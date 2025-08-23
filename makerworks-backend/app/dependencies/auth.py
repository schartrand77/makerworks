# app/dependencies/auth.py
from __future__ import annotations

import logging
import uuid
import inspect
from typing import Optional, Any, Iterable

from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy import or_, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.session import get_db
from app.models.models import User
from app.services.session_backend import get_session_user_id  # legacy session fallback
from app.utils.filesystem import ensure_user_model_thumbnails_for_user

logger = logging.getLogger(__name__)

# Prefer the project's decoder if available; fall back to PyJWT
try:
    from app.core.security import decode_token as _project_decode_token  # may be async or sync
except Exception:  # pragma: no cover
    _project_decode_token = None  # type: ignore

try:
    import jwt  # PyJWT
except Exception:  # pragma: no cover
    jwt = None  # type: ignore


def _extract_bearer(authorization: Optional[str]) -> Optional[str]:
    """
    Defensive parse for 'Authorization: Bearer <jwt>'.
    """
    if not isinstance(authorization, str):
        return None
    s = authorization.strip()
    if not s:
        return None
    parts = s.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        val = parts[1].strip()
        return val or None
    return None


def _get_jwt_config() -> tuple[str, list[str], Optional[str], Optional[str]]:
    """
    Pull JWT config from settings, with sane fallbacks.
    SECRET precedence: JWT_SECRET → SECRET_KEY.
    Algorithms: JWT_ALGORITHMS (list/CSV) → JWT_ALGORITHM → HS256.
    """
    secret = getattr(settings, "JWT_SECRET", None) or getattr(settings, "SECRET_KEY", None)
    if not secret:
        # We won't decode without a secret in fallback mode
        secret = ""

    algs: list[str] = []
    # Allow either a list or comma-separated string in settings
    jwt_algs = getattr(settings, "JWT_ALGORITHMS", None)
    if isinstance(jwt_algs, (list, tuple)):
        algs = [str(a) for a in jwt_algs if a]
    elif isinstance(jwt_algs, str) and jwt_algs.strip():
        algs = [a.strip() for a in jwt_algs.split(",") if a.strip()]

    if not algs:
        alg = getattr(settings, "JWT_ALGORITHM", None) or "HS256"
        algs = [str(alg)]

    iss = getattr(settings, "JWT_ISSUER", None)
    aud = getattr(settings, "JWT_AUDIENCE", None)
    return secret, algs, iss, aud


async def _decode_jwt(token: str) -> dict:
    """
    Decode a JWT using the project's decoder if present (async OR sync),
    else fall back to PyJWT + configured secret/alg/iss/aud.
    """
    # Project-specific decode wins
    if _project_decode_token:
        try:
            res = _project_decode_token(token)
            payload = await res if inspect.isawaitable(res) else res  # type: ignore[assignment]
            if not isinstance(payload, dict):
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
            return payload
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"[AUTH] project decode_token failed: {e}")

    # PyJWT fallback
    if not jwt:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Auth unavailable")

    secret, algs, iss, aud = _get_jwt_config()
    if not secret:
        logger.error("[AUTH] No JWT secret configured (JWT_SECRET/SECRET_KEY)")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Auth unavailable")

    try:
        # If issuer/audience are provided, PyJWT will verify them.
        payload = jwt.decode(
            token,
            secret,
            algorithms=algs,
            issuer=iss if iss else None,
            audience=aud if aud else None,
        )
        if not isinstance(payload, dict):
            raise getattr(jwt, "InvalidTokenError", Exception)("decoded payload not a dict")
        return payload
    except getattr(jwt, "ExpiredSignatureError", Exception):
        logger.info("[AUTH] JWT expired")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except getattr(jwt, "InvalidAudienceError", Exception):
        logger.info("[AUTH] JWT audience invalid")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except getattr(jwt, "InvalidIssuerError", Exception):
        logger.info("[AUTH] JWT issuer invalid")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except getattr(jwt, "InvalidSignatureError", Exception):
        logger.info("[AUTH] JWT signature invalid")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except getattr(jwt, "InvalidTokenError", Exception):
        logger.info("[AUTH] JWT invalid")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except Exception as e:
        logger.warning(f"[AUTH] JWT decode error: {e}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


async def _fetch_user_by_identifier(db: AsyncSession, ident: str) -> Optional[User]:
    """
    Accept UUID/email/username; return User or None. Case-insensitive for email/username.
    """
    # Try UUID first
    try:
        user_id = uuid.UUID(str(ident))
        res = await db.execute(select(User).where(User.id == user_id))
        user = res.scalar_one_or_none()
        if user:
            return user
    except Exception:
        pass

    ident_l = ident.lower()
    q = select(User).where(
        or_(
            func.lower(User.email) == ident_l,
            func.lower(User.username) == ident_l,
        )
    )
    res = await db.execute(q)
    return res.scalar_one_or_none()


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    access_token: Optional[str] = Cookie(default=None),  # cookie named "access_token"
) -> User:
    """
    Unified auth dependency (JWT-first).

    Accepts in order:
      1) Authorization: Bearer <JWT>
      2) access_token cookie
      3) access_token or token query parameter (?access_token= / ?token=)  ← handy for curl
      4) X-User-Id header (transitional)
      5) 'session' cookie (legacy Redis session id)
    """
    user_ident: Optional[str] = None

    # 1) Bearer JWT (header)
    token = _extract_bearer(authorization)
    if token:
        try:
            payload = await _decode_jwt(token)
            user_ident = payload.get("sub") or payload.get("email")
            if not user_ident:
                logger.warning("[AUTH] JWT missing 'sub' and 'email' claims (header)")
        except HTTPException as e:
            logger.info(f"[AUTH] Bearer token rejected: {e.detail}")
        except Exception as e:
            logger.warning(f"[AUTH] Bearer token error: {e}")

    # 2) JWT from access_token cookie (what signin/signup may set)
    if not user_ident and access_token:
        try:
            payload = await _decode_jwt(access_token)
            user_ident = payload.get("sub") or payload.get("email")
            if not user_ident:
                logger.warning("[AUTH] Cookie JWT missing 'sub'/'email'")
        except HTTPException as e:
            logger.info(f"[AUTH] Cookie token rejected: {e.detail}")
        except Exception as e:
            logger.warning(f"[AUTH] Cookie token error: {e}")

    # 3) Query string token (dev-friendly)
    if not user_ident:
        qs_token = request.query_params.get("access_token") or request.query_params.get("token")
        if qs_token:
            try:
                payload = await _decode_jwt(qs_token)
                user_ident = payload.get("sub") or payload.get("email")
                if not user_ident:
                    logger.warning("[AUTH] Query JWT missing 'sub'/'email'")
            except HTTPException as e:
                logger.info(f"[AUTH] Query token rejected: {e.detail}")
            except Exception as e:
                logger.warning(f"[AUTH] Query token error: {e}")

    # 4) Transitional: explicit user id header
    if not user_ident:
        header_uid = request.headers.get("X-User-Id")
        if header_uid:
            user_ident = header_uid
            logger.debug("[AUTH] Using X-User-Id header (transitional)")

    # 5) Legacy: Redis session cookie
    if not user_ident:
        session_token = request.cookies.get("session")
        if not session_token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
        try:
            uid = await get_session_user_id(session_token)
        except Exception as e:
            logger.error(f"[AUTH] Redis session lookup failed: {e}")
            uid = None
        if not uid:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
        user_ident = str(uid)

    # Resolve user
    user = await _fetch_user_by_identifier(db, user_ident)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if getattr(user, "is_active", True) is False:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User disabled")

    # Best-effort side effect; failures should never block auth
    try:
        ensure_user_model_thumbnails_for_user(str(user.id))
    except Exception as e:
        logger.debug(f"[AUTH] Thumbnail sync skipped: {e}")

    return user


async def optional_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    access_token: Optional[str] = Cookie(default=None),
) -> Optional[User]:
    """
    Like get_current_user but returns None (never raises) if unauthenticated.
    """
    try:
        return await get_current_user(
            request=request,
            db=db,
            authorization=authorization,
            access_token=access_token,
        )  # type: ignore[return-value]
    except HTTPException:
        return None


async def admin_required(user: User = Depends(get_current_user)) -> User:
    """
    Gate for admin-only routes. Accepts 'admin' or 'owner' roles.
    """
    role = (getattr(user, "role", "") or "").lower()
    if role not in {"admin", "owner"}:
        # Match existing API wording seen in logs
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user

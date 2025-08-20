# app/dependencies/auth.py
from __future__ import annotations

import logging
import uuid
from typing import Optional

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
    from app.core.security import decode_token as _project_decode_token  # type: ignore
except Exception:  # pragma: no cover
    _project_decode_token = None  # type: ignore

try:
    import jwt  # PyJWT
except Exception:  # pragma: no cover
    jwt = None  # type: ignore


def _extract_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


def _decode_jwt(token: str) -> dict:
    """
    Decode a JWT using the project's decoder if present,
    else fall back to PyJWT + SECRET_KEY.
    """
    if _project_decode_token:
        return _project_decode_token(token)  # type: ignore[misc]

    if not jwt:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Auth unavailable")

    try:
        # Default to HS256 unless your project sets something else in its decoder.
        return jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


async def _fetch_user_by_identifier(db: AsyncSession, ident: str) -> Optional[User]:
    """
    Accept UUID/email/username; return User or None.
    Case-insensitive match for email/username.
    """
    # Try UUID
    try:
        user_id = uuid.UUID(str(ident))
        res = await db.execute(select(User).where(User.id == user_id))
        user = res.scalar_one_or_none()
        if user:
            return user
    except Exception:
        pass

    ident_l = ident.lower()
    # Case-insensitive email/username match
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
    access_token_cookie: Optional[str] = Cookie(default=None, alias="access_token"),
) -> User:
    """
    Unified auth dependency (JWT-first).

    Order:
      1) Authorization: Bearer <JWT>  → use 'sub' (or 'email') claim
      2) access_token cookie          → same JWT, set by signup/signin
      3) X-User-Id header (debug only)
      4) 'session' cookie             → legacy Redis session lookup
    """
    user_ident: Optional[str] = None

    # 1) Bearer JWT (header)
    token = _extract_bearer(authorization)
    if token:
        try:
            payload = _decode_jwt(token)
            user_ident = payload.get("sub") or payload.get("email")
            if not user_ident:
                logger.warning("[AUTH] JWT missing 'sub' and 'email' claims")
        except HTTPException as e:
            # Real auth failures should bubble; continue to other methods only
            # if we want soft fallback. Here we log and try cookie next.
            logger.warning(f"[AUTH] Bearer decode failed: {e.detail}")
        except Exception as e:  # defensive
            logger.warning(f"[AUTH] Bearer decode error: {e}")

    # 2) JWT from access_token cookie (what your signin/signup set)
    if not user_ident and access_token_cookie:
        try:
            payload = _decode_jwt(access_token_cookie)
            user_ident = payload.get("sub") or payload.get("email")
            if not user_ident:
                logger.warning("[AUTH] Cookie JWT missing 'sub'/'email'")
        except HTTPException as e:
            logger.warning(f"[AUTH] Cookie token invalid: {e.detail}")
        except Exception as e:
            logger.warning(f"[AUTH] Cookie token decode error: {e}")

    # 3) Debug-only: X-User-Id
    if not user_ident and settings.DEBUG_ALLOW_USER_HEADER:
        header_uid = request.headers.get("X-User-Id")
        if header_uid:
            user_ident = header_uid
            logger.debug("[AUTH] Using X-User-Id header (debug)")

    # 4) Legacy: session cookie
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

    # Best-effort side effect
    try:
        ensure_user_model_thumbnails_for_user(str(user.id))
    except Exception as e:
        logger.debug(f"[AUTH] Thumbnail sync skipped: {e}")

    return user


async def admin_required(user: User = Depends(get_current_user)) -> User:
    # Allow both admin and owner; tweak as needed.
    role = (getattr(user, "role", "") or "").lower()
    if role not in {"admin", "owner"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return user

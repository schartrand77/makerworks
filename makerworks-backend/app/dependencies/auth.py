# app/dependencies/auth.py
import logging
import uuid
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token  # PyJWT decode (HS/RS)
from app.db.session import get_db  # must return AsyncSession
from app.models.models import User
from app.services.session_backend import get_session_user_id  # legacy session fallback
from app.utils.filesystem import ensure_user_model_thumbnails_for_user

logger = logging.getLogger(__name__)


async def _fetch_user_by_identifier(db: AsyncSession, ident: str) -> Optional[User]:
    """
    Accept UUID/email/username; return User or None.
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

    # Try email/username
    res = await db.execute(select(User).where(or_(User.email == ident, User.username == ident)))
    return res.scalar_one_or_none()


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """
    Unified auth dependency (JWT-first).

    Order:
      1) Authorization: Bearer <JWT>  → use 'sub' (or 'email') claim
      2) X-User-Id header             → temporary transition support
      3) 'session' cookie             → legacy Redis session lookup
    """
    user_ident: Optional[str] = None

    # 1) Bearer JWT
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.split(" ", 1)[1] if auth_header.startswith("Bearer ") else None
    if token:
        try:
            payload = decode_token(token)
            user_ident = payload.get("sub") or payload.get("email")
            if not user_ident:
                logger.warning("[AUTH] JWT missing 'sub' and 'email' claims")
        except Exception as e:
            logger.warning(f"[AUTH] JWT decode failed: {e}")

    # 2) Transitional: X-User-Id
    if not user_ident:
        header_uid = request.headers.get("X-User-Id")
        if header_uid:
            user_ident = header_uid
            logger.debug("[AUTH] Using X-User-Id header")

    # 3) Legacy: session cookie
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
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User disabled")

    # Best-effort side effect
    try:
        ensure_user_model_thumbnails_for_user(str(user.id))
    except Exception as e:
        logger.debug(f"[AUTH] Thumbnail sync skipped: {e}")

    return user


async def admin_required(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return user

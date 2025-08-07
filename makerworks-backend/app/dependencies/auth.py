# app/routes/auth.py
import logging
from fastapi import Depends, HTTPException, status, Request
from app.db.database import get_async_db
from app.models.models import User
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.services.session_backend import get_session_user_id
from app.utils.filesystem import ensure_user_model_thumbnails_for_user

logger = logging.getLogger(__name__)

async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_async_db),
) -> User:
    """
    Fetch user from Redis-backed session using the session cookie.
    Includes debug logging to trace authentication issues.
    """
    session_token = request.cookies.get("session")
    if not session_token:
        logger.warning("[AUTH] No session cookie present.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    logger.debug(f"[AUTH] Session token received: {session_token}")

    # Look up user_id in Redis via session backend
    user_id = await get_session_user_id(session_token)
    if not user_id:
        logger.warning(f"[AUTH] No user_id found for session token {session_token}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    logger.debug(f"[AUTH] Resolved user_id={user_id} from session")

    # Fetch user from database
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        logger.warning(f"[AUTH] User id {user_id} not found in database")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # After successful authentication, ensure thumbnails exist for this user's models
    try:
        ensure_user_model_thumbnails_for_user(str(user.id))
    except Exception as e:
        logger.exception("[AUTH] Thumbnail synchronization failed: %s", e)

    return user


async def admin_required(
    user: User = Depends(get_current_user)
) -> User:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return user

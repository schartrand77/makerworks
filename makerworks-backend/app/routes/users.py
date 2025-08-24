# app/routes/users.py
from __future__ import annotations

import logging
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# project deps
from app.db.database import get_async_db
from app.dependencies.auth import get_current_user

# ✅ use the PLURAL schemas module
from app.schemas.users import UserOut, UserUpdate

# your ORM model (adjust if your path differs)
from app.models import User  # or: from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()  # main.py mounts this at /api/v1/users

_USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,30}$")


@router.get("/me", response_model=UserOut, status_code=status.HTTP_200_OK)
async def get_me(
    me: User = Depends(get_current_user),
) -> UserOut:
    """
    Return the current authenticated user.
    """
    # Pydantic v2: validate from ORM instance
    return UserOut.model_validate(me)


@router.patch("/me", response_model=UserOut, status_code=status.HTTP_200_OK)
async def update_me(
    payload: UserUpdate,
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
) -> UserOut:
    """
    Sparse update for the signed-in user's profile.

    Notes:
    - Only applies fields explicitly sent (exclude_unset).
    - Coerces empty strings to None for optional text fields.
    - Validates username (3–30, [A-Za-z0-9_]) and enforces uniqueness.
    - Accepts `avatar_url` as a plain string; if your schema allows relative
      `/uploads/...`, this will not 422.
    """
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No fields provided")

    # Refresh within this session to avoid stale instance edge cases
    db_user = await db.get(User, me.id)
    if not db_user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    # Normalize empties → None
    def _clean(val: Optional[str]) -> Optional[str]:
        if isinstance(val, str) and val.strip() == "":
            return None
        return val

    for k in ("name", "bio", "language", "avatar_url"):
        if k in data:
            data[k] = _clean(data[k])

    # Username (optional)
    if "username" in data:
        new_username = (data["username"] or "").strip() or None
        if new_username and new_username != db_user.username:
            if not _USERNAME_RE.fullmatch(new_username):
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="username must be 3–30 chars of letters, numbers, or underscore",
                )
            # uniqueness
            res = await db.execute(select(User.id).where(User.username == new_username))
            if res.scalar() is not None:
                raise HTTPException(status.HTTP_409_CONFLICT, detail="Username already taken")
            db_user.username = new_username
        # prevent falling through to setattr with possibly None
        data.pop("username", None)

    # Theme normalization (accept only light/dark/null)
    if "theme" in data:
        t = (data["theme"] or "").lower()
        data["theme"] = t if t in ("light", "dark") else None

    # Apply remaining fields verbatim
    for field, value in data.items():
        setattr(db_user, field, value)

    try:
        await db.commit()
        await db.refresh(db_user)
    except Exception as exc:  # pragma: no cover
        await db.rollback()
        logger.exception("Profile update failed for user_id=%s", me.id)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update profile") from exc

    return UserOut.model_validate(db_user)

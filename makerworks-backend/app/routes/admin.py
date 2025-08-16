# app/routes/admin.py
from __future__ import annotations

from typing import List, Optional
from uuid import UUID
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, HttpUrl

# ✅ Use the cycle-safe re-exports (avoids startup import loops)
from app.dependencies import get_db, admin_required

from app.models.models import ModelMetadata, ModelUpload, User
from app.schemas.admin import DiscordConfigOut, UploadOut, UserOut
from app.services.auth_service import log_action
from app.utils.log_utils import logger

router = APIRouter()

# In-memory admin config (persist later if needed)
discord_config = {
    "webhook_url": "",
    "channel_id": "",
    "feed_enabled": True,
}

# ──────────────────────────────────────────────────────────────────────────────
# Schemas (inputs)
# ──────────────────────────────────────────────────────────────────────────────
class DiscordConfigIn(BaseModel):
    webhook_url: Optional[HttpUrl] = None
    channel_id: Optional[str] = None
    feed_enabled: Optional[bool] = None


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────
async def _count_admins(db: AsyncSession) -> int:
    q = select(func.count()).select_from(User).where(
        func.lower(func.coalesce(User.role, "")) == "admin"
    )
    return int((await db.execute(q)).scalar_one())


def _parse_uuid_maybe(value) -> Optional[UUID]:
    try:
        return UUID(str(value))
    except Exception:
        return None


# ──────────────────────────────────────────────────────────────────────────────
# Admin “who am I” — quick frontend sanity check
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/me")
async def admin_me(db: AsyncSession = Depends(get_db), admin=Depends(admin_required)):
    """
    Minimal endpoint so the frontend can quickly confirm admin status.
    Returns email & id from DB for the authenticated admin.
    """
    uid = _parse_uuid_maybe(admin.sub)
    user = await db.get(User, uid) if uid else None
    return {
        "is_admin": True,
        "user_id": str(admin.sub),
        "email": getattr(user, "email", None) if user else None,
        "username": getattr(user, "username", None) if user else None,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Users
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/users", response_model=List[UserOut])
async def get_all_users(
    db: AsyncSession = Depends(get_db),
    admin=Depends(admin_required),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    search: Optional[str] = Query(
        None, description="Filter users by email/username (case-insensitive, contains)."
    ),
):
    """
    Paginated list of users with optional case-insensitive search.
    """
    stmt = select(User)
    if search:
        like = f"%{search}%"
        stmt = stmt.where((User.email.ilike(like)) | (User.username.ilike(like)))
    try:
        stmt = stmt.order_by(User.created_at.desc())
    except Exception:
        stmt = stmt.order_by(User.username.asc())
    stmt = stmt.limit(limit).offset(offset)

    result = await db.execute(stmt)
    users = result.scalars().all()
    return users


@router.post("/users/{user_id}/promote")
async def promote_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(admin_required),
):
    """
    Promote a user to admin and normalize flags (active/verified).
    Protects against self-promotion (pointless), no-ops if already admin.
    """
    if str(admin.sub) == str(user_id):
        raise HTTPException(400, "You’re already an admin.")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    if (user.role or "").lower() == "admin":
        return {"status": "ok", "message": f"User {user_id} is already admin."}

    user.role = "admin"
    if hasattr(user, "is_verified"):
        user.is_verified = True
    if hasattr(user, "is_active"):
        user.is_active = True

    await log_action(admin.sub, "promote_user", str(user_id), db)
    await db.commit()
    return {"status": "ok", "message": f"User {user_id} promoted to admin."}


@router.post("/users/{user_id}/demote")
async def demote_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(admin_required),
):
    """
    Demote an admin back to user. Blocks self-demotion and prevents removing the last admin.
    """
    if str(admin.sub) == str(user_id):
        raise HTTPException(400, "You can’t demote yourself.")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    if (user.role or "").lower() == "admin":
        if await _count_admins(db) <= 1:
            raise HTTPException(400, "Cannot demote the last remaining admin.")

    user.role = "user"
    await log_action(admin.sub, "demote_user", str(user_id), db)
    await db.commit()
    return {"status": "ok", "message": f"User {user_id} demoted to user."}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(admin_required),
):
    """
    Delete a user. Blocks self-delete and prevents deleting the last admin.
    """
    if str(admin.sub) == str(user_id):
        raise HTTPException(400, "Deleting yourself would be… suboptimal.")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    if (user.role or "").lower() == "admin":
        if await _count_admins(db) <= 1:
            raise HTTPException(400, "Cannot delete the last remaining admin.")

    await db.delete(user)
    await log_action(admin.sub, "delete_user", str(user_id), db)
    await db.commit()
    return {"status": "ok", "message": f"User {user_id} deleted."}


# ──────────────────────────────────────────────────────────────────────────────
# User uploads / model metadata (paginated)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/users/{user_id}/uploads", response_model=List[UploadOut])
async def view_user_uploads(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(admin_required),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """
    Paginated list of a user's model uploads with metadata preloaded.
    NOTE: ModelMetadata has no user_id; filter by ModelUpload.user_id.
    """
    stmt = (
        select(ModelUpload)
        .where(ModelUpload.user_id == user_id)
        .options(selectinload(ModelUpload.metadata_entries))
        .order_by(ModelUpload.uploaded_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    # unique() avoids duplicates when using eager loaders
    uploads = result.scalars().unique().all()
    return uploads


# ──────────────────────────────────────────────────────────────────────────────
# Discord config (validated, still in-memory)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/discord/config", response_model=DiscordConfigOut)
async def get_discord_config(admin=Depends(admin_required)):
    return DiscordConfigOut(**discord_config)


@router.post("/discord/config", response_model=DiscordConfigOut)
async def update_discord_config(
    payload: DiscordConfigIn,
    admin=Depends(admin_required),
    db: AsyncSession = Depends(get_db),
):
    """
    Validate & update the in-memory Discord config.
    For production, persist to DB and cache (this keeps current behavior).
    """
    # Validate webhook host is Discord and enforce https
    if payload.webhook_url is not None:
        url_str = str(payload.webhook_url).strip()
        parsed = urlparse(url_str)
        host = (parsed.hostname or "").lower()
        scheme = (parsed.scheme or "").lower()
        if scheme != "https":
            raise HTTPException(status_code=422, detail="webhook_url must use https")
        if not (host.endswith("discord.com") or host.endswith("discordapp.com")):
            raise HTTPException(status_code=422, detail="webhook_url must be a Discord URL")
        discord_config["webhook_url"] = url_str

    if payload.channel_id is not None:
        discord_config["channel_id"] = payload.channel_id.strip()

    if payload.feed_enabled is not None:
        discord_config["feed_enabled"] = bool(payload.feed_enabled)

    await log_action(admin.sub, "update_discord_config", str(admin.sub), db)
    return DiscordConfigOut(**discord_config)

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_async_db
from app.dependencies.auth import admin_required
from app.models.models import ModelMetadata, User
from app.services.auth_service import log_action
from app.utils.logging import logger
from app.schemas.admin import UserOut, UploadOut, DiscordConfigOut

router = APIRouter()

discord_config = {
    "webhook_url": "",
    "channel_id": "",
    "feed_enabled": True,
}


@router.get("/users", response_model=List[UserOut])
async def get_all_users(
    db: AsyncSession = Depends(get_async_db), admin=Depends(admin_required)
):
    result = await db.execute(select(User))
    return result.scalars().all()


@router.post("/users/{user_id}/promote")
async def promote_user(
    user_id: str,
    db: AsyncSession = Depends(get_async_db),
    admin=Depends(admin_required),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.role = "admin"
    await log_action(admin.sub, "promote_user", user_id, db)
    await db.commit()
    return {"status": "ok", "message": f"User {user_id} promoted to admin."}


@router.post("/users/{user_id}/demote")
async def demote_user(
    user_id: str,
    db: AsyncSession = Depends(get_async_db),
    admin=Depends(admin_required),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.role = "user"
    await log_action(admin.sub, "demote_user", user_id, db)
    await db.commit()
    return {"status": "ok", "message": f"User {user_id} demoted to user."}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_async_db),
    admin=Depends(admin_required),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    await db.delete(user)
    await log_action(admin.sub, "delete_user", user_id, db)
    await db.commit()
    return {"status": "ok", "message": f"User {user_id} deleted."}


@router.post("/users/{user_id}/reset-password")
async def force_password_reset(
    user_id: str,
    db: AsyncSession = Depends(get_async_db),
    admin=Depends(admin_required),
):
    await log_action(admin.sub, "force_password_reset", user_id, db)
    return {
        "status": "noop",
        "message": "Password reset flow to be handled by frontend.",
    }


@router.get("/users/{user_id}/uploads", response_model=List[UploadOut])
async def view_user_uploads(
    user_id: str,
    db: AsyncSession = Depends(get_async_db),
    admin=Depends(admin_required),
):
    result = await db.execute(
        select(ModelMetadata).where(ModelMetadata.user_id == user_id)
    )
    return result.scalars().all()


@router.get("/discord/config", response_model=DiscordConfigOut)
async def get_discord_config(admin=Depends(admin_required)):
    return discord_config


@router.post("/discord/config")
async def update_discord_config(
    request: Request,
    admin=Depends(admin_required),
    db: AsyncSession = Depends(get_async_db),
):
    data = await request.json()
    discord_config.update(
        {
            "webhook_url": data.get("webhook_url", discord_config["webhook_url"]),
            "channel_id": data.get("channel_id", discord_config["channel_id"]),
            "feed_enabled": data.get("feed_enabled", discord_config["feed_enabled"]),
        }
    )
    await log_action(admin.sub, "update_discord_config", admin.sub, db)
    return {"status": "ok", "message": "Discord configuration updated."}

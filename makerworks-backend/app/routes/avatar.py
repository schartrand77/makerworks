from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from pathlib import Path
import time

from app.dependencies.auth import get_current_user
from app.db.session import get_db
from app.models.models import User
from app.utils.files import save_avatar
from app.config.settings import settings

router = APIRouter()

UPLOAD_DIR = Path(settings.uploads_path) / "users"

@router.post("")
async def upload_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # ✅ Ensure we are using a persistent instance attached to this session
    user = await db.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # ✅ Create user-specific avatar folder if needed
    user_dir = UPLOAD_DIR / str(user.id) / "avatars"
    user_dir.mkdir(parents=True, exist_ok=True)

    # ✅ Save avatar file to disk
    avatar_path = user_dir / "avatar.png"
    with avatar_path.open("wb") as buffer:
        buffer.write(await file.read())

    # ✅ Update avatar URL with cache-busting timestamp
    user.avatar_url = f"/uploads/users/{user.id}/avatars/avatar.png?t={int(time.time())}"
    user.avatar_updated_at = datetime.utcnow()

    # ✅ Commit and refresh persistent instance
    await db.commit()
    await db.refresh(user)

    return {
        "message": "Avatar uploaded successfully",
        "avatar_url": user.avatar_url
    }

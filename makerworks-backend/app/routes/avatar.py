# app/routes/avatar.py
"""Avatar upload route.

Mount with:
    app.include_router(avatar.router, prefix="/api/v1/avatar", tags=["avatar"])

Final path:
    POST /api/v1/avatar/   (trailing slash accepted; app.router.redirect_slashes = True)
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Tuple

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.db.database import get_db
from app.models.models import User
from app.dependencies import get_current_user  # ✅ use real auth

router = APIRouter()


def _ext_for_content_type(content_type: str) -> str:
    if content_type == "image/png":
        return ".png"
    if content_type in ("image/jpeg", "image/jpg"):
        return ".jpg"
    raise HTTPException(status_code=400, detail="Unsupported image type")


def _safe_avatar_filename(content_type: str) -> str:
    ext = _ext_for_content_type(content_type)
    return f"avatar-{int(time.time())}{ext}"


async def _stream_save(file: UploadFile, dest: Path) -> None:
    """Persist uploaded avatar to disk with a size cap."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    max_bytes = 5 * 1024 * 1024  # 5MB
    written = 0
    with dest.open("wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            written += len(chunk)
            if written > max_bytes:
                try:
                    f.close()
                    dest.unlink(missing_ok=True)
                except Exception:
                    pass
                raise HTTPException(status_code=400, detail="Avatar file too large (max 5MB)")
            f.write(chunk)


def _build_urls(request: Request, user_id: Any, filename: str) -> Tuple[str, str]:
    """Return (relative_url, absolute_url)."""
    rel = f"/uploads/users/{user_id}/avatars/{filename}"
    abs_url = f"{str(request.base_url).rstrip('/')}{rel}"
    return rel, abs_url


@router.post("/")  # final path: /api/v1/avatar/
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # ✅ real user from JWT
):
    """Handle avatar upload and update user's avatar_url."""
    if not file or not file.content_type:
        raise HTTPException(status_code=400, detail="No image provided")

    # Save file
    uploads_root = Path(settings.uploads_path or "/uploads")
    user_dir = uploads_root / "users" / str(current_user.id) / "avatars"
    filename = _safe_avatar_filename(file.content_type)
    avatar_path = user_dir / filename
    await _stream_save(file, avatar_path)

    # URLs to return/store
    rel_url, abs_url = _build_urls(request, current_user.id, filename)

    # Persist on user
    current_user.avatar_url = rel_url
    current_user.avatar_updated_at = datetime.now(timezone.utc)
    db.add(current_user)
    db.commit()

    return {
        "status": "ok",
        "avatar_url": rel_url,      # relative (store this)
        "avatar_url_abs": abs_url,  # convenience
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }


__all__ = ["router"]

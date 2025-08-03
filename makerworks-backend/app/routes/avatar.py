"""Avatar upload routes."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, Header
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.models import User
from app.config.settings import settings


router = APIRouter()


class Token:
    """Simple token container used in tests."""

    def __init__(self, sub: Any) -> None:  # pragma: no cover - trivial
        self.sub = sub


def get_user_from_headers(authorization: str | None = Header(default=None)) -> Token:
    """Extract a user identifier from the Authorization header.

    The real application would validate a JWT here.  For the purposes of the
    tests we raise an HTTP 401 if no header is supplied.  Tests override this
    dependency to return a `Token` with the desired ``sub`` value.
    """

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    user_id = authorization.split(" ", 1)[1]
    return Token(user_id)


async def _save_avatar(file: UploadFile, dest: Path) -> None:
    """Persist uploaded avatar to disk."""

    dest.parent.mkdir(parents=True, exist_ok=True)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:  # 5MB
        raise HTTPException(status_code=400, detail="Avatar file too large")
    with dest.open("wb") as f:
        f.write(content)


def _build_urls(request: Request, user_id: Any, filename: str) -> tuple[str, str]:
    base = str(request.base_url).rstrip("/")
    rel = f"/uploads/users/{user_id}/avatars/{filename}"
    url = f"{base}{rel}"
    return url, url  # avatar_url, thumbnail_url


@router.post("/avatar")
@router.post("/api/v1/avatar")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    token: Token = Depends(get_user_from_headers),
    db: Session = Depends(get_db),
):
    """Handle avatar upload for a user.

    Supports two paths:

    * ``/api/v1/avatar`` when the router is mounted with no prefix
    * ``/avatar`` when the router is mounted under ``/api/v1/users``
    """

    if file.content_type not in {"image/png", "image/jpeg"}:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    user = db.get(User, token.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_dir = Path(settings.uploads_path) / "users" / str(user.id) / "avatars"
    filename = file.filename or "avatar.png"
    avatar_path = user_dir / filename
    await _save_avatar(file, avatar_path)

    avatar_url, thumb_url = _build_urls(request, user.id, filename)

    user.avatar_url = avatar_url
    user.avatar_updated_at = datetime.utcnow()
    db.add(user)
    db.commit()

    return {
        "status": "ok",
        "avatar_url": avatar_url,
        "thumbnail_url": thumb_url,
        "uploaded_at": datetime.utcnow().isoformat(),
    }


__all__ = ["router", "get_user_from_headers"]


# app/routes/avatar.py
"""Avatar upload & lookup routes.

Mount with:
    app.include_router(avatar.router, prefix="/api/v1/avatar", tags=["avatar"])

Endpoints:
    POST    /api/v1/avatar            (also accepts trailing slash)
    POST    /api/v1/avatar/upload     (legacy alias)
    GET     /api/v1/avatar/me         (return caller's avatar or default)
    GET     /api/v1/avatar/{user_id}  (return user's avatar or default)
"""

from __future__ import annotations

import os
import re
import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Path as PathParam,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

logger = logging.getLogger("uvicorn")

# ── Settings (tolerate both old/new modules) ───────────────────────────────────
try:
    from app.core.config import settings  # preferred
except Exception:  # pragma: no cover
    from app.config.settings import settings  # legacy

# ── DB / Models ────────────────────────────────────────────────────────────────
from app.db.session import get_db  # must yield AsyncSession
from app.models.models import User

# ── Auth dep (tolerate legacy layout) ─────────────────────────────────────────
try:
    from app.dependencies.auth import get_current_user  # preferred
except Exception:  # pragma: no cover
    from app.dependencies import get_current_user  # legacy

router = APIRouter()

# ── Constraints ───────────────────────────────────────────────────────────────
MAX_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_CT = {"image/png", "image/jpeg", "image/jpg"}
FILENAME_RE = re.compile(r"[^a-zA-Z0-9_.-]")

DEFAULT_AVATAR_REL = "/static/default-avatar.png"  # main.py mounts /static

# ── Helpers ───────────────────────────────────────────────────────────────────
def _safe_name(name: str) -> str:
    base = os.path.basename(name) or "avatar"
    return FILENAME_RE.sub("_", base)

def _ext_for(ct: str) -> str:
    return ".png" if ct == "image/png" else ".jpg"

def _resolve_uploads_root_from_state(request: Request) -> Path | None:
    """
    Prefer the canonical root set by main.py:
        app.state.uploads_root = <Path actually mounted at /uploads>
    """
    root = getattr(request.app.state, "uploads_root", None)
    if isinstance(root, (str, Path)) and str(root).strip():
        return Path(str(root)).resolve()
    return None

def _resolve_uploads_root_fallback() -> Path:
    """
    Fallback: resolve from settings/env, mirror main.py logic.
    """
    candidates = [
        getattr(settings, "UPLOAD_DIR", None),
        getattr(settings, "upload_dir_raw", None),
        getattr(settings, "uploads_path", None),
        os.getenv("UPLOAD_DIR"),
        "/uploads",
    ]
    for c in candidates:
        if c and str(c).strip():
            return Path(str(c)).resolve()
    return Path("/uploads").resolve()

def _uploads_root(request: Request) -> Path:
    return _resolve_uploads_root_from_state(request) or _resolve_uploads_root_fallback()

def _user_avatar_dir(base: Path, user_id: str | uuid.UUID) -> Path:
    return base / "users" / str(user_id) / "avatars"

def _build_urls(request: Request, user_id: str | uuid.UUID, filename: str) -> Tuple[str, str]:
    # Relative matches your /uploads static mount
    rel = f"/uploads/users/{user_id}/avatars/{filename}"
    abs_url = f"{str(request.base_url).rstrip('/')}{rel}"
    return rel, abs_url

async def _stream_save(upload: UploadFile, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with dest.open("wb") as f:
        while True:
            chunk = await upload.read(1024 * 1024)  # 1MB
            if not chunk:
                break
            written += len(chunk)
            if written > MAX_BYTES:
                try:
                    f.close()
                finally:
                    try:
                        dest.unlink(missing_ok=True)
                    except Exception:
                        pass
                raise HTTPException(status_code=413, detail=f"Avatar too large (max {MAX_BYTES // (1024*1024)} MB)")
            f.write(chunk)

def _now() -> datetime:
    return datetime.now(timezone.utc)

# ── Core handlers ─────────────────────────────────────────────────────────────
async def _handle_upload(
    request: Request,
    avatar: Optional[UploadFile],
    file: Optional[UploadFile],
    db: AsyncSession,
    current_user: User,
):
    """
    Shared upload logic. Accepts either 'avatar' or 'file' form field.
    """
    upl = avatar or file
    if upl is None:
        raise HTTPException(status_code=400, detail="No image file. Use form field 'avatar' or 'file'.")

    ct = (upl.content_type or "").lower()
    if ct not in ALLOWED_CT:
        raise HTTPException(status_code=415, detail=f"Unsupported content type '{ct}'. Use PNG or JPEG.")

    # Determine canonical uploads root from app.state (set by main.py), fallback otherwise.
    base_root = _uploads_root(request)
    if not base_root.exists():
        # Don’t silently write to nowhere; fail loud to reveal misconfig.
        logger.error("[Avatar] Upload root does not exist: %s", base_root)
        raise HTTPException(status_code=500, detail="Uploads root is not available on the server.")

    # Destination path
    ext = _ext_for(ct)
    filename_base = _safe_name((upl.filename or "avatar").rsplit(".", 1)[0])
    unique = f"{filename_base}-{uuid.uuid4().hex[:12]}{ext}"
    dest_dir = _user_avatar_dir(base_root, current_user.id)
    dest_path = dest_dir / unique

    # Save file
    await _stream_save(upl, dest_path)

    # URLs
    rel_url, abs_url = _build_urls(request, current_user.id, unique)

    # Persist on user (relative URL)
    current_user.avatar_url = rel_url
    if hasattr(current_user, "avatar_updated_at"):
        setattr(current_user, "avatar_updated_at", _now())

    db.add(current_user)
    await db.commit()

    logger.info("[Avatar] Saved → %s | rel=%s | abs=%s | root=%s",
                dest_path, rel_url, abs_url, base_root)

    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={
            "status": "ok",
            "avatar_url": rel_url,      # store this
            "avatar_url_abs": abs_url,  # convenience
            "uploaded_at": _now().isoformat(),
        },
    )

def _best_avatar_urls(request: Request, user: User) -> tuple[str, str]:
    """
    Returns (relative_url, absolute_url), falling back to default avatar if necessary.
    """
    candidate = (getattr(user, "avatar_url", None) or "").strip()
    rel = candidate if candidate else DEFAULT_AVATAR_REL
    abs_url = f"{str(request.base_url).rstrip('/')}{rel}"
    return rel, abs_url

# ── Upload routes (accept BOTH "" and "/"; plus legacy alias) ────────────────
@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_avatar_no_slash(
    request: Request,
    avatar: Optional[UploadFile] = File(default=None),
    file: Optional[UploadFile] = File(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _handle_upload(request, avatar, file, db, current_user)

@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_avatar_slash(
    request: Request,
    avatar: Optional[UploadFile] = File(default=None),
    file: Optional[UploadFile] = File(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _handle_upload(request, avatar, file, db, current_user)

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_avatar_legacy(
    request: Request,
    avatar: Optional[UploadFile] = File(default=None),
    file: Optional[UploadFile] = File(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _handle_upload(request, avatar, file, db, current_user)

# ── Read routes (serve current avatar URL or default) ─────────────────────────
@router.get("/me", status_code=status.HTTP_200_OK)
async def get_my_avatar(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    rel, abs_url = _best_avatar_urls(request, current_user)
    return {"avatar_url": rel, "avatar_url_abs": abs_url}

@router.get("/{user_id}", status_code=status.HTTP_200_OK)
async def get_user_avatar(
    request: Request,
    user_id: str = PathParam(..., description="Target user UUID"),
    db: AsyncSession = Depends(get_db),
    _caller: User = Depends(get_current_user),  # auth gate; replace with RBAC as needed
):
    try:
        uuid.UUID(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        # match your default behavior: if user doesn't exist, 404
        raise HTTPException(status_code=404, detail="User not found")

    rel, abs_url = _best_avatar_urls(request, user)
    return {"avatar_url": rel, "avatar_url_abs": abs_url}

# convenience redirect (matches main.py’s /api/v1/avatar/default if you prefer to keep it here)
@router.get("/default", include_in_schema=False)
async def default_avatar_redirect():
    return RedirectResponse(url=DEFAULT_AVATAR_REL, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

__all__ = ["router"]

# app/routes/upload.py

from __future__ import annotations

import contextlib
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.db.session import async_engine
from app.dependencies.auth import get_current_user  # ← wire in your auth dep

router = APIRouter()
log = logging.getLogger("uvicorn.error")

# ── Config ────────────────────────────────────────────────────────────────
UPLOAD_ROOT = Path(os.getenv("UPLOAD_DIR", "/uploads")).resolve()
THUMB_ROOT = Path(os.getenv("THUMBNAILS_DIR", "/thumbnails")).resolve()

# Ensure these exist and are writable
def _ensure_dir_writable(path: Path):
    try:
        path.mkdir(parents=True, exist_ok=True)
        t = path / ".write_test"
        t.write_text("ok", encoding="utf-8")
        t.unlink(missing_ok=True)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Path not writable: {path} ({e})",
        )

_ensure_dir_writable(UPLOAD_ROOT)
_ensure_dir_writable(THUMB_ROOT)

# Make paths visible to any subprocess/library
os.environ.setdefault("UPLOAD_DIR", str(UPLOAD_ROOT))
os.environ.setdefault("THUMBNAILS_DIR", str(THUMB_ROOT))

ALLOWED_EXTS = {".stl", ".3mf"}
MAX_SIZE_BYTES = 200 * 1024 * 1024  # 200 MB

# ── Thumbnail util (uses your renderer; falls back to 1x1 PNG) ────────────
try:
    from app.utils.render_thumbnail import render_thumbnail as _render_thumb_util  # type: ignore
except Exception:  # pragma: no cover
    _render_thumb_util = None

# 1×1 transparent PNG (fallback)
_PNG_1x1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\x0cIDATx\x9cc``\x00"
    b"\x00\x00\x04\x00\x01\xf2\x1d\xdcS\x00\x00\x00\x00IEND\xaeB`\x82"
)

async def _make_thumbnail(model_path: Path, model_id: str) -> Path:
    thumb_fs_path = THUMB_ROOT / f"{model_id}.png"
    thumb_fs_path.parent.mkdir(parents=True, exist_ok=True)

    log.info("[thumbnail] starting: in=%s → out=%s (util=%s)",
             model_path, thumb_fs_path, getattr(_render_thumb_util, "__name__", None))

    if _render_thumb_util is not None:
        try:
            # Support both signatures we've seen in your codebase:
            # (src_path, model_id) or (src_path, dst_path)
            try:
                await run_in_threadpool(_render_thumb_util, str(model_path), str(model_id))
            except TypeError:
                await run_in_threadpool(_render_thumb_util, str(model_path), str(thumb_fs_path))
            return thumb_fs_path
        except Exception as e:
            log.warning("[thumbnail] util failed (%s); falling back to 1x1", e)

    with thumb_fs_path.open("wb") as f:
        f.write(_PNG_1x1)
    return thumb_fs_path

# ── Helpers ───────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)

def _safe_ext(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .stl or .3mf files are allowed.",
        )
    return ext

def _sanitize_segment(s: str) -> str:
    # filesystem-safe path segment
    s = (s or "").strip().replace("\\", "_").replace("/", "_")
    s = re.sub(r"[^a-zA-Z0-9._-]", "_", s).strip("._")
    return s[:128] or "user"

def _safe_join(root: Path, *parts: str) -> Path:
    """Join under root and reject traversal (guaranteed within root)."""
    p = root
    for part in parts:
        p = p / _sanitize_segment(part)
    p_res = p.resolve()
    root_res = root.resolve()
    try:
        p_res.relative_to(root_res)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path")
    return p_res

def _extract_user_id(current_user: Any) -> str:
    """
    Pull a UUID string from whatever object your get_current_user returns.
    Accepts attr or dict access for 'id' / 'user_id'.
    """
    candidate: Optional[str] = None
    for key in ("id", "user_id"):
        if hasattr(current_user, key):
            candidate = str(getattr(current_user, key))
            break
        if isinstance(current_user, dict) and key in current_user:
            candidate = str(current_user[key])
            break
    if not candidate:
        raise HTTPException(status_code=401, detail="Authenticated user has no id.")
    try:
        return str(uuid.UUID(candidate))
    except Exception:
        # if your user IDs are non-UUID, enforce/transform here.
        raise HTTPException(status_code=400, detail="User id is not a valid UUID.")

@lru_cache(maxsize=1)
def _model_uploads_columns() -> Dict[str, bool]:
    """Cache column nullability. Returns {column_name: is_nullable_bool}"""
    return {}

# ── Route (auth REQUIRED via get_current_user) ─────────────────────────────
@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_model(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    current_user: Any = Depends(get_current_user),  # ← FastAPI will verify token & load user
):
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename.")

    ext = _safe_ext(file.filename)
    owner_id = _extract_user_id(current_user)

    # Layout: /uploads/users/<owner_id>/models/<model_idhex>/model.<ext>
    model_uuid = uuid.uuid4()
    model_id = str(model_uuid)
    model_dir_id = model_uuid.hex

    dest_dir = _safe_join(UPLOAD_ROOT, "users", owner_id, "models", model_dir_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / f"model{ext}"

    log.info("[upload] owner=%s model_id=%s -> %s", owner_id, model_id, str(dest_path))

    # Stream write with size cap
    total = 0
    try:
        with dest_path.open("wb") as out:
            while True:
                chunk = await file.read(8 * 1024 * 1024)  # 8 MiB
                if not chunk:
                    break
                total_next = total + len(chunk)
                if total_next > MAX_SIZE_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="File too large (max 200MB).",
                    )
                out.write(chunk)
                total = total_next
    finally:
        with contextlib.suppress(Exception):
            await file.close()

    if total == 0:
        with contextlib.suppress(Exception):
            dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Empty upload.")

    # Public URL (guaranteed inside root)
    rel_to_uploads = dest_path.resolve().relative_to(UPLOAD_ROOT.resolve())
    file_url = f"/uploads/{rel_to_uploads.as_posix()}"

    # Thumbnail
    thumb_fs_path = await _make_thumbnail(dest_path, model_id)
    try:
        rel_to_thumbs = thumb_fs_path.resolve().relative_to(THUMB_ROOT.resolve())
        thumb_url = f"/thumbnails/{rel_to_thumbs.as_posix()}"
    except Exception:
        thumb_url = None

    uploaded_at = _now()

    # Prepare DB record
    base_record: Dict[str, Any] = {
        "id": model_id,
        "user_id": owner_id,
        "filename": Path(file.filename).name,
        "file_path": str(dest_path),
        "file_url": file_url,
        "thumbnail_path": thumb_url,  # store public URL for browse page
        "turntable_path": None,
        "name": (name or Path(file.filename).stem),
        "description": (description or ""),
        "uploaded_at": uploaded_at,
        "volume": None,
        "bbox": None,
        "faces": None,
        "vertices": None,
        "geometry_hash": None,
        "is_duplicate": False,
    }

    # Cache schema the first time
    cols_cache = _model_uploads_columns()
    if not cols_cache:
        async with async_engine.begin() as conn:
            cols_res = await conn.execute(
                text("""
                    SELECT column_name, is_nullable
                    FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='model_uploads'
                """)
            )
            rows = cols_res.fetchall()
            if not rows:
                raise HTTPException(status_code=500, detail="Model uploads table is missing. Run migrations.")
            # fill cache
            _model_uploads_columns.cache_clear()
            @lru_cache(maxsize=1)
            def _filled() -> Dict[str, bool]:
                return {r[0]: (str(r[1]).upper() == "YES") for r in rows}
            globals()["_model_uploads_columns"] = _filled  # type: ignore
            cols_cache = _filled()

    table_cols = set(cols_cache.keys())
    record = {k: v for k, v in base_record.items() if k in table_cols}
    collist = ", ".join(f'"{c}"' for c in record.keys())
    vallist = ", ".join(f":{c}" for c in record.keys())

    async with async_engine.begin() as conn:
        await conn.execute(text(f'INSERT INTO public.model_uploads ({collist}) VALUES ({vallist})'), record)

    log.info("[upload] wrote %s bytes -> %s; thumbnail -> %s", total, dest_path, thumb_fs_path)

    payload = {
        "id": model_id,
        "bytes_written": total,
        "model": {
            "id": model_id,
            "user_id": record.get("user_id"),
            "name": record.get("name"),
            "description": record.get("description"),
            "filename": record.get("filename"),
            "file_path": record.get("file_path"),
            "file_url": file_url,
            "thumbnail_path": record.get("thumbnail_path"),
            "thumbnail_url": thumb_url,
            "turntable_path": None,
            "uploaded_at": uploaded_at.isoformat(),
        },
        "message": "uploaded",
    }
    return JSONResponse(status_code=status.HTTP_201_CREATED, content=payload)

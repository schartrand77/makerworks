# app/routes/upload.py

from __future__ import annotations

import contextlib
import logging
import os
import re
import sys
import subprocess
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional, List

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
from PIL import Image  # for PNG sanity check

from app.db.session import async_engine
from app.dependencies.auth import get_current_user  # auth dep

router = APIRouter()
log = logging.getLogger("uvicorn.error")

# ── Config ────────────────────────────────────────────────────────────────
UPLOAD_ROOT = Path(os.getenv("UPLOAD_DIR") or os.getenv("UPLOADS_PATH") or "/app/uploads").resolve()
THUMB_ROOT = Path(os.getenv("THUMBNAILS_DIR") or "/thumbnails").resolve()

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

# Model file policy
ALLOWED_EXTS = {".stl", ".3mf"}
MAX_SIZE_BYTES = 200 * 1024 * 1024  # 200 MB

# PHOTOS: image policy
ALLOWED_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB per image

THUMBNAIL_SIZE    = int(os.getenv("THUMBNAIL_SIZE", "1024"))
THUMBNAIL_BACKEND = os.getenv("THUMBNAIL_BACKEND", "auto")  # auto|pyrender|plotly
ALLOW_THUMB_FALLBACK = os.getenv("THUMBNAIL_FALLBACK", "false").lower() == "true"

# 1×1 transparent PNG (fallback)
_PNG_1x1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\x0cIDATx\x9cc``\x00"
    b"\x00\x00\x04\x00\x01\xf2\x1d\xdcS\x00\x00\x00\x00IEND\xaeB`\x82"
)
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

# ── Thumbnail (call CLI renderer; validate output) ─────────────────────────
async def _make_thumbnail(model_path: Path, model_id: str) -> Path:
    """
    Call the CLI renderer: python -m app.utils.render_thumbnail <in> <out> --backend ... --size ...
    Validate that we produced a non-trivial, real PNG. Optionally fall back to 1×1.
    """
    out_path = THUMB_ROOT / f"{model_id}.png"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable, "-m", "app.utils.render_thumbnail",
        str(model_path), str(out_path),
        "--backend", THUMBNAIL_BACKEND,
        "--size", str(THUMBNAIL_SIZE),
    ]
    log.info("[thumbnail] render: %s", " ".join(cmd))

    def _run():
        return subprocess.run(cmd, capture_output=True, text=True)
    proc = await run_in_threadpool(_run)

    if proc.returncode != 0:
        log.error("[thumbnail] renderer failed (%s)\nSTDOUT:\n%s\nSTDERR:\n%s",
                  proc.returncode, proc.stdout, proc.stderr)
        if ALLOW_THUMB_FALLBACK:
            out_path.write_bytes(_PNG_1x1)
            return out_path
        raise HTTPException(status_code=500, detail="Thumbnail renderer failed.")

    try:
        with out_path.open("rb") as f:
            sig = f.read(8)
        if sig != _PNG_MAGIC:
            raise RuntimeError("bad PNG signature")
        size_bytes = out_path.stat().st_size
        if size_bytes < 2048:
            raise RuntimeError(f"suspiciously small PNG ({size_bytes} bytes)")
        Image.open(out_path).verify()
    except Exception as e:
        log.error("[thumbnail] output validation failed: %s", e)
        if ALLOW_THUMB_FALLBACK:
            out_path.write_bytes(_PNG_1x1)
            return out_path
        with contextlib.suppress(Exception):
            out_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Invalid thumbnail produced.")

    return out_path

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
    s = (s or "").strip().replace("\\", "_").replace("/", "_")
    s = re.sub(r"[^a-zA-Z0-9._-]", "_", s).strip("._")
    return s[:128] or "user"

def _safe_join(root: Path, *parts: str) -> Path:
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
        raise HTTPException(status_code=400, detail="User id is not a valid UUID.")

@lru_cache(maxsize=1)
def _model_uploads_columns() -> Dict[str, bool]:
    """Cache column nullability. Returns {column_name: is_nullable_bool}"""
    return {}

# PHOTOS: resolve a model’s base directory & owner from DB
async def _resolve_model_dir(model_id: str) -> tuple[Path, str]:
    async with async_engine.begin() as conn:
        row = await conn.execute(
            text(
                """
                SELECT user_id, file_path
                FROM public.model_uploads
                WHERE id = :id
                """
            ),
            {"id": model_id},
        )
        rec = row.first()
    if not rec:
        raise HTTPException(status_code=404, detail="Model not found.")
    owner_id = str(rec[0])
    file_path = Path(str(rec[1])).resolve()
    # parent directory where model.<ext> lives
    model_dir = file_path.parent
    # Safety: keep it under UPLOAD_ROOT
    try:
        model_dir.resolve().relative_to(UPLOAD_ROOT.resolve())
    except Exception:
        raise HTTPException(status_code=500, detail="Model path is invalid.")
    return model_dir, owner_id

# ── Route (auth REQUIRED via get_current_user) ─────────────────────────────
# NOTE: this router is mounted in main.py with prefix="/api/v1/upload"
# so the path here must be "" (empty) to avoid /upload/upload.
@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_model(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    current_user: Any = Depends(get_current_user),  # FastAPI verifies token & loads user
):
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename.")

    ext = _safe_ext(file.filename)
    owner_id = _extract_user_id(current_user)

    model_uuid = uuid.uuid4()
    model_id = str(model_uuid)
    model_dir_id = model_uuid.hex

    dest_dir = _safe_join(UPLOAD_ROOT, "users", owner_id, "models", model_dir_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / f"model{ext}"

    log.info("[upload] owner=%s model_id=%s -> %s", owner_id, model_id, str(dest_path))

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

    rel_to_uploads = dest_path.resolve().relative_to(UPLOAD_ROOT.resolve())
    file_url = f"/uploads/{rel_to_uploads.as_posix()}"

    # Render thumbnail and compute public URL
    thumb_fs_path = await _make_thumbnail(dest_path, model_id)
    try:
        rel_to_thumbs = thumb_fs_path.resolve().relative_to(THUMB_ROOT.resolve())
        thumb_url = f"/thumbnails/{rel_to_thumbs.as_posix()}"
    except Exception:
        thumb_url = None

    uploaded_at = _now()

    base_record: Dict[str, Any] = {
        "id": model_id,
        "user_id": owner_id,
        "filename": Path(file.filename).name,
        "file_path": str(dest_path),
        "file_url": file_url,
        # Store the real filesystem path in thumbnail_path; URL in thumbnail_url (if column exists)
        "thumbnail_path": str(thumb_fs_path),
        "thumbnail_url": thumb_url,
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
            "thumbnail_path": record.get("thumbnail_path"),  # FS path
            "thumbnail_url": thumb_url,                      # public URL
            "turntable_path": None,
            "uploaded_at": uploaded_at.isoformat(),
        },
        "message": "uploaded",
    }
    return JSONResponse(status_code=status.HTTP_201_CREATED, content=payload)

# ───────────────────────────────────────────────────────────────────────────
# PHOTOS: real-world print images per model
# Directory: <UPLOAD_ROOT>/users/<user_id>/models/<model_dir>/thumnails/
# (spelling matches request)
# ───────────────────────────────────────────────────────────────────────────

def _ensure_image(f: Path):
    """Basic sanity: verify with Pillow; reject oversized."""
    if f.stat().st_size > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 25MB).")
    try:
        with Image.open(f) as im:
            im.verify()  # cheap structural check
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image.")

def _sanitize_file_name(name: str) -> str:
    stem = _sanitize_segment(Path(name).stem) or "image"
    ext = Path(name).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTS:
        raise HTTPException(status_code=400, detail="Only png, jpg, jpeg, webp allowed.")
    return f"{stem}{ext}"

@router.post("/models/{model_id}/photos", status_code=status.HTTP_201_CREATED)
async def upload_model_photos(
    model_id: str,
    files: List[UploadFile] = File(..., description="Up to N image files"),
    current_user: Any = Depends(get_current_user),
):
    # Resolve model dir + owner
    model_dir, owner_id = await _resolve_model_dir(model_id)

    # Optional: only owner (or admin) can upload — tweak to your auth model
    requester_id = _extract_user_id(current_user)
    if requester_id != owner_id and not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Not allowed to add photos to this model.")

    images_dir = model_dir / "thumnails"  # ← yes, thum-nails
    images_dir.mkdir(parents=True, exist_ok=True)

    written: List[Dict[str, Any]] = []

    for up in files:
        if not up.filename:
            continue
        safe_name = _sanitize_file_name(up.filename)
        # make name unique
        unique = f"{Path(safe_name).stem}-{uuid.uuid4().hex[:8]}{Path(safe_name).suffix}"
        dest = images_dir / unique

        # stream write with cap
        size = 0
        try:
            with dest.open("wb") as out:
                while True:
                    chunk = await up.read(2 * 1024 * 1024)  # 2 MiB
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > MAX_IMAGE_SIZE_BYTES:
                        raise HTTPException(status_code=413, detail="Image too large (max 25MB).")
                    out.write(chunk)
        finally:
            with contextlib.suppress(Exception):
                await up.close()

        if size == 0:
            with contextlib.suppress(Exception):
                dest.unlink(missing_ok=True)
            raise HTTPException(status_code=422, detail="Empty image upload.")

        # sanity check
        _ensure_image(dest)

        rel_url = f"/uploads/{dest.resolve().relative_to(UPLOAD_ROOT.resolve()).as_posix()}"
        written.append(
            {
                "id": uuid.uuid4().hex,
                "url": rel_url,
                "thumbnail_url": rel_url,  # same for now
                "caption": None,
                "created_at": _now().isoformat(),
            }
        )

    if not written:
        raise HTTPException(status_code=400, detail="No images uploaded.")

    return {"items": written, "count": len(written), "message": "photos uploaded"}

@router.get("/models/{model_id}/photos")
async def list_model_photos(model_id: str):
    model_dir, _owner_id = await _resolve_model_dir(model_id)
    images_dir = model_dir / "thumnails"
    if not images_dir.exists():
        return {"items": []}

    items: List[Dict[str, Any]] = []
    for p in sorted(images_dir.glob("*"), key=lambda x: x.stat().st_mtime, reverse=True):
        if p.suffix.lower() not in ALLOWED_IMAGE_EXTS:
            continue
        try:
            rel_url = f"/uploads/{p.resolve().relative_to(UPLOAD_ROOT.resolve()).as_posix()}"
        except Exception:
            continue
        items.append(
            {
                "id": uuid.uuid4().hex,
                "url": rel_url,
                "thumbnail_url": rel_url,
                "caption": None,
                "created_at": datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).isoformat(),
            }
        )
    return {"items": items}

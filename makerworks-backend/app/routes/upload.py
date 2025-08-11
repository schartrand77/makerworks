# app/routes/upload.py

from __future__ import annotations

import base64
import contextlib
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import (
    APIRouter,
    File,
    Form,
    Header,
    HTTPException,
    UploadFile,
    status,
    Cookie,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.db.session import async_engine

router = APIRouter()

# ── Config ────────────────────────────────────────────────────────────────
UPLOAD_ROOT = Path(os.getenv("UPLOAD_DIR", "/uploads")).resolve()
THUMB_ROOT = Path(os.getenv("THUMBNAILS_DIR", "/thumbnails")).resolve()
ALLOWED_EXTS = {".stl", ".3mf"}
MAX_SIZE_BYTES = 200 * 1024 * 1024  # 200 MB
ALLOW_ANON_UPLOADS = os.getenv("ALLOW_ANON_UPLOADS", "false").lower() == "true"
ANON_BUCKET = "anonymous"

log = logging.getLogger("uvicorn.error")

# Try to use your real thumbnail util; otherwise write a tiny placeholder PNG.
try:
    from app.utils.render_thumbnail import render_thumbnail as _render_thumb_util  # type: ignore
except Exception:  # pragma: no cover
    _render_thumb_util = None

# 1×1 transparent PNG
_PNG_1x1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\x0cIDATx\x9cc``\x00"
    b"\x00\x00\x04\x00\x01\xf2\x1d\xdcS\x00\x00\x00\x00IEND\xaeB`\x82"
)

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

def _uuid_or_none(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        return str(uuid.UUID(str(value).strip()))
    except Exception:
        return None

def _b64url_decode(data: str) -> bytes:
    pad = (-len(data)) % 4
    return base64.urlsafe_b64decode(data + ("=" * pad))

def _parse_jwt_payload_from_token(token_like: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Accepts either a bare JWT or 'Bearer <jwt>'.
    Returns payload dict or None (no verification).
    """
    if not token_like:
        return None
    try:
        token = token_like.strip()
        if " " in token:
            typ, _, tok = token.partition(" ")
            if typ.lower() != "bearer":
                return None
            token = tok
        parts = token.split(".")
        if len(parts) < 2:
            return None
        return json.loads(_b64url_decode(parts[1]).decode("utf-8"))
    except Exception as e:
        log.debug("[upload] JWT parse failed: %s", e)
        return None

async def _lookup_user_id_by_email(email: str) -> Optional[str]:
    async with async_engine.connect() as conn:
        res = await conn.execute(
            text("SELECT id FROM public.users WHERE email=:email"),
            {"email": email},
        )
        row = res.first()
        return str(row[0]) if row else None

async def _lookup_user_id_by_username(username: str) -> Optional[str]:
    async with async_engine.connect() as conn:
        res = await conn.execute(
            text("SELECT id FROM public.users WHERE username=:u"),
            {"u": username},
        )
        row = res.first()
        return str(row[0]) if row else None

async def _resolve_owner_id(
    form_user_id: Optional[str],
    header_user_id: Optional[str],
    token_candidates: list[Optional[str]],
) -> Optional[str]:
    # 1) Explicit UUIDs win
    for tag, candidate in (
        ("form", _uuid_or_none(form_user_id)),
        ("header", _uuid_or_none(header_user_id)),
    ):
        if candidate:
            log.debug("[upload] using %s user_id: %s", tag, candidate)
            return candidate

    # 2) JWT claims from any source (Authorization header, cookies)
    for tok in (t for t in token_candidates if t):
        claims = _parse_jwt_payload_from_token(tok)
        if not claims:
            continue

        # direct UUID claims
        for key in ("id", "user_id", "uid", "sub"):
            cand = _uuid_or_none(str(claims.get(key)) if claims.get(key) is not None else None)
            if cand:
                log.debug("[upload] using JWT %s -> %s", key, cand)
                return cand

        # email / username fallback
        email = claims.get("email")
        username = claims.get("username") or claims.get("preferred_username")
        if isinstance(email, str):
            uid = await _lookup_user_id_by_email(email)
            if uid:
                log.debug("[upload] JWT email lookup -> %s", uid)
                return uid
        if isinstance(username, str):
            uid = await _lookup_user_id_by_username(username)
            if uid:
                log.debug("[upload] JWT username lookup -> %s", uid)
                return uid

        log.debug("[upload] JWT had no usable id; keys: %s", list(claims.keys()))

    return None

async def _make_thumbnail(model_path: Path, thumb_path: Path):
    thumb_path.parent.mkdir(parents=True, exist_ok=True)
    if _render_thumb_util is not None:
        try:
            await run_in_threadpool(_render_thumb_util, str(model_path), str(thumb_path))
            return
        except Exception as e:
            log.warning("[thumbnail] render util failed (%s), writing placeholder", e)
    with thumb_path.open("wb") as f:
        f.write(_PNG_1x1)

# ── Route ─────────────────────────────────────────────────────────────────
@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_model(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    # Hyphenated header name (works with Axios/fetch)
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    authorization: Optional[str] = Header(None),
    # Common cookie names your frontend might be using
    access_token: Optional[str] = Cookie(None),
    mw_token: Optional[str] = Cookie(None),
    session: Optional[str] = Cookie(None),
):
    # Accept either header or cookie tokens; only block if truly unauthenticated
    token_candidates = [authorization, access_token, mw_token, session]
    has_any_token = any(bool(t) for t in token_candidates)

    if not has_any_token and not ALLOW_ANON_UPLOADS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in required.")

    _ensure_dir_writable(UPLOAD_ROOT)
    _ensure_dir_writable(THUMB_ROOT)

    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename.")

    ext = _safe_ext(file.filename)
    model_uuid = uuid.uuid4()

    owner_id = await _resolve_owner_id(user_id, x_user_id, token_candidates)
    if not owner_id:
        if ALLOW_ANON_UPLOADS:
            owner_id = ANON_BUCKET
            log.warning("[upload] unresolved user -> falling back to '%s' (ALLOW_ANON_UPLOADS)", ANON_BUCKET)
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not resolve user id from token/headers/cookies. Send X-User-Id or include id/sub/email in JWT.",
            )

    # Layout: /uploads/users/<user_id>/models/<model_id>/model.<ext>
    dest_dir = UPLOAD_ROOT / "users" / owner_id / "models" / model_uuid.hex
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / f"model{ext}"

    log.info(
        "[upload] resolved user=%s (anon=%s) model_id=%s -> %s  [hdr=%s, cookies=%s]",
        owner_id,
        owner_id == ANON_BUCKET,
        model_uuid,
        str(dest_path),
        bool(authorization),
        {"access_token": bool(access_token), "mw_token": bool(mw_token), "session": bool(session)},
    )

    total = 0
    try:
        with dest_path.open("wb") as out:
            while True:
                chunk = await file.read(8 * 1024 * 1024)  # 8 MiB
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_SIZE_BYTES:
                    with contextlib.suppress(Exception):
                        out.flush(); out.close()
                        dest_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="File too large (max 200MB).",
                    )
                out.write(chunk)
    finally:
        with contextlib.suppress(Exception):
            await file.close()

    if total == 0:
        with contextlib.suppress(Exception):
            dest_path.unlink(missing_ok=True)
        log.warning("[upload] empty upload for model_id=%s (filename=%s)", model_uuid, file.filename)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Empty upload.")

    # Build URLs that match StaticFiles mounts in main.py (if any)
    try:
        rel_to_uploads = dest_path.relative_to(UPLOAD_ROOT)
        file_url = f"/uploads/{rel_to_uploads.as_posix()}"
    except Exception:
        file_url = None

    # Thumbnail: /thumbnails/<model_id>.png
    thumb_path = THUMB_ROOT / f"{model_uuid}.png"
    await _make_thumbnail(dest_path, thumb_path)

    try:
        rel_to_thumbs = thumb_path.relative_to(THUMB_ROOT)
        thumb_url = f"/thumbnails/{rel_to_thumbs.as_posix()}"
    except Exception:
        thumb_url = None

    uploaded_at = _now()

    # ── INSERT into public.model_uploads (not 'models') ────────────────────
    # Table columns (per your logs):
    # id, user_id, filename, file_path, file_url, thumbnail_path, turntable_path,
    # name, description, uploaded_at, volume, bbox, faces, vertices, geometry_hash, is_duplicate
    base_record = {
        "id": str(model_uuid),
        "user_id": owner_id if owner_id != ANON_BUCKET else None,  # will be rejected if NULL
        "filename": Path(file.filename).name,
        "file_path": str(dest_path),
        "file_url": file_url,
        "thumbnail_path": str(thumb_path),
        "turntable_path": None,
        "name": name or Path(file.filename).stem,
        "description": description or "",
        "uploaded_at": uploaded_at,
        "volume": None,
        "bbox": None,
        "faces": None,
        "vertices": None,
        "geometry_hash": None,
        "is_duplicate": False,
    }

    async with async_engine.begin() as conn:
        # discover columns in public.model_uploads
        cols_res = await conn.execute(
            text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema='public' AND table_name='model_uploads'
            """)
        )
        table_cols = {r[0] for r in cols_res}

        if "user_id" in table_cols and base_record["user_id"] is None and not ALLOW_ANON_UPLOADS:
            # Enforce NOT NULL user_id unless anon is explicitly allowed
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Anonymous uploads are disabled.")

        record = {k: v for k, v in base_record.items() if k in table_cols}
        collist = ", ".join(f'"{c}"' for c in record.keys())
        vallist = ", ".join(f":{c}" for c in record.keys())
        sql = text(f'INSERT INTO public.model_uploads ({collist}) VALUES ({vallist})')
        await conn.execute(sql, record)

    log.info("[upload] wrote %s bytes -> %s; thumbnail -> %s", total, dest_path, thumb_path)

    payload = {
        "id": str(model_uuid),
        "bytes_written": total,
        "model": {
            "id": str(model_uuid),
            "user_id": base_record["user_id"],
            "name": base_record["name"],
            "description": base_record["description"],
            "filename": base_record["filename"],
            "file_path": base_record["file_path"],
            "file_url": file_url,
            "thumbnail_path": base_record["thumbnail_path"],
            "thumbnail_url": thumb_url,  # not stored in DB, but handy for the client
            "turntable_path": None,
            "uploaded_at": uploaded_at.isoformat(),
        },
        "message": "uploaded",
    }
    return JSONResponse(status_code=status.HTTP_201_CREATED, content=payload)

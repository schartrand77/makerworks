# app/routes/models.py
from __future__ import annotations

import logging
import os
import sys
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import text

from app.db.session import async_engine

log = logging.getLogger("uvicorn.error")

# ── Path roots (bind-safe) ────────────────────────────────────────────────────
def _norm_root(p: str) -> str:
    """
    Map container-internal defaults to the bind-mounted external roots.
    Example: '/app/uploads' -> '/uploads' (since we mount those at FS root).
    """
    return (
        (p or "")
        .replace("/app/uploads", "/uploads")
        .replace("/app/thumbnails", "/thumbnails")
        .replace("/app/models", "/models")
    )


UPLOAD_ROOT = Path(_norm_root(os.getenv("UPLOAD_DIR") or "/uploads")).resolve()
THUMB_ROOT = Path(_norm_root(os.getenv("THUMBNAILS_DIR") or "/thumbnails")).resolve()

UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
THUMB_ROOT.mkdir(parents=True, exist_ok=True)


# ── Utilities ────────────────────────────────────────────────────────────────
def _thumb_url_from_id(model_id: str) -> str:
    return f"/thumbnails/{model_id}.png"


def _public_file_url(file_path: str | None) -> Optional[str]:
    if not file_path:
        return None
    try:
        p = Path(_norm_root(file_path)).resolve()
        rel = p.relative_to(UPLOAD_ROOT)
        return f"/uploads/{rel.as_posix()}"
    except Exception:
        return None


def _row_to_model(row: Any) -> Dict[str, Any]:
    """
    Convert a SELECT row from public.model_uploads into the API model payload.
    Assumes columns:
      id, user_id, filename, file_path, file_url, thumbnail_path, turntable_path,
      name, description, uploaded_at, volume, bbox, faces, vertices, geometry_hash, is_duplicate
    """
    d = dict(row._mapping) if hasattr(row, "_mapping") else dict(row)
    model_id = d.get("id")
    # Prefer stored URLs; compute fallback if missing
    file_url = d.get("file_url") or _public_file_url(d.get("file_path"))
    thumb_url = d.get("thumbnail_path") or _thumb_url_from_id(model_id)

    return {
        "id": model_id,
        "user_id": d.get("user_id"),
        "name": d.get("name") or (d.get("filename") or "").split(".")[0],
        "description": d.get("description") or "",
        "filename": d.get("filename"),
        "file_path": _norm_root(d.get("file_path") or ""),
        "file_url": file_url,
        "thumbnail_path": thumb_url,   # keep name for backward-compat
        "thumbnail_url": thumb_url,    # explicit for the frontend
        "turntable_path": d.get("turntable_path"),
        "uploaded_at": d.get("uploaded_at"),
        "volume": d.get("volume"),
        "bbox": d.get("bbox"),
        "faces": d.get("faces"),
        "vertices": d.get("vertices"),
        "geometry_hash": d.get("geometry_hash"),
        "is_duplicate": d.get("is_duplicate", False),
    }


def _is_png(path: Path) -> bool:
    try:
        with path.open("rb") as f:
            return f.read(8) == b"\x89PNG\r\n\x1a\n"
    except Exception:
        return False


async def _render_thumbnail_subprocess(input_path: Path, output_path: Path, size: int = 1024, backend: str = "cpu") -> None:
    """
    Call the thumbnail renderer as a module to avoid import path collisions
    (e.g., local modules shadowing stdlib).
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable,
        "-m",
        "app.utils.render_thumbnail",
        str(input_path),
        str(output_path),
        "--backend",
        backend,
        "--size",
        str(size),
    ]

    def _run() -> None:
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            log.error("Thumbnail render failed: %s\nstdout:\n%s\nstderr:\n%s", cmd, proc.stdout, proc.stderr)
            raise RuntimeError(f"Renderer failed ({proc.returncode})")

    await run_in_threadpool(_run)

    if not output_path.exists() or not _is_png(output_path):
        raise RuntimeError("Renderer did not produce a valid PNG")


# ── Router ───────────────────────────────────────────────────────────────────
router = APIRouter()


@router.get("", status_code=status.HTTP_200_OK)
async def list_models(
    limit: int = Query(24, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: Optional[str] = Query(None, description="Filter by owner"),
    q: Optional[str] = Query(None, description="Search in name/filename"),
) -> Dict[str, Any]:
    where = ["1=1"]
    params: Dict[str, Any] = {}

    if user_id:
        where.append("user_id = :user_id")
        params["user_id"] = user_id

    if q:
        where.append("(LOWER(name) LIKE :q OR LOWER(filename) LIKE :q)")
        params["q"] = f"%{q.lower()}%"

    where_sql = " AND ".join(where)

    async with async_engine.begin() as conn:
        total_sql = text(f"SELECT COUNT(*) FROM public.model_uploads WHERE {where_sql}")
        total = (await conn.execute(total_sql, params)).scalar_one()

        rows_sql = text(
            f"""
            SELECT
              id, user_id, filename, file_path, file_url, thumbnail_path, turntable_path,
              name, description, uploaded_at, volume, bbox, faces, vertices, geometry_hash, is_duplicate
            FROM public.model_uploads
            WHERE {where_sql}
            ORDER BY uploaded_at DESC NULLS LAST, id DESC
            LIMIT :limit OFFSET :offset
            """
        )
        rows = (await conn.execute(rows_sql, {**params, "limit": limit, "offset": offset})).fetchall()

    items = [_row_to_model(r) for r in rows]
    return {"total": total, "items": items, "limit": limit, "offset": offset}


@router.get("/{model_id}", status_code=status.HTTP_200_OK)
async def get_model(model_id: str) -> Dict[str, Any]:
    async with async_engine.begin() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    SELECT
                      id, user_id, filename, file_path, file_url, thumbnail_path, turntable_path,
                      name, description, uploaded_at, volume, bbox, faces, vertices, geometry_hash, is_duplicate
                    FROM public.model_uploads
                    WHERE id = :id
                    """
                ),
                {"id": model_id},
            )
        ).first()

    if not row:
        raise HTTPException(status_code=404, detail="Model not found.")

    return _row_to_model(row)


@router.post("/{model_id}/rethumb", status_code=status.HTTP_202_ACCEPTED)
async def rethumb_model(model_id: str) -> Dict[str, Any]:
    """
    Force re-generate the thumbnail file at THUMB_ROOT/<id>.png, and update the DB to
    expose the thumbnail at /thumbnails/<id>.png for the frontend.
    """
    # Look up the stored file_path
    async with async_engine.begin() as conn:
        row = (
            await conn.execute(
                text("SELECT file_path, filename FROM public.model_uploads WHERE id = :id"),
                {"id": model_id},
            )
        ).first()

    if not row or not row[0]:
        raise HTTPException(status_code=404, detail="Model not found or missing file_path.")

    src = Path(_norm_root(str(row[0]))).resolve()
    if not src.exists():
        raise HTTPException(status_code=404, detail="Model file missing on disk.")

    # Only allow STL/3MF for now
    if not src.suffix.lower() in {".stl", ".3mf"}:
        raise HTTPException(status_code=400, detail="Only .stl or .3mf files are supported for thumbnails.")

    dst = THUMB_ROOT / f"{model_id}.png"

    size = int(os.getenv("THUMBNAIL_SIZE", "1024"))
    backend = os.getenv("THUMBNAIL_BACKEND", "cpu")

    try:
        await _render_thumbnail_subprocess(src, dst, size=size, backend=backend)
    except Exception as e:
        log.exception("Failed to render thumbnail for %s: %s", model_id, e)
        raise HTTPException(status_code=500, detail="Failed to generate thumbnail.")

    # Update DB record to point to the public URL (keeps old consumers happy)
    thumb_url = _thumb_url_from_id(model_id)
    async with async_engine.begin() as conn:
        try:
            await conn.execute(
                text("UPDATE public.model_uploads SET thumbnail_path = :u WHERE id = :i"),
                {"u": thumb_url, "i": model_id},
            )
        except Exception as e:
            # Non-fatal; file is there, API will still compute the URL.
            log.warning("Could not update thumbnail_path for %s: %s", model_id, e)

    return {"ok": True, "thumbnail_url": thumb_url}

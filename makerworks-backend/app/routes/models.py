# app/routes/models.py
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import text

from app.db.session import async_engine

# Try to use the same thumbnail util the upload route uses.
try:
    from app.utils.render_thumbnail import render_thumbnail as _render_thumb_util  # type: ignore
except Exception:  # pragma: no cover
    _render_thumb_util = None

log = logging.getLogger("uvicorn.error")

# ── Path roots (bind-safe) ────────────────────────────────────────────────────
def _norm_root(p: str) -> str:
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

# ── Router ───────────────────────────────────────────────────────────────────
router = APIRouter()

@router.get("/models", status_code=status.HTTP_200_OK)
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

@router.get("/models/{model_id}", status_code=status.HTTP_200_OK)
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

@router.post("/models/{model_id}/rethumb", status_code=status.HTTP_202_ACCEPTED)
async def rethumb_model(model_id: str) -> Dict[str, Any]:
    """
    Force re-generate the thumbnail and update the library.
    """
    # find file_path
    async with async_engine.begin() as conn:
        row = (
            await conn.execute(
                text("SELECT file_path FROM public.model_uploads WHERE id=:id"),
                {"id": model_id},
            )
        ).first()

    if not row or not row[0]:
        raise HTTPException(status_code=404, detail="Model not found or missing file_path.")

    file_path = Path(_norm_root(str(row[0]))).resolve()
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Model file missing on disk.")

    thumb_path = THUMB_ROOT / f"{model_id}.png"
    thumb_path.parent.mkdir(parents=True, exist_ok=True)

    if _render_thumb_util is None:
        # best effort placeholder
        from PIL import Image
        img = Image.new("RGBA", (16, 16), (240, 240, 240, 255))
        img.save(thumb_path, "PNG")
        ok = thumb_path.exists()
    else:
        # try new signature first, fall back to old
        try:
            await run_in_threadpool(_render_thumb_util, str(file_path), str(model_id))
        except TypeError:
            await run_in_threadpool(_render_thumb_util, str(file_path), str(thumb_path))
        ok = thumb_path.exists()

    if not ok:
        raise HTTPException(status_code=500, detail="Failed to generate thumbnail.")

    return {"ok": True, "thumbnail_url": f"/thumbnails/{model_id}.png"}

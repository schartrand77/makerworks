# app/routes/filaments.py
from __future__ import annotations

from typing import Any, Dict, Optional
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, admin_required
from app.models.models import Filament  # your ORM model

router = APIRouter()  # tags supplied in main.py (use tags=["filaments"])

# ---------- helpers (sync/async compatible) ----------
async def _exec(db: Session | AsyncSession, stmt):
    if isinstance(db, AsyncSession):
        return await db.execute(stmt)
    return db.execute(stmt)

async def _commit(db: Session | AsyncSession):
    if isinstance(db, AsyncSession):
        await db.commit()
    else:
        db.commit()

def _has(model: Any, attr: str) -> bool:
    return hasattr(model, attr)

def _set(obj: Any, attr: str, val: Any):
    if hasattr(obj, attr):
        setattr(obj, attr, val)

def _row(row: Any) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    mapping = {
        "id": "id",
        "type": "type",
        "color_name": "color",
        "color_hex": "hex",
        "is_active": "is_active",
        "created_at": "created_at",
        "updated_at": "updated_at",
    }
    for attr, key in mapping.items():
        if hasattr(row, attr):
            out[key] = getattr(row, attr)
    return out

def _q_bool(req: Request, name: str, default: bool) -> bool:
    raw = req.query_params.get(name)
    if raw is None:
        return default
    s = str(raw).strip().lower()
    return s in ("1", "true", "t", "yes", "y", "on")

def _q_int(req: Request, name: str, default: int) -> int:
    raw = req.query_params.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return max(0, int(str(raw)))
    except Exception:
        return default

# ---------- GET /api/v1/filaments and /api/v1/filaments/ ----------
@router.get("/")
async def list_filaments(request: Request, db: Session | AsyncSession = Depends(get_db)):
    """
    Super-permissive list: accepts any combo of:
      - include_inactive(=true|1)
      - offset/limit
      - page/per_page
    …without triggering Pydantic 422s.
    """
    include_inactive = _q_bool(request, "include_inactive", False)

    # support page/per_page or offset/limit
    page = _q_int(request, "page", 0)
    per_page = _q_int(request, "per_page", 0)
    if page > 0 or per_page > 0:
        p = page or 1
        pp = per_page or 1000
        offset = (p - 1) * pp
        limit = pp
    else:
        offset = _q_int(request, "offset", 0)
        limit = _q_int(request, "limit", 1000)

    stmt = select(Filament)
    if _has(Filament, "is_active") and not include_inactive:
        stmt = stmt.where(Filament.is_active != False)  # noqa: E712

    if _has(Filament, "type"):
        stmt = stmt.order_by(Filament.type.asc())

    if limit:
        stmt = stmt.offset(offset).limit(limit)

    res = await _exec(db, stmt)
    items = res.scalars().all()
    return [_row(it) for it in items]

# Accept no-trailing-slash too (hidden from OpenAPI)
@router.get("", include_in_schema=False)
async def list_filaments_no_slash(request: Request, db: Session | AsyncSession = Depends(get_db)):
    return await list_filaments(request=request, db=db)

# ---------- POST /api/v1/filaments/ ----------
@router.post("/")
async def create_filament(
    payload: Dict[str, Any],
    db: Session | AsyncSession = Depends(get_db),
    admin=Depends(admin_required),
):
    type_val = (payload.get("type") or "").strip()
    if not type_val:
        raise HTTPException(
            status_code=422,
            detail=[{"loc": ["body", "type"], "msg": "type is required", "type": "value_error"}],
        )
    f = Filament()
    _set(f, "type", type_val)
    _set(f, "color_name", (payload.get("color") or "").strip())
    _set(f, "color_hex", (payload.get("hex") or "").strip())
    if _has(Filament, "is_active"):
        _set(f, "is_active", bool(payload.get("is_active", True)))
    now = datetime.utcnow()
    if _has(Filament, "created_at") and getattr(f, "created_at", None) is None:
        _set(f, "created_at", now)
    if _has(Filament, "updated_at"):
        _set(f, "updated_at", now)

    if isinstance(db, AsyncSession):
        db.add(f)
    else:
        db.add(f)
    await _commit(db)

    res = await _exec(db, select(Filament).where(Filament.id == f.id))
    created = res.scalars().first() or f
    return _row(created)

# Accept no-trailing-slash too (hidden from OpenAPI)
@router.post("", include_in_schema=False)
async def create_filament_no_slash(
    payload: Dict[str, Any],
    db: Session | AsyncSession = Depends(get_db),
    admin=Depends(admin_required),
):
    return await create_filament(payload=payload, db=db, admin=admin)

# ---------- PATCH /api/v1/filaments/{filament_id} ----------
@router.patch("/{filament_id}")
async def update_filament(
    filament_id: UUID,
    payload: Dict[str, Any],
    db: Session | AsyncSession = Depends(get_db),
    admin=Depends(admin_required),
):
    res = await _exec(db, select(Filament).where(Filament.id == filament_id))
    f = res.scalars().first()
    if not f:
        raise HTTPException(404, "Filament not found")

    if "type" in payload and _has(Filament, "type"):
        val = (payload.get("type") or "").strip()
        if not val:
            raise HTTPException(422, "type cannot be empty")
        f.type = val
    if "color" in payload and _has(Filament, "color_name"):
        f.color_name = (payload.get("color") or "").strip()
    if "hex" in payload and _has(Filament, "color_hex"):
        f.color_hex = (payload.get("hex") or "").strip()
    if "is_active" in payload and _has(Filament, "is_active"):
        f.is_active = bool(payload.get("is_active"))
    if _has(Filament, "updated_at"):
        f.updated_at = datetime.utcnow()

    await _commit(db)
    return _row(f)

# ---------- DELETE /api/v1/filaments/{filament_id} ----------
@router.delete("/{filament_id}")
async def delete_filament(
    filament_id: UUID,
    db: Session | AsyncSession = Depends(get_db),
    admin=Depends(admin_required),
):
    res = await _exec(db, select(Filament).where(Filament.id == filament_id))
    f = res.scalars().first()
    if not f:
        raise HTTPException(404, "Filament not found")

    if _has(Filament, "is_active"):
        f.is_active = False
        if _has(Filament, "updated_at"):
            f.updated_at = datetime.utcnow()
        await _commit(db)
        return {"status": "ok", "message": "Soft-deleted", "id": str(filament_id)}

    # fallback hard delete if no is_active column
    if isinstance(db, AsyncSession):
        await db.delete(f)  # type: ignore[arg-type]
    else:
        db.delete(f)
    await _commit(db)
    return {"status": "ok", "message": "Deleted", "id": str(filament_id)}

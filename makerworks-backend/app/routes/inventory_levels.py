# app/routes/inventory_levels.py
from __future__ import annotations

from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, admin_required
from app.models.inventory import InventoryLevel, Warehouse, ProductVariant

router = APIRouter(prefix="/inventory/levels", tags=["inventory"])

def _q_str(req: Request, name: str) -> Optional[str]:
    v = req.query_params.get(name)
    if v is None:
        return None
    s = str(v).strip()
    return s or None

def _q_int(req: Request, name: str, default: int = 0) -> int:
    v = req.query_params.get(name)
    if v is None or str(v).strip() == "":
        return default
    try:
        return int(v)
    except Exception:
        return default

@router.get("")
async def list_levels(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin=Depends(admin_required),
):
    variant_id = _q_str(request, "variant_id")
    warehouse_id = _q_str(request, "warehouse_id")
    page = max(1, _q_int(request, "page", 1))
    page_size = max(1, _q_int(request, "page_size", 50))
    off = (page - 1) * page_size

    q = select(InventoryLevel)
    if variant_id:
        q = q.where(InventoryLevel.variant_id == variant_id)
    if warehouse_id:
        q = q.where(InventoryLevel.warehouse_id == warehouse_id)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (await db.execute(q.offset(off).limit(page_size))).scalars().all()

    def out(r: InventoryLevel) -> Dict[str, Any]:
        return {
            "variant_id": str(r.variant_id),
            "warehouse_id": str(r.warehouse_id),
            "on_hand": r.on_hand,
            "reserved": r.reserved,
            "updated_at": r.updated_at,
        }

    return {"items": [out(r) for r in rows], "total": total, "page": page, "page_size": page_size}

@router.patch("")
async def upsert_level(
    body: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    admin=Depends(admin_required),
):
    vid = body.get("variant_id")
    wid = body.get("warehouse_id")
    if not vid or not wid:
        raise HTTPException(422, "variant_id and warehouse_id are required")

    try:
        on_hand = int(body.get("on_hand", 0))
        reserved = int(body.get("reserved", 0))
    except Exception:
        raise HTTPException(422, "on_hand and reserved must be integers")

    # validate existence (give friendly 404s)
    if not (await db.get(ProductVariant, vid)):
        raise HTTPException(404, "Variant not found")
    if not (await db.get(Warehouse, wid)):
        raise HTTPException(404, "Warehouse not found")

    # composite PK → pass a tuple (variant_id, warehouse_id)
    row = await db.get(InventoryLevel, (vid, wid))
    if not row:
        row = InventoryLevel(variant_id=vid, warehouse_id=wid, on_hand=on_hand, reserved=reserved)
        db.add(row)
    else:
        row.on_hand = on_hand
        row.reserved = reserved

    await db.commit()

    return {
        "variant_id": str(row.variant_id),
        "warehouse_id": str(row.warehouse_id),
        "on_hand": row.on_hand,
        "reserved": row.reserved,
        "updated_at": row.updated_at,
    }

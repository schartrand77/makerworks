# app/routes/inventory_levels.py
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
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


@router.get("", summary="List inventory levels")
async def list_levels(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin=Depends(admin_required),
):
    """
    Query params:
      - variant_id: optional filter
      - warehouse_id: optional filter
      - page: default 1
      - page_size: default 50
    """
    variant_id = _q_str(request, "variant_id")
    warehouse_id = _q_str(request, "warehouse_id")
    page = max(1, _q_int(request, "page", 1))
    page_size = max(1, _q_int(request, "page_size", 50))
    off = (page - 1) * page_size

    base_q = select(InventoryLevel)
    if variant_id:
        base_q = base_q.where(InventoryLevel.variant_id == variant_id)
    if warehouse_id:
        base_q = base_q.where(InventoryLevel.warehouse_id == warehouse_id)

    # total count
    total_q = select(func.count()).select_from(base_q.subquery())
    total = (await db.execute(total_q)).scalar_one()

    # stable ordering for deterministic pagination
    q = base_q.order_by(InventoryLevel.variant_id.asc(), InventoryLevel.warehouse_id.asc())
    rows = (await db.execute(q.offset(off).limit(page_size))).scalars().all()

    def out(r: InventoryLevel) -> Dict[str, Any]:
        return {
            "variant_id": str(r.variant_id),
            "warehouse_id": str(r.warehouse_id),
            "on_hand": int(r.on_hand),
            "reserved": int(r.reserved),
            "updated_at": r.updated_at,
        }

    return {"items": [out(r) for r in rows], "total": total, "page": page, "page_size": page_size}


async def _upsert_impl(body: Dict[str, Any], db: AsyncSession) -> Dict[str, Any]:
    vid = str(body.get("variant_id") or "").strip()
    wid = str(body.get("warehouse_id") or "").strip()
    if not vid or not wid:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "variant_id and warehouse_id are required")

    try:
        on_hand = int(body.get("on_hand", 0))
        reserved = int(body.get("reserved", 0))
    except Exception:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "on_hand and reserved must be integers")

    # Soft validation: allow negatives only if your business logic allows it.
    if reserved < 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "reserved cannot be negative")
    # If you disallow negative on_hand, uncomment:
    # if on_hand < 0:
    #     raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "on_hand cannot be negative")

    # Validate existence (return friendly 404s)
    if not (await db.get(ProductVariant, vid)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Variant not found")
    if not (await db.get(Warehouse, wid)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Warehouse not found")

    # Composite PK is (variant_id, warehouse_id)
    row = await db.get(InventoryLevel, (vid, wid))
    if row is None:
        row = InventoryLevel(variant_id=vid, warehouse_id=wid, on_hand=on_hand, reserved=reserved)
        db.add(row)
    else:
        row.on_hand = on_hand
        row.reserved = reserved

    await db.commit()
    # ensure updated_at is current in the response
    await db.refresh(row)

    return {
        "variant_id": str(row.variant_id),
        "warehouse_id": str(row.warehouse_id),
        "on_hand": int(row.on_hand),
        "reserved": int(row.reserved),
        "updated_at": row.updated_at,
    }


@router.put("", summary="Upsert inventory level (create if missing, else update)")
async def upsert_level_put(
    body: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    admin=Depends(admin_required),
):
    return await _upsert_impl(body, db)


# Backward-compat: allow PATCH to call the same upsert.
@router.patch("", summary="Upsert inventory level (PATCH compatibility)")
async def upsert_level_patch(
    body: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    admin=Depends(admin_required),
):
    return await _upsert_impl(body, db)

# app/routes/inventory_moves.py
from __future__ import annotations

from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, admin_required
from app.models.inventory import InventoryLevel, Warehouse, ProductVariant, StockMove

router = APIRouter(prefix="/inventory/moves", tags=["inventory"])


def _q_int(req: Request, name: str, default: int = 1) -> int:
    v = req.query_params.get(name)
    if v is None or str(v).strip() == "":
        return default
    try:
        return int(v)
    except Exception:
        return default


@router.get("", summary="List stock moves")
async def list_moves(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin=Depends(admin_required),
):
    """
    Query:
      - page (default 1)
      - page_size (default 50)
    Returns {items, page, page_size, total} with stable ordering (created_at desc, then id desc).
    """
    page = max(1, _q_int(request, "page", 1))
    page_size = max(1, _q_int(request, "page_size", 50))
    off = (page - 1) * page_size

    base_q = select(StockMove)
    total = (await db.execute(select(func.count()).select_from(base_q.subquery()))).scalar_one()

    q = base_q.order_by(StockMove.created_at.desc(), StockMove.id.desc())
    rows = (await db.execute(q.offset(off).limit(page_size))).scalars().all()

    def out(m: StockMove) -> Dict[str, Any]:
        return {
            "id": str(m.id),
            "variant_id": str(m.variant_id),
            "warehouse_id": str(m.warehouse_id),
            "to_warehouse_id": str(m.to_warehouse_id) if getattr(m, "to_warehouse_id", None) else None,
            "qty": int(m.qty),
            "type": str(m.type),
            "note": m.note,
            "created_at": m.created_at,
        }

    return {"items": [out(r) for r in rows], "total": total, "page": page, "page_size": page_size}


async def _get_or_create_level(db: AsyncSession, variant_id: str, warehouse_id: str) -> InventoryLevel:
    row = await db.get(InventoryLevel, (variant_id, warehouse_id))
    if not row:
        row = InventoryLevel(variant_id=variant_id, warehouse_id=warehouse_id, on_hand=0, reserved=0)
        db.add(row)
    return row


def _require_positive(qty: int, field: str = "qty") -> None:
    if qty <= 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{field} must be > 0")


@router.post("", summary="Create a stock move (purchase|sale|adjust|transfer)")
async def create_move(
    body: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    admin=Depends(admin_required),
):
    # Extract + basic validation
    variant_id = (body.get("variant_id") or "").strip()
    warehouse_id = (body.get("warehouse_id") or "").strip()
    to_warehouse_id: Optional[str] = (body.get("to_warehouse_id") or None)
    to_warehouse_id = to_warehouse_id.strip() if isinstance(to_warehouse_id, str) else None
    move_type = (body.get("type") or "").strip().lower()
    note = (body.get("note") or "").strip() or None

    if not variant_id or not warehouse_id or not move_type:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "variant_id, warehouse_id and type are required")

    # qty parsing & rules
    try:
        qty = int(body.get("qty", 0))
    except Exception:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "qty must be an integer")

    if move_type not in {"purchase", "sale", "adjust", "transfer"}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "type must be one of purchase|sale|adjust|transfer")

    # Allow negatives only for 'adjust' (UI can send negative to subtract, or positive to add)
    if move_type == "adjust":
        if qty == 0:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "qty must be non-zero for adjust")
    else:
        _require_positive(qty)

    if move_type == "transfer" and not to_warehouse_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "to_warehouse_id required for transfer")

    # Friendly rejections for temp IDs (if you want to enforce server-side)
    if variant_id.startswith("temp:"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Temporary variant IDs cannot be used for moves. Create the product in the Catalog first.")

    # Existence checks
    if not (await db.get(ProductVariant, variant_id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Variant not found")
    src_wh = await db.get(Warehouse, warehouse_id)
    if not src_wh:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Warehouse not found")

    # Apply inventory effects atomically
    if move_type == "transfer":
        dst_wh = await db.get(Warehouse, to_warehouse_id)
        if not dst_wh:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Destination warehouse not found")

        src_level = await _get_or_create_level(db, variant_id, warehouse_id)
        if src_level.on_hand < qty:
            raise HTTPException(status.HTTP_409_CONFLICT, "insufficient stock to transfer")

        dst_level = await _get_or_create_level(db, variant_id, to_warehouse_id)

        # decrement src, increment dst
        src_level.on_hand -= qty
        dst_level.on_hand += qty

        move = StockMove(
            variant_id=variant_id,
            warehouse_id=warehouse_id,
            to_warehouse_id=to_warehouse_id,
            qty=qty,
            type="transfer",
            note=note,
        )
        db.add(move)
        await db.commit()
        await db.refresh(move)
        # (levels' updated_at are DB-managed; no need to refresh for the response here)

        return {
            "id": str(move.id),
            "variant_id": variant_id,
            "warehouse_id": warehouse_id,
            "to_warehouse_id": to_warehouse_id,
            "qty": qty,
            "type": "transfer",
            "note": note,
            "created_at": move.created_at,
            "status": "ok",
        }

    # Single-warehouse moves
    level = await _get_or_create_level(db, variant_id, warehouse_id)

    if move_type == "purchase":
        level.on_hand += qty
    elif move_type == "sale":
        if level.on_hand < qty:
            raise HTTPException(status.HTTP_409_CONFLICT, "insufficient stock to sell")
        level.on_hand -= qty
    elif move_type == "adjust":
        # qty can be positive (increase) or negative (decrease)
        level.on_hand += qty

    move = StockMove(
        variant_id=variant_id,
        warehouse_id=warehouse_id,
        qty=qty,
        type=move_type,
        note=note,
    )
    db.add(move)
    await db.commit()
    await db.refresh(move)

    return {
        "id": str(move.id),
        "variant_id": variant_id,
        "warehouse_id": warehouse_id,
        "to_warehouse_id": None,
        "qty": int(qty),
        "type": move_type,
        "note": note,
        "created_at": move.created_at,
        "status": "ok",
    }

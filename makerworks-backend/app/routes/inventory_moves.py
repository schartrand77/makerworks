# app/routes/inventory_moves.py
from __future__ import annotations

from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Request
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

@router.get("")
async def list_moves(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin=Depends(admin_required),
):
    page = max(1, _q_int(request, "page", 1))
    page_size = max(1, _q_int(request, "page_size", 50))
    off = (page - 1) * page_size

    q = select(StockMove).order_by(StockMove.created_at.desc())
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (await db.execute(q.offset(off).limit(page_size))).scalars().all()

    def out(m: StockMove) -> Dict[str, Any]:
        return {
            "id": str(m.id),
            "variant_id": str(m.variant_id),
            "warehouse_id": str(m.warehouse_id),
            "qty": m.qty,
            "type": m.type,
            "note": m.note,
            "created_at": m.created_at,
        }

    return {"items": [out(r) for r in rows], "total": total, "page": page, "page_size": page_size}

@router.post("")
async def create_move(
    body: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    admin=Depends(admin_required),
):
    v_id = body.get("variant_id")
    w_id = body.get("warehouse_id")
    to_w_id = body.get("to_warehouse_id")  # only for transfer

    try:
        qty = int(body.get("qty", 0))
    except Exception:
        raise HTTPException(422, "qty must be an integer")

    move_type = (body.get("type") or "").strip().lower()
    note = (body.get("note") or "").strip() or None

    if not v_id or not w_id or not move_type:
        raise HTTPException(422, "variant_id, warehouse_id and type are required")
    if qty <= 0:
        raise HTTPException(422, "qty must be > 0")
    if move_type not in {"purchase", "sale", "adjust", "transfer"}:
        raise HTTPException(422, "type must be one of purchase|sale|adjust|transfer")
    if move_type == "transfer" and not to_w_id:
        raise HTTPException(422, "to_warehouse_id required for transfer")

    if not (await db.get(ProductVariant, v_id)):
        raise HTTPException(404, "Variant not found")
    src = await db.get(Warehouse, w_id)
    if not src:
        raise HTTPException(404, "Warehouse not found")

    async def level_of(vid, wid) -> InventoryLevel:
        row = await db.get(InventoryLevel, (vid, wid))
        if not row:
            row = InventoryLevel(variant_id=vid, warehouse_id=wid, on_hand=0, reserved=0)
            db.add(row)
        return row

    if move_type == "transfer":
        dst = await db.get(Warehouse, to_w_id)
        if not dst:
            raise HTTPException(404, "Destination warehouse not found")

        src_level = await level_of(v_id, w_id)
        if src_level.on_hand < qty:
            raise HTTPException(409, "insufficient stock to transfer")

        # out of src, into dst
        out_m = StockMove(variant_id=v_id, warehouse_id=w_id, qty=qty, type="transfer", note=note)
        dst_level = await level_of(v_id, to_w_id)
        src_level.on_hand -= qty
        dst_level.on_hand += qty
        in_m = StockMove(variant_id=v_id, warehouse_id=to_w_id, qty=qty, type="purchase", note=f"transfer in: {note or ''}".strip())

        db.add_all([out_m, in_m])
        await db.commit()
        return {"status": "ok", "moves": [{"id": str(out_m.id)}, {"id": str(in_m.id)}]}

    # single-warehouse moves
    level = await level_of(v_id, w_id)
    if move_type == "purchase":
        level.on_hand += qty
    elif move_type == "sale":
        if level.on_hand < qty:
            raise HTTPException(409, "insufficient stock to sell")
        level.on_hand -= qty
    elif move_type == "adjust":
        # convention: pass negative qty from client to subtract
        level.on_hand += qty

    move = StockMove(variant_id=v_id, warehouse_id=w_id, qty=qty, type=move_type, note=note)
    db.add(move)
    await db.commit()

    return {"status": "ok", "id": str(move.id)}

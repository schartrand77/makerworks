# app/routes/user_inventory.py
from __future__ import annotations

from typing import Any, Dict
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user
from app.models.inventory import UserItem, ProductVariant

router = APIRouter(prefix="/user/inventory", tags=["user-inventory"])

def _q_int(req: Request, name: str, default: int = 1) -> int:
    v = req.query_params.get(name)
    if v is None or str(v).strip() == "":
        return default
    try:
        return int(v)
    except Exception:
        return default

@router.get("")
async def list_user_items(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    page = max(1, _q_int(request, "page", 1))
    page_size = max(1, _q_int(request, "page_size", 50))
    off = (page - 1) * page_size

    q = select(UserItem).where(UserItem.user_id == user.id).order_by(UserItem.created_at.desc())
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (await db.execute(q.offset(off).limit(page_size))).scalars().all()

    def out(it: UserItem) -> Dict[str, Any]:
        return {
            "id": str(it.id),
            "variant_id": str(it.variant_id),
            "qty": it.qty,
            "cost_cents": it.cost_cents,
            "notes": it.notes,
            "created_at": it.created_at,
        }

    return {"items": [out(r) for r in rows], "total": total, "page": page, "page_size": page_size}

@router.post("")
async def create_user_item(
    body: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    v_id = body.get("variant_id")
    if not v_id:
        raise HTTPException(422, "variant_id is required")
    try:
        qty = int(body.get("qty", 1))
        cost_cents = int(body.get("cost_cents", 0))
    except Exception:
        raise HTTPException(422, "qty and cost_cents must be integers")
    if qty <= 0:
        raise HTTPException(422, "qty must be > 0")

    if not (await db.get(ProductVariant, v_id)):
        raise HTTPException(404, "Variant not found")

    row = UserItem(user_id=user.id, variant_id=v_id, qty=qty, cost_cents=cost_cents, notes=(body.get("notes") or "").strip() or None)
    db.add(row)
    await db.commit()
    return {"id": str(row.id)}

@router.patch("/{item_id}")
async def update_user_item(
    item_id: UUID,
    body: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    row = await db.get(UserItem, item_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Item not found")

    if "qty" in body:
        try:
            q = int(body.get("qty", 1))
        except Exception:
            raise HTTPException(422, "qty must be integer")
        if q <= 0:
            raise HTTPException(422, "qty must be > 0")
        row.qty = q

    if "cost_cents" in body:
        try:
            row.cost_cents = int(body.get("cost_cents", 0))
        except Exception:
            raise HTTPException(422, "cost_cents must be integer")

    if "notes" in body:
        row.notes = (body.get("notes") or "").strip() or None

    await db.commit()
    return {"status": "ok"}

@router.delete("/{item_id}")
async def delete_user_item(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    row = await db.get(UserItem, item_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Item not found")
    await db.delete(row)
    await db.commit()
    return {"status": "ok"}

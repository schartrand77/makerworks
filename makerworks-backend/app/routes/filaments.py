# app/routes/filaments.py
from __future__ import annotations

from typing import Optional, List
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, update, delete, func, insert, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

# use the async session dependency directly
from app.db.database import get_async_db as get_db
from app.dependencies import optional_user, admin_required
from app.schemas.filaments import FilamentCreate, FilamentUpdate, FilamentOut
from app.models.models import Filament  # adjust if your model lives elsewhere

router = APIRouter(prefix="/api/v1/filaments", tags=["Filaments"])

# ──────────────────────────────────────────────────────────────────────────────
# helpers
# ──────────────────────────────────────────────────────────────────────────────
def _norm_str(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    s = v.strip()
    return s or None

def _norm_hex(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    s = v.strip().upper()
    if not s:
        return None
    if not s.startswith("#"):
        s = "#" + s
    return s

def _has_attr(model, name: str) -> bool:
    return hasattr(model, name)

def _col_or_none(model, *candidates):
    for n in candidates:
        if _has_attr(model, n):
            return getattr(model, n)
    return None

def _col_required(model, *candidates):
    col = _col_or_none(model, *candidates)
    if col is None:
        raise HTTPException(
            status_code=500,
            detail=f"Filament model missing required column; tried {candidates}"
        )
    return col

# Resolve columns once (tolerant to legacy aliases)
TYPE_COL = _col_required(Filament, "category", "type", "material_type")
NAME_COL = _col_or_none(Filament, "name")
OPTIONAL_TYPE_COL = _col_or_none(Filament, "type") if TYPE_COL.key != "type" else None
COLOR_COL = _col_or_none(Filament, "color", "color_name", "colour")
HEX_COL = _col_or_none(Filament, "hex", "color_hex", "hex_color")
PRICE_COL = _col_or_none(Filament, "price_per_kg", "price")
IS_ACTIVE_COL = _col_or_none(Filament, "is_active", "active")
CREATED_AT_COL = _col_or_none(Filament, "created_at", "createdAt", "created")

def _unique_select(type_: str, color: Optional[str], hex_: Optional[str]):
    stmt = select(Filament).where(func.lower(TYPE_COL) == func.lower(type_))
    if COLOR_COL is not None:
        if color is not None:
            stmt = stmt.where(func.lower(COLOR_COL) == func.lower(color))
        else:
            stmt = stmt.where(COLOR_COL.is_(None))
    if HEX_COL is not None:
        if hex_ is not None:
            stmt = stmt.where(func.upper(HEX_COL) == func.upper(hex_))
        else:
            stmt = stmt.where(HEX_COL.is_(None))
    return stmt

# Pydantic v1/v2 friendly conversion
def _to_out(obj: Filament) -> FilamentOut:
    try:
        # v2
        return FilamentOut.model_validate(obj)  # type: ignore[attr-defined]
    except Exception:
        # v1
        return FilamentOut.from_orm(obj)  # type: ignore[attr-defined]

# ──────────────────────────────────────────────────────────────────────────────
# routes
# ──────────────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[FilamentOut])
async def list_filaments(
    db: AsyncSession = Depends(get_db),
    _user=Depends(optional_user),  # public-friendly
    search: Optional[str] = Query(None, description="Filter by type/name/color/hex (case-insensitive)"),
    include_inactive: bool = Query(False, alias="include_inactive"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
):
    q = select(Filament)

    if not include_inactive and IS_ACTIVE_COL is not None:
        q = q.where((IS_ACTIVE_COL.is_(True)) | (IS_ACTIVE_COL.is_(None)))

    if search:
        term = f"%{search.strip().lower()}%"
        pieces = [func.lower(TYPE_COL).like(term)]
        if NAME_COL is not None:
            pieces.append(func.lower(NAME_COL).like(term))
        if COLOR_COL is not None:
            pieces.append(func.lower(COLOR_COL).like(term))
        if HEX_COL is not None:
            pieces.append(func.upper(HEX_COL).like(term.upper()))
        cond = pieces[0]
        for p in pieces[1:]:
            cond = cond | p
        q = q.where(cond)

    order_by = [func.lower(TYPE_COL)]
    if NAME_COL is not None:
        order_by.append(func.lower(NAME_COL))
    if COLOR_COL is not None:
        order_by.append(func.lower(COLOR_COL))
    if CREATED_AT_COL is not None:
        order_by.append(CREATED_AT_COL.desc())

    q = q.order_by(*order_by).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).scalars().all()
    return [_to_out(r) for r in rows]

@router.get("/{filament_id}", response_model=FilamentOut)
async def get_filament(
    filament_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(optional_user),
):
    row = await db.get(Filament, filament_id)
    if not row:
        raise HTTPException(status_code=404, detail="Filament not found")
    return _to_out(row)

@router.post(
    "",
    response_model=FilamentOut,
    status_code=status.HTTP_200_OK,  # idempotent: returns existing row on duplicate
)
async def create_filament(
    body: FilamentCreate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(admin_required),
):
    # Normalize incoming values
    type_norm = _norm_str(getattr(body, "type", None)) or ""
    category_norm = _norm_str(getattr(body, "category", None)) or type_norm
    name_norm = _norm_str(getattr(body, "name", None)) or f"{category_norm} {_norm_str(getattr(body, 'color_name', None)) or ''}".strip()

    color_in = getattr(body, "color_name", None)
    if color_in is None:
        color_in = getattr(body, "color", None)
    color_norm = _norm_str(color_in)

    hex_in = getattr(body, "color_hex", None)
    if hex_in is None:
        hex_in = getattr(body, "hex", None)
    hex_norm = _norm_hex(hex_in)

    values = {TYPE_COL.key: category_norm}
    if OPTIONAL_TYPE_COL is not None:
        values[OPTIONAL_TYPE_COL.key] = type_norm
    if NAME_COL is not None:
        values[NAME_COL.key] = name_norm
    if COLOR_COL is not None:
        values[COLOR_COL.key] = color_norm
    if HEX_COL is not None:
        values[HEX_COL.key] = hex_norm
    if PRICE_COL is not None:
        price_in = getattr(body, "price_per_kg", None)
        if price_in is None:
            price_in = getattr(body, "pricePerKg", None)
        if price_in is not None:
            values[PRICE_COL.key] = price_in
    if IS_ACTIVE_COL is not None:
        is_active_in = getattr(body, "is_active", None)
        values[IS_ACTIVE_COL.key] = True if is_active_in is None else bool(is_active_in)

    try:
        stmt = insert(Filament).values(**values).returning(Filament)
        created = (await db.execute(stmt)).scalar_one()
        await db.commit()
        created_out = _to_out(created)
    except IntegrityError:
        await db.rollback()
        existing = (await db.execute(_unique_select(category_norm or type_norm, color_norm, hex_norm))).scalar_one_or_none()
        if not existing:
            raise HTTPException(status_code=409, detail="filament_exists")
        if IS_ACTIVE_COL is not None and getattr(existing, IS_ACTIVE_COL.key, True) is False:
            upd = (
                update(Filament)
                .where(Filament.id == existing.id)
                .values({IS_ACTIVE_COL.key: True})
                .returning(Filament)
            )
            existing = (await db.execute(upd)).scalar_one()
            await db.commit()
        created_out = _to_out(existing)

    # Optional: attach a barcode if caller provided any barcode-ish fields.
    code = _norm_str(getattr(body, "barcode", None)) or _norm_str(getattr(body, "code", None))
    if code:
        symb = _norm_str(getattr(body, "symbology", None))
        is_primary = getattr(body, "is_primary_barcode", True)
        try:
            await db.execute(
                text(
                    """
                    INSERT INTO public.barcodes (id, code, symbology, type, is_primary, filament_id, created_at)
                    VALUES (:id, :code, :symbology, :type, :is_primary, :fid, now())
                    ON CONFLICT (code) DO UPDATE
                      SET filament_id = EXCLUDED.filament_id
                      WHERE public.barcodes.filament_id IS NULL
                    """
                ),
                {
                    "id": str(uuid4()),
                    "code": code,
                    "symbology": symb or None,
                    "type": "consumer",
                    "is_primary": bool(is_primary),
                    "fid": str(getattr(created_out, "id")),
                },
            )
            await db.commit()
        except Exception:
            await db.rollback()

    return created_out

@router.patch("/{filament_id}", response_model=FilamentOut)
async def update_filament(
    filament_id: UUID,
    body: FilamentUpdate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(admin_required),
):
    values = {}

    if getattr(body, "category", None) is not None:
        values[TYPE_COL.key] = _norm_str(body.category)
    elif getattr(body, "type", None) is not None:
        values[TYPE_COL.key] = _norm_str(body.type)

    if OPTIONAL_TYPE_COL is not None and getattr(body, "type", None) is not None:
        values[OPTIONAL_TYPE_COL.key] = _norm_str(body.type)

    if NAME_COL is not None and getattr(body, "name", None) is not None:
        values[NAME_COL.key] = _norm_str(body.name)

    if PRICE_COL is not None:
        price_val = getattr(body, "price_per_kg", None)
        if price_val is None:
            price_val = getattr(body, "pricePerKg", None)
        if price_val is not None:
            values[PRICE_COL.key] = price_val

    color_val = getattr(body, "color_name", None)
    if color_val is None:
        color_val = getattr(body, "color", None)
    if color_val is not None and COLOR_COL is not None:
        values[COLOR_COL.key] = _norm_str(color_val)

    hex_val = getattr(body, "color_hex", None)
    if hex_val is None:
        hex_val = getattr(body, "hex", None)
    if hex_val is not None and HEX_COL is not None:
        values[HEX_COL.key] = _norm_hex(hex_val)

    if getattr(body, "is_active", None) is not None and IS_ACTIVE_COL is not None:
        values[IS_ACTIVE_COL.key] = bool(body.is_active)

    if not values:
        row = await db.get(Filament, filament_id)
        if not row:
            raise HTTPException(status_code=404, detail="Filament not found")
        return _to_out(row)

    stmt = (
        update(Filament)
        .where(Filament.id == filament_id)
        .values(**values)
        .returning(Filament)
    )

    try:
        res = await db.execute(stmt)
        row = res.scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Filament not found")
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="filament_exists")

    code = _norm_str(getattr(body, "barcode", None)) or _norm_str(getattr(body, "code", None))
    if code:
        symb = _norm_str(getattr(body, "symbology", None))
        is_primary = getattr(body, "is_primary_barcode", True)
        try:
            await db.execute(
                text(
                    """
                    INSERT INTO public.barcodes (id, code, symbology, type, is_primary, filament_id, created_at)
                    VALUES (:id, :code, :symbology, :type, :is_primary, :fid, now())
                    ON CONFLICT (code) DO UPDATE
                      SET filament_id = EXCLUDED.filament_id
                      WHERE public.barcodes.filament_id IS NULL
                    """
                ),
                {
                    "id": str(uuid4()),
                    "code": code,
                    "symbology": symb or None,
                    "type": "consumer",
                    "is_primary": bool(is_primary),
                    "fid": str(filament_id),
                },
            )
            await db.commit()
        except Exception:
            await db.rollback()

    return _to_out(row)

@router.delete("/{filament_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_filament(
    filament_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(admin_required),
):
    await db.execute(delete(Filament).where(Filament.id == filament_id))
    await db.commit()
    return None

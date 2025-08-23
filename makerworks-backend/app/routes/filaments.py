# app/routes/filaments.py
from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.schemas.filaments import (
    FilamentCreate,
    FilamentUpdate,
    FilamentOut,
)

# --- Dependencies (safe imports) ---
try:
    # Async DB session provider
    from app.db.session import get_db  # yields AsyncSession
except Exception as e:  # pragma: no cover
    raise RuntimeError("get_db not found; check app.db.session") from e

# Admin gating (fall back to no-op in dev so hot reload doesn’t crash)
try:
    from app.deps import require_admin  # type: ignore
except Exception:  # pragma: no cover
    async def require_admin() -> None:
        return None

router = APIRouter(tags=["filaments"])


# -----------------------
# Helpers
# -----------------------
def _normalize_hex(h: Optional[str]) -> Optional[str]:
    if not h:
        return None
    s = h.strip().lstrip("#")
    s = (s + "000000")[:6]  # pad defensively
    return f"#{s}"


def _display_name(category: Optional[str], color_name: Optional[str]) -> Optional[str]:
    cat = (category or "").strip()
    col = (color_name or "").strip()
    if not cat and not col:
        return None
    if not cat:
        return col
    if not col:
        return cat
    return f"{cat} {col}"


async def _load_barcodes_map(db: AsyncSession, ids: List[UUID]) -> Dict[UUID, List[str]]:
    if not ids:
        return {}
    q = text(
        """
        SELECT filament_id::uuid AS fid, code
        FROM public.barcodes
        WHERE filament_id = ANY(:ids)
        """
    )
    rows = (await db.execute(q, {"ids": [str(i) for i in ids]})).all()
    out: Dict[UUID, List[str]] = {}
    for fid, code in rows:
        out.setdefault(fid, []).append(code)
    return out


def _row_to_out(row: Any, barcodes: List[str]) -> FilamentOut:
    return FilamentOut(
        id=row.id,
        name=row.name,
        material=row.material,
        category=row.category,
        type=row.type,
        color_name=row.color_name,
        color_hex=row.color_hex,
        price_per_kg=float(row.price_per_kg) if row.price_per_kg is not None else 0.0,
        is_active=bool(row.is_active),
        barcodes=barcodes,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


# -----------------------
# Routes
# -----------------------

@router.head("/filaments", include_in_schema=False)
async def head_filaments(_: AsyncSession = Depends(get_db)) -> Response:
    # Explicit HEAD to avoid occasional 405s from caches/middle-proxies
    return Response(status_code=200)


@router.get("/filaments", response_model=List[FilamentOut])
async def list_filaments(db: AsyncSession = Depends(get_db)) -> List[FilamentOut]:
    q = text(
        """
        SELECT id, name, material, category, type, color_name, color_hex,
               price_per_kg, is_active, created_at, updated_at
        FROM public.filaments
        ORDER BY created_at DESC
        """
    )
    rows = (await db.execute(q)).fetchall()
    ids = [r.id for r in rows]
    bc_map = await _load_barcodes_map(db, ids)
    return [_row_to_out(r, bc_map.get(r.id, [])) for r in rows]


@router.post(
    "/filaments",
    response_model=FilamentOut,
    status_code=status.HTTP_200_OK,  # keep 200 for current frontend expectation
    dependencies=[Depends(require_admin)],
)
async def create_filament(payload: FilamentCreate, db: AsyncSession = Depends(get_db)) -> FilamentOut:
    fid = uuid4()
    color_hex = _normalize_hex(payload.color_hex)
    name = _display_name(payload.category, payload.color_name)

    insert_q = text(
        """
        INSERT INTO public.filaments
            (id, name, category, color_hex, price_per_kg, material, type,
             color_name, is_active, created_at, updated_at)
        VALUES
            (:id, :name, :category, :color_hex, :price_per_kg, :material, :type,
             :color_name, :is_active, now(), now())
        """
    )
    params = {
        "id": str(fid),
        "name": name,
        "category": payload.category,
        "color_hex": color_hex,
        "price_per_kg": payload.price_per_kg,
        "material": payload.material,
        "type": payload.category,  # mirror current UI concept
        "color_name": payload.color_name,
        "is_active": bool(payload.is_active) if payload.is_active is not None else True,
    }
    await db.execute(insert_q, params)

    if payload.barcode:
        bc_q = text(
            """
            INSERT INTO public.barcodes (filament_id, code)
            VALUES (:fid, :code)
            ON CONFLICT (code) DO NOTHING
            """
        )
        await db.execute(bc_q, {"fid": str(fid), "code": payload.barcode})

    # Commit before fetching again (avoids visibility issues across pools)
    await db.commit()

    fetch_q = text(
        """
        SELECT id, name, material, category, type, color_name, color_hex,
               price_per_kg, is_active, created_at, updated_at
        FROM public.filaments
        WHERE id = :id
        """
    )
    row = (await db.execute(fetch_q, {"id": str(fid)})).one()
    bc_map = await _load_barcodes_map(db, [fid])
    return _row_to_out(row, bc_map.get(fid, []))


@router.patch(
    "/filaments/{filament_id}",
    response_model=FilamentOut,
    dependencies=[Depends(require_admin)],
)
async def update_filament(
    filament_id: UUID, payload: FilamentUpdate, db: AsyncSession = Depends(get_db)
) -> FilamentOut:
    sets: List[str] = []
    params: Dict[str, Any] = {"id": str(filament_id)}

    def add(field: str, value: Any, transform=None):
        if value is None:
            return
        sets.append(f"{field} = :{field}")
        params[field] = transform(value) if transform else value

    add("material", payload.material)
    add("category", payload.category)
    add("type", payload.category)  # keep mirrored with category
    add("color_name", payload.color_name)
    add("color_hex", payload.color_hex, _normalize_hex)
    add("price_per_kg", payload.price_per_kg)
    if payload.is_active is not None:
        add("is_active", bool(payload.is_active))

    # Recompute name if category or color_name changed
    if payload.category is not None or payload.color_name is not None:
        cur = (await db.execute(
            text("SELECT category, color_name FROM public.filaments WHERE id = :id"),
            {"id": str(filament_id)},
        )).one_or_none()
        if cur is None:
            raise HTTPException(status_code=404, detail="Filament not found")
        new_cat = payload.category if payload.category is not None else cur.category
        new_col = payload.color_name if payload.color_name is not None else cur.color_name
        add("name", _display_name(new_cat, new_col))

    if sets:
        await db.execute(
            text(
                f"""
                UPDATE public.filaments
                SET {', '.join(sets)}, updated_at = now()
                WHERE id = :id
                """
            ),
            params,
        )

    if payload.barcode:
        await db.execute(
            text(
                """
                INSERT INTO public.barcodes (filament_id, code)
                VALUES (:fid, :code)
                ON CONFLICT (code) DO NOTHING
                """
            ),
            {"fid": str(filament_id), "code": payload.barcode},
        )

    await db.commit()

    row = (await db.execute(
        text(
            """
            SELECT id, name, material, category, type, color_name, color_hex,
                   price_per_kg, is_active, created_at, updated_at
            FROM public.filaments
            WHERE id = :id
            """
        ),
        {"id": str(filament_id)},
    )).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Filament not found")

    bc_map = await _load_barcodes_map(db, [filament_id])
    return _row_to_out(row, bc_map.get(filament_id, []))


@router.delete(
    "/filaments/{filament_id}",
    status_code=status.HTTP_200_OK,           # Option B: return JSON with 200
    response_model=Dict[str, Any],            # simple JSON shape
    dependencies=[Depends(require_admin)],
)
async def delete_filament(
    filament_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    res = await db.execute(
        text("DELETE FROM public.filaments WHERE id = :id"),
        {"id": str(filament_id)},
    )
    if getattr(res, "rowcount", 0) == 0:
        await db.rollback()
        raise HTTPException(status_code=404, detail="Filament not found")
    await db.commit()
    return {"deleted": True, "id": str(filament_id)}

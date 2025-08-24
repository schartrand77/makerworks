from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_async_db
from app.models.pricing import (
    PricingSettings, Material, Printer, LaborRole, ProcessStep, QualityTier, Consumable, Rule
)

router = APIRouter(prefix="/api/v1", tags=["pricing-read"])

# ---------- health ----------
@router.get("/_health")
async def health():
    return {"ok": True}

# ---------- helpers ----------
async def list_all(db: AsyncSession, model):
    res = await db.execute(select(model))
    return list(res.scalars().all())

# ---------- pricing/settings ----------
@router.get("/pricing/settings/latest")
async def settings_latest(db: AsyncSession = Depends(get_async_db)):
    res = await db.execute(select(PricingSettings).order_by(PricingSettings.effective_from.desc()).limit(1))
    s = res.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="No pricing settings configured.")
    return s

# ---------- plain lists used by the admin UI (GET) ----------
@router.get("/pricing/materials")
async def get_materials(db: AsyncSession = Depends(get_async_db)):
    return await list_all(db, Material)

@router.get("/pricing/printers")
async def get_printers(db: AsyncSession = Depends(get_async_db)):
    return await list_all(db, Printer)

@router.get("/pricing/labor-roles")
async def get_roles(db: AsyncSession = Depends(get_async_db)):
    return await list_all(db, LaborRole)

@router.get("/pricing/process-steps")
async def get_steps(db: AsyncSession = Depends(get_async_db)):
    return await list_all(db, ProcessStep)

@router.get("/pricing/tiers")
async def get_tiers(db: AsyncSession = Depends(get_async_db)):
    return await list_all(db, QualityTier)

@router.get("/pricing/consumables")
async def get_consumables(db: AsyncSession = Depends(get_async_db)):
    return await list_all(db, Consumable)

# Admin rules were write-only; the UI is doing GET /api/v1/admin/rules
admin = APIRouter(prefix="/api/v1/admin", tags=["admin-read"])

@admin.get("/rules")
async def get_rules(db: AsyncSession = Depends(get_async_db)):
    return await list_all(db, Rule)

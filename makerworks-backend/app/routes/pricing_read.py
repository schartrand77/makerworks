# app/api/v1/pricing_read.py
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel, ConfigDict

from app.db.database import get_async_db
from app.models.pricing import (
    PricingSettings, Material, Printer, LaborRole, ProcessStep,
    QualityTier, Consumable, Rule
)

# -----------------------------------------------------------------------------
# Pydantic v2 OUT schemas (avoid returning raw ORM; enable from_attributes)
# -----------------------------------------------------------------------------
class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

class PricingSettingsOut(ORMBase):
    id: UUID
    effective_from: datetime
    currency: str
    electricity_cost_per_kwh: float
    shop_overhead_per_day: float
    productive_hours_per_day: Optional[float] = None
    admin_note: Optional[str] = None

class MaterialOut(ORMBase):
    id: UUID
    name: str
    type: Literal['FDM', 'SLA']
    cost_per_kg: Optional[float] = None
    cost_per_l: Optional[float] = None
    density_g_cm3: Optional[float] = None
    abrasive: bool
    waste_allowance_pct: float
    enabled: bool

class PrinterOut(ORMBase):
    id: UUID
    name: str
    tech: Literal['FDM', 'SLA']
    nozzle_diameter_mm: Optional[float] = None
    chamber: Optional[bool] = None
    enclosed: Optional[bool] = None
    watts_idle: float
    watts_printing: float
    hourly_base_rate: float
    maintenance_rate_per_hour: float
    depreciation_per_hour: float
    enabled: bool

class LaborRoleOut(ORMBase):
    id: UUID
    name: str
    hourly_rate: float
    min_bill_minutes: int

class ProcessStepOut(ORMBase):
    id: UUID
    name: str
    default_minutes: int
    labor_role_id: UUID
    material_type_filter: Optional[Literal['FDM', 'SLA']] = None
    multiplier_per_cm3: Optional[float] = None
    enabled: bool

class QualityTierOut(ORMBase):
    id: UUID
    name: str
    layer_height_mm: Optional[float] = None
    infill_pct: Optional[int] = None
    support_density_pct: Optional[int] = None
    qc_time_minutes: int
    price_multiplier: float
    notes: Optional[str] = None

class ConsumableOut(ORMBase):
    id: UUID
    name: str
    unit: str
    cost_per_unit: float
    usage_per_print: float

class RuleOut(ORMBase):
    id: UUID
    if_expression: str
    then_modifiers: Dict[str, Any]

class VersionRowOut(ORMBase):
    id: UUID | str
    effective_from: datetime
    note: Optional[str] = None

# -----------------------------------------------------------------------------
# Routers
# -----------------------------------------------------------------------------
router = APIRouter(prefix="/api/v1", tags=["pricing-read"])
admin = APIRouter(prefix="/api/v1/admin", tags=["admin-read"])

# ---------- health ----------
@router.get("/_health")
async def health():
    return {"ok": True}

# ---------- helpers ----------
async def serialize_all(db: AsyncSession, model, out_schema):
    res = await db.execute(select(model))
    rows = res.scalars().all()
    # Return Pydantic objects; FastAPI will serialize them
    return [out_schema.model_validate(r, from_attributes=True) for r in rows]

# ---------- pricing/settings ----------
@router.get("/pricing/settings/latest", response_model=PricingSettingsOut)
async def settings_latest(db: AsyncSession = Depends(get_async_db)):
    res = await db.execute(
        select(PricingSettings).order_by(PricingSettings.effective_from.desc()).limit(1)
    )
    s = res.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="No pricing settings configured.")
    return PricingSettingsOut.model_validate(s, from_attributes=True)

# ---------- plain lists used by the admin UI (GET) ----------
@router.get("/pricing/materials", response_model=List[MaterialOut])
async def get_materials(db: AsyncSession = Depends(get_async_db)):
    return await serialize_all(db, Material, MaterialOut)

@router.get("/pricing/printers", response_model=List[PrinterOut])
async def get_printers(db: AsyncSession = Depends(get_async_db)):
    return await serialize_all(db, Printer, PrinterOut)

@router.get("/pricing/labor-roles", response_model=List[LaborRoleOut])
async def get_roles(db: AsyncSession = Depends(get_async_db)):
    return await serialize_all(db, LaborRole, LaborRoleOut)

@router.get("/pricing/process-steps", response_model=List[ProcessStepOut])
async def get_steps(db: AsyncSession = Depends(get_async_db)):
    return await serialize_all(db, ProcessStep, ProcessStepOut)

@router.get("/pricing/tiers", response_model=List[QualityTierOut])
async def get_tiers(db: AsyncSession = Depends(get_async_db)):
    return await serialize_all(db, QualityTier, QualityTierOut)

@router.get("/pricing/consumables", response_model=List[ConsumableOut])
async def get_consumables(db: AsyncSession = Depends(get_async_db)):
    return await serialize_all(db, Consumable, ConsumableOut)

# Expose rules publicly (your UI tries /api/v1/rules or /api/v1/pricing/rules first)
@router.get("/pricing/rules", response_model=List[RuleOut])
async def get_rules_public(db: AsyncSession = Depends(get_async_db)):
    return await serialize_all(db, Rule, RuleOut)

# Optional: if your UI ever calls /api/v1/system/snapshot
@router.get("/system/snapshot", response_model=List[VersionRowOut])
async def get_snapshot(db: AsyncSession = Depends(get_async_db)):
    # synthesize from settings history (unless you have a versions table)
    res = await db.execute(select(PricingSettings).order_by(PricingSettings.effective_from.desc()))
    rows = res.scalars().all()
    out: List[VersionRowOut] = []
    for r in rows:
        out.append(
            VersionRowOut.model_validate(
                {
                    "id": getattr(r, "id", str(getattr(r, "effective_from", ""))),
                    "effective_from": r.effective_from,
                    "note": getattr(r, "admin_note", None),
                },
                from_attributes=True,
            )
        )
    return out

# Admin rules were write-only; keep a read for admin too (UI may fall back here)
@admin.get("/rules", response_model=List[RuleOut])
async def get_rules_admin(db: AsyncSession = Depends(get_async_db)):
    return await serialize_all(db, Rule, RuleOut)

# app/schemas/pricing_out.py
from __future__ import annotations
from typing import Any, Dict, Literal, Optional
from uuid import UUID
from datetime import datetime
from pydantic import ConfigDict
from app.schemas._base import APIModel as BaseModel


# Global base with from_attributes enabled (Pydantic v2)
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
    id: UUID | str  # allow str if your DB uses text ids
    effective_from: datetime
    note: Optional[str] = None

# app/models/pricing_models.py
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, Float, Integer, Text, DateTime,
    ForeignKey, JSON, Index
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import relationship

# Base (support both layouts)
try:
    from app.db.base import Base  # newer
except Exception:
    from app.db.base_class import Base  # legacy


# ──────────────────────────────────────────────────────────────────
# Pricing settings (global)
# ──────────────────────────────────────────────────────────────────
class PricingSettings(Base):
    __tablename__ = "pricing_settings"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    effective_from = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    currency = Column(String(8), nullable=False, default="CAD")
    electricity_cost_per_kwh = Column(Float, nullable=False, default=0.18)
    shop_overhead_per_day = Column(Float, nullable=False, default=35.0)
    productive_hours_per_day = Column(Float, nullable=True)
    admin_note = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_pricing_settings_effective_from", "effective_from"),
    )


# ──────────────────────────────────────────────────────────────────
# Materials
# ──────────────────────────────────────────────────────────────────
class Material(Base):
    __tablename__ = "materials"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128), nullable=False)
    type = Column(String(8), nullable=False)  # 'FDM' | 'SLA'
    cost_per_kg = Column(Float, nullable=True)
    cost_per_l = Column(Float, nullable=True)
    density_g_cm3 = Column(Float, nullable=True)
    abrasive = Column(Boolean, nullable=False, default=False)
    waste_allowance_pct = Column(Float, nullable=False, default=0.05)
    enabled = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (Index("ix_materials_enabled", "enabled"),)


# ──────────────────────────────────────────────────────────────────
# Printers
# ──────────────────────────────────────────────────────────────────
class Printer(Base):
    __tablename__ = "printers"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128), nullable=False)
    tech = Column(String(8), nullable=False)  # 'FDM' | 'SLA'

    nozzle_diameter_mm = Column(Float, nullable=True)
    chamber = Column(Boolean, nullable=True)
    enclosed = Column(Boolean, nullable=True)

    watts_idle = Column(Float, nullable=False, default=10.0)
    watts_printing = Column(Float, nullable=False, default=120.0)

    hourly_base_rate = Column(Float, nullable=False, default=5.0)
    maintenance_rate_per_hour = Column(Float, nullable=False, default=0.4)
    depreciation_per_hour = Column(Float, nullable=False, default=1.0)

    enabled = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (Index("ix_printers_enabled", "enabled"),)


# ──────────────────────────────────────────────────────────────────
# Labor roles
# ──────────────────────────────────────────────────────────────────
class LaborRole(Base):
    __tablename__ = "labor_roles"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128), nullable=False)
    hourly_rate = Column(Float, nullable=False, default=36.0)
    min_bill_minutes = Column(Integer, nullable=False, default=15)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


# ──────────────────────────────────────────────────────────────────
# Process steps
# ──────────────────────────────────────────────────────────────────
class ProcessStep(Base):
    __tablename__ = "process_steps"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128), nullable=False)
    default_minutes = Column(Integer, nullable=False, default=0)

    labor_role_id = Column(PGUUID(as_uuid=True), ForeignKey("labor_roles.id", ondelete="SET NULL"), nullable=True)
    labor_role = relationship("LaborRole")

    material_type_filter = Column(String(8), nullable=True)  # 'FDM' | 'SLA' | None
    multiplier_per_cm3 = Column(Float, nullable=True)

    enabled = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (Index("ix_process_steps_enabled", "enabled"),)


# ──────────────────────────────────────────────────────────────────
# Quality tiers
# ──────────────────────────────────────────────────────────────────
class QualityTier(Base):
    __tablename__ = "quality_tiers"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(64), nullable=False)

    layer_height_mm = Column(Float, nullable=True)
    infill_pct = Column(Integer, nullable=True)
    support_density_pct = Column(Integer, nullable=True)

    qc_time_minutes = Column(Integer, nullable=False, default=0)
    price_multiplier = Column(Float, nullable=False, default=1.0)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


# ──────────────────────────────────────────────────────────────────
# Consumables
# ──────────────────────────────────────────────────────────────────
class Consumable(Base):
    __tablename__ = "consumables"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128), nullable=False)
    unit = Column(String(32), nullable=False)  # e.g., 'L', 'm', 'sheet'
    cost_per_unit = Column(Float, nullable=False, default=0.0)
    usage_per_print = Column(Float, nullable=False, default=0.0)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


# ──────────────────────────────────────────────────────────────────
# Rules (advanced modifiers)
# ──────────────────────────────────────────────────────────────────
class Rule(Base):
    __tablename__ = "pricing_rules"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    if_expression = Column(Text, nullable=False)
    then_modifiers = Column(JSON, nullable=False, default=dict)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


# Optional: versions table (if you want a history separate from settings)
class PricingVersion(Base):
    __tablename__ = "pricing_versions"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    effective_from = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    note = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

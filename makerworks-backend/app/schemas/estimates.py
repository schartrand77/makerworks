# app/schemas/estimate.py
from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Tuple

from pydantic import Field, conlist, confloat
from app.schemas._base import APIModel as BaseModel
from app.schemas.enums import CurrencyEnum


# ---------- Request ----------

class SlicerStats(BaseModel):
    """Stats coming from the slicer or your estimator on the client."""
    time_h: confloat(ge=0) = Field(..., example=6.2, description="Estimated machine time, in hours")
    mass_g: confloat(ge=0) = Field(0, example=140.0, description="Estimated material mass, grams (FDM)")
    volume_cm3: confloat(ge=0) = Field(0, example=45.0, description="Estimated part volume, cm³ (for resin or size scaling)")
    bbox_mm: Optional[Tuple[float, float, float]] = Field(
        None, example=(180.0, 40.0, 30.0), description="Axis-aligned bounding box (X,Y,Z) in mm"
    )
    supports: bool = Field(False, description="Whether supports are generated")

    model_config = {"from_attributes": True}


class EstimateRequest(BaseModel):
    """Base-price estimate (no taxes, no shipping)."""
    # model reference (optional but useful for audit)
    model_id: Optional[int] = Field(None, description="Internal ID of the 3D model")

    # required selections
    printer_id: str = Field(..., description="Printer to use")
    material_id: str = Field(..., description="Material to use")
    tier_id: str = Field(..., description="Quality tier (e.g., prototype, production)")

    # slicer stats
    slicer: SlicerStats = Field(..., description="Slicer-derived metrics")

    # optional knobs
    selected_steps: List[str] = Field(
        default_factory=list, description="Post-processing step IDs to include"
    )
    setup_minutes: confloat(ge=0) = Field(
        10, description="Operator setup minutes before rounding to role min increment"
    )
    notes: Optional[str] = Field(None, description="Freeform note for this estimate")

    # legacy fields from earlier schema (kept for forward compatibility; ignored by backend if provided)
    x_mm: Optional[confloat(gt=0)] = Field(None, description="(legacy) width in mm")
    y_mm: Optional[confloat(gt=0)] = Field(None, description="(legacy) depth in mm")
    z_mm: Optional[confloat(gt=0)] = Field(None, description="(legacy) height in mm")
    filament_type: Optional[str] = Field(None, description="(legacy) filament type")
    filament_colors: Optional[conlist(str, min_length=1, max_length=4)] = Field(
        None, description="(legacy) selected color hex codes"
    )
    print_profile: Optional[str] = Field(None, description="(legacy) print profile")
    custom_text: Optional[str] = Field(None, description="(legacy) engraving or label")

    model_config = {"from_attributes": True}


# ---------- Response ----------

class EstimateLineItem(BaseModel):
    key: str = Field(..., examples=["material", "machine", "electricity", "depreciation"])
    label: str = Field(..., examples=["PLA (waste 5%)", "Machine time (6.20 h)"])
    amount: confloat(ge=0) = Field(..., example=12.34, description="Monetary amount in response currency")

    model_config = {"from_attributes": True}


class EstimateResponse(BaseModel):
    currency: CurrencyEnum = Field(
        default=CurrencyEnum.USD,
        description=CurrencyEnum.openapi_schema()["description"],
    )
    lines: List[EstimateLineItem] = Field(..., description="Detailed line items included in subtotal")

    # Multipliers & math
    tier_multiplier: confloat(gt=0) = Field(..., example=0.9, description="Quality tier multiplier applied to subtotal")
    rules_multiplier: confloat(gt=0) = Field(1.0, example=1.05, description="Aggregate multiplier from matching rules")
    rules_add: float = Field(0.0, example=2.5, description="Flat amount added by rules after multipliers")

    # Totals
    subtotal: confloat(ge=0) = Field(..., example=62.83, description="Sum of line items before multipliers")
    base_price: confloat(ge=0) = Field(..., example=56.55, description="Final base price (pre-tax, pre-shipping)")

    # Provenance
    effective_settings_id: str = Field(..., description="ID of the pricing settings version used")
    calculated_at: datetime = Field(..., description="UTC timestamp when the estimate was computed")

    # Back-compat fields (optional; not used by math)
    estimated_time_minutes: Optional[confloat(ge=0)] = Field(
        None, example=372.0, description="(legacy) total time minutes for UI display"
    )
    estimated_cost: Optional[confloat(ge=0)] = Field(
        None, example=56.55, description="(legacy) mirrors base_price for older clients"
    )

    model_config = {"from_attributes": True}

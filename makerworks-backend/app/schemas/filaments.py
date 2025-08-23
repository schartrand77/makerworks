from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

HEX6 = r"^#?[0-9A-Fa-f]{6}$"


class FilamentBase(BaseModel):
    material: Optional[str] = Field(
        None, description="Material family, e.g. PLA, PETG, ABS"
    )
    category: Optional[str] = Field(
        None, description="Catalog category, e.g. Matte, Silk"
    )
    type: Optional[str] = Field(
        None, description="Subtype if needed; often same as category"
    )
    color_name: Optional[str] = None
    color_hex: Optional[str] = Field(
        None,
        pattern=HEX6,  # Pydantic v2: use 'pattern' (not 'regex')
        description="6-digit hex, with or without #",
    )
    price_per_kg: Optional[float] = None
    is_active: Optional[bool] = True


class FilamentCreate(FilamentBase):
    # Required on create
    material: str
    category: str
    color_name: str
    color_hex: str
    price_per_kg: float

    # Optional single barcode on create
    barcode: Optional[str] = None


class FilamentUpdate(FilamentBase):
    # All fields optional for PATCH/PUT
    barcode: Optional[str] = None


class FilamentOut(BaseModel):
    id: UUID
    name: Optional[str] = None

    # taxonomy / attributes
    material: Optional[str] = None
    category: Optional[str] = None
    type: Optional[str] = None
    color_name: Optional[str] = None
    color_hex: Optional[str] = None

    # pricing / state
    price_per_kg: float
    is_active: bool = True

    # enriched fields (joined from barcodes table)
    barcodes: List[str] = Field(default_factory=list)

    # timestamps
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True          # v1 compatibility (ignored on v2)
        from_attributes = True   # v2 compatibility

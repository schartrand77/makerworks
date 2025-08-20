# app/schemas/filaments.py
from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────
_HEX_RE = re.compile(r"^#?(?:[0-9A-Fa-f]{3}){1,2}$")
_ALLOWED_DIAMETERS = {1.75, 2.85}  # common sizes; extend as needed


def _trim(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    s2 = s.strip()
    return s2 or None


def _norm_hex(hex_str: Optional[str]) -> Optional[str]:
    if not hex_str:
        return None
    s = hex_str.strip()
    if not s:
        return None
    if not _HEX_RE.match(s):
        raise ValueError("colorHex must be a valid 3/6-digit hex (e.g. #AABBCC)")
    s = s.upper()
    return s if s.startswith("#") else f"#{s}"


def _norm_currency(code: Optional[str]) -> Optional[str]:
    if not code:
        return None
    s = code.strip().upper()
    if len(s) != 3 or not s.isalpha():
        raise ValueError("currency must be a 3-letter ISO code (e.g. USD, EUR)")
    return s


# ──────────────────────────────────────────────────────────────────────────────
# Base mixin (Pydantic v2)
# ──────────────────────────────────────────────────────────────────────────────
class _FilamentBase(BaseModel):
    # Catalog-ish fields
    name: Optional[str] = None
    brand: Optional[str] = None        # e.g., "Prusament", "Hatchbox"
    category: Optional[str] = None     # e.g., "PLA", "PETG"
    type: Optional[str] = None         # e.g., "Matte", "Silk"
    subtype: Optional[str] = None
    surface_texture: Optional[str] = None
    description: Optional[str] = None

    # Color
    color_hex: Optional[str] = Field(None, alias="colorHex")
    color_name: Optional[str] = Field(None, alias="colorName")

    # Pricing
    price_per_kg: Optional[float] = Field(
        None, alias="pricePerKg", ge=0.0, le=10_000.0,
        description="Price per kilogram in the given currency"
    )
    currency: Optional[str] = Field(default="USD", description="ISO-4217 code")

    # Physical/inventory attributes (optional)
    diameter_mm: Optional[float] = Field(
        None, alias="diameterMm", description="Nominal filament diameter in millimeters"
    )  # typically 1.75 or 2.85
    spool_grams: Optional[int] = Field(
        None, alias="spoolGrams", ge=0, le=10_000, description="Spool weight in grams"
    )
    density_g_cm3: Optional[float] = Field(
        None, alias="densityGCm3", ge=0.0, le=10.0, description="Material density g/cm³"
    )

    # Recommended temps (range)
    nozzle_temp_c_min: Optional[int] = Field(None, alias="nozzleTempCMin", ge=0, le=400)
    nozzle_temp_c_max: Optional[int] = Field(None, alias="nozzleTempCMax", ge=0, le=400)
    bed_temp_c_min: Optional[int] = Field(None, alias="bedTempCMin", ge=0, le=200)
    bed_temp_c_max: Optional[int] = Field(None, alias="bedTempCMax", ge=0, le=200)

    # Flags
    is_active: Optional[bool] = Field(True, alias="isActive")
    is_biodegradable: Optional[bool] = Field(None, alias="isBiodegradable")

    # Normalizers
    @field_validator(
        "name", "brand", "category", "type", "subtype", "surface_texture",
        "description", "color_name"
    )
    @classmethod
    def _trim_strs(cls, v: Optional[str]) -> Optional[str]:
        return _trim(v)

    @field_validator("color_hex")
    @classmethod
    def _check_hex(cls, v: Optional[str]) -> Optional[str]:
        return _norm_hex(v)

    @field_validator("currency")
    @classmethod
    def _check_currency(cls, v: Optional[str]) -> Optional[str]:
        return _norm_currency(v)

    @field_validator("diameter_mm")
    @classmethod
    def _check_diameter(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return None
        # snap near-misses to canonical sizes
        if abs(v - 2.85) < 0.05:
            return 2.85
        if abs(v - 1.75) < 0.05:
            return 1.75
        if v not in _ALLOWED_DIAMETERS:
            raise ValueError(f"diameterMm must be one of {sorted(_ALLOWED_DIAMETERS)}")
        return v

    @model_validator(mode="after")
    def _validate_ranges(self):
        # nozzle temps
        nmin, nmax = self.nozzle_temp_c_min, self.nozzle_temp_c_max
        if nmin is not None and nmax is not None and nmin > nmax:
            raise ValueError("nozzleTempCMin cannot be greater than nozzleTempCMax")
        # bed temps
        bmin, bmax = self.bed_temp_c_min, self.bed_temp_c_max
        if bmin is not None and bmax is not None and bmin > bmax:
            raise ValueError("bedTempCMin cannot be greater than bedTempCMax")
        return self

    model_config = {
        "populate_by_name": True,  # accept snake_case OR camelCase
        "str_max_length": 512,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Create / Update / Out
# ──────────────────────────────────────────────────────────────────────────────
class FilamentCreate(_FilamentBase):
    name: str = Field(..., min_length=1, max_length=120)
    category: str = Field(..., min_length=1, max_length=60)  # PLA/PETG/ABS/…
    type: str = Field(..., min_length=1, max_length=60)
    color_hex: str = Field(..., alias="colorHex", description="Hex color like #AABBCC")
    price_per_kg: float = Field(..., alias="pricePerKg", ge=0.0, le=10_000.0)
    # currency/is_active are optional with defaults


class FilamentUpdate(_FilamentBase):
    """
    All fields optional; validators still run on provided fields.
    Examples:
      { "pricePerKg": 28.99, "colorHex": "#FF0000", "isActive": false }
    """
    pass


class FilamentOut(_FilamentBase):
    id: str
    created_at: Optional[datetime] = Field(None, alias="createdAt")
    updated_at: Optional[datetime] = Field(None, alias="updatedAt")

    # Make some fields required in responses (they exist after create)
    name: str
    category: str
    type: str
    color_hex: str = Field(..., alias="colorHex")
    price_per_kg: float = Field(..., alias="pricePerKg")

    model_config = {
        "from_attributes": True,   # ORM mode in Pydantic v2
        "populate_by_name": True,
    }

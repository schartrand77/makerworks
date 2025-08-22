# app/schemas/filaments.py
from __future__ import annotations

import re
from datetime import datetime
from typing import Optional, List
from uuid import UUID

# ── Pydantic v1/v2 compatibility layer ────────────────────────────────────────
_V2 = False
try:
    # Pydantic v2
    from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator  # type: ignore
    _V2 = True
except Exception:
    # Pydantic v1 fallback
    from pydantic import BaseModel, Field, validator, root_validator  # type: ignore
    ConfigDict = dict  # dummy for type hints


_HEX_RE = re.compile(r"^#?(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$")


def _trim(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    s2 = s.strip()
    return s2 or None


def _norm_hex(hex_str: Optional[str]) -> Optional[str]:
    if hex_str is None:
        return None
    s = str(hex_str).strip()
    if not s:
        return None
    if not _HEX_RE.match(s):
        raise ValueError("color hex must be a valid 3/6-digit value (e.g. #AABBCC)")
    s = s.upper()
    return s if s.startswith("#") else f"#{s}"


# ──────────────────────────────────────────────────────────────────────────────
# Barcode (lightweight)
# ──────────────────────────────────────────────────────────────────────────────
class BarcodeLite(BaseModel):
    code: Optional[str] = None
    symbology: Optional[str] = None
    is_primary: Optional[bool] = None

    if _V2:
        model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    else:
        class Config:
            orm_mode = True
            allow_population_by_field_name = True


# ──────────────────────────────────────────────────────────────────────────────
# Base filament schema (permissive; aliases for legacy fields)
# ──────────────────────────────────────────────────────────────────────────────
class _FilamentBase(BaseModel):
    # Canonical/new-ish fields
    name: Optional[str] = None
    category: Optional[str] = None
    color_hex: Optional[str] = Field(default=None, alias="colorHex")
    price_per_kg: Optional[float] = Field(default=None, alias="pricePerKg", ge=0.0)

    # Legacy/compat
    type: Optional[str] = None
    color_name: Optional[str] = Field(default=None, alias="color")
    color: Optional[str] = None
    hex: Optional[str] = None
    is_active: Optional[bool] = True

    # Timestamps (db managed)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # Aliases / ORM mode
    if _V2:
        model_config = ConfigDict(populate_by_name=True, from_attributes=False)
    else:
        class Config:
            allow_population_by_field_name = True
            orm_mode = False  # we’ll convert explicitly in routes for v1 safety

    # String trimming
    if _V2:
        @field_validator("name", "category", "type", "color_name", "color", mode="before")
        @classmethod
        def _trim_v2(cls, v): return _trim(v)
        @field_validator("color_hex", mode="before")
        @classmethod
        def _norm_hex_color_hex_v2(cls, v): return _norm_hex(v)
        @field_validator("hex", mode="before")
        @classmethod
        def _norm_hex_legacy_v2(cls, v): return _norm_hex(v)
    else:
        @validator("name", "category", "type", "color_name", "color", pre=True)
        def _trim_v1(cls, v): return _trim(v)
        @validator("color_hex", pre=True)
        def _norm_hex_color_hex_v1(cls, v): return _norm_hex(v)
        @validator("hex", pre=True)
        def _norm_hex_legacy_v1(cls, v): return _norm_hex(v)


# ──────────────────────────────────────────────────────────────────────────────
# Create / Update payloads
# ──────────────────────────────────────────────────────────────────────────────
class FilamentCreate(_FilamentBase):
    barcode: Optional[str] = None
    code: Optional[str] = None
    symbology: Optional[str] = None
    is_primary_barcode: Optional[bool] = True


class FilamentUpdate(_FilamentBase):
    barcode: Optional[str] = None
    code: Optional[str] = None
    symbology: Optional[str] = None
    is_primary_barcode: Optional[bool] = None


# ──────────────────────────────────────────────────────────────────────────────
# Out schema
# ──────────────────────────────────────────────────────────────────────────────
class FilamentOut(_FilamentBase):
    id: UUID
    barcodes: Optional[List[BarcodeLite]] = None

    if _V2:
        model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    else:
        class Config:
            orm_mode = True
            allow_population_by_field_name = True

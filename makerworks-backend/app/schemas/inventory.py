# app/schemas/inventory.py
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional, Union
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

UUIDLike = Union[str, UUID]


class StockMoveType(str, Enum):
    purchase = "purchase"
    sale = "sale"
    adjust = "adjust"
    transfer = "transfer"


# ── Inventory Levels ──────────────────────────────────────────────────────────
class InventoryLevelUpsert(BaseModel):
    variant_id: UUIDLike = Field(..., alias="variantId")
    warehouse_id: UUIDLike = Field(..., alias="warehouseId")
    on_hand: int = Field(0, ge=0, alias="onHand")
    reserved: int = Field(0, ge=0)

    model_config = {"populate_by_name": True}

class InventoryLevelOut(BaseModel):
    variant_id: str = Field(alias="variantId")
    warehouse_id: str = Field(alias="warehouseId")
    on_hand: int = Field(alias="onHand")
    reserved: int
    updated_at: Optional[datetime] = Field(None, alias="updatedAt")

    model_config = {"from_attributes": True, "populate_by_name": True}


# ── Stock Moves ───────────────────────────────────────────────────────────────
class StockMoveCreate(BaseModel):
    variant_id: UUIDLike = Field(..., alias="variantId")
    warehouse_id: UUIDLike = Field(..., alias="warehouseId")
    qty: int = Field(..., gt=0)
    type: StockMoveType
    note: Optional[str] = None
    to_warehouse_id: Optional[UUIDLike] = Field(None, alias="toWarehouseId")

    @field_validator("to_warehouse_id")
    @classmethod
    def _require_dst_for_transfer(cls, v, info):
        # if type == transfer, require destination
        t = info.data.get("type")
        if t == StockMoveType.transfer and not v:
            raise ValueError("toWarehouseId required for transfer")
        return v

    model_config = {"populate_by_name": True}

class StockMoveOut(BaseModel):
    id: str
    variant_id: str = Field(alias="variantId")
    warehouse_id: str = Field(alias="warehouseId")
    qty: int
    type: StockMoveType
    note: Optional[str] = None
    created_at: Optional[datetime] = Field(None, alias="createdAt")

    model_config = {"from_attributes": True, "populate_by_name": True}


# ── User Inventory ────────────────────────────────────────────────────────────
class UserItemCreate(BaseModel):
    variant_id: UUIDLike = Field(..., alias="variantId")
    qty: int = Field(1, gt=0)
    cost_cents: int = Field(0, ge=0, alias="costCents")
    notes: Optional[str] = None

    model_config = {"populate_by_name": True}

class UserItemUpdate(BaseModel):
    qty: Optional[int] = Field(None, gt=0)
    cost_cents: Optional[int] = Field(None, ge=0, alias="costCents")
    notes: Optional[str] = None

    model_config = {"populate_by_name": True}

class UserItemOut(BaseModel):
    id: str
    variant_id: str = Field(alias="variantId")
    qty: int
    cost_cents: int = Field(alias="costCents")
    notes: Optional[str] = None
    created_at: Optional[datetime] = Field(None, alias="createdAt")

    model_config = {"from_attributes": True, "populate_by_name": True}

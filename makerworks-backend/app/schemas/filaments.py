from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class FilamentCreate(BaseModel):
    name: str
    category: str
    type: str
    subtype: Optional[str] = None
    surface_texture: Optional[str] = None
    description: Optional[str] = None

    color_hex: str = Field(..., alias="colorHex")
    color_name: Optional[str] = Field(None, alias="colorName")

    price_per_kg: float = Field(..., alias="pricePerKg")
    currency: Optional[str] = "USD"

    is_active: Optional[bool] = True
    is_biodegradable: Optional[bool] = None

    model_config = {
        "populate_by_name": True,
        "json_schema_extra": {
            "examples": [{
                "name": "Matte Ice Blue",
                "category": "PLA",
                "type": "Matte",
                "subtype": "Special Edition",
                "surface_texture": "Matte",
                "description": "Cool icy matte blue finish",
                "colorHex": "#A3D8F4",
                "colorName": "Ice Blue",
                "pricePerKg": 25.99,
                "currency": "USD",
                "is_active": True,
                "is_biodegradable": True
            }]
        }
    }


class FilamentUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    type: Optional[str] = None
    subtype: Optional[str] = None
    surface_texture: Optional[str] = None
    description: Optional[str] = None

    color_hex: Optional[str] = Field(None, alias="colorHex")
    color_name: Optional[str] = Field(None, alias="colorName")

    price_per_kg: Optional[float] = Field(None, alias="pricePerKg")
    currency: Optional[str] = None

    is_active: Optional[bool] = None
    is_biodegradable: Optional[bool] = None

    model_config = {
        "populate_by_name": True,
        "json_schema_extra": {
            "examples": [{
                "pricePerKg": 28.99,
                "colorHex": "#FF0000",
                "colorName": "Scarlet Red",
                "is_active": False
            }]
        }
    }


class FilamentOut(BaseModel):
    id: str
    name: str
    category: str
    type: str
    subtype: Optional[str] = None
    surface_texture: Optional[str] = None
    description: Optional[str] = None

    color_hex: str = Field(..., alias="colorHex")
    color_name: Optional[str] = Field(None, alias="colorName")

    price_per_kg: float = Field(..., alias="pricePerKg")
    currency: Optional[str] = "USD"

    is_active: Optional[bool] = True
    is_biodegradable: Optional[bool] = None
    created_at: Optional[datetime] = None

    model_config = {
        "from_attributes": True,
        "populate_by_name": True
    }

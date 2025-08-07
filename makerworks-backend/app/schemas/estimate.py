# app/schemas/estimate.py

from pydantic import BaseModel, Field
from app.schemas.enums import CurrencyEnum


class EstimateRequest(BaseModel):
    model_id: int = Field(..., description="ID of the 3D model to estimate")
    x_mm: float = Field(..., gt=0, description="Model width in millimeters")
    y_mm: float = Field(..., gt=0, description="Model depth in millimeters")
    z_mm: float = Field(..., gt=0, description="Model height in millimeters")
    filament_type: str = Field(
        ..., description="Type of filament (e.g. PLA, PLA MATTE, PETG)"
    )
    filament_colors: list[str] = Field(
        ..., min_items=1, max_items=4, description="List of selected color hex codes"
    )
    print_profile: str = Field(
        ..., description="Print profile: standard, quality, elite"
    )
    custom_text: str | None = Field(
        None, description="Optional engraving or label text"
    )

    model_config = {"from_attributes": True}


class EstimateResponse(BaseModel):
    estimated_time_minutes: float = Field(
        ..., example=85.4, description="Estimated total print time in minutes"
    )
    estimated_cost: float = Field(
        ..., example=6.75, description="Estimated total print cost"
    )
    currency: CurrencyEnum = Field(
        default=CurrencyEnum.USD, description=CurrencyEnum.openapi_schema()["description"]
    )

    model_config = {"from_attributes": True}

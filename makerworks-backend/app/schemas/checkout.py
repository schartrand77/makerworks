# app/schemas/checkout.py

from pydantic import BaseModel, Field, model_validator
from typing import List
from datetime import datetime

from app.schemas.enums import CurrencyEnum


class CheckoutItem(BaseModel):
    model_id: int = Field(..., description="Unique ID of the model being purchased")
    name: str = Field(
        ..., max_length=100, description="Human-readable name of the model"
    )
    cost: float = Field(..., gt=0.0, description="Cost of the model in selected currency")

    model_config = {"from_attributes": True}


class CheckoutRequest(BaseModel):
    description: str = Field(
        ..., min_length=1, max_length=200, description="Description or cart note"
    )
    total_cost: float = Field(
        ..., gt=0.0, lt=10000.0, description="Total purchase cost in selected currency"
    )
    items: List[CheckoutItem] = Field(
        ..., description="List of models being checked out"
    )
    currency: CurrencyEnum = Field(
        default=CurrencyEnum.USD, description=CurrencyEnum.openapi_schema()["description"]
    )

    @model_validator(mode="after")
    def validate_total_cost(self) -> "CheckoutRequest":
        calculated = round(sum(item.cost for item in self.items), 2)
        if round(self.total_cost, 2) != calculated:
            raise ValueError(
                f"total_cost (${self.total_cost}) does not match sum of item costs (${calculated})"
            )
        return self

    model_config = {"from_attributes": True}


class CheckoutSessionOut(BaseModel):
    id: int = Field(..., description="ID of the checkout session")
    user_id: str = Field(..., description="UUID of the user who submitted the checkout")
    total_cost: float = Field(..., description="Total amount paid")
    description: str = Field(..., description="Cart note or description")
    currency: CurrencyEnum = Field(..., description=CurrencyEnum.openapi_schema()["description"])
    items: List[CheckoutItem] = Field(..., description="List of items in the session")
    created_at: datetime = Field(..., description="Timestamp of checkout submission")

    model_config = {"from_attributes": True}


class PaginatedCheckoutSessions(BaseModel):
    total: int = Field(..., description="Total number of checkout sessions")
    page: int = Field(..., description="Current page number")
    per_page: int = Field(..., description="Number of sessions per page")
    sessions: List[CheckoutSessionOut] = Field(..., description="List of checkout sessions")

    model_config = {"from_attributes": True}

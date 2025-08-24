# app/schemas/response.py

from pydantic import Field
from app.schemas._base import APIModel as BaseModel


class TokenResponse(BaseModel):
    access_token: str = Field(..., example="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...")
    token_type: str = Field(..., example="Bearer")

    model_config = {"from_attributes": True}

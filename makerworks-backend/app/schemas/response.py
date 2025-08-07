# app/schemas/response.py

from pydantic import BaseModel, Field


class TokenResponse(BaseModel):
    access_token: str = Field(..., example="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...")
    token_type: str = Field(..., example="Bearer")

    model_config = {"from_attributes": True}

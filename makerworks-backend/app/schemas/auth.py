from pydantic import BaseModel, EmailStr, ConfigDict, field_validator
from uuid import UUID
from datetime import datetime
from typing import Optional


class SignupRequest(BaseModel):
    email: EmailStr
    username: str
    password: str


class SigninRequest(BaseModel):
    email_or_username: str
    password: str


# ✅ Aliases to match route imports
UserCreate = SignupRequest
UserSignIn = SigninRequest


class UserOut(BaseModel):
    id: UUID
    email: EmailStr
    username: str
    role: Optional[str] = None
    created_at: datetime
    last_login: Optional[datetime] = None
    is_verified: bool

    # ✅ Keep avatar_url as plain string to avoid Pydantic HttpUrl validation
    avatar_url: Optional[str] = None

    @field_validator('avatar_url', mode='before')
    @classmethod
    def force_string(cls, v):
        if v is None:
            return v
        return str(v)

    model_config = ConfigDict(
        from_attributes=True,
        arbitrary_types_allowed=True
    )


class AuthPayload(BaseModel):
    user: UserOut
    token: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

# app/schemas/user.py

from datetime import datetime
from uuid import UUID
from typing import Optional
from pydantic import BaseModel, EmailStr, HttpUrl, field_serializer, ConfigDict


class UserOut(BaseModel):
    id: UUID
    email: EmailStr
    username: str
    name: Optional[str] = None
    bio: Optional[str] = None
    role: str
    is_verified: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    avatar_url: Optional[HttpUrl] = None  # ✅ Ensure consistent URL type
    thumbnail_url: Optional[HttpUrl] = None
    avatar_updated_at: Optional[datetime] = None
    language: Optional[str] = None

    @field_serializer("id")
    def serialize_id(self, v: UUID, _info) -> str:
        return str(v)

    @field_serializer("created_at", "last_login", "avatar_updated_at")
    def serialize_datetime(self, v: datetime | None, _info) -> Optional[str]:
        return v.isoformat() if v else None

    model_config = ConfigDict(from_attributes=True)


class UpdateUserProfile(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    language: Optional[str] = None
    avatar_url: Optional[HttpUrl] = None  # ✅ Allow avatar updates

    model_config = ConfigDict(extra="forbid")


class AvatarUploadResponse(BaseModel):
    status: str
    avatar_url: HttpUrl
    thumbnail_url: Optional[HttpUrl] = None
    uploaded_at: datetime

    @field_serializer("uploaded_at")
    def serialize_uploaded_at(self, v: datetime, _info) -> str:
        return v.isoformat()

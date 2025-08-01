from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, ConfigDict


class UserOut(BaseModel):
    id: UUID
    username: str
    email: EmailStr
    banned: Optional[bool] = False
    role: Optional[str] = "user"
    groups: Optional[List[str]] = []
    is_verified: Optional[bool] = True
    is_active: Optional[bool] = True
    created_at: Optional[datetime]
    last_login: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class UploadOut(BaseModel):
    id: UUID
    user_id: UUID
    filename: str
    uploaded_at: datetime
    url: Optional[str]
    thumbnail_url: Optional[str]
    status: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class DiscordConfigOut(BaseModel):
    bot_token: str
    channel_id: str
    enabled: bool

    model_config = ConfigDict(from_attributes=True)

# app/schemas/users.py
from __future__ import annotations
"""
Pydantic v2 user schemas.
PURE models only—no FastAPI/DB imports.
"""

from typing import Optional, Literal
from pydantic import ConfigDict, Field, EmailStr, field_validator
from app.schemas._base import APIModel as BaseModel
import re

_USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,30}$")


# ─────────────────────────────
# Output models
# ─────────────────────────────
class PublicUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    avatar: Optional[str] = None
    # Keep as plain str so relative '/uploads/...' is allowed
    avatar_url: Optional[str] = None


class UserOut(PublicUserOut):
    model_config = ConfigDict(from_attributes=True)

    email: EmailStr
    name: Optional[str] = None
    bio: Optional[str] = None
    language: Optional[str] = None
    theme: Optional[Literal["light", "dark"]] = None
    role: Optional[str] = None
    is_verified: Optional[bool] = None
    is_active: Optional[bool] = None
    created_at: Optional[str] = None
    last_login: Optional[str] = None


# ─────────────────────────────
# Input / command models
# ─────────────────────────────
class UserUpdate(BaseModel):
    """Sparse PATCH model for /api/v1/users/me."""
    username: Optional[str] = Field(None, description="3–30 chars: letters, numbers, underscore")
    name: Optional[str] = None
    bio: Optional[str] = None
    # Accept absolute URL or app-served relative path like '/uploads/...'
    avatar_url: Optional[str] = Field(None, description="Absolute URL or '/uploads/...'")
    language: Optional[str] = None
    theme: Optional[Literal["light", "dark"]] = None

    @field_validator("username")
    @classmethod
    def _username_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        vv = v.strip()
        if not vv:
            return None
        if not _USERNAME_RE.fullmatch(vv):
            raise ValueError("username must be 3–30 chars of letters, numbers, or underscore")
        return vv

    @field_validator("name", "bio", "language", "avatar_url")
    @classmethod
    def _empty_to_none(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str) and v.strip() == "":
            return None
        return v


class EmailUpdate(BaseModel):
    email: EmailStr


class RoleUpdate(BaseModel):
    role: Literal["user", "admin"]


class AvatarUpdate(BaseModel):
    # Keep simple: allow relative or absolute; validation happens elsewhere
    avatar_url: str


class UsernameAvailability(BaseModel):
    available: bool
    note: Optional[str] = None


class UserAdminAction(BaseModel):
    action: Literal["promote", "demote", "enable", "disable"]

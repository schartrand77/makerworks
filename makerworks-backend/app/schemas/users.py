from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal, Optional
from uuid import UUID
from urllib.parse import urlparse

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    constr,
    field_validator,
)

# ───────────────────────────────────────────────
# Constraints & helpers
# ───────────────────────────────────────────────

RESERVED_USERNAMES = {
    "admin", "root", "system", "support", "help", "api", "me",
    "null", "none", "owner", "moderator", "mod", "staff",
}

UsernameStr = constr(min_length=3, max_length=32)  # type: ignore[valid-type]
BioStr = constr(max_length=140)  # type: ignore[valid-type]


def _empty_to_none(v: object) -> object:
    return None if isinstance(v, str) and v.strip() == "" else v


def _norm_theme(v: Optional[str]) -> Optional[Literal["light", "dark", "system"]]:
    if v is None:
        return None
    s = str(v).strip().lower()
    return s if s in ("light", "dark", "system") else None


def _validate_username(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    s = v.strip().lower()
    if not (3 <= len(s) <= 32):
        raise ValueError("username must be 3–32 characters")
    # Allowed: a–z 0–9 . _ -
    for ch in s:
        if not (ch.isalnum() or ch in {".", "_", "-"}):
            raise ValueError("username may contain letters, numbers, '.', '_' or '-' only")
    if not (s[0].isalnum() and s[-1].isalnum()):
        raise ValueError("username must start and end with a letter/number")
    if ".." in s or "__" in s or "--" in s:
        raise ValueError("username cannot contain repeated punctuation")
    if s in RESERVED_USERNAMES:
        raise ValueError("that username is reserved")
    return s


def _is_http_url(s: str) -> bool:
    try:
        p = urlparse(s)
        return p.scheme in ("http", "https") and bool(p.netloc)
    except Exception:
        return False


def _is_upload_path(s: str) -> bool:
    # Root-relative path the app serves; block traversal
    return s.startswith("/uploads/") and ".." not in s and "://" not in s


def _avatar_like_input(v: object) -> Optional[str]:
    """Accept absolute http(s) URL or root-relative '/uploads/...' path; '' -> None."""
    if v is None:
        return None
    if isinstance(v, str):
        s = v.strip()
        if s == "":
            return None
        if _is_http_url(s) or _is_upload_path(s):
            return s
    raise ValueError("avatar must be an http(s) URL or a '/uploads/…' path")


# ───────────────────────────────────────────────
# Core User Base Schema
# ───────────────────────────────────────────────

class UserBase(BaseModel):
    email: EmailStr = Field(..., example="user@example.com")
    username: UsernameStr = Field(..., example="printmaster77")

    model_config = ConfigDict(from_attributes=True)


# ───────────────────────────────────────────────
# Output Schemas
# ───────────────────────────────────────────────

class UserOut(UserBase):
    id: UUID = Field(..., example="f47ac10b-58cc-4372-a567-0e02b2c3d479")
    # 🔧 Make role optional to tolerate endpoints that omit it
    role: Optional[Literal["admin", "user"]] = Field(None, example="user")
    is_active: bool = Field(default=True)
    is_verified: bool = Field(default=False, example=True)
    created_at: datetime = Field(..., example="2024-01-15T12:00:00Z")
    last_login: datetime | None = Field(None, example="2025-06-13T07:45:00Z")

    # Accept either absolute URL or relative path in outputs too
    avatar: str | None = Field(None, example="/uploads/users/abc/avatars/pic.jpg")
    avatar_url: str | None = Field(None, example="https://cdn.makerworks.io/avatars/abc123.jpg")

    bio: BioStr | None = Field(None, example="Maker. Designer. Print wizard.")
    language: Literal["en", "fr", "es", "de", "zh", "ja"] | None = Field(default="en")
    theme: Literal["light", "dark", "system"] | None = Field(default="system", example="dark")

    model_config = ConfigDict(from_attributes=True)

    @field_validator("avatar", "avatar_url", "bio", mode="before")
    @classmethod
    def _outs_coerce(cls, v):  # coerce empty strings to None in outputs
        return _empty_to_none(v)


class PublicUserOut(BaseModel):
    id: UUID = Field(..., example="f47ac10b-58cc-4372-a567-0e02b2c3d479")
    username: str = Field(..., example="printmaster77")
    avatar: str | None = Field(None, example="/uploads/users/u1/avatars/a.jpg")
    bio: str | None = Field(None, example="I build printer mods.")
    created_at: datetime = Field(..., example="2024-01-15T12:00:00Z")

    model_config = ConfigDict(from_attributes=True)


# ───────────────────────────────────────────────
# Update Schemas
# (PATCH /users/me accepts these; extra keys are forbidden)
# ───────────────────────────────────────────────

class UserUpdate(BaseModel):
    # Yes, you can change these now:
    email: EmailStr | None = None
    username: UsernameStr | None = None

    # Other profile fields
    bio: BioStr | None = None
    language: Literal["en", "fr", "es", "de", "zh", "ja"] | None = None
    theme: Literal["light", "dark", "system"] | None = Field(None, example="dark")

    # Support BOTH 'avatar' and 'avatar_url' and allow relative upload paths
    avatar: str | None = Field(None, example="/uploads/users/u1/avatars/a.jpg")
    avatar_url: str | None = Field(None, example="https://cdn.makerworks.io/avatars/user456.jpg")

    model_config = ConfigDict(from_attributes=True, extra="forbid")

    # Normalizers / validators
    @field_validator("bio", mode="before")
    @classmethod
    def _bio_empty_to_none(cls, v):
        return _empty_to_none(v)

    @field_validator("avatar", "avatar_url", mode="before")
    @classmethod
    def _avatar_like(cls, v):
        return _avatar_like_input(v)

    @field_validator("theme", mode="before")
    @classmethod
    def _normalize_theme(cls, v):
        return _norm_theme(v)

    @field_validator("username")
    @classmethod
    def _validate_un(cls, v):
        return _validate_username(v)

    # Optional: keep email lowercased
    @field_validator("email", mode="before")
    @classmethod
    def _email_lower(cls, v):
        return v.lower() if isinstance(v, str) else v


class EmailUpdate(BaseModel):
    new_email: EmailStr = Field(..., example="new@example.com")

    model_config = ConfigDict(from_attributes=True)


class RoleUpdate(BaseModel):
    role: Literal["admin", "user"] = Field(..., example="admin")
    user_id: UUID = Field(..., example="f47ac10b-58cc-4372-a567-0e02b2c3d479")

    model_config = ConfigDict(from_attributes=True)


# ───────────────────────────────────────────────
# Utility Schemas
# ───────────────────────────────────────────────

class AvatarUpdate(BaseModel):
    # Either of these can be provided; both validated like above by the route if reused
    avatar_url: str | None = Field(
        default=None,
        example="/uploads/users/abc/avatars/pic.jpg",
        description="Absolute http(s) URL or '/uploads/…' path",
    )
    base64_image: str | None = Field(
        default=None, description="Base64-encoded image as fallback"
    )

    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "avatar_url": "/uploads/users/abc/avatars/pic.jpg",
                "base64_image": None,
            }
        },
    )

    @field_validator("avatar_url", mode="before")
    @classmethod
    def _avatar_like2(cls, v):
        return _avatar_like_input(v)


class UsernameAvailability(BaseModel):
    available: bool = Field(..., example=True)

    model_config = ConfigDict(from_attributes=True)


# ───────────────────────────────────────────────
# Admin Utility Schemas
# ───────────────────────────────────────────────

class UserAdminAction(str, Enum):
    promote = "promote"
    demote = "demote"
    delete = "delete"
    reset_password = "reset_password"
    view_uploads = "view_uploads"


class UserActionLog(BaseModel):
    id: int
    admin_id: UUID
    target_user_id: UUID
    action: UserAdminAction
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)

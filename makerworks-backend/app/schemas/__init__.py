# app/schemas/__init__.py
"""
Central exports for Pydantic schemas.

We intentionally re-export from `.users` (plural) to avoid accidental imports of
any legacy singular module (`schemas.user`). If you still have `schemas/user.py`,
rename it to `_user_legacy.py` or delete it.
"""

from .checkout import CheckoutRequest
from .filaments import (
    FilamentCreate,
    FilamentOut,
    FilamentUpdate,
)
from .models import (
    ModelOut,
    ModelUploadRequest,
    ModelUploadResponse,
)
from .system import SystemStatus
from .token import (
    Token,
    TokenData,
    TokenPayload,
)
from .users import (
    AvatarUpdate,
    EmailUpdate,
    PublicUserOut,
    RoleUpdate,
    UserAdminAction,
    UsernameAvailability,
    UserOut,
    UserUpdate,
)

__all__ = [
    "AvatarUpdate",
    "CheckoutRequest",
    "EmailUpdate",
    "FilamentCreate",
    "FilamentOut",
    "FilamentUpdate",
    "ModelOut",
    "ModelUploadRequest",
    "ModelUploadResponse",
    "PublicUserOut",
    "RoleUpdate",
    "SystemStatus",
    "Token",
    "TokenData",
    "TokenPayload",
    "UserAdminAction",
    "UserOut",
    "UserUpdate",
    "UsernameAvailability",
]

# app/dependencies/__init__.py
"""
Cycle-safe dependency re-exports.

Import dependencies from *this* module:
    from app.dependencies import get_current_user, admin_required, get_db

Instead of importing from submodules directly (which can create circular
imports during app startup).
"""

from __future__ import annotations

from typing import Any

__all__ = [
    "get_current_user",
    "admin_required",
    "optional_user",
    "get_db",
    "get_async_db",
]

# ──────────────────────────────────────────────────────────────────────────────
# Auth dependencies — lazy-loaded to avoid circular imports
# ──────────────────────────────────────────────────────────────────────────────

def get_current_user(*args: Any, **kwargs: Any):
    # Lazy import at call-time
    from .auth import get_current_user as _impl
    return _impl(*args, **kwargs)

def admin_required(*args: Any, **kwargs: Any):
    from .auth import admin_required as _impl
    return _impl(*args, **kwargs)

def optional_user(*args: Any, **kwargs: Any):
    """
    Optional auth dependency. If your code doesn't define it, we provide a
    harmless fallback that returns None.
    """
    try:
        from .auth import optional_user as _impl
    except Exception:
        def _impl(*_a: Any, **_k: Any):
            return None
    return _impl(*args, **kwargs)

# ──────────────────────────────────────────────────────────────────────────────
# DB session dependency — also lazy to avoid import-order surprises
# ──────────────────────────────────────────────────────────────────────────────

def get_db(*args: Any, **kwargs: Any):
    """
    Yield an AsyncSession (preferred new path), falling back to legacy helper.
    Use exactly like FastAPI Depends(get_db).
    """
    try:
        from app.db.session import get_db as _impl  # preferred
    except Exception:
        from app.db.database import get_async_db as _impl  # legacy
    return _impl(*args, **kwargs)

# Back-compat alias some codebases still use
def get_async_db(*args: Any, **kwargs: Any):
    return get_db(*args, **kwargs)

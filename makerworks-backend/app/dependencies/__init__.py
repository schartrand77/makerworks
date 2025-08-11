# app/dependencies/__init__.py

from .auth import get_current_user, admin_required

# Prefer the new session dependency; alias old name for back-compat
try:
    from app.db.session import get_db
except ImportError:
    from app.db.database import get_async_db as get_db  # fallback if legacy path exists

# Backwards compatibility: some modules may still import get_async_db
get_async_db = get_db

__all__ = [
    "get_current_user",
    "admin_required",
    "get_db",
    "get_async_db",
]

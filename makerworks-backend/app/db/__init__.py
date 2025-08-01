# app/db/__init__.py

# Only import symbols that are guaranteed to exist at module import time.
# Avoid pulling in functions that might trigger model imports before the engine is ready.

from .database import engine, async_session_maker, Base

__all__ = ("engine", "async_session_maker", "Base")

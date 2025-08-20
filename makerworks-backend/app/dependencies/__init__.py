# app/dependencies/__init__.py
"""
Cycle-safe dependency re-exports WITHOUT leaking *args/**kwargs.

Import from here:
    from app.dependencies import get_current_user, admin_required, optional_user, get_db

This module lazy-imports the real implementations to avoid circular imports, but
exposes explicit FastAPI-friendly signatures so DI (Request/Header/Cookie/DB)
actually happens and we don't pass Header(...) sentinels into business logic.
"""

from __future__ import annotations

import inspect
from typing import Any, AsyncGenerator, Optional

from fastapi import Cookie, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

__all__ = [
    "get_current_user",
    "admin_required",
    "optional_user",
    "get_db",
    "get_async_db",
]

# ──────────────────────────────────────────────────────────────────────────────
# DB session dependency (explicit signature; supports legacy/new impls)
# ──────────────────────────────────────────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Yield an AsyncSession from whichever factory exists in the app.
    Prefers app.db.session.get_db, falls back to app.db.database.get_async_db.
    """
    try:
        from app.db.session import get_db as _impl  # async generator function
    except Exception:
        from app.db.database import get_async_db as _impl  # legacy name

    agen = _impl()
    # Normal case: async generator → yield items through
    if inspect.isasyncgen(agen):
        async for sess in agen:
            yield sess
        return

    # Fallback: someone made it an async def returning a session
    sess = agen
    if inspect.isawaitable(sess):
        sess = await sess
    try:
        yield sess  # type: ignore[misc]
    finally:
        close = getattr(sess, "close", None)
        if callable(close):
            if inspect.iscoroutinefunction(close):
                await close()
            else:
                close()

# Back-compat alias
get_async_db = get_db


# ──────────────────────────────────────────────────────────────────────────────
# Auth dependencies (explicit signatures; lazy import bodies; no *args/**kwargs)
# IMPORTANT: include Header/Cookie/DB in the signature so FastAPI injects them.
# ──────────────────────────────────────────────────────────────────────────────
async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    access_token: Optional[str] = Cookie(default=None),
) -> Any:
    from .auth import get_current_user as _impl
    result = _impl(
        request=request,
        db=db,
        authorization=authorization,
        access_token=access_token,
    )
    return await result if inspect.isawaitable(result) else result  # type: ignore[no-any-return]


async def optional_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    access_token: Optional[str] = Cookie(default=None),
) -> Optional[Any]:
    try:
        from .auth import optional_user as _impl
    except Exception:
        async def _impl(**_: Any) -> None:
            return None
    result = _impl(
        request=request,
        db=db,
        authorization=authorization,
        access_token=access_token,
    )
    return await result if inspect.isawaitable(result) else result  # type: ignore[no-any-return]


async def admin_required(user: Any = Depends(get_current_user)) -> Any:
    from .auth import admin_required as _impl
    result = _impl(user=user)
    return await result if inspect.isawaitable(result) else result  # type: ignore[no-any-return]

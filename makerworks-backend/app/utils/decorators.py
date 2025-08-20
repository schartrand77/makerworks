# app/utils/decorators.py
from __future__ import annotations
from functools import wraps
from typing import Callable, Any, Awaitable

def async_wraps(fn: Callable[..., Awaitable[Any]]):
    # Optional helper; or just use @wraps(fn) directly in your decorators.
    def _decorator(w: Callable[..., Awaitable[Any]]):
        return wraps(fn)(w)
    return _decorator

def log_calls(fn: Callable[..., Awaitable[Any]]):
    @wraps(fn)  # ← THIS is the fix. No @wraps = FastAPI sees *args/**kwargs as query params.
    async def _w(*args, **kwargs):
        # your logging here
        return await fn(*args, **kwargs)
    return _w

# app/services/session_backend.py
import secrets
from typing import Optional, Union
from uuid import UUID
from redis.asyncio import Redis
from app.core.config import settings

redis = Redis.from_url(settings.redis_url, decode_responses=True)

SESSION_PREFIX = "session:"
SESSION_TTL = 60 * 60 * 24 * 7  # 7 days


def _to_str_id(user_id: Union[str, UUID]) -> str:
    """Convert UUID or str to a clean string for Redis keys/values."""
    return str(user_id)


async def create_session(user_id: Union[str, UUID]) -> str:
    token = secrets.token_urlsafe(32)
    key = SESSION_PREFIX + token
    # ✅ Convert UUID to string before storing
    await redis.set(key, _to_str_id(user_id), ex=SESSION_TTL)
    return token


async def get_session(token: str) -> Optional[str]:
    key = SESSION_PREFIX + token
    return await redis.get(key)


async def get_session_user_id(token: str) -> Optional[str]:
    """
    Wrapper used by get_current_user to resolve a user_id from a session token.
    """
    key = SESSION_PREFIX + token
    user_id = await redis.get(key)
    return user_id


async def destroy_session(user_id: Union[str, UUID]):
    """Destroy all sessions belonging to this user_id."""
    user_id_str = _to_str_id(user_id)
    keys = await redis.keys(SESSION_PREFIX + "*")
    for key in keys:
        val = await redis.get(key)
        if val == user_id_str:
            await redis.delete(key)

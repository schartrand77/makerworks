import json
from datetime import timedelta
from uuid import UUID
from typing import Optional, Union

from redis.asyncio import Redis
from app.schemas.users import UserOut
from app.models.models import User as UserORM  # ✅ SQLAlchemy ORM model
import logging
import prometheus_client

# ✅ Import the global Redis connection
from app.services.cache.redis_service import redis as global_redis

logger = logging.getLogger("user_cache")

# Redis Key Prefixes
USER_CACHE_PREFIX = "user:cache:"
USER_ID_KEY = lambda user_id: f"{USER_CACHE_PREFIX}id:{user_id}"
USERNAME_KEY = lambda username: f"{USER_CACHE_PREFIX}username:{username}"

# Time-to-live (TTL) for user cache entries
DEFAULT_TTL = timedelta(hours=2)

# Prometheus Metrics
user_cache_hits = prometheus_client.Counter(
    "user_cache_hits", "Total Redis user cache hits", ["lookup_type"]
)
user_cache_misses = prometheus_client.Counter(
    "user_cache_misses", "Total Redis user cache misses", ["lookup_type"]
)
user_cache_sets = prometheus_client.Counter(
    "user_cache_sets", "Total Redis user cache set operations"
)
user_cache_deletes = prometheus_client.Counter(
    "user_cache_deletes", "Total Redis user cache delete operations"
)


def serialize_user(user: Union[UserOut, UserORM]) -> str:
    """
    Ensure we always serialize to JSON using Pydantic, even if we receive a SQLAlchemy ORM object.
    """
    if isinstance(user, UserOut):
        return user.model_dump_json()
    elif isinstance(user, UserORM):
        pydantic_user = UserOut.model_validate(user)
        return pydantic_user.model_dump_json()
    else:
        raise TypeError(f"Unsupported user type for serialization: {type(user)}")


def deserialize_user(data: str) -> UserOut:
    return UserOut.model_validate_json(data)


async def cache_user_by_id(redis: Redis, user: Union[UserOut, UserORM], ttl: timedelta = DEFAULT_TTL):
    key = USER_ID_KEY(user.id)
    await redis.set(key, serialize_user(user), ex=ttl)
    user_cache_sets.inc()
    logger.info(f"[REDIS] Cached user by ID: {user.id}")


async def cache_user_by_username(redis: Redis, user: Union[UserOut, UserORM], ttl: timedelta = DEFAULT_TTL):
    key = USERNAME_KEY(user.username)
    await redis.set(key, serialize_user(user), ex=ttl)
    user_cache_sets.inc()
    logger.info(f"[REDIS] Cached user by username: {user.username}")


async def cache_user_profile(user: Union[UserOut, UserORM], ttl: timedelta = DEFAULT_TTL, redis: Redis = global_redis):
    """
    Unified cache function to store both ID and username keys for a user.
    Accepts both SQLAlchemy User ORM and Pydantic UserOut.
    """
    # Ensure we work with Pydantic for consistency
    pydantic_user = user if isinstance(user, UserOut) else UserOut.model_validate(user)

    await cache_user_by_id(redis, pydantic_user, ttl)
    await cache_user_by_username(redis, pydantic_user, ttl)
    logger.debug(f"[REDIS] Cached full user profile for {pydantic_user.id}")


async def get_user_by_id(user_id: UUID, redis: Redis = global_redis) -> Optional[UserOut]:
    key = USER_ID_KEY(user_id)
    data = await redis.get(key)
    if data:
        user_cache_hits.labels(lookup_type="id").inc()
        logger.debug(f"[REDIS] Cache hit for user ID: {user_id}")
        return deserialize_user(data)
    else:
        user_cache_misses.labels(lookup_type="id").inc()
        logger.debug(f"[REDIS] Cache miss for user ID: {user_id}")
        return None


async def get_user_by_username(username: str, redis: Redis = global_redis) -> Optional[UserOut]:
    key = USERNAME_KEY(username)
    data = await redis.get(key)
    if data:
        user_cache_hits.labels(lookup_type="username").inc()
        logger.debug(f"[REDIS] Cache hit for username: {username}")
        return deserialize_user(data)
    else:
        user_cache_misses.labels(lookup_type="username").inc()
        logger.debug(f"[REDIS] Cache miss for username: {username}")
        return None


async def delete_user_cache(user_id: UUID, username: str, redis: Redis = global_redis):
    deleted = await redis.delete(USER_ID_KEY(user_id), USERNAME_KEY(username))
    user_cache_deletes.inc(deleted)
    logger.info(f"[REDIS] Deleted {deleted} user cache entries for {user_id} / {username}")


async def invalidate_user_cache(user_id: UUID, username: Optional[str] = None, redis: Redis = global_redis):
    """
    Public wrapper to invalidate all cache entries for a user.
    Called when avatar or profile updates occur.
    """
    keys = [USER_ID_KEY(user_id)]
    if username:
        keys.append(USERNAME_KEY(username))
    deleted = await redis.delete(*keys)
    user_cache_deletes.inc(deleted)
    logger.info(f"[REDIS] Invalidated cache for user {user_id} ({username})")


async def auto_clear_expired_keys(redis: Redis = global_redis):
    """
    Optional: clears all expired keys in the Redis user cache namespace.
    This only makes sense in Redis configurations that do not automatically evict expired keys.
    """
    try:
        keys = await redis.keys(f"{USER_CACHE_PREFIX}*")
        count = 0
        for key in keys:
            if await redis.ttl(key) == -2:  # TTL -2 means key does not exist (expired)
                await redis.delete(key)
                count += 1
        logger.info(f"[REDIS] Auto-cleared {count} expired user cache keys on boot.")
    except Exception as e:
        logger.warning(f"[REDIS] Error auto-clearing expired keys: {e}")


__all__ = [
    "cache_user_profile",
    "get_user_by_id",
    "get_user_by_username",
    "delete_user_cache",
    "invalidate_user_cache"
]

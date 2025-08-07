"""Backward-compatible export for redis service utilities."""

from app.services.cache.redis_service import (
    clear_expired_keys,
    get_redis,
    redis_client,
    redis_keys_deleted,
    redis_keys_scanned,
    redis_lifespan,
    redis_ping_latency,
    verify_redis_connection,
)

__all__ = [
    "clear_expired_keys",
    "get_redis",
    "redis_client",
    "redis_keys_deleted",
    "redis_keys_scanned",
    "redis_lifespan",
    "redis_ping_latency",
    "verify_redis_connection",
]

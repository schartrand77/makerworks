import logging
import time
from typing import AsyncGenerator

from redis.asyncio import Redis
from app.config.settings import settings

from prometheus_client import Gauge, Counter

# ──────────────────────────────────────────────────────────────
# Redis client singleton
# ──────────────────────────────────────────────────────────────
redis: Redis = Redis.from_url(
    settings.redis_url,
    decode_responses=True
)

# Keep old name for backward compatibility
redis_client = redis

# Logger setup
logger = logging.getLogger("makerworks.redis")

# ──────────────────────────────────────────────────────────────
# Prometheus Metrics
# ──────────────────────────────────────────────────────────────
redis_ping_latency = Gauge("redis_ping_latency_seconds", "Redis PING roundtrip latency")
redis_keys_scanned = Counter("redis_keys_scanned_total", "Total Redis keys scanned on startup")
redis_keys_deleted = Counter("redis_keys_deleted_total", "Total Redis keys auto-deleted on startup")

# ──────────────────────────────────────────────────────────────
# Verify Redis connection on startup
# ──────────────────────────────────────────────────────────────
async def verify_redis_connection() -> None:
    try:
        start = time.perf_counter()
        await redis.ping()
        latency = time.perf_counter() - start
        redis_ping_latency.set(latency)

        logger.info(f"✅ Connected to Redis at {settings.redis_url} (ping: {latency:.4f}s)")
    except Exception as e:
        logger.error(f"❌ Redis connection failed: {e}")
        raise RuntimeError(f"Redis connection failed: {e}") from e

# ──────────────────────────────────────────────────────────────
# Auto-clear expired MakerWorks namespace keys on startup
# ──────────────────────────────────────────────────────────────
async def clear_expired_keys(namespace: str = "makerworks:*") -> None:
    logger.info("🧹 Scanning Redis for expired keys…")
    async for key in redis.scan_iter(match=namespace, count=100):
        redis_keys_scanned.inc()
        ttl = await redis.ttl(key)
        if ttl == -2:  # expired
            await redis.delete(key)
            redis_keys_deleted.inc()
            logger.debug(f"🗑️ Deleted expired key: {key}")
    logger.info("✅ Redis expired key scan complete.")

# ──────────────────────────────────────────────────────────────
# Dependency-injectable accessor
# ──────────────────────────────────────────────────────────────
async def get_redis() -> Redis:
    return redis

# ──────────────────────────────────────────────────────────────
# Optional: Context manager for FastAPI lifespan or background tasks
# ──────────────────────────────────────────────────────────────
async def redis_lifespan() -> AsyncGenerator[None, None]:
    await verify_redis_connection()
    await clear_expired_keys()
    yield

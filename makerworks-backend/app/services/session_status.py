import time
from redis.asyncio import Redis

SESSION_PREFIX = "session:status:"

async def set_session_status(redis: Redis, user_id: str, status: str, ttl: int = 3600) -> None:
    await redis.set(f"{SESSION_PREFIX}{user_id}", status, ex=ttl)

async def get_session_status(redis: Redis, user_id: str) -> str | None:
    return await redis.get(f"{SESSION_PREFIX}{user_id}")


import os
import sys
import pytest
from fakeredis.aioredis import FakeRedis

# Ensure paths and environment are set before importing the module under test
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

from app.services import session_backend


@pytest.mark.asyncio
async def test_destroy_session_uses_scan_iter(monkeypatch):
    fake_redis = FakeRedis(decode_responses=True)

    async def forbidden_keys(*args, **kwargs):
        raise AssertionError("keys should not be used")

    monkeypatch.setattr(fake_redis, "keys", forbidden_keys)

    scan_called = False
    original_scan_iter = fake_redis.scan_iter

    async def spy_scan_iter(*args, **kwargs):
        nonlocal scan_called
        scan_called = True
        async for k in original_scan_iter(*args, **kwargs):
            yield k

    monkeypatch.setattr(fake_redis, "scan_iter", spy_scan_iter)
    monkeypatch.setattr(session_backend, "redis", fake_redis)

    user1 = "user1"
    user2 = "user2"
    t1 = await session_backend.create_session(user1)
    t2 = await session_backend.create_session(user2)
    t3 = await session_backend.create_session(user1)

    await session_backend.destroy_session(user1)

    assert scan_called is True
    assert await fake_redis.get(session_backend.SESSION_PREFIX + t1) is None
    assert await fake_redis.get(session_backend.SESSION_PREFIX + t3) is None
    assert await fake_redis.get(session_backend.SESSION_PREFIX + t2) == user2

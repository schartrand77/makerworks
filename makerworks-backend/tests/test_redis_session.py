import os
import sys
import json
import pytest

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

from app.services.redis_service import redis_client

@pytest.mark.asyncio
async def test_redis_session_store_and_retrieve():
    await redis_client.flushdb()
    token = "test-token"
    user = {"id": "123", "email": "test@example.com"}

    await redis_client.set(token, json.dumps(user), ex=60)
    data = await redis_client.get(token)
    assert data is not None
    assert json.loads(data) == user
    ttl = await redis_client.ttl(token)
    assert ttl > 0

import os
from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.services.cache.redis_service as redis_service


def test_redis_connectivity_checked_on_startup(monkeypatch):
    called = {"flag": False}

    async def fake_verify():
        called["flag"] = True

    async def fake_clear():
        return None

    monkeypatch.setattr(redis_service, "verify_redis_connection", fake_verify)
    monkeypatch.setattr(redis_service, "clear_expired_keys", fake_clear)

    app = FastAPI()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async for _ in redis_service.redis_lifespan():
            yield

    app.router.lifespan_context = lifespan

    with TestClient(app):
        assert called["flag"] is True

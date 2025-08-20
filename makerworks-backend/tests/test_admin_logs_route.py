import os
import sys
import uuid
import asyncio
from pathlib import Path

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# set required environment variables before importing application modules
os.environ.setdefault("ENV", "test")
os.environ.setdefault("DOMAIN", "http://testserver")
os.environ.setdefault("BASE_URL", "http://testserver")
os.environ.setdefault("VITE_API_BASE_URL", "http://testserver")
os.environ.setdefault("UPLOAD_DIR", "/tmp")
os.environ.setdefault("MODEL_DIR", "/tmp")
os.environ.setdefault("AVATAR_DIR", "/tmp")
os.environ.setdefault("ASYNC_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "secret")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

from app.routes import admin
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.models import User, AuditLog


def create_test_app(overrides: dict | None = None) -> FastAPI:
    engine = create_async_engine(
        'sqlite+aiosqlite:///:memory:',
        echo=False,
        connect_args={'check_same_thread': False},
        poolclass=StaticPool,
    )
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with async_session() as session:
            yield session

    async def init_models():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    loop = asyncio.get_event_loop()
    loop.run_until_complete(init_models())

    app = FastAPI()
    app.dependency_overrides[get_db] = override_get_db
    if overrides:
        for dep, func in overrides.items():
            app.dependency_overrides[dep] = func
    app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
    app.state.async_session = async_session
    return app


def test_admin_logs_requires_auth():
    app = create_test_app()
    with TestClient(app) as client:
        resp = client.post("/api/v1/admin/logs", json={"action": "ping"})
        assert resp.status_code == 401


def test_admin_logs_forbidden_for_non_admin():
    async def override_user():
        return User(id=uuid.uuid4(), email="user@example.com", username="user", hashed_password="x", role="user")

    app = create_test_app({get_current_user: override_user})
    with TestClient(app) as client:
        resp = client.post("/api/v1/admin/logs", json={"action": "ping"})
        assert resp.status_code == 403



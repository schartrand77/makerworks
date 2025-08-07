import os
import sys

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

import importlib.util
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.session import get_db

spec_auth = importlib.util.spec_from_file_location(
    "app.routes.auth",
    Path(__file__).resolve().parents[1] / "app" / "routes" / "auth.py",
)
auth = importlib.util.module_from_spec(spec_auth)
spec_auth.loader.exec_module(auth)

spec_admin = importlib.util.spec_from_file_location(
    "app.routes.admin",
    Path(__file__).resolve().parents[1] / "app" / "routes" / "admin.py",
)
admin = importlib.util.module_from_spec(spec_admin)
spec_admin.loader.exec_module(admin)


def create_test_app():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with async_session() as session:
            yield session

    async def init_models():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    app = FastAPI()
    app.dependency_overrides[get_db] = override_get_db
    app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
    app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])

    import asyncio

    asyncio.get_event_loop().run_until_complete(init_models())

    return app


@pytest.fixture()
def client():
    app = create_test_app()
    with TestClient(app) as c:
        yield c


def test_auth_admin_unlock_protected(client):
    resp = client.post("/api/v1/auth/admin/unlock")
    assert resp.status_code == 401


def test_admin_unlock_protected(client):
    resp = client.post("/api/v1/admin/admin/unlock")
    assert resp.status_code == 401

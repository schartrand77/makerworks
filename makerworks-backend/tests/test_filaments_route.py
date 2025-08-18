import os
import sys
from pathlib import Path

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
os.environ.setdefault("STRIPE_SECRET_KEY", "test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.append(Path(__file__).resolve().parents[1].as_posix())

from app.db.base import Base
from app.dependencies import get_db
from app.models.models import Filament

import importlib.util

spec = importlib.util.spec_from_file_location(
    "app.routes.filaments",
    Path(__file__).resolve().parents[1] / "app" / "routes" / "filaments.py",
)
filaments = importlib.util.module_from_spec(spec)
spec.loader.exec_module(filaments)


async def create_test_app():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    session_local = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with session_local() as session:
            yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    app = FastAPI()
    app.dependency_overrides[get_db] = override_get_db
    app.include_router(filaments.router, prefix="/api/v1/filaments", tags=["filaments"])

    app.state._sessionmaker = session_local
    return app


@pytest.fixture()
async def client():
    app = await create_test_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        c.app = app  # type: ignore[attr-defined]
        yield c


@pytest.fixture()
async def db(client):
    session_local = client.app.state._sessionmaker
    async with session_local() as session:
        yield session


@pytest.mark.asyncio
async def test_list_filaments_returns_color_and_hex(client: AsyncClient, db: AsyncSession):
    filament = Filament(
        material="PLA",
        type="PLA",
        color_name="Red",
        color_hex="#ff0000",
        price_per_kg=20.0,
    )
    db.add(filament)
    await db.commit()

    resp = await client.get("/api/v1/filaments/")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert data
    item = data[0]
    assert item["color"] == "Red"
    assert item["hex"] == "#ff0000"
    assert "color_name" not in item
    assert "color_hex" not in item

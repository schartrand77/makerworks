import os
from pathlib import Path
import sys

os.environ.setdefault("ENV", "test")
os.environ.setdefault("ASYNC_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.append(Path(__file__).resolve().parents[1].as_posix())

from app.db.base import Base
from app.models.models import Filament
from app.schemas.filaments import FilamentCreate, FilamentUpdate

import importlib.util

spec = importlib.util.spec_from_file_location(
    "app.routes.filaments",
    Path(__file__).resolve().parents[1] / "app" / "routes" / "filaments.py",
)
filaments = importlib.util.module_from_spec(spec)
spec.loader.exec_module(filaments)


@pytest.fixture()
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        def _create_all(sync_conn):
            meta = Base.metadata
            for tbl in list(meta.tables.values()):
                if getattr(tbl, "schema", None):
                    meta.remove(tbl)
            meta.create_all(sync_conn)
        await conn.run_sync(_create_all)
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        yield session


@pytest.mark.asyncio
async def test_list_filaments_returns_color_and_hex(db: AsyncSession):
    filament = Filament(
        name="PLA Red",
        category="PLA",
        material="PLA",
        type="PLA",
        color_name="Red",
        color_hex="#ff0000",
        price_per_kg=20.0,
    )
    db.add(filament)
    await db.commit()

    rows = await filaments.list_filaments(db=db, _user=object(), search=None, include_inactive=False, page=1, page_size=100)
    assert rows
    item = rows[0]
    assert item.color == "Red"
    assert item.hex == "#ff0000"


@pytest.mark.asyncio
async def test_create_filament(db: AsyncSession):
    body = FilamentCreate(
        name="PLA Red",
        category="PLA",
        type="PLA",
        colorHex="#FF0000",
        pricePerKg=25.0,
    )
    created = await filaments.create_filament(body=body, db=db, _admin=object())
    row = await db.get(Filament, created.id)
    assert row is not None
    assert row.color_hex == "#FF0000"


@pytest.mark.asyncio
async def test_update_filament(db: AsyncSession):
    filament = Filament(
        name="PLA Red",
        category="PLA",
        material="PLA",
        type="PLA",
        color_name="Red",
        color_hex="#ff0000",
        price_per_kg=20.0,
    )
    db.add(filament)
    await db.commit()

    body = FilamentUpdate(colorHex="#00FF00", isActive=False)
    await filaments.update_filament(filament.id, body=body, db=db, _admin=object())
    row = await db.get(Filament, filament.id)
    assert row.color_hex == "#00FF00"
    assert row.is_active is False


@pytest.mark.asyncio
async def test_delete_filament(db: AsyncSession):
    filament = Filament(
        name="PLA Red",
        category="PLA",
        material="PLA",
        type="PLA",
        color_name="Red",
        color_hex="#ff0000",
        price_per_kg=20.0,
    )
    db.add(filament)
    await db.commit()

    await filaments.delete_filament(filament.id, db=db, _admin=object())
    row = await db.get(Filament, filament.id)
    assert row is None

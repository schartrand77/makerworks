# scripts/seed_filaments.py
from __future__ import annotations

# ── Force host DB & writable paths BEFORE importing app code ────────────────
import os
from pathlib import Path

HOST_ROOT = Path("/Users/stephenchartrand/Downloads/makerworks-repo/makerworks/makerworks-backend").resolve()
HOST_UPLOADS = HOST_ROOT / "uploads"
HOST_DATA = HOST_ROOT / "data"

# Point to your local Postgres (not the Docker service name "postgres")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://makerworks:makerworks@127.0.0.1:5432/makerworks",
)
# If you don't have Postgres running locally, uncomment to seed into SQLite:
# os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{(HOST_DATA / 'dev.db').as_posix()}"

# Keep settings.py from trying to mkdir('/app/...') on macOS
for k, v in {
    "APP_DIR": str(HOST_ROOT),
    "BASE_DIR": str(HOST_ROOT),
    "DATA_DIR": str(HOST_DATA),
    "UPLOAD_DIR": str(HOST_UPLOADS),
    "UPLOADS_DIR": str(HOST_UPLOADS),
    "THUMBNAILS_DIR": str(HOST_ROOT / "thumbnails"),
    "RUNNING_IN_DOCKER": "0",
    "DOCKER": "0",
    "CONTAINERIZED": "0",
}.items():
    os.environ.setdefault(k, v)

HOST_UPLOADS.mkdir(parents=True, exist_ok=True)
HOST_DATA.mkdir(parents=True, exist_ok=True)

# ── Actual seeder logic ─────────────────────────────────────────────────────
import asyncio
import logging
from typing import List

from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError

# Try to use the project's session maker; fall back to constructing one
try:
    from app.db.session import async_session_maker as SessionMaker  # type: ignore[attr-defined]
except Exception:  # pragma: no cover
    from importlib import import_module
    mod = import_module("app.db.session")
    async_engine = getattr(mod, "async_engine", None) or getattr(mod, "engine", None)
    if async_engine is None:
        raise RuntimeError("No async engine found in app.db.session (expected 'async_engine' or 'engine').")
    try:
        from sqlalchemy.ext.asyncio import async_sessionmaker  # SQLAlchemy 2.x
    except Exception:
        from sqlalchemy.ext.asyncio import AsyncSession
        from sqlalchemy.orm import sessionmaker as async_sessionmaker
        SessionMaker = async_sessionmaker(bind=async_engine, class_=AsyncSession, expire_on_commit=False)  # type: ignore
    else:
        SessionMaker = async_sessionmaker(bind=async_engine, expire_on_commit=False)  # type: ignore

from app.models import Filament

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("seed-filaments")

log.info("Using DATABASE_URL=%s", os.environ.get("DATABASE_URL", "<unset>"))

# Columns present (from smoke test):
# attributes, category, color_hex, color_name, created_at, id, is_active,
# material, name, price_per_kg, type, updated_at

# Your intent: material = polymer family (PLA/PETG/etc); type/category = finish (Matte/Silk/CF/etc)
SEED_FILAMENTS: List[dict] = [
    dict(
        name="Bambu PLA Matte Charcoal",
        # finish
        category="Matte",
        type="Matte",
        # polymer
        material="PLA",
        # cosmetic
        color_name="Matte Charcoal",
        color_hex="#333333",
        # pricing
        price_per_kg=25.99,
        # misc
        attributes=None,
        is_active=True,
    ),
    dict(
        name="Bambu PLA Matte Sakura Pink",
        category="Matte",
        type="Matte",
        material="PLA",
        color_name="Matte Sakura Pink",
        color_hex="#F9CEDF",
        price_per_kg=25.99,
        attributes=None,
        is_active=True,
    ),
]


async def seed_filaments() -> int:
    inserted = 0
    missing: list[str] = []
    async with SessionMaker() as db:  # type: ignore[call-arg]
        # Clear any existing rows with the same names
        names = [f["name"] for f in SEED_FILAMENTS]
        log.info("🧹 Deleting existing rows for %s", ", ".join(names))
        await db.execute(delete(Filament).where(Filament.name.in_(names)))
        await db.commit()

        # Insert each filament
        for payload in SEED_FILAMENTS:
            try:
                obj = Filament(**payload)
                db.add(obj)
                await db.commit()
                inserted += 1
                log.info("✅ Inserted %s", payload["name"])
            except SQLAlchemyError:
                await db.rollback()
                log.exception("⛔ Insert failed for %r", payload["name"])

        # Read back to confirm
        result = await db.execute(select(Filament).where(Filament.name.in_(names)))
        got = {row.name for row in result.scalars().all()}
        missing = [n for n in names if n not in got]
        if missing:
            log.error("❌ Missing after insert: %s", ", ".join(missing))
        else:
            log.info("✅ Verified all seed rows present")

    return 0 if not missing else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(seed_filaments()))

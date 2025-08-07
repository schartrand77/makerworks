# alembic/env.py

import os
import sys
import asyncio
import logging
from logging.config import fileConfig

from sqlalchemy import create_engine, pool, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from alembic import context

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Import models and metadata
from app.db.base import Base
from app.models.models import (
    User,
    Estimate,
    Filament,
    FilamentPricing,
    UploadJob,
    ModelUpload,
    AuditLog,
    EstimateSettings,
)

# Alembic Config
config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

logger = logging.getLogger("alembic.env")
logger.setLevel(logging.INFO)
logger.addHandler(logging.StreamHandler())

REQUIRED_TABLES = [
    "users",
    "filaments",
    "estimates",
    "filament_pricing",
    "model_uploads",
    "audit_logs",
    "upload_jobs",
    "estimate_settings",
]

def run_migrations_offline():
    """Run Alembic migrations in offline mode."""
    url = os.getenv("DATABASE_URL", "").replace("+asyncpg", "")
    print("⚙️ [offline] DATABASE_URL:", url)
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    """Run the actual migrations."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def async_post_migration_tasks():
    """Run async tasks after sync migrations."""
    uri = os.getenv("DATABASE_URL")
    if not uri:
        raise RuntimeError("❌ DATABASE_URL not set.")

    print("🔗 Using async DB URI:", uri)
    engine = create_async_engine(uri, echo=False)
    async_session = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    all_found = True

    try:
        async with async_session() as session:
            logger.info("🔍 Verifying required tables after migration...")
            for table in REQUIRED_TABLES:
                result = await session.execute(
                    text(
                        "SELECT EXISTS (SELECT FROM information_schema.tables "
                        "WHERE table_schema = 'public' AND table_name = :table)"
                    ),
                    {"table": table}
                )
                exists = result.scalar()
                if not exists:
                    all_found = False
                    logger.warning(f"⚠️ Missing expected table: {table}")
                else:
                    logger.info(f"✅ Found table: {table}")
    finally:
        await engine.dispose()

    if all_found:
        try:
            from app.utils.admin_seed import ensure_admin_user
            await ensure_admin_user()
            logger.info("👤 Admin user created or already exists.")
        except ModuleNotFoundError:
            logger.warning("⚠️ admin_seed.py not found, skipping admin creation.")
        except Exception as e:
            logger.error(f"❌ Failed to seed admin user: {e}")
    else:
        logger.warning("⏭️ Skipping admin seed: not all tables found.")


def run_migrations_online():
    """Run Alembic migrations using sync engine (psycopg2)."""
    raw_url = os.getenv("DATABASE_URL", "")
    sync_url = raw_url.replace("+asyncpg", "")

    print("🧪 DATABASE_URL (raw):", raw_url)
    print("🧪 DATABASE_URL (sync):", sync_url)

    connectable = create_engine(sync_url, poolclass=pool.NullPool, future=True)

    with connectable.connect() as connection:
        do_run_migrations(connection)

    # 🚨 Ensure async task always runs and awaits
    try:
        asyncio.run(async_post_migration_tasks())
    except RuntimeError as e:
        logger.error(f"❌ Could not complete async tasks: {e}")
    except Exception as e:
        logger.error(f"❌ Unexpected error in post-migration: {e}")


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

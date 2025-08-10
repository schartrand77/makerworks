# alembic/env.py

import os
import sys
import asyncio
import logging
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from alembic import context

# ── Ensure we can import the app package (app/...) ─────────────────────────────
# This file lives at <repo_root>/alembic/env.py, so add <repo_root> to sys.path.
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Import Base metadata for autogenerate
from app.db.base import Base  # noqa: E402

# Alembic Config object; provides access to .ini values
config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

logger = logging.getLogger("alembic.env")

# Target metadata for 'autogenerate'
target_metadata = Base.metadata

# Optional: version table settings (env overrides if you care)
VERSION_TABLE = os.getenv("ALEMBIC_VERSION_TABLE", "alembic_version")
VERSION_TABLE_SCHEMA = os.getenv("ALEMBIC_VERSION_SCHEMA", None)  # e.g., "public" for Postgres


def _sync_url_from_env_or_ini() -> str:
    """
    Alembic needs a **sync** SQLAlchemy URL.
    If DATABASE_URL is async (postgresql+asyncpg://...), convert to psycopg2.
    """
    env_url = os.getenv("DATABASE_URL")
    if env_url:
        url = env_url
    else:
        url = config.get_main_option("sqlalchemy.url")

    if not url:
        raise RuntimeError("No database URL provided to Alembic (set DATABASE_URL or sqlalchemy.url).")

    # Convert +asyncpg → +psycopg2 for Alembic sync engine
    if "+asyncpg" in url:
        url = url.replace("+asyncpg", "+psycopg2")

    # Some folks use plain 'postgresql://' (driverless); that's fine.
    return url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (no DBAPI connection)."""
    url = _sync_url_from_env_or_ini()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        version_table=VERSION_TABLE,
        version_table_schema=VERSION_TABLE_SCHEMA,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode using a sync Engine."""
    # Make sure the ini reflects the resolved URL so engine_from_config uses it.
    sync_url = _sync_url_from_env_or_ini()
    # Push into Alembic's config object (so engine_from_config reads it)
    section = config.get_section(config.config_ini_section) or {}
    section["sqlalchemy.url"] = sync_url

    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        future=True,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            version_table=VERSION_TABLE,
            version_table_schema=VERSION_TABLE_SCHEMA,
        )

        with context.begin_transaction():
            context.run_migrations()

    # Optional: async post-check if your runtime URL is asyncpg
    final_url = os.getenv("DATABASE_URL", sync_url)
    if "asyncpg" in final_url:
        try:
            engine = create_async_engine(final_url, echo=False, future=True)
            async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

            async def _check():
                async with async_session() as sess:
                    res = await sess.execute(text("SELECT version_num FROM {}".format(VERSION_TABLE)))
                    logger.info("Current Alembic revision: %s", res.scalar())
                await engine.dispose()

            asyncio.run(_check())
        except Exception as e:
            logger.warning("Post-migration async check failed: %s", e)
    else:
        logger.info("ℹ️ Skipping async post-migration check (not using asyncpg driver).")


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

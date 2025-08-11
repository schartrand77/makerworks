# alembic/env.py

import os
import sys
import logging
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool, text

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


def _qualified_version_table() -> str:
    """Return the fully-qualified version table name if a schema is specified."""
    if VERSION_TABLE_SCHEMA:
        return f"{VERSION_TABLE_SCHEMA}.{VERSION_TABLE}"
    return VERSION_TABLE


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

        # Post-migration **sync** check (no asyncio.run in a running loop, thanks)
        try:
            vt = _qualified_version_table()
            res = connection.execute(text(f"SELECT version_num FROM {vt}"))
            rev = res.scalar()
            logger.info("Current Alembic revision: %s", rev)
        except Exception as e:
            logger.warning("Post-migration revision check failed: %s", e)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

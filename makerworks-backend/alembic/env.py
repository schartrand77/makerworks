# alembic/env.py

from __future__ import annotations

import os
import sys
import logging
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool, text
from alembic import context

# ── Ensure we can import the app package (app/...) ─────────────────────────────
# This file lives at <repo_root>/alembic/env.py, so add <repo_root> to sys.path.
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Import Base metadata for autogenerate (must aggregate ALL model modules)
from app.db.base import Base  # noqa: E402

# Alembic Config object; provides access to .ini values
config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

logger = logging.getLogger("alembic.env")

# Target metadata for 'autogenerate'
target_metadata = Base.metadata

# Version table settings (defaults work for Postgres/public schema)
VERSION_TABLE = os.getenv("ALEMBIC_VERSION_TABLE", "alembic_version")
VERSION_TABLE_SCHEMA = os.getenv("ALEMBIC_VERSION_SCHEMA", "public")  # keep migrations in public schema


def _coerce_sync_url(url: str | None) -> str:
    """
    Alembic needs a **sync** SQLAlchemy URL/driver.
    Convert any async or psycopg2 URLs to psycopg (v3, sync).
    """
    if not url:
        return ""
    u = url.strip()

    # Convert known async drivers to psycopg (sync)
    u = u.replace("+asyncpg", "+psycopg").replace("+aiopg", "+psycopg")

    # If no driver specified, prefer psycopg (v3) explicitly
    if u.startswith("postgresql://"):
        u = u.replace("postgresql://", "postgresql+psycopg://", 1)

    # Convert psycopg2 to psycopg so we don't require psycopg2
    u = u.replace("+psycopg2", "+psycopg")

    return u


def _sync_url_from_env_or_ini() -> str:
    """
    Resolve DB URL with priority:
    1) DATABASE_URL
    2) SQLALCHEMY_DATABASE_URI
    3) sqlalchemy.url from alembic.ini
    """
    env_url = (
        os.getenv("DATABASE_URL")
        or os.getenv("SQLALCHEMY_DATABASE_URI")
        or config.get_main_option("sqlalchemy.url")
    )
    url = _coerce_sync_url(env_url)
    if not url:
        raise RuntimeError("No database URL provided to Alembic (set DATABASE_URL or sqlalchemy.url).")
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
        include_schemas=True,
        version_table=VERSION_TABLE,
        version_table_schema=VERSION_TABLE_SCHEMA,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode using a sync Engine."""
    # Build a config section Alembic understands, forcing our resolved URL
    section = config.get_section(config.config_ini_section) or {}
    section["sqlalchemy.url"] = _sync_url_from_env_or_ini()

    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",  # ← FIX: dot, not colon
        poolclass=pool.NullPool,
        future=True,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_schemas=True,
            version_table=VERSION_TABLE,
            version_table_schema=VERSION_TABLE_SCHEMA,
        )

        with context.begin_transaction():
            context.run_migrations()

        # Post-migration revision check (sync)
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

# alembic/env.py

from __future__ import annotations

import os
import sys
import logging
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool, text
from alembic import context

# ── Make sure <repo_root> is on sys.path so we can import app.* ────────────────
# This file lives at <repo_root>/alembic/env.py
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Import Base metadata that includes ALL your models
from app.db.base import Base  # noqa: E402

# Alembic config object, provides access to values in alembic.ini
config = context.config
if config.config_file_name:
  fileConfig(config.config_file_name)

logger = logging.getLogger("alembic.env")

# Target metadata for autogenerate
target_metadata = Base.metadata

# Optional: let env override version table placement
VERSION_TABLE = os.getenv("ALEMBIC_VERSION_TABLE", "alembic_version")
VERSION_TABLE_SCHEMA = os.getenv("ALEMBIC_VERSION_SCHEMA", "public")


def _coerce_sync_url(url: str | None) -> str:
  """
  Alembic needs a **sync** driver URL.
  - Convert +asyncpg / +aiopg → +psycopg (v3)
  - Convert +psycopg2 → +psycopg
  - Add +psycopg if driver is omitted
  """
  if not url:
    return ""
  u = url.strip()

  # Convert known async drivers to psycopg (sync)
  u = u.replace("+asyncpg", "+psycopg").replace("+aiopg", "+psycopg")

  # Convert psycopg2 (v2) → psycopg (v3)
  u = u.replace("+psycopg2", "+psycopg")

  # If no explicit driver, prefer psycopg (v3)
  if u.startswith("postgresql://"):
    u = u.replace("postgresql://", "postgresql+psycopg://", 1)

  return u


def _sync_url_from_env_or_ini() -> str:
  """
  Resolve the database URL with priority:
    1) ALEMBIC_URL
    2) DATABASE_URL
    3) SQLALCHEMY_DATABASE_URI
    4) sqlalchemy.url from alembic.ini
  Then coerce to a sync driver.
  """
  env_url = (
    os.getenv("ALEMBIC_URL")
    or os.getenv("DATABASE_URL")
    or os.getenv("SQLALCHEMY_DATABASE_URI")
    or config.get_main_option("sqlalchemy.url")
  )
  url = _coerce_sync_url(env_url)
  if not url:
    raise RuntimeError(
      "No database URL provided to Alembic. "
      "Set ALEMBIC_URL or DATABASE_URL, or define sqlalchemy.url in alembic.ini."
    )
  return url


def _qualified_version_table() -> str:
  """Return the fully qualified version table name if schema is specified."""
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
    prefix="sqlalchemy.",  # correct: dot, not colon
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

    # Log current revision to help with debugging CI/install flows
    try:
      vt = _qualified_version_table()
      rev = connection.execute(text(f"SELECT version_num FROM {vt}")).scalar()
      logger.info("Current Alembic revision: %s", rev)
    except Exception as e:
      logger.warning("Post-migration revision check failed: %s", e)


if context.is_offline_mode():
  run_migrations_offline()
else:
  run_migrations_online()

# alembic/env.py

import os
import sys
import asyncio
import logging
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from alembic import context

# allow imports from your application
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# import your Base metadata
from app.db.base import Base
target_metadata = Base.metadata

# Alembic Config object
config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

logger = logging.getLogger("alembic.env")


def run_migrations_offline():
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url").replace("+asyncpg", "")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    """Run migrations in 'online' mode, then async post-tasks."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()

    # Optional: run an async check of the current revision
    uri = config.get_main_option("sqlalchemy.url") or ""
    # only run this if using asyncpg
    if "asyncpg" in uri:
        try:
            engine = create_async_engine(uri, echo=False)
            async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

            async def _check():
                async with async_session() as sess:
                    res = await sess.execute(text("SELECT version_num FROM alembic_version"))
                    logger.info(f"Current Alembic revision: {res.scalar()}")
                await engine.dispose()

            asyncio.run(_check())
        except Exception as e:
            logger.warning(f"Post-migration async check failed: {e}")
    else:
        logger.info("ℹ️ Skipping async post-migration check (not using asyncpg driver).")


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

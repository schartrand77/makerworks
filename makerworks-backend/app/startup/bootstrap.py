# app/startup/bootstrap.py
from __future__ import annotations

import asyncio
import logging
import os
import time

from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import async_session_maker  # your existing async session factory
from app.startup.admin_seed import ensure_admin_user

log = logging.getLogger(__name__)

async def _wait_for_db(timeout_sec: int = 45) -> None:
  """Poll the DB until it's reachable or timeout."""
  deadline = time.monotonic() + timeout_sec
  last_err = None
  while time.monotonic() < deadline:
    try:
      async with async_session_maker() as session:  # type: AsyncSession
        await session.execute(text("SELECT 1"))
      log.info("[bootstrap] DB is reachable.")
      return
    except Exception as e:
      last_err = e
      await asyncio.sleep(1.0)
  log.warning("[bootstrap] DB not reachable after %ss: %s", timeout_sec, last_err)

async def _run_migrations() -> None:
  """Try Alembic; if unavailable or fails, fall back to create_all()."""
  # 1) Alembic (preferred)
  try:
    from alembic import command
    from alembic.config import Config

    cfg_path = os.getenv("ALEMBIC_INI", "alembic.ini")
    cfg = Config(cfg_path)

    # If your alembic.ini already has sqlalchemy.url, great. If not, we don't override here.
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, lambda: command.upgrade(cfg, "head"))
    log.info("[bootstrap] Alembic upgrade -> head complete.")
    return
  except Exception as e:
    log.warning("[bootstrap] Alembic failed/unavailable, falling back to create_all(): %s", e)

  # 2) Fallback: create tables from models metadata
  try:
    from app.db.base import Base  # your declarative base
    async with async_session_maker() as session:  # type: AsyncSession
      conn = await session.connection()
      await conn.run_sync(Base.metadata.create_all)
    log.info("[bootstrap] Base.metadata.create_all complete.")
  except Exception as e2:
    log.exception("[bootstrap] Fallback create_all() failed: %s", e2)
    # still continue to admin seed; it will no-op if users table doesn't exist

def schedule_bootstrap_on_startup(app: FastAPI) -> None:
  """
  On FastAPI startup:
    1) Wait for DB
    2) Run migrations (or create_all)
    3) Ensure admin user exists (and rotate if ADMIN_FORCE_UPDATE)
  """
  @app.on_event("startup")
  async def _bootstrap():
    try:
      await _wait_for_db()
      await _run_migrations()
      await ensure_admin_user()
      log.info("[bootstrap] Admin ensured.")
    except Exception as e:
      log.exception("[bootstrap] Startup bootstrap failed: %s", e)

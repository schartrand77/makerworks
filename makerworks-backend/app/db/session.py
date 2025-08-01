import os
import sys
import logging
import traceback
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import sessionmaker
from app.config.settings import settings

logger = logging.getLogger(__name__)

# ─── Database URL Resolution ──────────────────────────
try:
    DATABASE_URL = os.getenv("ASYNC_DATABASE_URL", settings.async_database_url)
except AttributeError:
    # Fallback to sync URL converted to async if async_database_url missing
    sync_url = os.getenv("DATABASE_URL", settings.database_url)
    DATABASE_URL = sync_url.replace("postgresql://", "postgresql+asyncpg://")
    sys.stderr.write("⚠️  async_database_url not found in settings, using derived URL.\n")

# ─── Async Engine ─────────────────────────────────────
async_engine = create_async_engine(
    DATABASE_URL,
    echo=settings.env.lower() == "development",
    future=True,
)

# ─── Session Factories ────────────────────────────────
async_session = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

AsyncSessionLocal = sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

logger.info(f"✅ Async SQLAlchemy engine initialized: {DATABASE_URL}")

# ─── FastAPI Dependency ───────────────────────────────
async def get_async_session() -> AsyncSession:
    async with async_session() as session:
        yield session

get_async_db = get_async_session
get_db = get_async_session

# ─── Startup Validation ───────────────────────────────
try:
    if not DATABASE_URL:
        raise RuntimeError("❌ No DATABASE_URL or ASYNC_DATABASE_URL configured!")

    logger.info(f"[Startup] Validated DB URL for engine: {DATABASE_URL}")

except Exception as e:
    # Full traceback dump to stderr to avoid Gunicorn swallowing import errors
    exc_type, exc_value, exc_tb = sys.exc_info()
    formatted_tb = "".join(traceback.format_exception(exc_type, exc_value, exc_tb))
    sys.stderr.write("=== DATABASE STARTUP VALIDATION FAILED ===\n")
    sys.stderr.write(formatted_tb + "\n")
    sys.stderr.flush()
    # Hard exit to fail fast if DB init is broken
    os._exit(1)

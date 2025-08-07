import os
import sys
import logging
import traceback
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import sessionmaker
from app.config.settings import settings

logger = logging.getLogger(__name__)

# ─── Database URL Resolution ──────────────────────────
# Prefer ASYNC_DATABASE_URL if provided, fallback to DATABASE_URL
DATABASE_URL = os.getenv("ASYNC_DATABASE_URL") or os.getenv("DATABASE_URL") or settings.async_database_url

if not DATABASE_URL:
    sys.stderr.write("❌ No DATABASE_URL or ASYNC_DATABASE_URL configured!\n")
    os._exit(1)

# Normalize DSN for psycopg3
if DATABASE_URL.startswith("postgresql+asyncpg://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg://")
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://")

# ─── Async Engine ─────────────────────────────────────
async_engine = create_async_engine(
    DATABASE_URL,
    echo=(settings.env.lower() == "development"),
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

# Aliases for compatibility
get_async_db = get_async_session
get_db = get_async_session

# ─── Startup Validation ───────────────────────────────
try:
    logger.info(f"[Startup] Validated DB URL for engine: {DATABASE_URL}")
except Exception:
    exc_type, exc_value, exc_tb = sys.exc_info()
    formatted_tb = "".join(traceback.format_exception(exc_type, exc_value, exc_tb))
    sys.stderr.write("=== DATABASE STARTUP VALIDATION FAILED ===\n")
    sys.stderr.write(formatted_tb + "\n")
    sys.stderr.flush()
    os._exit(1)

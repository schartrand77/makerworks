# app/db/database.py

import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# ─── Resolve Database URL ───────────────────────────────────────────────────
# Prefer ASYNC_DATABASE_URL for async engine. Fallback to DATABASE_URL,
# automatically upgrading to the async driver for Postgres.
DATABASE_URL = os.getenv("ASYNC_DATABASE_URL") or os.getenv("DATABASE_URL", "")

if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# ✅ Create engine at module load so it's always importable
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    poolclass=NullPool,
    future=True,
)

# ✅ Async session factory
async_session_maker = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# ✅ Base class for models
Base = declarative_base()

# ✅ Dependency for routes
async def get_async_db():
    async with async_session_maker() as session:
        yield session

# Backwards compatibility alias used in tests
get_db = get_async_db

# ✅ Initialize DB, import models here to avoid circular imports
async def init_db():
    from app.models import models  # delayed import to prevent circular reference
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

import sys
import os
from pathlib import Path
from dotenv import load_dotenv

from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool, create_engine
from alembic import context

# ─────────────────────────────────────────────────────────────
# ENV + PATH BOOTSTRAP
# ─────────────────────────────────────────────────────────────

# Load environment from `.env.dev` early (fallback to `.env` if needed)
dotenv_path = Path(__file__).resolve().parents[1] / ".env.dev"
if dotenv_path.exists():
    load_dotenv(dotenv_path)
    print(f"✅ Loaded environment from {dotenv_path}")
else:
    raise RuntimeError("❌ .env.dev not found — Alembic cannot continue")

# Add project root to sys.path so imports like `from app.db.base` work
sys.path.append(str(Path(__file__).resolve().parents[1]))

# ─────────────────────────────────────────────────────────────
# AVOID ASYNC ENGINE IMPORTS
# ─────────────────────────────────────────────────────────────

# DO NOT import `app.db.database` or `app.config.settings` — this would trigger async engine
# Instead: import only metadata and model classes
from app.db.base import Base
import app.models.models  # ensure models are registered

# ─────────────────────────────────────────────────────────────
# DATABASE URL FROM ENV
# ─────────────────────────────────────────────────────────────

config = context.config
fileConfig(config.config_file_name)

raw_url = os.getenv("DATABASE_URL")
if not raw_url:
    raise RuntimeError("❌ DATABASE_URL environment variable is not set")

# Alembic needs a sync driver — downgrade asyncpg to psycopg2
if raw_url.startswith("postgresql+asyncpg://"):
    sqlalchemy_url = raw_url.replace("postgresql+asyncpg://", "postgresql://", 1)
else:
    sqlalchemy_url = raw_url

print(f"✅ Using SYNC DATABASE_URL for Alembic: {sqlalchemy_url}")

# Assign to config so `context.configure()` picks it up
config.set_main_option("sqlalchemy.url", sqlalchemy_url)

target_metadata = Base.metadata

# ─────────────────────────────────────────────────────────────
# OFFLINE MIGRATIONS
# ─────────────────────────────────────────────────────────────

def run_migrations_offline():
    context.configure(
        url=sqlalchemy_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()

# ─────────────────────────────────────────────────────────────
# ONLINE MIGRATIONS
# ─────────────────────────────────────────────────────────────

def run_migrations_online():
    connectable = create_engine(sqlalchemy_url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()

# ─────────────────────────────────────────────────────────────
# DISPATCH
# ─────────────────────────────────────────────────────────────

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

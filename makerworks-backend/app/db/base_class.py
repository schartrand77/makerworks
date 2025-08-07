import os
from sqlalchemy import MetaData
from sqlalchemy.orm import declarative_base

# Prefer ASYNC_DATABASE_URL for consistency with async engine setup
database_url = os.getenv("ASYNC_DATABASE_URL") or os.getenv("DATABASE_URL", "")

# SQLite doesn't support schemas, so only specify one for other databases
if database_url.startswith("sqlite") or not database_url:
    Base = declarative_base()
else:
    Base = declarative_base(metadata=MetaData(schema="public"))

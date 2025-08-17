import os
import sys
import uuid

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

os.environ.setdefault("ENV", "test")
os.environ.setdefault("DOMAIN", "http://testserver")
os.environ.setdefault("BASE_URL", "http://testserver")
os.environ.setdefault("VITE_API_BASE_URL", "http://testserver")
os.environ.setdefault("UPLOAD_DIR", "/tmp")
os.environ.setdefault("MODEL_DIR", "/tmp")
os.environ.setdefault("AVATAR_DIR", "/tmp")
os.environ.setdefault("ASYNC_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "secret")
os.environ.setdefault("STRIPE_SECRET_KEY", "test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.db.base import Base
from app.models.models import User, AuditLog
from app.services.auth_service import log_action


@pytest.fixture()
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_local = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_local() as session:
        yield session


@pytest.fixture()
async def admin_user(db: AsyncSession):
    user = User(email="admin@example.com", username="admin", hashed_password="x", role="admin")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.mark.asyncio
async def test_log_action_inserts_audit_log(db: AsyncSession, admin_user: User):
    audit = await log_action(db, user_id=str(admin_user.id), action="test", details="via helper")
    assert audit.user_id == admin_user.id
    assert audit.action == "test"
    assert audit.details == "via helper"
    assert audit.created_at is not None

    result = await db.execute(select(AuditLog).where(AuditLog.id == audit.id))
    fetched = result.scalars().first()
    assert fetched is not None
    assert fetched.user_id == admin_user.id

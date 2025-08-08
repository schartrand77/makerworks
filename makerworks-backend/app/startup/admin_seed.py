import uuid
import datetime
import logging

from sqlalchemy import select, text
from app.models.models import User  # ✅ fixed import path
from app.utils.security import hash_password
from app.config.settings import settings

logger = logging.getLogger(__name__)

DEFAULT_ADMIN_EMAIL = settings.admin_email or "admin@example.com"
DEFAULT_ADMIN_USERNAME = settings.admin_username or "admin"
DEFAULT_ADMIN_PASSWORD = settings.admin_password or "admin123"


async def ensure_admin_user():
    """
    Ensure at least one admin user exists in the database.
    Creates a default admin if none found, but only after confirming the users table exists.
    """
    # 🔥 import here to avoid circular import
    from app.db.database import async_session_maker

    async with async_session_maker() as session:
        # ✅ Wait for users table to exist
        result = await session.execute(
            text("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')")
        )
        table_ready = result.scalar()
        if not table_ready:
            logger.warning("⏳ Skipping admin creation — 'users' table not yet created.")
            return

        # ✅ Check for existing admin
        result = await session.execute(
            select(User).where(User.email == DEFAULT_ADMIN_EMAIL)
        )
        admin = result.scalar_one_or_none()

        if admin:
            logger.info(f"✅ Admin user already exists: {admin.email}")
            return

        # ✅ Create new admin
        hashed_pw = hash_password(DEFAULT_ADMIN_PASSWORD)

        new_admin = User(
            id=uuid.uuid4(),
            email=DEFAULT_ADMIN_EMAIL,
            username=DEFAULT_ADMIN_USERNAME,
            hashed_password=hashed_pw,
            role="admin",
            is_verified=True,
            is_active=True,
            created_at=datetime.datetime.utcnow(),
            last_login=datetime.datetime.utcnow(),
        )

        session.add(new_admin)
        await session.commit()

        logger.info(
            f"🎉 Created default admin → email: {DEFAULT_ADMIN_EMAIL} password: {DEFAULT_ADMIN_PASSWORD}"
        )
        logger.info(f"⚠️ Please change this password immediately after first login.")

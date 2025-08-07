# app/services/auth_service.py
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from passlib.context import CryptContext

from app.models.models import User, AuditLog  # Assuming AuditLog model exists
from app.schemas.auth import SignupRequest

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


async def authenticate_user(db: AsyncSession, email_or_username: str, password: str) -> Optional[User]:
    stmt = select(User).where((User.email == email_or_username) | (User.username == email_or_username))
    result = await db.execute(stmt)
    user = result.scalars().first()
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


async def create_user(db: AsyncSession, user_in: SignupRequest) -> User:
    hashed_password = get_password_hash(user_in.password)
    user = User(
        email=user_in.email,
        username=user_in.username,
        hashed_password=hashed_password,
        created_at=datetime.utcnow(),
        is_active=True,
        is_verified=False,
    )
    db.add(user)
    await db.flush()  # ensures user.id is populated before returning
    return user


async def log_action(
    db: AsyncSession,
    admin_id: str,
    action: str,
    target_id: Optional[str] = None,
    details: Optional[str] = None
):
    """
    Logs admin actions to the AuditLog table.
    """
    audit = AuditLog(
        admin_id=admin_id,
        action=action,
        target_id=target_id,
        details=details,
        timestamp=datetime.utcnow()
    )
    db.add(audit)
    await db.commit()

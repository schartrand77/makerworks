from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import delete, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.models import User
from app.schemas.users import UserUpdate


async def get_user_by_id(db: AsyncSession, user_id: UUID) -> User | None:
    """
    Get user by UUID primary key.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    """
    Get user by email.
    """
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    """
    Get user by username.
    """
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def create_local_user(db: AsyncSession, user_data: dict) -> User:
    """
    Create a new local user from dict.
    """
    user = User(**user_data)
    db.add(user)
    # Flush to ensure the user is persisted and has a primary key
    # before committing the transaction.  Without an explicit flush,
    # some database backends may defer writes until commit, which can
    # cause follow-up queries in the same session to miss the newly
    # created user.
    await db.flush()
    await db.commit()
    await db.refresh(user)
    return user


async def update_user_profile(
    db: AsyncSession, user_id: UUID, data: UserUpdate
) -> User | None:
    """
    Patch update user profile with fields from UserUpdate.
    """
    stmt = (
        update(User)
        .where(User.id == user_id)
        .values(**data.dict(exclude_unset=True))
    )
    await db.execute(stmt)
    await db.commit()
    return await get_user_by_id(db, user_id)


async def delete_user(db: AsyncSession, user_id: UUID) -> bool:
    """
    Delete user by ID.
    """
    stmt = delete(User).where(User.id == user_id)
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount > 0


async def update_last_login(db: AsyncSession, user_id: UUID) -> None:
    """
    Update user's last_login timestamp.
    """
    await db.execute(
        update(User)
        .where(User.id == user_id)
        .values(last_login=datetime.now(timezone.utc))
    )
    await db.commit()


async def upsert_user(db: AsyncSession, email: str, username: str) -> User:
    """
    Upsert a user in the local DB by email. Creates a user if not exists.
    """
    existing_user = await get_user_by_email(db, email)

    if existing_user:
        existing_user.username = username
        existing_user.is_active = True
        existing_user.is_verified = True
        existing_user.last_login = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(existing_user)
        return existing_user

    # Create new user
    new_user = User(
        id=uuid4(),
        email=email,
        username=username,
        is_active=True,
        is_verified=True,
        created_at=datetime.now(timezone.utc),
        last_login=datetime.now(timezone.utc),
    )
    db.add(new_user)
    await db.flush()
    await db.commit()
    await db.refresh(new_user)
    return new_user

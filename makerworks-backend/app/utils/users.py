from datetime import datetime
from pathlib import Path
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.models import User
from app.config.settings import settings

logger = logging.getLogger(__name__)


async def upsert_user_from_token(db: AsyncSession, token_payload: dict) -> User:
    sub = token_payload["sub"]
    email = token_payload["email"]
    username = token_payload.get("preferred_username") or email.split("@")[0]

    result = await db.execute(select(User).where(User.id == sub))
    user = result.scalar_one_or_none()

    if user:
        user.last_login = datetime.utcnow()
    else:
        user = User(
            id=sub,
            email=email,
            username=username,
            is_verified=True,
            is_active=True,
            role=token_payload.get("role", "user"),
        )
        db.add(user)

    await db.commit()
    await db.refresh(user)
    return user


def create_user_dirs(user_id: str) -> dict[str, bool]:
    """
    Create per-user upload directories:
    /app/uploads/users/{user_id}/avatars
    /app/uploads/users/{user_id}/models

    Returns a dict of {path: success_flag}
    """
    base = Path(settings.uploads_path).resolve() / "users" / user_id
    results: dict[str, bool] = {}

    for sub in ["avatars", "models", "thumbnails"]:
        path = base / sub
        try:
            path.mkdir(parents=True, exist_ok=True)
            logger.info(f"✅ Created directory: {path}")
            results[str(path)] = True
        except Exception as e:
            logger.error(f"❌ Failed to create directory {path}: {e}")
            results[str(path)] = False

    return results

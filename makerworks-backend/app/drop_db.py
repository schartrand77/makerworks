import asyncio
import logging

from app.db.database import engine
from app.models.models import Base

logger = logging.getLogger("makerworks.drop")
logging.basicConfig(level=logging.INFO)


async def drop_all():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    logger.warning("⚠️ All tables dropped successfully.")


if __name__ == "__main__":
    try:
        asyncio.run(drop_all())
    except Exception as e:
        logger.error(f"❌ Failed to drop database: {e}")
        raise

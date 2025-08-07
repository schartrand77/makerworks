import asyncio
import logging

from app.database import engine
from app.models.models import Filament, User

logger = logging.getLogger("makerworks.init_subset")
logging.basicConfig(level=logging.INFO)


async def create_subset():
    async with engine.begin() as conn:
        await conn.run_sync(lambda conn: User.__table__.create(conn, checkfirst=True))
        await conn.run_sync(
            lambda conn: Filament.__table__.create(conn, checkfirst=True)
        )
    logger.info("✅ Selected tables created (User, Filament).")


if __name__ == "__main__":
    try:
        asyncio.run(create_subset())
    except Exception as e:
        logger.error(f"❌ Subset init failed: {e}")
        raise

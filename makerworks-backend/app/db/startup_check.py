import asyncio
import logging
from sqlalchemy import text
from app.db.session import engine

logger = logging.getLogger(__name__)


async def ping_database(timeout: float = 5.0) -> None:
    """
    Pings the database by running SELECT 1.

    Raises:
        Exception if the DB is unreachable or too slow.
    """
    try:
        async with engine.connect() as conn:
            await asyncio.wait_for(conn.execute(text("SELECT 1")), timeout=timeout)
            logger.info("✅ Database ping successful.")
    except Exception as e:
        logger.critical(f"❌ Database ping failed: {e}")
        raise

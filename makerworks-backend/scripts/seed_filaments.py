# scripts/seed_filaments.py

import asyncio
import logging

from app.db.session import async_session_maker
from app.models import Filament

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("seed-filaments")


async def seed_filaments():
    async with async_session_maker() as db:
        # Clear any existing filaments with matching names
        await db.execute(
            Filament.__table__.delete().where(
                Filament.name.in_(
                    ["Bambu PLA Matte Charcoal", "Bambu PLA Matte Sakura Pink"]
                )
            )
        )

        filaments = [
            Filament(
                name="Bambu PLA Matte Charcoal",
                type="PLA",
                subtype="Matte",
                color_name="Matte Charcoal",
                color="#333333",
                price_per_kg=25.99,
                currency="USD",
                texture="Matte",
                is_biodegradable=True,
                is_active=True,
            ),
            Filament(
                name="Bambu PLA Matte Sakura Pink",
                type="PLA",
                subtype="Matte",
                color_name="Matte Sakura Pink",
                color="#F9CEDF",
                price_per_kg=25.99,
                currency="USD",
                texture="Matte",
                is_biodegradable=True,
                is_active=True,
            ),
        ]

        db.add_all(filaments)
        await db.commit()
        logger.info("✅ Seeded filaments successfully.")


if __name__ == "__main__":
    asyncio.run(seed_filaments())

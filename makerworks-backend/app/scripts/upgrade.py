#!/usr/bin/env python3

import logging
import os
import sys

from alembic import command  # type: ignore[attr-defined]
from alembic.config import Config

# ─────────────────────────────────────────────────────────────
# Add project root to sys.path
# ─────────────────────────────────────────────────────────────
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, PROJECT_ROOT)

# ─────────────────────────────────────────────────────────────
# Logging setup
# ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("alembic-upgrade")

# ─────────────────────────────────────────────────────────────
# Alembic config path
# ─────────────────────────────────────────────────────────────
ALEMBIC_INI_PATH = os.path.join(PROJECT_ROOT, "alembic.ini")


def run_upgrade():
    logger.info("🚀 Starting Alembic upgrade")

    if not os.path.isfile(ALEMBIC_INI_PATH):
        logger.error("❌ alembic.ini not found at: %s", ALEMBIC_INI_PATH)
        sys.exit(1)

    alembic_cfg = Config(ALEMBIC_INI_PATH)

    try:
        command.upgrade(alembic_cfg, "head")
        logger.info("✅ Alembic upgrade complete.")
    except Exception:
        logger.exception("❌ Alembic upgrade failed")
        sys.exit(1)


if __name__ == "__main__":
    run_upgrade()

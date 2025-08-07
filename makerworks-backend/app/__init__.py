import logging
import os

# ✅ Avoid duplicate logger initialization when imported by Gunicorn/Uvicorn workers
root_logger = logging.getLogger()
if not root_logger.handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )

logger = logging.getLogger("makerworks")
__version__ = os.getenv("API_VERSION", "0.1.0")

__all__ = ["__version__", "logger"]

# app/logging_config.py

import logging
import sys
import os
import random
import platform
import psutil
from datetime import datetime

def configure_logging(level: str = "INFO"):
    """
    Configures the logging format and levels for the application.
    """
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
        ],
    )
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def startup_banner():
    """
    Prints a styled startup banner with system info and a random boot message.
    """
    boot_messages = [
        "🚀 Systems online. Let's make some prints!",
        "🛠 MakerWorks: Printing dreams since boot time.",
        "🖨 Spinning up the print engines...",
        "🔧 Ready to fabricate the future.",
        "📦 Models loaded. Time to create.",
        "🌐 Backend up — awaiting your genius.",
        "💡 MakerWorks: Creativity engaged.",
        "⚙️ Full power to the printhead!"
    ]

    logger = logging.getLogger("uvicorn")

    # System snapshot
    sys_info = {
        "Python": sys.version.split()[0],
        "Platform": platform.system(),
        "Release": platform.release(),
        "CPU Cores": os.cpu_count(),
        "Memory": f"{round(psutil.virtual_memory().total / (1024 ** 3), 2)} GB",
        "Time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

    banner_line = "=" * 60
    logger.info(banner_line)
    logger.info(f"🎯 MakerWorks Backend Startup — {random.choice(boot_messages)}")
    for k, v in sys_info.items():
        logger.info(f"{k}: {v}")
    logger.info(banner_line)

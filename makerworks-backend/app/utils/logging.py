import logging
import os
import platform
import subprocess
import sys
import time

import psutil
import redis
from prometheus_client import Gauge

# ✅ psycopg3 import instead of psycopg2
import psycopg
from psycopg.errors import OperationalError

from app.utils.boot_messages import random_boot_message

try:
    import colorlog
except ImportError:
    colorlog = None

START_TIME = time.time()

logger = logging.getLogger("makerworks")
logger.setLevel(logging.INFO)

# ────────────── TTY COLORS ──────────────
def is_tty() -> bool:
    return sys.stdout.isatty()

def color(text: str, code: str) -> str:
    if is_tty():
        return f"{code}{text}\033[0m"
    return text

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"

# ────────────── COLORLOG ──────────────
def configure_colorlog():
    """Configure logger with optional color output."""
    if logger.hasHandlers():
        logger.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)

    if colorlog:
        formatter = colorlog.ColoredFormatter(
            "%(log_color)s[%(asctime)s] [%(levelname)s]%(reset)s %(message)s",
            log_colors={
                "DEBUG": "cyan",
                "INFO": "green",
                "WARNING": "yellow",
                "ERROR": "red",
                "CRITICAL": "red,bg_white",
            },
        )
    else:
        formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s")

    handler.setFormatter(formatter)
    logger.addHandler(handler)


# ────────────── PROMETHEUS GAUGES ──────────────
startup_time_gauge = Gauge("makerworks_startup_seconds", "Time taken to start MakerWorks backend")
redis_status_gauge = Gauge("makerworks_redis_up", "Redis availability (1=up, 0=down)")
postgres_status_gauge = Gauge("makerworks_postgres_up", "PostgreSQL availability (1=up, 0=down)")
memory_used_gauge = Gauge("makerworks_memory_used_mb", "Memory used (in MB)")
memory_percent_gauge = Gauge("makerworks_memory_percent", "Percent memory used")
gpu_info = Gauge("makerworks_gpu_info", "GPU detected on system (1 if present, 0 otherwise)")

# ────────────── CHECKERS ──────────────
def check_redis_available(url: str) -> bool:
    try:
        r = redis.Redis.from_url(url, socket_connect_timeout=1)
        return r.ping()
    except Exception:
        return False

def check_postgres_available() -> bool:
    """
    Use psycopg3 to quickly test PostgreSQL connectivity.
    """
    try:
        dsn = os.getenv("DATABASE_URL", "")
        # psycopg3 accepts both postgresql:// and postgresql+psycopg://
        clean_dsn = dsn.replace("postgresql+psycopg://", "postgresql://")
        with psycopg.connect(clean_dsn, connect_timeout=1) as conn:
            return True
    except OperationalError:
        return False
    except Exception:
        return False

def detect_gpu() -> str:
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True, text=True, check=True
        )
        gpus = [line.strip() for line in result.stdout.splitlines() if line.strip()]
        if gpus:
            return ", ".join(gpus)
    except Exception:
        pass

    try:
        import torch
        if torch.cuda.is_available():
            gpus = [torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())]
            if gpus:
                return ", ".join(gpus)
    except ImportError:
        pass

    if platform.system() == "Darwin" and platform.machine().startswith("arm"):
        return "Apple Metal"

    return "None"

# ────────────── BANNER ──────────────
def startup_banner():
    """
    Logs a colorized, minimal, informative system startup banner.
    Includes Prometheus gauges.
    """
    logger.info(color("🚀 MakerWorks Backend Started", GREEN))
    logger.info(
        f"{color('🖥️  Platform:', CYAN)} {platform.system()} {platform.release()} "
        f"| CPU Cores: {os.cpu_count()}"
    )

    mem = psutil.virtual_memory()
    mem_used_mb = mem.used // (1024 ** 2)
    mem_total_mb = mem.total // (1024 ** 2)
    logger.info(
        f"{color('📦 Memory:', CYAN)} {mem_used_mb} MB used / {mem_total_mb} MB "
        f"({mem.percent}%)"
    )
    memory_used_gauge.set(mem_used_mb)
    memory_percent_gauge.set(mem.percent)

    # Redis check
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
    redis_status = check_redis_available(redis_url)
    redis_text = f"{'✅ Connected' if redis_status else '❌ Unavailable'}"
    logger.info(
        f"{color('🧱 Redis:', CYAN)} {color(redis_text, GREEN if redis_status else RED)} "
        f"({redis_url})"
    )
    redis_status_gauge.set(1 if redis_status else 0)

    # PostgreSQL check
    pg_status = check_postgres_available()
    pg_text = f"{'✅ Connected' if pg_status else '❌ Unavailable'}"
    logger.info(
        f"{color('🗃️  PostgreSQL:', CYAN)} {color(pg_text, GREEN if pg_status else RED)}"
    )
    postgres_status_gauge.set(1 if pg_status else 0)

    # GPU
    gpu = detect_gpu()
    if gpu != "None":
        logger.info(f"{color('🎮 GPU:', CYAN)} {color(gpu, GREEN)}")
        gpu_info.set(1)
    else:
        logger.info(f"{color('🎮 GPU:', CYAN)} {color('None detected', YELLOW)}")
        gpu_info.set(0)

    # System load
    try:
        load1, load5, load15 = os.getloadavg()
        logger.info(
            f"{color('📈 Load Average (1/5/15 min):', CYAN)} "
            f"{load1:.2f} / {load5:.2f} / {load15:.2f}"
        )
    except (AttributeError, OSError):
        logger.info(f"{color('📈 Load Average:', CYAN)} Not available")

    # Uptime
    uptime_sec = time.time() - psutil.boot_time()
    uptime_hr = uptime_sec / 3600
    logger.info(f"{color('⏳ System Uptime:', CYAN)} {uptime_hr:.1f} hours")

    # Startup time
    elapsed = time.time() - START_TIME
    logger.info(f"{color('⏱️  Startup Time:', CYAN)} {elapsed:.2f} seconds")
    startup_time_gauge.set(elapsed)

    # Boot message
    msg = random_boot_message()
    logger.info(f"{color('🎬 Boot Message:', CYAN)} {color(msg, YELLOW)}")


# ✅ configure logger immediately
configure_colorlog()

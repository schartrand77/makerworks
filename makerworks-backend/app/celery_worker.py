# app/celery_worker.py — MakerWorks Celery worker (patched with connection retries + REDIS_URL enforcement)

import os
import logging
from celery import Celery
from dotenv import load_dotenv
from kombu import Exchange, Queue

# ─────────────────────────────────────────────
# Load environment variables
# ─────────────────────────────────────────────
load_dotenv()

# ─────────────────────────────────────────────
# Redis broker/backend URL
# ─────────────────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://makerworks_redis:6379/0")

# ✅ Log the URL on startup for verification
print(f"[Celery] Using Redis broker/backend: {REDIS_URL}")

# ─────────────────────────────────────────────
# Celery Application
# ─────────────────────────────────────────────
celery_app = Celery(
    "makerworks",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

celery_app.conf.update(
    task_track_started=True,
    task_time_limit=600,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    result_expires=3600,
    broker_connection_retry_on_startup=True,

    # ✅ Robust retry settings for Redis broker/backend
    broker_transport_options={
        "max_retries": 20,
        "interval_start": 0,
        "interval_step": 1,
        "interval_max": 10,
    },
    result_backend_transport_options={
        "retry_policy": {
            "timeout": 5.0,
            "retries": 20,
            "interval_start": 0,
            "interval_step": 1,
            "interval_max": 10,
        }
    },

    task_default_queue="default",
    task_queues=(
        Queue("default", Exchange("default"), routing_key="default"),
        Queue("thumbnails", Exchange("thumbnails"), routing_key="thumbnails"),
    ),
    worker_send_task_events=True,
    task_send_sent_event=True,
    enable_utc=True,
    timezone="UTC",
    worker_enable_remote_control=True,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
)

# ─────────────────────────────────────────────
# Autodiscover tasks
# ─────────────────────────────────────────────
celery_app.autodiscover_tasks(["app.tasks"])

# ─────────────────────────────────────────────
# Prometheus metrics
# ─────────────────────────────────────────────
try:
    from prometheus_client import start_http_server

    METRICS_PORT = int(os.getenv("PROMETHEUS_METRICS_PORT", 9808))
    start_http_server(METRICS_PORT)
    logging.info(f"📈 Prometheus metrics running on :{METRICS_PORT}")
except ImportError:
    logging.warning("Prometheus client not installed — metrics disabled")

# ─────────────────────────────────────────────
# Logging setup
# ─────────────────────────────────────────────
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logger = logging.getLogger("celery")
logger.setLevel(LOG_LEVEL)

handler = logging.StreamHandler()
formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
handler.setFormatter(formatter)
logger.addHandler(handler)

logging.getLogger("celery.worker").setLevel(LOG_LEVEL)
logging.getLogger("celery.app.trace").setLevel(LOG_LEVEL)

# ─────────────────────────────────────────────
# Patch: Ensure thumbnail tasks always resolve file path
# ─────────────────────────────────────────────
@celery_app.task(name="tasks.render_thumbnail", queue="thumbnails")
def render_thumbnail_task(model_id_or_path: str):
    """
    Celery wrapper that accepts either a full file path or a model UUID,
    resolves to absolute file path if needed, then calls render_thumbnail().
    """
    import pathlib
    from app.db.session import get_sync_session
    from app.models.models import Model
    from app.utils.render_thumbnail import render_thumbnail

    candidate = pathlib.Path(model_id_or_path)
    if candidate.exists():
        return render_thumbnail(str(candidate))

    with get_sync_session() as db:
        model = db.query(Model).filter(Model.id == model_id_or_path).first()
        if not model or not model.file_path:
            logger.error(f"[Celery] Thumbnail task: model {model_id_or_path} not found or missing file_path")
            return None
        return render_thumbnail(model.file_path)


if __name__ == "__main__":
    logger.info("🚀 Starting Celery worker with broker: %s", REDIS_URL)
    celery_app.start()

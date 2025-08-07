import os
import logging
from celery import Celery

logger = logging.getLogger(__name__)

# ✅ Detect Redis host with Docker-friendly default
REDIS_HOST = os.getenv("REDIS_HOST", "makerworks_redis")
REDIS_PORT = os.getenv("REDIS_PORT", "6379")
REDIS_DB_BROKER = os.getenv("REDIS_DB_BROKER", "0")
REDIS_DB_BACKEND = os.getenv("REDIS_DB_BACKEND", "1")

# ✅ Allow overriding full URL if REDIS_URL is set
REDIS_URL = os.getenv("REDIS_URL")
if REDIS_URL:
    broker_url = REDIS_URL
    result_backend = REDIS_URL
else:
    broker_url = f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB_BROKER}"
    result_backend = f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB_BACKEND}"

logger.info(f"[Celery] Using Redis broker at {broker_url}")

celery_app = Celery(
    "makerworks",
    broker=broker_url,
    backend=result_backend,
)

celery_app.conf.update(
    task_routes={
        "generate_model_previews": {"queue": "previews"},
    },
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
    broker_heartbeat=10,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

# ✅ Optional: autodiscover tasks
celery_app.autodiscover_tasks(["app.tasks"])

from __future__ import annotations
import os
from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "makerworks",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

# Keep it simple; we can tune later
celery_app.conf.update(
    task_default_queue="default",
    task_routes={
        "app.worker.tasks.*": {"queue": "default"},
    },
)

# Allow `celery -A app.worker.celery_app worker ...`
__all__ = ["celery_app"]

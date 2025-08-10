from __future__ import annotations
import logging
from pathlib import Path
from typing import Optional

from . import celery_app

log = logging.getLogger(__name__)

@celery_app.task(name="app.worker.tasks.generate_model_previews")
def generate_model_previews(
    model_path: str,
    model_id: str,
    user_id: str,
    turntable_abs_path: Optional[str] = None,
):
    """
    Stub preview task. It logs and sanity-checks the model file.
    Wire in real thumbnail/turntable generation here later if you want it async.
    """
    log.info(
        "🧵 generate_model_previews: model_id=%s user_id=%s path=%s turntable=%s",
        model_id, user_id, model_path, turntable_abs_path
    )

    p = Path(model_path)
    if not p.exists():
        msg = f"model not found at {model_path}"
        log.warning(msg)
        return {"status": "error", "reason": msg}

    # TODO: call your heavy renderers here if desired
    return {"status": "ok"}

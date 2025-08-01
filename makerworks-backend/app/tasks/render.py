import logging

from app.worker import celery_app

logger = logging.getLogger(__name__)


@celery_app.task
def generate_gcode(model_id: int, estimate_id: int):
    logger.info(
        "[TASK] Generating G-code for model %s, estimate %s", model_id, estimate_id
    )
    # TODO: Actual G-code rendering logic
    return True

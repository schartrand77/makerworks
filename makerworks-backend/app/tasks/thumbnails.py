import logging
from celery import shared_task
from pathlib import Path

from app.utils.render_thumbnail import render_thumbnail
from app.utils.render_turntable import render_turntable

logger = logging.getLogger(__name__)

@shared_task(bind=True, name="generate_model_previews")
def generate_model_previews(self, model_path: str, thumbnail_path: str, turntable_path: str):
    """
    Celery task to render both a PNG thumbnail and a WEBM turntable preview
    for STL/3MF/OBJ models.

    Args:
        model_path (str): Path to the uploaded model file.
        thumbnail_path (str): Path to save the generated PNG thumbnail.
        turntable_path (str): Path to save the generated WEBM turntable.

    Returns:
        dict: Status and paths for both thumbnail and turntable.
    """
    try:
        model_file = Path(model_path)
        thumb_file = Path(thumbnail_path)
        turn_file = Path(turntable_path)

        if not model_file.exists():
            logger.error("❌ Model file not found: %s", model_path)
            return {"status": "error", "error": "model_not_found"}

        # Ensure output directories exist
        thumb_file.parent.mkdir(parents=True, exist_ok=True)
        turn_file.parent.mkdir(parents=True, exist_ok=True)

        logger.info("🎨 Rendering thumbnail for %s", model_file)
        thumb_status = render_thumbnail(model_file, thumb_file)

        logger.info("🎥 Rendering turntable for %s", model_file)
        turn_status = render_turntable(model_file, turn_file)

        result = {
            "status": "done",
            "thumbnail": str(thumb_file) if thumb_status else None,
            "turntable": turn_status.get("turntable") if isinstance(turn_status, dict) else None
        }

        if not thumb_status:
            logger.warning("⚠️ Thumbnail generation failed for %s", model_file)
            result["status"] = "partial"

        if not turn_status or turn_status.get("status") != "done":
            logger.warning("⚠️ Turntable generation failed for %s", model_file)
            result["status"] = "partial"

        logger.info("✅ Model previews complete for %s", model_file)
        return result

    except Exception as e:
        logger.exception("❌ Exception generating previews")
        return {"status": "error", "error": str(e)}

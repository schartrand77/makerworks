# app/utils/filesystem.py

from pathlib import Path
import logging
from app.config.settings import settings
from app.utils.render_thumbnail import render_thumbnail

UPLOADS_ROOT: Path = settings.uploads_path
logger = logging.getLogger("makerworks.filesystem")


def ensure_user_model_thumbnails_for_user(user_id: str) -> None:
    """
    Ensures all STL/3MF/OBJ models in a user's models folder have thumbnails.
    Uses the unified render_thumbnail() which always writes to the global thumbnails folder.
    """
    models_dir = UPLOADS_ROOT / "users" / str(user_id) / "models"
    if not models_dir.exists():
        logger.debug(f"[Thumbnail] No models directory for user {user_id}")
        return

    for model_file in models_dir.iterdir():
        if model_file.suffix.lower() not in {".stl", ".3mf", ".obj"}:
            continue

        model_id = model_file.stem
        try:
            logger.info(f"[Thumbnail] Generating thumbnail for {model_file.name}")
            thumb_path = render_thumbnail(model_file, model_id)
            logger.debug(f"[Thumbnail] ✅ Generated thumbnail: {thumb_path}")
        except Exception as e:
            # ✅ Avoid reentrant logging by not using logger.exception
            logger.error(f"[Thumbnail] ❌ Failed for {model_file.name}: {e}")

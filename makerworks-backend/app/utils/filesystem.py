# app/utils/filesystem.py

from pathlib import Path
import logging
import os
from app.config.settings import settings
from app.utils.render_thumbnail import render_thumbnail

UPLOADS_ROOT: Path = settings.uploads_path
logger = logging.getLogger("makerworks.filesystem")


def create_user_folders(user_id) -> dict[str, bool]:
    """Ensure avatar and model folders exist for a user.

    Parameters
    ----------
    user_id: UUID or str
        Identifier for the user.  Converted to string when building paths.

    Returns
    -------
    dict
        Mapping of folder paths to booleans indicating whether each directory
        exists after the operation.
    """

    root = Path(os.getenv("UPLOADS_PATH", UPLOADS_ROOT))
    base = root / str(user_id)
    avatars = base / "avatars"
    models = base / "models"
    avatars.mkdir(parents=True, exist_ok=True)
    models.mkdir(parents=True, exist_ok=True)
    return {str(avatars): avatars.exists(), str(models): models.exists()}


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

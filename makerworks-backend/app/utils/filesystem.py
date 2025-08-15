# app/utils/filesystem.py

from pathlib import Path
import logging
import os
from app.config.settings import settings

UPLOADS_ROOT: Path = settings.uploads_path
logger = logging.getLogger("makerworks.filesystem")


def create_user_folders(user_id) -> dict[str, bool]:
    """Ensure avatar and model folders exist for a user.

    Parameters
    ----------
    user_id: UUID or str
        Identifier for the user. Converted to string when building paths.

    Returns
    -------
    dict
        Mapping of folder paths to booleans indicating whether each directory
        exists after the operation.
    """
    root = Path(os.getenv("UPLOADS_PATH", str(UPLOADS_ROOT)))
    base = root / str(user_id)
    avatars = base / "avatars"
    models = base / "models"
    avatars.mkdir(parents=True, exist_ok=True)
    models.mkdir(parents=True, exist_ok=True)
    return {str(avatars): avatars.exists(), str(models): models.exists()}


def ensure_user_model_thumbnails_for_user(user_id: str) -> None:
    """
    Ensure each STL/3MF/OBJ model for ``user_id`` has a rendered thumbnail.

    Thumbnails are written to ``uploads/users/{user_id}/thumbnails`` using the
    pattern ``{model_id}_thumb.png`` so they can be served via ``/uploads`` and
    discovered by the browse endpoint.
    """
    # Lazy import so the API can boot even if the renderer (and its heavy deps)
    # are unavailable at import time.
    try:
        from app.utils.render_thumbnail import render_thumbnail  # type: ignore
    except Exception as e:  # ImportError or anything raised by that module
        logger.error(f"[Thumbnail] Renderer unavailable; skipping generation: {e}")
        return

    root = Path(os.getenv("UPLOADS_PATH", str(UPLOADS_ROOT)))
    models_dir = root / "users" / str(user_id) / "models"
    if not models_dir.exists():
        logger.debug(f"[Thumbnail] No models directory for user {user_id}")
        return

    thumbs_dir = root / "users" / str(user_id) / "thumbnails"
    thumbs_dir.mkdir(parents=True, exist_ok=True)

    allowed_exts = {".stl", ".3mf", ".obj"}

    for model_file in models_dir.iterdir():
        if not model_file.is_file():
            continue
        if model_file.suffix.lower() not in allowed_exts:
            continue

        model_id = model_file.stem
        thumb_abs = thumbs_dir / f"{model_id}_thumb.png"
        if thumb_abs.exists():
            continue

        try:
            logger.info(f"[Thumbnail] Generating thumbnail for {model_file.name}")
            # Use strings to avoid any surprises in downstream libs
            render_thumbnail(str(model_file), str(thumb_abs))
            logger.debug(f"[Thumbnail] ✅ Generated thumbnail: {thumb_abs}")
        except Exception as e:
            # Avoid re-entrant logging noise
            logger.error(f"[Thumbnail] ❌ Failed for {model_file.name}: {e}")

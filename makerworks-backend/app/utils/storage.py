# app/utils/storage.py

import os
from pathlib import Path
from uuid import uuid4
from fastapi import UploadFile

from app.config.settings import settings

# ✅ Base uploads directory for all user content
BASE_UPLOAD_DIR = Path(settings.uploads_path)


def is_valid_model_file(filename: str) -> bool:
    """
    Check if the file is a valid 3D model based on extension.
    """
    return filename.lower().endswith((".stl", ".3mf"))


async def save_upload_to_disk(file: UploadFile, dest_path: str) -> None:
    """
    Save an uploaded file to disk at the specified destination.
    Creates directories as needed.
    """
    dest = Path(dest_path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as f:
        content = await file.read()
        f.write(content)


def generate_unique_filename(original_name: str) -> str:
    """
    Generate a unique filename preserving extension.
    """
    ext = os.path.splitext(original_name)[-1]
    return f"{uuid4().hex}{ext}"


def get_storage_paths(user_id: str, filename: str) -> tuple[str, str]:
    """
    Compute temp and final storage paths for a user's model upload.
    Returns (tmp_path, final_path).

    /app/uploads/users/{user_id}/tmp/{filename}
    /app/uploads/users/{user_id}/models/{filename}
    """
    user_dir = BASE_UPLOAD_DIR / "users" / str(user_id)
    tmp_path = user_dir / "tmp" / filename
    final_path = user_dir / "models" / filename

    tmp_path.parent.mkdir(parents=True, exist_ok=True)
    final_path.parent.mkdir(parents=True, exist_ok=True)

    return str(tmp_path), str(final_path)


def move_file(src: str, dest: str) -> None:
    """
    Move a file from src to dest, overwriting if needed.
    """
    os.replace(src, dest)

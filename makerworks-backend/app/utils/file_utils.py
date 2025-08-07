# app/utils/file_utils.py
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Tuple

from fastapi import UploadFile

from app.config.settings import settings

# ✅ Allowed 3D model file types
ALLOWED_EXTENSIONS = {".stl", ".3mf"}
MAX_UPLOAD_SIZE_MB = 100

# ✅ Base uploads directory from settings
BASE_UPLOAD_DIR = Path(settings.uploads_path)


def get_file_extension(filename: str) -> str:
    """
    Return the lowercase file extension, including dot.
    """
    return Path(filename).suffix.lower()


def is_valid_model_file(filename: str) -> bool:
    """
    Check if the file has an allowed 3D model extension.
    """
    return get_file_extension(filename) in ALLOWED_EXTENSIONS


def generate_unique_filename(original_filename: str) -> str:
    """
    Generate a unique filename with timestamp + uuid.
    """
    ext = get_file_extension(original_filename)
    uid = uuid.uuid4().hex
    timestamp = datetime.utcnow().strftime('%Y%m%dT%H%M%S')
    return f"{timestamp}_{uid}{ext}"


def get_user_model_dir(user_id: str) -> Path:
    """
    Get the per-user models directory: /app/uploads/users/{user_id}/models
    Creates the directory if it does not exist.
    """
    safe_user_id = str(user_id).strip()
    path = BASE_UPLOAD_DIR / "users" / safe_user_id / "models"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_storage_paths(user_id: str, filename: str) -> Tuple[str, str]:
    """
    Compute temp and final storage paths for a user's file.
    Returns: (temp_path, final_path)
    """
    user_dir = BASE_UPLOAD_DIR / "users" / str(user_id)
    tmp_path = user_dir / "tmp" / filename
    final_path = user_dir / "models" / filename
    tmp_path.parent.mkdir(parents=True, exist_ok=True)
    final_path.parent.mkdir(parents=True, exist_ok=True)
    return str(tmp_path), str(final_path)


async def save_upload_to_disk(upload_file: UploadFile, destination_path: str) -> None:
    """
    Save an UploadFile to disk at destination_path.
    """
    dest = Path(destination_path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as f:
        while chunk := await upload_file.read(1024 * 1024):
            f.write(chunk)


def move_file(src: str, dest: str) -> None:
    """
    Move a file from src to dest, creating dest directories if needed.
    """
    src_path = Path(src)
    dest_path = Path(dest)
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src_path), str(dest_path))


def get_file_size_mb(path: str) -> float:
    """
    Return the file size in MB.
    """
    return Path(path).stat().st_size / (1024 * 1024)


def validate_file_size(path: str) -> None:
    """
    Raise ValueError if file exceeds MAX_UPLOAD_SIZE_MB.
    """
    size_mb = get_file_size_mb(path)
    if size_mb > MAX_UPLOAD_SIZE_MB:
        raise ValueError(
            f"File exceeds {MAX_UPLOAD_SIZE_MB} MB limit (got {size_mb:.2f} MB)"
        )

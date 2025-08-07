# app/utils/validation.py

import os

MAX_FILE_SIZE_MB = 100  # Adjust as needed


def validate_file_size(file_path: str) -> None:
    size_mb = os.path.getsize(file_path) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise ValueError(f"File exceeds max size of {MAX_FILE_SIZE_MB}MB")

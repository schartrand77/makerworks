import os
from pathlib import Path
from fastapi import UploadFile

async def save_avatar(user_id: str, avatar_file: UploadFile, base_path: str) -> str:
    """
    Save uploaded avatar to disk and return relative URL path.
    """
    user_dir = Path(base_path) / "users" / user_id / "avatars"
    user_dir.mkdir(parents=True, exist_ok=True)

    avatar_path = user_dir / "avatar.png"
    with open(avatar_path, "wb") as buffer:
        buffer.write(await avatar_file.read())

    # Return URL path (served via /uploads)
    return f"/uploads/users/{user_id}/avatars/avatar.png"

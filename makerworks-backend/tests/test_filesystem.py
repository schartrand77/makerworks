import os
import importlib
import uuid
from pathlib import Path

import pytest


def test_create_user_folders(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOADS_PATH", str(tmp_path))
    filesystem = importlib.reload(importlib.import_module("app.utils.filesystem"))

    user_id = uuid.uuid4()
    result = filesystem.create_user_folders(user_id)

    user_dir = Path(tmp_path) / str(user_id)
    avatars = user_dir / "avatars"
    models = user_dir / "models"

    assert avatars.exists()
    assert models.exists()
    assert result[str(avatars)]
    assert result[str(models)]

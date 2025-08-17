import os
import sys
import uuid
from pathlib import Path

import pytest

# Ensure the backend package is importable
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

os.environ.setdefault("DATABASE_URL", "sqlite:///test.db")
os.environ.setdefault("ASYNC_DATABASE_URL", "sqlite+aiosqlite:///test.db")

import importlib
import app.models.models as models_module


def _import_filesystem(monkeypatch, uploads_path: Path):
    """Helper to import filesystem with required env variables."""
    monkeypatch.setenv("UPLOADS_PATH", str(uploads_path))
    monkeypatch.setenv("DATABASE_URL", "sqlite:///test.db")
    monkeypatch.setenv("ASYNC_DATABASE_URL", "sqlite+aiosqlite:///test.db")
    sys.modules.pop("app.config.settings", None)
    sys.modules.pop("app.utils.filesystem", None)
    settings_module = importlib.import_module("app.config.settings")
    importlib.reload(settings_module)
    return importlib.reload(importlib.import_module("app.utils.filesystem"))


@pytest.fixture(autouse=True)
def _set_uploads_root(tmp_path):
    models_module.uploads_root = tmp_path


def test_create_user_folders(tmp_path, monkeypatch):
    filesystem = _import_filesystem(monkeypatch, tmp_path)

    user_id = uuid.uuid4()
    result = filesystem.create_user_folders(user_id)

    user_dir = Path(tmp_path) / str(user_id)
    avatars = user_dir / "avatars"
    models = user_dir / "models"

    assert avatars.exists()
    assert models.exists()
    assert result[str(avatars)]
    assert result[str(models)]


def test_ensure_user_model_thumbnails_for_user(tmp_path, monkeypatch):
    """Thumbnails should be generated in the user's thumbnails folder."""
    filesystem = _import_filesystem(monkeypatch, tmp_path)

    user_id = "user1"
    models_dir = Path(tmp_path) / "users" / user_id / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    model_file = models_dir / "cube.stl"
    model_file.write_text("solid cube\nendsolid cube")

    # Patch render_thumbnail importer to avoid heavy dependencies and create a dummy file
    def fake_render(model_path, output_path, size=(1024, 1024)):
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        Path(output_path).write_bytes(b"png")
        return str(output_path)

    import types
    monkeypatch.setitem(sys.modules, "app.utils.render_thumbnail", types.SimpleNamespace(render_thumbnail=fake_render))

    filesystem.ensure_user_model_thumbnails_for_user(user_id)

    thumb = Path(tmp_path) / "users" / user_id / "thumbnails" / "cube_thumb.png"
    assert thumb.exists(), "Thumbnail was not generated in expected location"


def test_normalize_rejects_parent_paths():
    with pytest.raises(ValueError):
        target = models_module.ModelUpload(file_path="../evil.stl")
        models_module.normalize_modelupload_paths(None, None, target)


def test_normalize_rejects_outside_paths():
    outside = models_module.uploads_root.parent / "evil.stl"
    with pytest.raises(ValueError):
        target = models_module.ModelUpload(file_path=str(outside))
        models_module.normalize_modelupload_paths(None, None, target)

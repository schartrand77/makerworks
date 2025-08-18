import os
import sys
from pathlib import Path
import types

import pytest
from sqlalchemy.orm import declarative_base

# Ensure backend package importable and settings loaded
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# Stub minimal settings and Base to avoid heavy dependencies during import
settings_stub = types.SimpleNamespace(UPLOAD_DIR="/uploads", uploads_path="/uploads")

core_config = types.ModuleType("app.core.config")
core_config.settings = settings_stub
sys.modules["app.core.config"] = core_config

legacy_config = types.ModuleType("app.config.settings")
legacy_config.settings = settings_stub
sys.modules["app.config.settings"] = legacy_config

base_module = types.ModuleType("app.db.base")
base_module.Base = declarative_base()
sys.modules["app.db.base"] = base_module

base_class_module = types.ModuleType("app.db.base_class")
base_class_module.Base = base_module.Base
sys.modules["app.db.base_class"] = base_class_module

models_pkg = types.ModuleType("app.models")
models_pkg.__path__ = [str(Path(__file__).resolve().parent.parent / "app" / "models")]
sys.modules["app.models"] = models_pkg

import app.models.models as models_module


@pytest.fixture(autouse=True)
def _set_uploads_root(tmp_path):
    models_module.uploads_root = tmp_path


def test_relative_paths_become_root_relative(tmp_path):
    rel = "unicod\u00e9/\u6a21\u578b @#$%.stl"
    target = models_module.ModelUpload(file_path=rel)
    models_module.normalize_modelupload_paths(None, None, target)
    assert target.file_path == Path(rel).as_posix()
    assert not Path(target.file_path).is_absolute()
    assert (tmp_path / target.file_path) == (tmp_path / rel)


def test_absolute_paths_within_root_normalize(tmp_path):
    rel = "unicod\u00e9/\u6a21\u578b @#$%.stl"
    abs_path = tmp_path / rel
    target = models_module.ModelUpload(file_path=str(abs_path))
    models_module.normalize_modelupload_paths(None, None, target)
    assert target.file_path == Path(rel).as_posix()
    assert not Path(target.file_path).is_absolute()


def test_escape_root_raises_error(tmp_path):
    rel = "unicod\u00e9/\u6a21\u578b @#$%.stl"
    outside = tmp_path.parent / rel
    with pytest.raises(ValueError):
        target = models_module.ModelUpload(file_path=str(outside))
        models_module.normalize_modelupload_paths(None, None, target)

    escape_rel = f"../{rel}"
    with pytest.raises(ValueError):
        target = models_module.ModelUpload(file_path=escape_rel)
        models_module.normalize_modelupload_paths(None, None, target)

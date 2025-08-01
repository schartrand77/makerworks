import os
import sys
import importlib
from pathlib import Path

import pytest

sys.path.append(os.path.dirname(os.path.dirname(__file__)))
os.environ.setdefault("ENV", "test")
os.environ.setdefault("DOMAIN", "http://testserver")
os.environ.setdefault("BASE_URL", "http://testserver")
os.environ.setdefault("VITE_API_BASE_URL", "http://testserver")
os.environ.setdefault("ASYNC_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "secret")


def test_generate_gcode_creates_file(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOADS_PATH", str(tmp_path))
    # Import after setting env so settings uses tmp path
    task_module = importlib.import_module("app.tasks.render")
    importlib.reload(task_module)
    output = task_module.generate_gcode(model_id=1, estimate_id=2)
    expected = Path(tmp_path) / "gcode" / "1_2.gcode"
    assert output == str(expected)
    assert expected.exists()
    # Check file contains some G-code commands
    content = expected.read_text()
    assert "G90" in content

import importlib.util
import os
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# set minimal env vars
os.environ.setdefault("ENV", "test")
os.environ.setdefault("DOMAIN", "http://testserver")
os.environ.setdefault("BASE_URL", "http://testserver")
os.environ.setdefault("VITE_API_BASE_URL", "http://testserver")

spec = importlib.util.spec_from_file_location(
    "app.routes.system",
    Path(__file__).resolve().parents[1] / "app" / "routes" / "system.py",
)
system = importlib.util.module_from_spec(spec)
spec.loader.exec_module(system)


def create_test_app():
    app = FastAPI()
    app.include_router(system.router, prefix="/api/v1/system", tags=["system"])
    return app


@pytest.fixture()
def client():
    app = create_test_app()
    with TestClient(app) as c:
        yield c


def test_system_snapshot_route(client):
    response = client.get("/api/v1/system/snapshot")
    assert response.status_code == 200
    data = response.json()
    assert "platform" in data
    assert "cpu_cores" in data

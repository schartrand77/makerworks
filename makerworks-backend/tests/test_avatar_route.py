import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

os.environ.setdefault("ENV", "test")
os.environ.setdefault("DOMAIN", "http://testserver")
os.environ.setdefault("BASE_URL", "http://testserver")
os.environ.setdefault("VITE_API_BASE_URL", "http://testserver")
os.environ.setdefault("UPLOAD_DIR", "/tmp")
os.environ.setdefault("MODEL_DIR", "/tmp")
os.environ.setdefault("AVATAR_DIR", "/tmp")
os.environ.setdefault("ASYNC_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "secret")

import importlib.util
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.db.database import get_db
from app.models.models import User

spec = importlib.util.spec_from_file_location(
    "app.routes.avatar",
    Path(__file__).resolve().parents[1] / "app" / "routes" / "avatar.py",
)
avatar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(avatar)


def create_test_app():
    engine = create_engine(
        "sqlite:///./test_avatar.db",
        echo=False,
        connect_args={"check_same_thread": False},
    )
    session_local = sessionmaker(bind=engine, class_=Session)

    def override_get_db():
        db = session_local()
        try:
            yield db
        finally:
            db.close()

    def init_models():
        Base.metadata.create_all(engine)

    app = FastAPI()
    app.dependency_overrides[get_db] = override_get_db
    app.include_router(avatar.router, prefix="/api/v1/users", tags=["users"])

    init_models()
    app.state._sessionmaker = session_local
    return app


def add_test_user(app, user_id):
    session_local = app.state._sessionmaker

    with session_local() as session:
        uid_str = str(user_id).replace("-", "")
        user = User(
            id=user_id,
            email=f"{uid_str}@example.com",
            username=uid_str,
            hashed_password="password123",
        )
        session.add(user)
        session.commit()


@pytest.fixture()
def client():
    app = create_test_app()
    with TestClient(app) as c:
        yield c


def test_avatar_route_registered(client):
    paths = [route.path for route in client.app.routes]
    assert "/api/v1/users/avatar" in paths


def test_upload_avatar_success(client):
    user_id = uuid4()
    add_test_user(client.app, user_id)

    def override_token():
        class Tok:
            def __init__(self, sub):
                self.sub = sub

        return Tok(user_id)

    client.app.dependency_overrides[avatar.get_user_from_headers] = override_token

    image = Image.new("RGB", (50, 50), color="red")
    buf = BytesIO()
    image.save(buf, format="PNG")
    buf.seek(0)

    resp = client.post(
        "/api/v1/users/avatar",
        files={"file": ("avatar.png", buf, "image/png")},
        headers={"Authorization": "Bearer test"},
    )

    client.app.dependency_overrides.pop(avatar.get_user_from_headers, None)

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    prefix = f"http://testserver/uploads/users/{user_id}/avatars/"
    assert data["avatar_url"].startswith(prefix)
    assert data["thumbnail_url"].startswith(prefix)
    assert data["uploaded_at"]


def test_upload_avatar_invalid_type(client):
    def override_token():
        class Tok:
            def __init__(self, sub):
                self.sub = sub

        return Tok(uuid4())

    client.app.dependency_overrides[avatar.get_user_from_headers] = override_token

    resp = client.post(
        "/api/v1/users/avatar",
        files={"file": ("avatar.txt", b"bad", "text/plain")},
        headers={"Authorization": "Bearer test"},
    )

    client.app.dependency_overrides.pop(avatar.get_user_from_headers, None)

    assert resp.status_code == 400
    assert resp.json()["detail"].startswith("Unsupported image type")


def test_upload_avatar_too_large(client):
    user_id = uuid4()
    add_test_user(client.app, user_id)

    def override_token():
        class Tok:
            def __init__(self, sub):
                self.sub = sub

        return Tok(user_id)

    client.app.dependency_overrides[avatar.get_user_from_headers] = override_token

    big_content = b"x" * (6 * 1024 * 1024)

    resp = client.post(
        "/api/v1/users/avatar",
        files={"file": ("big.jpg", big_content, "image/jpeg")},
        headers={"Authorization": "Bearer test"},
    )

    client.app.dependency_overrides.pop(avatar.get_user_from_headers, None)

    assert resp.status_code == 400
    assert resp.json()["detail"].startswith("Avatar file too large")


def test_upload_avatar_user_not_found(client):
    fake_id = uuid4()

    def override_token():
        class Tok:
            def __init__(self, sub):
                self.sub = sub

        return Tok(fake_id)

    client.app.dependency_overrides[avatar.get_user_from_headers] = override_token

    image = Image.new("RGB", (20, 20), color="blue")
    buf = BytesIO()
    image.save(buf, format="PNG")
    buf.seek(0)

    resp = client.post(
        "/api/v1/users/avatar",
        files={"file": ("avatar.png", buf, "image/png")},
        headers={"Authorization": "Bearer test"},
    )

    client.app.dependency_overrides.pop(avatar.get_user_from_headers, None)

    assert resp.status_code == 404
    assert resp.json()["detail"] == "User not found"

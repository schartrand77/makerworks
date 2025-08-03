import os
import importlib.util
from io import BytesIO
from pathlib import Path
from uuid import uuid4
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

os.environ.setdefault("ENV", "test")
os.environ.setdefault("DOMAIN", "http://testserver")
os.environ.setdefault("BASE_URL", "http://testserver")
os.environ.setdefault("VITE_API_BASE_URL", "http://testserver")
os.environ.setdefault("UPLOADS_PATH", "uploads_test")
os.environ.setdefault("ASYNC_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "secret")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker


from app.db.base import Base
from app.db.session import get_db
from app.models.models import User

spec = importlib.util.spec_from_file_location(
    "app.routes.upload",
    Path(__file__).resolve().parents[1] / "app" / "routes" / "upload.py",
)
upload = importlib.util.module_from_spec(spec)
spec.loader.exec_module(upload)


def create_test_app(base_path: Path):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    session_local = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with session_local() as session:
            yield session

    async def init_models():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    app = FastAPI()
    app.dependency_overrides[get_db] = override_get_db
    app.include_router(upload.router, prefix="/api/v1/upload", tags=["upload"])

    import asyncio
    asyncio.get_event_loop().run_until_complete(init_models())
    app.state._sessionmaker = session_local
    return app


def add_test_user(app, user_id):
    session_local = app.state._sessionmaker
    async def _add():
        async with session_local() as session:
            user = User(
                id=user_id,
                email=f"{user_id}@example.com",
                username=str(user_id),
                hashed_password="password",
            )
            session.add(user)
            await session.commit()
    import asyncio
    asyncio.get_event_loop().run_until_complete(_add())


@pytest.fixture()
def client(tmp_path):
    os.environ["UPLOADS_PATH"] = str(tmp_path)
    app = create_test_app(tmp_path)
    upload.BASE_UPLOAD_DIR = Path(tmp_path)
    upload.BASE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    async def _noop():
        return None
    upload.check_alembic_revision = _noop
    class DummyResult:
        def scalars(self):
            return self
        def first(self):
            return None
    class DummySession:
        def add(self, *_args, **_kwargs):
            pass
        async def commit(self):
            pass
        async def refresh(self, _obj):
            pass
        async def rollback(self):
            pass
        async def execute(self, *_args, **_kwargs):
            return DummyResult()
    async def override_db():
        yield DummySession()
    app.dependency_overrides[upload.get_db] = override_db
    with TestClient(app) as c:
        c.upload_module = upload
        yield c

def test_thumbnail_created(client, tmp_path):
    user_id = uuid4()
    add_test_user(client.app, user_id)

    # Override auth dependency to return our test user
    def override_get_current_user():
        return User(id=user_id)

    client.app.dependency_overrides[upload.get_current_user] = override_get_current_user

    # Patch render_thumbnail to create a fake file
    def fake_render(model_path, output_path, size=(512, 512)):
        with open(output_path, "wb") as f:
            f.write(b"png")
        return True

    original_render = upload.render_thumbnail
    upload.render_thumbnail = fake_render

    data = BytesIO(b"solid cube\nendsolid cube")
    resp = client.post(
        "/api/v1/upload",
        files={"file": ("cube.stl", data, "model/stl")},
        headers={"Authorization": "Bearer test"},
    )

    client.app.dependency_overrides.pop(upload.get_current_user, None)
    upload.render_thumbnail = original_render

    assert resp.status_code == 200
    thumb_dir = Path(tmp_path) / "users" / str(user_id) / "thumbnails"
    # Thumbnail uses generated UUID name; ensure directory is not empty
    files = list(thumb_dir.glob("*.png"))
    assert files

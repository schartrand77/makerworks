import os
import sys
import uuid
from pathlib import Path
from io import BytesIO

from PIL import Image

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
os.environ.setdefault("STRIPE_SECRET_KEY", "test")

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.db.base import Base
from app.db.session import get_db
from app.models.models import User
from app.routes import auth, avatar


def create_test_app():
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
    app.include_router(auth.router, prefix="", tags=["auth"])
    app.include_router(avatar.router, prefix="", tags=["avatar"])

    import asyncio
    asyncio.get_event_loop().run_until_complete(init_models())

    app.state._sessionmaker = session_local
    return app


@pytest.fixture()
async def client():
    app = create_test_app()
    async with AsyncClient(app=app, base_url="http://testserver") as c:
        yield c


@pytest.fixture()
async def db(client):
    session_local = client.app.state._sessionmaker
    async with session_local() as session:
        yield session




@pytest.mark.asyncio
async def test_signup(client: AsyncClient, db: AsyncSession):
    email = f"user-{uuid.uuid4()}@example.com"
    username = f"user-{uuid.uuid4()}"
    password = "StrongPass123!"

    response = await client.post("/signup", json={
        "email": email,
        "username": username,
        "password": password
    })
    assert response.status_code == 200
    data = response.json()
    assert "user" in data
    assert data["user"]["email"] == email
    assert data["user"]["username"] == username

    # Validate user exists in DB
    user_in_db = await db.get(User, uuid.UUID(data["user"]["id"]))
    assert user_in_db is not None

    base = Path(os.environ.get("UPLOAD_DIR", "/tmp")) / "users" / data["user"]["id"]
    assert (base / "avatars").exists()
    assert (base / "models").exists()


@pytest.mark.asyncio
async def test_signin(client: AsyncClient):
    email = f"s{uuid.uuid4()}@example.com"
    username = f"s{uuid.uuid4()}"
    password = "StrongPass123!"

    await client.post("/signup", json={"email": email, "username": username, "password": password})

    response = await client.post(
        "/signin",
        json={"email_or_username": email, "password": password},
    )
    assert response.status_code == 200
    data = response.json()
    assert "user" in data


@pytest.mark.asyncio
async def test_me(client: AsyncClient):
    email = f"m{uuid.uuid4()}@example.com"
    username = f"m{uuid.uuid4()}"
    password = "StrongPass123!"

    resp = await client.post(
        "/signup",
        json={"email": email, "username": username, "password": password},
    )
    assert resp.status_code == 200

    response = await client.get("/me")
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == email




@pytest.mark.asyncio
async def test_avatar_url_persists(client: AsyncClient, db: AsyncSession):
    email = f"u{uuid.uuid4()}@example.com"
    username = f"u{uuid.uuid4()}"
    password = "Pass123!"

    resp = await client.post("/signup", json={
        "email": email,
        "username": username,
        "password": password,
    })
    assert resp.status_code == 200
    user_id = resp.json()["user"]["id"]

    user_obj = await db.get(User, uuid.UUID(user_id))

    async def override_current_user():
        return user_obj

    from app.dependencies.auth import get_current_user
    client.app.dependency_overrides[get_current_user] = override_current_user

    buf = BytesIO()
    Image.new("RGB", (10, 10), color="green").save(buf, format="PNG")
    buf.seek(0)
    upload = await client.post(
        "/api/v1/avatar",
        files={"file": ("avatar.png", buf, "image/png")},
    )
    client.app.dependency_overrides.pop(get_current_user, None)
    assert upload.status_code == 200
    avatar_url = upload.json()["avatar_url"]

    signin = await client.post(
        "/signin",
        json={"email_or_username": email, "password": password},
    )
    assert signin.status_code == 200
    assert signin.json()["user"]["avatar_url"] == avatar_url

    refreshed = await db.get(User, uuid.UUID(user_id))
    assert refreshed.avatar_url == avatar_url

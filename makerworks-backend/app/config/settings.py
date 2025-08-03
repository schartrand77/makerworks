from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from pathlib import Path
from typing import List, Optional
import os
from pydantic import Field


def _default_upload_path() -> Path:
    """
    Determine the default uploads path:
    - Inside Docker: /app/uploads
    - Local development: ./uploads (absolute path)
    """
    if os.path.exists("/.dockerenv") or os.getenv("DOCKER_ENV") == "1":
        return Path("/app/uploads").resolve()
    return Path(os.getcwd(), "uploads").resolve()


class Settings(BaseSettings):
    # ─── App Info ───────────────────────────────────────
    app_name: str = "MakerWorks API"
    env: str = "development"

    # ─── URLs ───────────────────────────────────────────
    domain: str = "http://localhost:8000"
    base_url: str = "http://localhost:8000"
    vite_api_base_url: Optional[str] = None

    # ─── Database ──────────────────────────────────────
    database_url: str
    async_database_url: Optional[str] = None  # Allow None to auto-generate

    # ─── Storage ───────────────────────────────────────
    uploads_path: Path = Path(
        os.getenv("UPLOADS_PATH", _default_upload_path())
    ).resolve()
    model_dir: str = "models"
    avatar_dir: str = "avatars"

    @property
    def upload_dir(self) -> Path:
        return self.uploads_path

    @property
    def resolved_async_url(self) -> str:
        """
        Ensure async_database_url always exists.
        Falls back to database_url converted to asyncpg if missing.
        """
        if self.async_database_url:
            return self.async_database_url
        return self.database_url.replace("postgresql://", "postgresql+asyncpg://")

    # ─── Redis ─────────────────────────────────────────
    # ✅ Updated default to use service name "redis"
    redis_url: str = Field(default="redis://redis:6379/0", alias="REDIS_URL")

    @property
    def safe_redis_url(self) -> str:
        """
        Always returns a valid Redis URL, falling back to the default
        if the environment variable is unset or blank.
        """
        url = (self.redis_url or "").strip()
        if not url:
            return "redis://redis:6379/0"
        return url

    # ─── JWT (Legacy) ──────────────────────────────────
    jwt_secret: Optional[str] = None
    jwt_algorithm: Optional[str] = None

    # ─── Stripe ────────────────────────────────────────
    stripe_secret_key: Optional[str] = None
    stripe_webhook_secret: Optional[str] = None

    # ─── Admin Seed ────────────────────────────────────
    admin_email: Optional[str] = None
    admin_username: Optional[str] = None
    admin_password: Optional[str] = None

    # ─── Monitoring ────────────────────────────────────
    grafana_admin_user: Optional[str] = None
    grafana_admin_password: Optional[str] = None
    flower_port: Optional[int] = None

    # ─── CORS ──────────────────────────────────────────
    cors_origins: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

    @property
    def debug(self) -> bool:
        return self.env.lower() == "development"

    model_config = SettingsConfigDict(
        env_file=os.getenv("ENV_FILE", ".env"),
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    s = Settings()
    # Force generation of async_database_url if missing
    if not s.async_database_url:
        s.async_database_url = s.database_url.replace(
            "postgresql://", "postgresql+asyncpg://"
        )
    return s


settings = get_settings()

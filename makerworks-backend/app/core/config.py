import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import AnyHttpUrl, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# ─────────────────────────────────────────────
# Load .env file explicitly with fallback
# ─────────────────────────────────────────────
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
if not os.path.exists(env_path):
    env_path = os.path.join(os.path.dirname(__file__), "../..", ".env")
load_dotenv(dotenv_path=env_path)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
        populate_by_name=True,
    )

    # ────────────────
    # ENVIRONMENT
    # ────────────────
    env: str = Field(default="development", alias="ENV")

    # ────────────────
    # DOMAIN + PUBLIC URLS
    # ────────────────
    domain: str = Field(default="localhost", alias="DOMAIN")
    base_url: str = Field(default="http://localhost:8000", alias="BASE_URL")
    vite_api_base_url: str = Field(default="http://localhost:8000/api/v1", alias="VITE_API_BASE_URL")

    # ────────────────
    # FILE SYSTEM
    # ────────────────
    upload_dir_raw: str = Field(default="./uploads", alias="UPLOAD_DIR")
    model_dir_raw: str = Field(default="./uploads/models", alias="MODEL_DIR")
    avatar_dir_raw: str = Field(default="./uploads/avatars", alias="AVATAR_DIR")

    @property
    def UPLOAD_DIR(self) -> str:
        return str(Path(self.upload_dir_raw).resolve())

    @property
    def MODEL_DIR(self) -> str:
        return str(Path(self.model_dir_raw).resolve())

    @property
    def AVATAR_DIR(self) -> str:
        return str(Path(self.avatar_dir_raw).resolve())

    # ────────────────
    # DATABASE
    # ────────────────
    database_url: str = Field(
        default="postgresql+asyncpg://makerworks:makerworks@localhost:5432/makerworks",
        alias="DATABASE_URL"
    )

    @property
    def async_database_url(self) -> str:
        if "+asyncpg" in self.database_url:
            return self.database_url
        return self.database_url.replace("postgresql", "postgresql+asyncpg")

    @property
    def database_url_sync(self) -> str:
        return self.async_database_url.replace("+asyncpg", "")

    # ────────────────
    # REDIS
    # ────────────────
    # ✅ Default now uses the Docker service name "redis" to ensure network resolution works.
    # ✅ Provides a strong fallback even if REDIS_URL is unset or blank.
    redis_url: str = Field(
        default="redis://redis:6379/0",
        alias="REDIS_URL"
    )

    @property
    def safe_redis_url(self) -> str:
        """Always returns a valid Redis URL, falling back to docker-compose default if empty."""
        url = (self.redis_url or "").strip()
        if not url:
            return "redis://redis:6379/0"
        return url

    # ────────────────
    # JWT
    # ────────────────
    algorithm: str = Field(default="RS256", alias="JWT_ALGORITHM")

    # ────────────────
    # STRIPE
    # ────────────────
    stripe_secret_key: str = Field(default="sk_test_dummy", alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: str = Field(default="whsec_dummy", alias="STRIPE_WEBHOOK_SECRET")

    # ────────────────
    # CORS
    # ────────────────
    cors_origins_raw: str = Field(default="", alias="CORS_ORIGINS")
    cors_origins: list[AnyHttpUrl] = []

    @model_validator(mode="after")
    def parse_cors_origins(cls, values):
        raw = values.cors_origins_raw
        if raw:
            values.cors_origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
        else:
            values.cors_origins = []
        return values

    # ────────────────
    # Monitoring / Prometheus
    # ────────────────
    metrics_api_key: str | None = Field(
        default=None,
        alias="METRICS_API_KEY",
        description="Optional API key to secure Prometheus /metrics endpoint",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

__all__ = ["settings"]

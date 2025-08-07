# /app/config/settings.py

from functools import lru_cache
from pathlib import Path
from typing import Optional, List
import os
import socket
from pydantic import Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


def _resolve_docker_host(service: str, fallback: str = "localhost") -> str:
    try:
        socket.gethostbyname(service)
        return service
    except socket.gaierror:
        return fallback


class Settings(BaseSettings):
    # 📄 Environment
    env: str = Field(default="development", alias="ENV")
    env_file: str = Field(default=".env.dev", alias="ENV_FILE")

    # 📄 Application
    app_name: str = Field(default="MakerWorks API", alias="APP_NAME")
    api_version: str = Field(default="0.1.0", alias="API_VERSION")

    # 📄 Debug & URLs
    debug: bool = Field(default=True, alias="DEBUG")
    domain: str = Field(default="http://localhost:8000", alias="DOMAIN")
    base_url: str = Field(default="http://localhost:8000", alias="BASE_URL")

    # 📄 Uploads
    uploads_path: Path = Path("/app/uploads")
    model_dir: str = Field(default="/app/uploads/models", alias="MODEL_DIR")
    avatar_dir: str = Field(default="/app/uploads/avatars", alias="AVATAR_DIR")

    # 📄 Database
    database_url: str = Field(..., alias="DATABASE_URL")
    asyncpg_url: Optional[str] = Field(None, alias="ASYNCPG_URL")

    @property
    def resolved_db_url(self) -> str:
        return self.database_url.replace("@postgres", f"@{_resolve_docker_host('postgres')}")

    @property
    def resolved_asyncpg_url(self) -> str:
        url = self.asyncpg_url or self.database_url
        return url.replace("@postgres", f"@{_resolve_docker_host('postgres')}")

    # 📄 Redis & Celery
    redis_url: str = Field(..., alias="REDIS_URL")
    celery_broker_url: str = Field(..., alias="CELERY_BROKER_URL")
    celery_result_backend: str = Field(..., alias="CELERY_RESULT_BACKEND")
    celery_enabled: bool = Field(default=True, alias="CELERY_ENABLED")

    # 📄 Security
    jwt_secret: str = Field(..., alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    secret_key: str = Field(..., alias="SECRET_KEY")
    auth_audience: str = Field(default="makerworks", alias="AUTH_AUDIENCE")

    # 📄 Admin
    admin_email: Optional[str] = Field(None, alias="ADMIN_EMAIL")
    admin_username: Optional[str] = Field(None, alias="ADMIN_USERNAME")
    admin_password: Optional[str] = Field(None, alias="ADMIN_PASSWORD")

    # 📄 Stripe
    stripe_secret_key: Optional[str] = Field(None, alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: Optional[str] = Field(None, alias="STRIPE_WEBHOOK_SECRET")

    # 📄 Metrics
    metrics_api_key: Optional[str] = Field(None, alias="METRICS_API_KEY")
    grafana_admin_user: Optional[str] = Field(None, alias="GRAFANA_ADMIN_USER")
    grafana_admin_password: Optional[str] = Field(None, alias="GRAFANA_ADMIN_PASSWORD")

    # 📄 CORS
    cors_origins: List[str] = Field(default_factory=lambda: [
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ], alias="CORS_ORIGINS")

    # 📄 Optional
    bambu_ip: Optional[str] = Field(None, alias="BAMBU_IP")

    model_config = SettingsConfigDict(
        env_file=".env.dev",
        extra="ignore"
    )


@lru_cache()
def get_settings() -> Settings:
    try:
        return Settings()
    except ValidationError as e:
        print("❌ Config error: Missing or invalid environment variables.")
        raise e


settings = get_settings()

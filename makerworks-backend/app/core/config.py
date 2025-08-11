import os
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# ─────────────────────────────────────────────
# Load .env explicitly with fallback search
# ─────────────────────────────────────────────
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
if not os.path.exists(env_path):
    env_path = os.path.join(os.path.dirname(__file__), "../..", ".env")
load_dotenv(dotenv_path=env_path)


class Settings(BaseSettings):
    """
    Centralized app configuration (Pydantic v2).

    Notes:
    - Supports running both locally and in Docker (auto-detects for Redis fallback).
    - Adds full JWT settings (HS256 by default; RS256 supported via key file paths).
    - Adds THUMBNAILS_DIR to match docker-compose volumes.
    """

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
    thumbnails_dir_raw: str = Field(default="./thumbnails", alias="THUMBNAILS_DIR")

    @property
    def UPLOAD_DIR(self) -> str:
        return str(Path(self.upload_dir_raw).resolve())

    @property
    def MODEL_DIR(self) -> str:
        return str(Path(self.model_dir_raw).resolve())

    @property
    def AVATAR_DIR(self) -> str:
        return str(Path(self.avatar_dir_raw).resolve())

    @property
    def THUMBNAILS_DIR(self) -> str:
        return str(Path(self.thumbnails_dir_raw).resolve())

    # ────────────────
    # DATABASE
    # ────────────────
    database_url: str = Field(
        default="postgresql+asyncpg://makerworks:makerworks@localhost:5432/makerworks",
        alias="DATABASE_URL",
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
    # REDIS (auto-detect Docker for sensible default)
    # ────────────────
    redis_url: str = Field(default="", alias="REDIS_URL")

    @property
    def running_in_docker(self) -> bool:
        # Common heuristics
        if os.getenv("DOCKER") == "1":
            return True
        if Path("/.dockerenv").exists():
            return True
        # GitHub Actions / CI still count as "not docker" by default
        return False

    @property
    def safe_redis_url(self) -> str:
        """
        Always returns a valid Redis URL:
        - If REDIS_URL provided → use it.
        - Else if Docker → redis://redis:6379/0
        - Else → redis://127.0.0.1:6379/0
        """
        url = (self.redis_url or "").strip()
        if url:
            return url
        return "redis://redis:6379/0" if self.running_in_docker else "redis://127.0.0.1:6379/0"

    # ────────────────
    # JWT (HS or RS)
    # ────────────────
    # Support BOTH env names for algorithm: JWT_ALGORITHM (current) and JWT_ALG (alt)
    jwt_algorithm_raw: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_alg_alt: Optional[str] = Field(default=None, alias="JWT_ALG")

    # HS* secret (ignored for RS*)
    jwt_secret: str = Field(default="", alias="JWT_SECRET")

    # RS* key paths (PEM)
    jwt_private_key_path: str = Field(default="", alias="JWT_PRIVATE_KEY_PATH")
    jwt_public_key_path: str = Field(default="", alias="JWT_PUBLIC_KEY_PATH")

    # Standard claims config
    jwt_issuer: str = Field(default="makerworks", alias="JWT_ISSUER")
    jwt_audience: str = Field(default="makerworks-web", alias="JWT_AUDIENCE")
    jwt_expires_min: int = Field(default=60, alias="JWT_EXPIRES_MIN")
    jwt_refresh_expires_days: int = Field(default=14, alias="JWT_REFRESH_EXPIRES_DAYS")

    @property
    def algorithm(self) -> str:
        """
        Expose the algorithm under the legacy name 'algorithm' used elsewhere in the codebase.
        Prefers JWT_ALG if set; otherwise JWT_ALGORITHM.
        """
        return (self.jwt_alg_alt or self.jwt_algorithm_raw or "HS256").upper()

    # ────────────────
    # STRIPE
    # ────────────────
    stripe_secret_key: str = Field(default="sk_test_dummy", alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: str = Field(default="whsec_dummy", alias="STRIPE_WEBHOOK_SECRET")

    # ────────────────
    # CORS
    # ────────────────
    cors_origins_raw: str = Field(default="", alias="CORS_ORIGINS")
    cors_origins: List[str] = []

    @model_validator(mode="after")
    def parse_cors_origins(cls, values: "Settings") -> "Settings":
        raw = (values.cors_origins_raw or "").strip()
        if raw:
            values.cors_origins = [o.strip() for o in raw.split(",") if o.strip()]
        else:
            # Reasonable dev defaults
            values.cors_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
        return values

    # ────────────────
    # Monitoring / Prometheus
    # ────────────────
    metrics_api_key: Optional[str] = Field(
        default=None,
        alias="METRICS_API_KEY",
        description="Optional API key to secure Prometheus /metrics endpoint",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

__all__ = ["settings", "Settings"]

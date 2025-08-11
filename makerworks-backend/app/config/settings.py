# /app/config/settings.py
from __future__ import annotations

import json
import os
import re
import socket
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from pydantic import Field, ValidationError, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _resolve_docker_host(service: str, fallback: str = "localhost") -> str:
    try:
        socket.gethostbyname(service)
        return service
    except socket.gaierror:
        return fallback


class Settings(BaseSettings):
    """
    Robust settings that won’t faceplant on CORS or missing envs.
    Accepts CORS_ORIGINS as JSON (["a","b"]) or comma/space list (a,b).
    """

    # Pydantic v2 config
    model_config = SettingsConfigDict(
        env_file=".env.dev",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    # ───────────────  Environment / App  ───────────────
    env: str = Field(default="development", alias="ENV")
    env_file: str = Field(default=".env.dev", alias="ENV_FILE")
    debug: bool = Field(default=True, alias="DEBUG")

    app_name: str = Field(default="MakerWorks API", alias="APP_NAME")
    api_version: str = Field(default="0.1.0", alias="API_VERSION")

    # ───────────────  URLs (optional)  ───────────────
    domain: str = Field(default="localhost", alias="DOMAIN")
    base_url: str = Field(default="http://localhost:8000", alias="BASE_URL")

    # ───────────────  Filesystem  ───────────────
    upload_dir: str = Field(default="/uploads", alias="UPLOAD_DIR")
    model_dir: str = Field(default="/uploads/models", alias="MODEL_DIR")
    avatar_dir: str = Field(default="/uploads/avatars", alias="AVATAR_DIR")
    thumbnails_dir: str = Field(default="/thumbnails", alias="THUMBNAILS_DIR")

    # ───────────────  Database  ───────────────
    database_url: str = Field(
        default="postgresql+asyncpg://makerworks:makerworks@postgres:5432/makerworks",
        alias="DATABASE_URL",
    )
    asyncpg_url: Optional[str] = Field(default=None, alias="ASYNCPG_URL")

    @property
    def resolved_db_url(self) -> str:
        return self.database_url.replace("@postgres", f"@{_resolve_docker_host('postgres')}")

    @property
    def resolved_asyncpg_url(self) -> str:
        url = self.asyncpg_url or self.database_url
        return url.replace("@postgres", f"@{_resolve_docker_host('postgres')}")

    # ───────────────  Redis & Celery  ───────────────
    redis_url: str = Field(default="redis://redis:6379/0", alias="REDIS_URL")
    celery_broker_url: str = Field(default="redis://redis:6379/0", alias="CELERY_BROKER_URL")
    celery_result_backend: str = Field(default="redis://redis:6379/0", alias="CELERY_RESULT_BACKEND")
    celery_enabled: bool = Field(default=True, alias="CELERY_ENABLED")

    # ───────────────  Security / JWT  ───────────────
    jwt_secret: str = Field(default="dev-super-secret-change-me", alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")  # HS256 by default
    jwt_alg: Optional[str] = Field(default=None, alias="JWT_ALG")       # alt name
    jwt_private_key_path: str = Field(default="", alias="JWT_PRIVATE_KEY_PATH")
    jwt_public_key_path: str = Field(default="", alias="JWT_PUBLIC_KEY_PATH")
    jwt_issuer: str = Field(default="makerworks", alias="JWT_ISSUER")
    jwt_audience: str = Field(default="makerworks-web", alias="JWT_AUDIENCE")
    jwt_expires_min: int = Field(default=60, alias="JWT_EXPIRES_MIN")
    jwt_refresh_expires_days: int = Field(default=14, alias="JWT_REFRESH_EXPIRES_DAYS")

    # also used by SessionMiddleware sometimes
    secret_key: str = Field(default="change-me", alias="SECRET_KEY")
    auth_audience: str = Field(default="makerworks", alias="AUTH_AUDIENCE")

    # ───────────────  Admin seed (optional)  ───────────────
    admin_email: Optional[str] = Field(default="admin@example.com", alias="ADMIN_EMAIL")
    admin_username: Optional[str] = Field(default="admin", alias="ADMIN_USERNAME")
    admin_password: Optional[str] = Field(default="change-me-please", alias="ADMIN_PASSWORD")

    # ───────────────  Stripe (optional)  ───────────────
    stripe_secret_key: Optional[str] = Field(default=None, alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: Optional[str] = Field(default=None, alias="STRIPE_WEBHOOK_SECRET")

    # ───────────────  Metrics (optional)  ───────────────
    metrics_api_key: Optional[str] = Field(default=None, alias="METRICS_API_KEY")
    grafana_admin_user: Optional[str] = Field(default=None, alias="GRAFANA_ADMIN_USER")
    grafana_admin_password: Optional[str] = Field(default=None, alias="GRAFANA_ADMIN_PASSWORD")

    # ───────────────  CORS  ───────────────
    # raw string from env; we’ll parse it into cors_origins below
    cors_origins_raw: str = Field(default="", alias="CORS_ORIGINS")
    cors_origins: List[str] = Field(default_factory=list)

    # optional
    bambu_ip: Optional[str] = Field(default=None, alias="BAMBU_IP")

    @property
    def algorithm(self) -> str:
        """Back-compat property used by older code."""
        return (self.jwt_alg or self.jwt_algorithm or "HS256").upper()

    @model_validator(mode="after")
    def _parse_cors(self) -> "Settings":
        raw = (self.cors_origins_raw or "").strip()
        if not raw:
            self.cors_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
            return self

        # Try JSON first
        if raw and raw[0] in "[{\"'":
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, str):
                    vals = [parsed]
                elif isinstance(parsed, list):
                    vals = parsed
                else:
                    vals = [str(v) for v in getattr(parsed, "values", lambda: [])()]
                self.cors_origins = [str(v).strip().strip('"').strip("'") for v in vals if str(v).strip()]
                return self
            except Exception:
                # fall through to manual parsing
                pass

        # Fallback: split on commas/whitespace; strip brackets/quotes
        parts = re.split(r"[,\s]+", raw)
        cleaned: list[str] = []
        for p in parts:
            p = p.strip().strip("[]").strip().strip('"').strip("'")
            if p:
                cleaned.append(p)
        # dedupe while preserving order
        seen = set()
        deduped = []
        for item in cleaned:
            if item not in seen:
                seen.add(item)
                deduped.append(item)
        self.cors_origins = deduped or ["http://localhost:5173", "http://127.0.0.1:5173"]
        return self

    # Convenience resolved paths
    @property
    def uploads_path(self) -> Path:
        return Path(self.upload_dir).resolve()

    @property
    def models_path(self) -> Path:
        return Path(self.model_dir).resolve()

    @property
    def thumbnails_path(self) -> Path:
        return Path(self.thumbnails_dir).resolve()


@lru_cache()
def get_settings() -> Settings:
    try:
        # Allow overriding the env file at runtime
        env_file = os.getenv("ENV_FILE")
        if env_file and Path(env_file).exists():
            Settings.model_config["env_file"] = env_file  # type: ignore[index]
        return Settings()
    except ValidationError as e:
        print("❌ Config error: Missing or invalid environment variables.")
        raise e


settings = get_settings()

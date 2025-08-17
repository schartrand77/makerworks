# app/config/settings.py
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings

# ──────────────────────────────────────────────────────────────────────────────
# Preload .env *once* (no DIY tokenizing nonsense)
# Priority: explicit ENV_FILE -> .env.dev -> .env
# ──────────────────────────────────────────────────────────────────────────────
def _preload_env() -> None:
    env_file = os.getenv("ENV_FILE")
    try:
        from dotenv import load_dotenv  # type: ignore
    except Exception:
        return
    if env_file and Path(env_file).exists():
        load_dotenv(env_file, override=False)
        return
    if Path(".env.dev").exists():
        load_dotenv(".env.dev", override=False)
    load_dotenv(".env", override=False)


_preload_env()


DEFAULT_SECRET = "dev-secret-change-me"


def _default_if_blank(value: Optional[str], default: str) -> str:
    if value is None:
        return default
    v = str(value).strip()
    return v or default


class Settings(BaseSettings):
    # ── App basics ────────────────────────────────────────────────────────────
    PROJECT_NAME: str = Field(default="MakerWorks", env="PROJECT_NAME")
    API_V1_STR: str = Field(default="/api/v1", env="API_V1_STR")
    ENV: str = Field(default="development", env="ENV")

    # ── Secrets / auth ────────────────────────────────────────────────────────
    SECRET_KEY: str = Field(default=DEFAULT_SECRET, env="SECRET_KEY")
    SESSION_SECRET: str = Field(default=DEFAULT_SECRET, env="SESSION_SECRET")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=60 * 24 * 8, env="ACCESS_TOKEN_EXPIRE_MINUTES")  # 8 days

    # ── URLs ─────────────────────────────────────────────────────────────────
    # DOMAIN = frontend origin, BASE_URL = backend base (don’t mix these up)
    DOMAIN: str = Field(default="http://localhost:5173", env="DOMAIN")
    BASE_URL: str = Field(default="http://localhost:8000", env="BASE_URL")
    FRONTEND_ORIGIN: Optional[str] = Field(default=None, env="FRONTEND_ORIGIN")

    # ── Database / Redis / Celery ────────────────────────────────────────────
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://makerworks:makerworks@postgres:5432/makerworks",
        env="DATABASE_URL",
    )
    REDIS_URL: str = Field(default="redis://redis:6379/0", env="REDIS_URL")
    CELERY_BROKER_URL: str = Field(default="", env="CELERY_BROKER_URL")
    CELERY_RESULT_BACKEND: str = Field(default="", env="CELERY_RESULT_BACKEND")

    # ── File system roots (mounted in Docker) ────────────────────────────────
    # In containers we *bind* /uploads and /thumbnails. Outside Docker, we’ll
    # create local ./uploads and ./thumbnails so dev still works.
    UPLOAD_DIR: str = Field(default="/uploads", env="UPLOAD_DIR")
    THUMBNAILS_DIR: Optional[str] = Field(default="/thumbnails", env="THUMBNAILS_DIR")
    MODELS_DIR: str = Field(default="/models", env="MODELS_DIR")
    STATIC_DIR: str = Field(default="app/static", env="STATIC_DIR")

    # ── CORS ─────────────────────────────────────────────────────────────────
    # Accepts JSON list or CSV string. We normalize later.
    CORS_ORIGINS: List[str] | str = Field(
        default='["http://localhost:5173","http://127.0.0.1:5173","http://localhost:3000","http://127.0.0.1:3000"]',
        env="CORS_ORIGINS",
    )
    CORS_ALLOW_ALL: bool = Field(default=False, env="CORS_ALLOW_ALL")

    # ── Payments (Stripe) ────────────────────────────────────────────────────
    STRIPE_SECRET_KEY: str = Field(default="", env="STRIPE_SECRET_KEY")
    STRIPE_WEBHOOK_SECRET: str = Field(default="", env="STRIPE_WEBHOOK_SECRET")
    STRIPE_PUBLISHABLE_KEY: str = Field(default="", env="STRIPE_PUBLISHABLE_KEY")

    # ── Admin seed ───────────────────────────────────────────────────────────
    ADMIN_EMAIL: str = Field(default="admin@example.com", env="ADMIN_EMAIL")
    ADMIN_USERNAME: str = Field(default="admin", env="ADMIN_USERNAME")
    ADMIN_PASSWORD: str = Field(default="change-me-please", env="ADMIN_PASSWORD")

    # ── Optional devices ─────────────────────────────────────────────────────
    BAMBU_IP: Optional[str] = Field(default=None, env="BAMBU_IP")

    class Config:
        env_file = ".env.dev"
        env_file_encoding = "utf-8"
        extra = "ignore"

    # ── Validators / normalizers ─────────────────────────────────────────────
    @field_validator("ENV", mode="before")
    @classmethod
    def _env_lower(cls, v: str) -> str:
        return (v or "development").strip().lower()

    @field_validator("DOMAIN", "BASE_URL", "FRONTEND_ORIGIN", mode="before")
    @classmethod
    def _normalize_url(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        s = str(v).strip().strip('"').strip("'")
        if not s:
            return s
        # Kill accidental JSON-bracket debris from bad loaders
        s = s.replace('["', "").replace('"]', "").replace("['", "").replace("']", "")
        if not s.startswith(("http://", "https://")):
            s = "http://" + s
        return s.rstrip("/")

    @model_validator(mode="after")
    def _require_production_secrets(self):
        if self.ENV == "production":
            missing: list[str] = []
            if self.SECRET_KEY == DEFAULT_SECRET:
                missing.append("SECRET_KEY")
            if self.SESSION_SECRET == DEFAULT_SECRET:
                missing.append("SESSION_SECRET")
            if missing:
                joined = " and ".join(missing)
                raise ValueError(f"{joined} must be set to non-default values in production")
        return self

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v):
        if v is None or v == "":
            return []
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        raw = str(v).strip()
        # Try JSON first
        if raw.startswith("["):
            try:
                arr = json.loads(raw)
                if isinstance(arr, list):
                    return [str(x).strip() for x in arr if str(x).strip()]
            except Exception:
                pass
        # Fallback: CSV
        return [part.strip().strip("'").strip('"') for part in raw.split(",") if part.strip()]

    @field_validator("CELERY_BROKER_URL", "CELERY_RESULT_BACKEND", mode="after")
    @classmethod
    def _celery_defaults(cls, v, info):
        return v or os.getenv("REDIS_URL", "redis://redis:6379/0")

    # ── Convenience properties ───────────────────────────────────────────────
    @property
    def cors_origins(self) -> List[str]:
        normed: List[str] = []
        def _norm(u: str) -> str:
            s = str(u).strip().rstrip("/")
            s = s.replace('["', "").replace('"]', "").replace("['", "").replace("']", "")
            if not s.startswith(("http://", "https://")):
                s = "http://" + s
            return s

        # From env list
        for o in (self.CORS_ORIGINS if isinstance(self.CORS_ORIGINS, list) else []):
            s = _norm(o)
            if s and s not in normed:
                normed.append(s)

        # Also include DOMAIN + BASE_URL for sanity
        for extra in (self.DOMAIN, self.BASE_URL, "http://localhost:5173", "http://127.0.0.1:5173"):
            if extra:
                s = _norm(extra)
                if s not in normed:
                    normed.append(s)
        return normed

    @property
    def base_upload_path(self) -> Path:
        # Prefer explicit env, else container bind, else local ./uploads
        p = Path(self.UPLOAD_DIR)
        if not p.is_absolute():
            p = Path("/uploads") if Path("/uploads").exists() else Path("uploads")
        return p.resolve()

    @property
    def thumbnails_path(self) -> Path:
        # Prefer explicit env, else container bind, else local ./thumbnails
        if self.THUMBNAILS_DIR:
            p = Path(self.THUMBNAILS_DIR)
        else:
            p = Path("/thumbnails") if Path("/thumbnails").exists() else Path("thumbnails")
        return p.resolve()

    @property
    def models_path(self) -> Path:
        p = Path(self.MODELS_DIR)
        if not p.is_absolute():
            p = Path("/models") if Path("/models").exists() else Path("models")
        return p.resolve()

    @property
    def static_path(self) -> Path:
        p = Path(self.STATIC_DIR)
        if not p.is_absolute():
            p = Path("app/static")
        return p.resolve()

    # ── Back-compat lowercase aliases (some modules still expect these) ──────
    @property
    def env(self) -> str: return self.ENV
    @property
    def domain(self) -> str: return self.DOMAIN
    @property
    def base_url(self) -> str: return self.BASE_URL
    @property
    def frontend_url(self) -> str: return self.DOMAIN
    @property
    def backend_url(self) -> str: return self.BASE_URL
    @property
    def database_url(self) -> str: return self.DATABASE_URL
    @property
    def redis_url(self) -> str: return self.REDIS_URL
    @property
    def celery_broker_url(self) -> str: return self.CELERY_BROKER_URL or self.REDIS_URL
    @property
    def celery_result_backend(self) -> str: return self.CELERY_RESULT_BACKEND or self.REDIS_URL
    @property
    def upload_dir(self) -> str: return str(self.base_upload_path)
    @property
    def thumbnails_dir(self) -> str: return str(self.thumbnails_path)
    @property
    def models_dir(self) -> str: return str(self.models_path)
    @property
    def static_dir(self) -> str: return str(self.static_path)
    @property
    def stripe_secret_key(self) -> str: return self.STRIPE_SECRET_KEY
    @property
    def stripe_webhook_secret(self) -> str: return self.STRIPE_WEBHOOK_SECRET
    @property
    def stripe_publishable_key(self) -> str: return self.STRIPE_PUBLISHABLE_KEY
    # Admin seed aliases
    @property
    def admin_email(self) -> str: return self.ADMIN_EMAIL
    @property
    def admin_username(self) -> str: return self.ADMIN_USERNAME
    @property
    def admin_password(self) -> str: return self.ADMIN_PASSWORD
    # Legacy raw paths
    @property
    def uploads_path(self) -> str: return str(self.base_upload_path)
    @property
    def thumbnails_dir_raw(self) -> str: return str(self.thumbnails_path)
    @property
    def model_dir_raw(self) -> str: return str(self.models_path)


@lru_cache()
def get_settings() -> Settings:
    s = Settings()

    # Backfill empty strings with sane defaults (covers mangled .env values)
    s.DOMAIN = _default_if_blank(s.DOMAIN, "http://localhost:5173")
    s.BASE_URL = _default_if_blank(s.BASE_URL, "http://localhost:8000")
    s.DATABASE_URL = _default_if_blank(
        s.DATABASE_URL,
        "postgresql+asyncpg://makerworks:makerworks@postgres:5432/makerworks",
    )
    s.REDIS_URL = _default_if_blank(s.REDIS_URL, "redis://redis:6379/0")
    s.CELERY_BROKER_URL = _default_if_blank(s.CELERY_BROKER_URL, s.REDIS_URL)
    s.CELERY_RESULT_BACKEND = _default_if_blank(s.CELERY_RESULT_BACKEND, s.REDIS_URL)
    s.FRONTEND_ORIGIN = _default_if_blank(s.FRONTEND_ORIGIN or "", s.DOMAIN)

    # Ensure directories exist (binds in Docker; local dirs in bare metal)
    for p in (s.base_upload_path, s.thumbnails_path, s.models_path, s.static_path):
        p.mkdir(parents=True, exist_ok=True)

    # Backfill env for libs that read os.environ directly
    os.environ.setdefault("UPLOAD_DIR", str(s.base_upload_path))
    os.environ.setdefault("THUMBNAILS_DIR", str(s.thumbnails_path))
    os.environ.setdefault("MODELS_DIR", str(s.models_path))
    os.environ.setdefault("STATIC_DIR", str(s.static_path))
    os.environ.setdefault("DOMAIN", s.DOMAIN)
    os.environ.setdefault("BASE_URL", s.BASE_URL)
    os.environ.setdefault("FRONTEND_ORIGIN", s.FRONTEND_ORIGIN or s.DOMAIN)
    os.environ.setdefault("ADMIN_EMAIL", s.ADMIN_EMAIL)
    os.environ.setdefault("ADMIN_USERNAME", s.ADMIN_USERNAME)
    os.environ.setdefault("ADMIN_PASSWORD", s.ADMIN_PASSWORD)

    return s


# Export singleton
settings: Settings = get_settings()

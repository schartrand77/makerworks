# app/main.py

from __future__ import annotations

import asyncio
import logging
import os
import re
import sys
import traceback
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, Sequence
from urllib.parse import urlparse
import json as _json

from fastapi import FastAPI, Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from pydantic import BaseModel, Field, ValidationError

# ──────────────────────────────────────────────────────────────────────────────
# stderr helper (avoid crashing on early logging)
# ──────────────────────────────────────────────────────────────────────────────
def safe_stderr(msg: str) -> None:
    try:
        os.write(sys.__stderr__.fileno(), (msg.rstrip() + "\n").encode("utf-8"))
    except Exception:
        pass

# ──────────────────────────────────────────────────────────────────────────────
# Minimal, robust .env loader (tolerates URLs, colons, quotes, export)
# Loads BEFORE importing settings so values are available to Pydantic, etc.
# ──────────────────────────────────────────────────────────────────────────────
def _load_env_file(path: str) -> int:
    count = 0
    try:
        with open(path, "r", encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("export "):
                    line = line[len("export "):].strip()
                if "=" not in line:
                    # tolerate junk; don't crash
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip()
                if not key:
                    continue
                # Strip matching quotes only (do NOT split on ':', allow URLs)
                if (len(val) >= 2) and ((val[0] == val[-1]) and val[0] in ("'", '"')):
                    val = val[1:-1]
                # Don't overwrite already-present env vars (e.g., docker-compose)
                if key not in os.environ:
                    os.environ[key] = val
                    count += 1
        safe_stderr(f"📦 Loaded {count} env keys from {path}")
    except FileNotFoundError:
        safe_stderr(f"📦 Env file not found: {path} (skipping)")
    except Exception:
        safe_stderr("📦 Env load error:\n" + "".join(traceback.format_exc()))
    return count

# Pick env file: ENV_FILE if set, else .env.dev, else .env
ENV_FILE = os.getenv("ENV_FILE") or ".env.dev"
if Path(ENV_FILE).exists():
    _load_env_file(ENV_FILE)
elif Path(".env").exists():
    _load_env_file(".env")

# ──────────────────────────────────────────────────────────────────────────────
# Defensive imports (now that env vars are in place)
# ──────────────────────────────────────────────────────────────────────────────
try:
    from alembic.config import Config as AlembicConfig
    from alembic import command as alembic_command

    # prefer new location, fall back to legacy
    try:
        from app.core.config import settings  # preferred
    except Exception:
        from app.config.settings import settings  # legacy

    try:
        from app.db.session import async_engine
    except Exception:
        async_engine = None  # type: ignore

    try:
        from app.db.database import init_db
    except Exception:
        init_db = lambda: None  # type: ignore

    # Routers: import modules, not router objects, so we can mount later
    from app.routes import (
        admin, auth, avatar, cart, checkout, filaments, models,
        metrics, system, upload, users
    )

    try:
        from app.routes.health import router as health_router  # type: ignore
    except Exception:
        health_router = None  # type: ignore

    from app.services.cache.redis_service import verify_redis_connection

    # 👑 Admin seeder: prefer scheduler if available; fall back to ensure_admin_user
    try:
        from app.startup.admin_seed import schedule_admin_seed_on_startup  # type: ignore
    except Exception:
        schedule_admin_seed_on_startup = None  # type: ignore
    try:
        from app.startup.admin_seed import ensure_admin_user  # type: ignore
    except Exception:
        ensure_admin_user = None  # type: ignore

    from app.utils.boot_messages import random_boot_message
    from app.utils.system_info import get_system_status_snapshot

    try:
        from app.logging_config import startup_banner
    except Exception:
        def startup_banner() -> None:
            logging.getLogger("uvicorn").info("🚀 Backend startup (fallback banner)")

    # Celery hooks (optional: worker may not be installed in dev)
    try:
        from app.worker.tasks import generate_model_previews  # Celery task
    except Exception:
        generate_model_previews = None  # type: ignore
    try:
        # Prefer a shared Celery() instance if you expose it
        from app.worker import celery_app as celery_app_instance  # type: ignore
    except Exception:
        celery_app_instance = None  # type: ignore

except Exception:
    formatted_tb = "".join(traceback.format_exc())
    safe_stderr("=== STARTUP IMPORT FAILURE ===\n" + formatted_tb)
    raise

logger = logging.getLogger("uvicorn")

# ──────────────────────────────────────────────────────────────────────────────
# CORS helpers (robust parsing, credential-safe)
# ──────────────────────────────────────────────────────────────────────────────
def _clean_origin_token(token: str | None) -> Optional[str]:
    """Normalize a single origin token to 'scheme://host[:port]' or None."""
    if token is None:
        return None
    t = str(token).strip()
    if not t:
        return None
    # tolerate stray brackets/quotes/commas from bad env formatting
    t = t.strip(", ").strip().strip("[]").strip().strip("'").strip('"')
    if not t:
        return None
    if not t.startswith(("http://", "https://")):
        t = "http://" + t
    u = urlparse(t)
    if u.scheme not in ("http", "https") or not u.netloc:
        return None
    return f"{u.scheme}://{u.netloc}"

def _parse_cors_env(raw: str) -> list[str]:
    """Parse CORS_ORIGINS from JSON list, single string, or CSV with weird quotes."""
    # 1) strict JSON
    try:
        parsed = _json.loads(raw)
        if isinstance(parsed, list):
            cleaned = [_clean_origin_token(x) for x in parsed]
            return [c for c in cleaned if c]
        if isinstance(parsed, str):
            c = _clean_origin_token(parsed)
            return [c] if c else []
    except Exception:
        pass
    # 2) single-quoted JSON list -> swap quotes and retry
    try:
        s = raw.strip()
        if s.startswith("[") and "'" in s and '"' not in s:
            parsed = _json.loads(s.replace("'", '"'))
            if isinstance(parsed, list):
                cleaned = [_clean_origin_token(x) for x in parsed]
                return [c for c in cleaned if c]
    except Exception:
        pass
    # 3) CSV (with or without brackets)
    parts = [p for p in raw.split(",")]
    cleaned = [_clean_origin_token(p) for p in parts]
    return [c for c in cleaned if c]

def _normalize_origin(o: str | None) -> Optional[str]:
    """Normalize an Origin header value so it can be compared to allowlist."""
    return _clean_origin_token(o)

def resolve_allowed_origins() -> list[str]:
    origins: list[str] = []

    # 1) settings.cors_origins when present
    try:
        from_settings = getattr(settings, "cors_origins", None)
        if isinstance(from_settings, (list, tuple)):
            origins.extend([c for c in (_clean_origin_token(x) for x in from_settings) if c])
        elif isinstance(from_settings, str):
            origins.extend(_parse_cors_env(from_settings))
    except Exception:
        pass

    # 2) env CORS_ORIGINS (robust parsing)
    env_raw = os.getenv("CORS_ORIGINS", "")
    if env_raw:
        parsed = _parse_cors_env(env_raw)
        origins.extend(parsed)
        # warn if env looked malformed but we recovered
        try:
            _json.loads(env_raw)
            parsed_ok = True
        except Exception:
            parsed_ok = False
        if not parsed_ok and any(ch in env_raw for ch in "[]'"):
            logger.warning("⚠️ CORS_ORIGINS looked malformed; parsed defensively: %r -> %s", env_raw, parsed)

    # 3) common localhost devs
    origins.extend([
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
    ])

    # 4) FRONTEND_ORIGIN override (single value)
    fe = os.getenv("FRONTEND_ORIGIN", "").strip()
    if fe:
        c = _clean_origin_token(fe)
        if c:
            origins.append(c)

    # normalize + dedupe while preserving order
    seen: set[str] = set()
    norm: list[str] = []
    for o in origins:
        n = _clean_origin_token(o)
        if n and n not in seen:
            seen.add(n)
            norm.append(n)
    return norm

# ──────────────────────────────────────────────────────────────────────────────
# Admin/log helpers
# ──────────────────────────────────────────────────────────────────────────────
def _redact_dsn(dsn: Optional[str]) -> str:
    if not dsn:
        return "(unset)"
    try:
        # e.g. postgresql+asyncpg://user:pass@host:5432/db
        before_at, after_at = dsn.split("@", 1)
        proto, user_and_pass = before_at.split("://", 1)
        user = user_and_pass.split(":", 1)[0]
        return f"{proto}://{user}:***@{after_at}"
    except Exception:
        return "(redacted)"

def _active_db_dsn() -> Optional[str]:
    # Prefer settings if present, else env fallbacks
    for key in ("database_url", "ASYNCPG_URL", "DATABASE_URL"):
        try:
            val = getattr(settings, key) if hasattr(settings, key) else os.getenv(key)
            if val:
                return str(val)
        except Exception:
            continue
    return None

# ──────────────────────────────────────────────────────────────────────────────
# App
# ──────────────────────────────────────────────────────────────
app = FastAPI(title="MakerWorks API", version="1.0.0", description="MakerWorks backend API")
app.router.redirect_slashes = True

# If available, schedule admin seeding on the FastAPI startup hook.
# We keep a flag to avoid double-running (since lifespan also calls ensure_admin_user()).
_ADMIN_SEED_SCHEDULED = False
if 'schedule_admin_seed_on_startup' in globals() and callable(schedule_admin_seed_on_startup):  # type: ignore[name-defined]
    try:
        schedule_admin_seed_on_startup(app)  # type: ignore[misc]
        _ADMIN_SEED_SCHEDULED = True
        logger.info("👑 Admin seeder scheduled via app.startup.admin_seed")
    except Exception as _e:
        logger.warning(f"⚠️ Failed to schedule admin seeder: {_e}")

# ──────────────────────────────────────────────────────────────────────────────
# CORS FIRST (no regex when using credentials)
# ──────────────────────────────────────────────────────────────────────────────
ALLOWED_ORIGINS = resolve_allowed_origins()
ALLOW_CREDENTIALS = True
ALLOWED_METHODS: Sequence[str] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
ALLOWED_HEADERS: Sequence[str] = ["*"]
EXPOSED_HEADERS: Sequence[str] = ["set-cookie", "content-type"]
CORS_MAX_AGE = 86400  # 24h

# IMPORTANT: do NOT use allow_origin_regex when credentials=True
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_methods=list(ALLOWED_METHODS),
    allow_headers=list(ALLOWED_HEADERS),
    expose_headers=list(EXPOSED_HEADERS),
    max_age=CORS_MAX_AGE,
)

SESSION_SECRET = os.getenv("SESSION_SECRET", "supersecretkey")
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    same_site="strict" if getattr(settings, "env", "development") == "production" else "lax",
    https_only=getattr(settings, "env", "development") == "production",
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

# ──────────────────────────────────────────────────────────────────────────────
# Global exception handlers (preserve ACAO on errors)
# ──────────────────────────────────────────────────────────────────────────────
def _cors_headers_for_request(request: Request) -> dict:
    origin = _normalize_origin(request.headers.get("origin"))
    if not origin:
        return {}
    if origin not in ALLOWED_ORIGINS:
        return {}
    h = {"Access-Control-Allow-Origin": origin, "Vary": "Origin"}
    if ALLOW_CREDENTIALS:
        h["Access-Control-Allow-Credentials"] = "true"
    return h

@app.exception_handler(StarletteHTTPException)
async def http_exc_handler(request: Request, exc: StarletteHTTPException):
    headers = _cors_headers_for_request(request)
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=headers)

# Detailed dev errors + generic prod fallback
@app.exception_handler(Exception)
async def unhandled_exc_handler(request: Request, exc: Exception):
    headers = _cors_headers_for_request(request)
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)

    # Force verbosity for common auth/signup endpoints (wildcards)
    p = request.url.path
    force_verbose = (
        p.startswith(("/api/v1/auth", "/api/v1/users"))
        or p.endswith(("/signup", "/register", "/login"))
    )

    # In dev or when EXPOSE_ERRORS=1, return detail + stack to frontend
    env_name = os.getenv("ENV") or getattr(settings, "env", "development")
    dev_mode = (env_name.lower() != "production") or os.getenv("EXPOSE_ERRORS", "0") == "1"

    if dev_mode or force_verbose:
        tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        return JSONResponse(
            {
                "detail": str(exc),
                "error_type": type(exc).__name__,
                "trace": tb,
                "path": request.url.path,
                "method": request.method,
            },
            status_code=500,
            headers=headers,
        )
    return JSONResponse({"detail": "Internal server error"}, status_code=500, headers=headers)

# Map DB unique violations to 409 Conflict (e.g., email/username taken)
@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    headers = _cors_headers_for_request(request)
    return JSONResponse(
        {"detail": "duplicate", "hint": "email_or_username_taken"},
        status_code=409,
        headers=headers,
    )

# Bubble pydantic validation as 422 with field errors
@app.exception_handler(ValidationError)
async def validation_error_handler(request: Request, exc: ValidationError):
    headers = _cors_headers_for_request(request)
    return JSONResponse(
        {"detail": "validation_error", "errors": exc.errors()},
        status_code=422,
        headers=headers,
    )

# ──────────────────────────────────────────────────────────────────────────────
# Manual OPTIONS (guarantee good preflight responses)
# ──────────────────────────────────────────────────────────────────────────────
@app.options("/{full_path:path}")
async def any_options(full_path: str, request: Request) -> Response:
    origin = _normalize_origin(request.headers.get("origin"))
    acrm = request.headers.get("access-control-request-method", "GET")
    acrh = request.headers.get("access-control-request-headers", "")

    logger.info(f"[CORS] Preflight OPTIONS {request.url.path} | Origin={origin} | "
                f"Req-Method={acrm} | Req-Headers={acrh} | Allowed={ALLOWED_ORIGINS}")

    headers = {"Vary": "Origin"}
    if origin and origin in ALLOWED_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        if ALLOW_CREDENTIALS:
            headers["Access-Control-Allow-Credentials"] = "true"
        headers["Access-Control-Allow-Methods"] = ", ".join(ALLOWED_METHODS)
        headers["Access-Control-Allow-Headers"] = acrh or "*"
        headers["Access-Control-Max-Age"] = str(CORS_MAX_AGE)

    return Response(status_code=204, headers=headers)

# ──────────────────────────────────────────────────────────────────────────────
# Alembic helpers
# ──────────────────────────────────────────────────────────────────────────────
async def verify_alembic_revision() -> None:
    if not async_engine:
        logger.warning("⚠️ Async engine not available; skipping Alembic revision check.")
        return
    try:
        async with async_engine.begin() as conn:
            result = await conn.execute(text("SELECT version_num FROM alembic_version"))
            db_rev = result.scalar()
            if db_rev:
                logger.info(f"✅ Current Alembic revision: {db_rev}")
            else:
                logger.warning("⚠️ No Alembic revision found in DB.")
    except Exception as e:
        logger.warning(f"⚠️ Alembic revision check failed: {e}")

def run_alembic_upgrade() -> None:
    try:
        cfg_path = Path(os.getenv("ALEMBIC_INI", "/app/alembic.ini"))
        alembic_cfg = AlembicConfig(str(cfg_path))
        if not alembic_cfg.get_main_option("script_location"):
            alembic_cfg.set_main_option("script_location", "app/migrations")
        alembic_command.upgrade(alembic_cfg, "head")
    except Exception as e:
        logger.error(f"❌ Failed to apply Alembic migrations: {e}")
        raise

# ──────────────────────────────────────────────────────────────────────────────
# Celery helpers (optional)
# ──────────────────────────────────────────────────────────────────────────────
async def verify_celery_workers() -> None:
    if celery_app_instance is None:
        logger.warning("⚠️ Celery not imported; worker health check skipped.")
        return

    loop = asyncio.get_event_loop()

    def _ping():
        try:
            return celery_app_instance.control.ping(timeout=1.0)
        except Exception as e:
            return e

    res = await loop.run_in_executor(None, _ping)
    if isinstance(res, Exception):
        logger.warning(f"⚠️ Celery ping failed: {res}")
    else:
        # res is a list of {hostname: "pong"} dicts; empty if no workers
        if res:
            logger.info(f"✅ Celery workers responding: {res}")
        else:
            logger.warning("⚠️ Celery ping returned no workers.")

# ──────────────────────────────────────────────────────────────────────────────
# Lifespan
# ──────────────────────────────────────────────────────────────────────────────
from fastapi import FastAPI as _FastAPI

@asynccontextmanager
async def lifespan(_: _FastAPI):
    try:
        snapshot = get_system_status_snapshot()
        logger.info("📊 System Snapshot on Startup:")
        for key, value in snapshot.items():
            logger.info(f"   {key}: {value}")

        docker_env = os.path.exists("/.dockerenv")
        logger.info(f"🐳 Running inside Docker: {docker_env}")
        logger.info(f"✅ CORS (list): {ALLOWED_ORIGINS}")
        logger.info(f"🎬 Boot Message: {random_boot_message()}")

        # Quick sanity logs for auth config (no secrets)
        logger.info(f"🔐 JWT_SECRET present: {bool(os.getenv('JWT_SECRET'))}")
        logger.info(f"🔐 SESSION_SECRET present: {bool(os.getenv('SESSION_SECRET'))}")
        logger.info(f"🔐 SECRET_KEY present: {bool(os.getenv('SECRET_KEY'))}")

        # Admin seed visibility (no secrets)
        try:
            admin_email = os.getenv("ADMIN_EMAIL") or getattr(settings, "admin_email", None) or "(unset)"
            force_update_raw = os.getenv("ADMIN_FORCE_UPDATE") or getattr(settings, "admin_force_update", "")
            force_update = str(force_update_raw).lower() in {"1", "true", "yes", "on"}
            logger.info("👑 Admin config: email=%s force_update=%s dsn=%s",
                        admin_email, force_update, _redact_dsn(_active_db_dsn()))
        except Exception as _e:
            logger.warning(f"⚠️ Admin config log failed: {_e}")

        try:
            run_alembic_upgrade()
            logger.info("✅ Alembic migrations applied at startup")
        except Exception as e:
            logger.warning(f"⚠️ Alembic migrations failed (continuing): {e}")

        await verify_alembic_revision()

        try:
            await verify_redis_connection()
            logger.info("✅ Redis connection OK")
        except Exception as e:
            logger.error(f"❌ Redis connection failed: {e}")

        try:
            await init_db()
        except Exception as e:
            logger.warning(f"⚠️ init_db failed/skipped: {e}")

        # Prefer scheduled startup hook; else fall back to direct call.
        if not _ADMIN_SEED_SCHEDULED and ensure_admin_user is not None:
            try:
                await ensure_admin_user()  # type: ignore[misc]
            except Exception as e:
                logger.warning(f"⚠️ ensure_admin_user failed/skipped: {e}")

        # Celery worker ping (non-fatal)
        try:
            await verify_celery_workers()
        except Exception as e:
            logger.warning(f"⚠️ Celery verify failed/skipped: {e}")

        startup_banner()
        logger.info("✅ Backend is up and ready to accept requests")
        yield

    except Exception:
        formatted_tb = "".join(traceback.format_exc())
        safe_stderr("=== STARTUP FAILURE ===\n" + formatted_tb)
        raise

app.router.lifespan_context = lifespan

# ──────────────────────────────────────────────────────────────────────────────
# Debug CORS middleware (optional)
# ──────────────────────────────────────────────────────────────────────────────
@app.middleware("http")
async def debug_origin(request: Request, call_next):
    if os.getenv("CORS_DEBUG", "0") == "1":
        origin = request.headers.get("origin")
        logger.debug(f"[CORS] Incoming Origin: {origin}")
        logger.debug(f"[CORS] Allowed (list): {ALLOWED_ORIGINS}")
        logger.debug(f"[CORS] {request.method} {request.url.path}")
    return await call_next(request)

# ──────────────────────────────────────────────────────────────────────────────
# Public health
# ──────────────────────────────────────────────────────────────────────────────
@app.get("/healthz", include_in_schema=False)
async def healthz():
    return {"status": "ok"}

@app.get("/api/v1/healthz", include_in_schema=False)
async def healthz_v1():
    return {"status": "ok"}

@app.get("/api/v1/system/status", include_in_schema=False)
async def system_status_public():
    return {"status": "ok"}

# Celery health (optional)
@app.get("/api/v1/celery/health", include_in_schema=False)
async def celery_health():
    if celery_app_instance is None:
        return {"status": "disabled"}
    loop = asyncio.get_event_loop()

    def _ping():
        try:
            return celery_app_instance.control.ping(timeout=1.0)
        except Exception as e:
            return e

    res = await loop.run_in_executor(None, _ping)
    if isinstance(res, Exception):
        return {"status": "error", "detail": str(res)}
    return {"status": "ok" if res else "noworkers", "workers": res}

# ──────────────────────────────────────────────────────────────────────────────
# Legacy avatar path compatibility
# ──────────────────────────────────────────────────────────────────────────────
@app.post("/api/v1/users/avatar", include_in_schema=False)
async def legacy_avatar_redirect():
    return RedirectResponse(url="/api/v1/avatar", status_code=status.HTTP_307_TEMPORARY_REDIRECT)

# default avatar helper (redirect to static file)
@app.get("/api/v1/avatar/default", include_in_schema=False)
async def default_avatar_default():
    return RedirectResponse(url="/static/default-avatar.png", status_code=status.HTTP_307_TEMPORARY_REDIRECT)

# ──────────────────────────────────────────────────────────────────────────────
# Static path resolution + mounts (with sane defaults + env backfill)
# ──────────────────────────────────────────────────────────────────────────────
def _resolve_path(*candidates: Optional[str], default: str) -> Path:
    for c in candidates:
        if isinstance(c, str) and c.strip():
            return Path(c).resolve()
    return Path(default).resolve()

# Prefer settings.* when present; fall back to env; then hard defaults.
uploads_path = _resolve_path(
    getattr(settings, "UPLOAD_DIR", None),
    getattr(settings, "upload_dir_raw", None),
    getattr(settings, "uploads_path", None),
    os.getenv("UPLOAD_DIR"),
    default="/uploads",
)
thumbnails_path = _resolve_path(
    getattr(settings, "THUMBNAILS_DIR", None),
    getattr(settings, "thumbnails_dir_raw", None),
    getattr(settings, "thumbnails_path", None),
    os.getenv("THUMBNAILS_DIR"),
    default="/thumbnails",
)
models_path = _resolve_path(
    os.getenv("MODELS_DIR"),
    getattr(settings, "MODEL_DIR", None),
    getattr(settings, "model_dir_raw", None),
    getattr(settings, "models_path", None),
    default="/models",
)

# static assets path (serves default-avatar.png)
static_path = _resolve_path(
    os.getenv("STATIC_DIR"),
    getattr(settings, "STATIC_DIR", None),
    "app/static",      # preferred inside backend
    "./static",        # if you dropped it here
    default="app/static",
)

# Backfill env so subprocesses / libraries see the same values
os.environ.setdefault("UPLOAD_DIR", str(uploads_path))
os.environ.setdefault("THUMBNAILS_DIR", str(thumbnails_path))
os.environ.setdefault("MODELS_DIR", str(models_path))
os.environ.setdefault("STATIC_DIR", str(static_path))
# Make Celery task's default THUMBNAIL_ROOT follow our thumbnails mount
os.environ.setdefault("THUMBNAIL_ROOT", str(thumbnails_path))

# Ensure dirs exist & are writable; log mount status
for label, path in (
    ("Uploads", uploads_path),
    ("Thumbnails", thumbnails_path),
    ("Models", models_path),
    ("Static", static_path),
):
    try:
        path.mkdir(parents=True, exist_ok=True)
        (path / ".write_test").touch()
        (path / ".write_test").unlink()
        logger.info(f"📁 {label} directory ready at: {path} (mount={os.path.ismount(path)})")
    except Exception as e:
        logger.error(f"❌ {label} path check failed at {path}: {e}")

logger.info(f"📂 Using uploads path: {uploads_path}")
logger.info(f"📂 Using thumbnails path: {thumbnails_path}")
logger.info(f"📂 Using models path: {models_path}")
logger.info(f"📂 Using static path: {static_path}")

# Expose canonical roots to routes
app.state.uploads_root = uploads_path
app.state.thumbnails_root = thumbnails_path
app.state.models_root = models_path
app.state.static_root = static_path

# Mount static directories
app.mount("/uploads", StaticFiles(directory=str(uploads_path), html=False, check_dir=True), name="uploads")
app.mount("/thumbnails", StaticFiles(directory=str(thumbnails_path), html=False, check_dir=True), name="thumbnails")
app.mount("/models", StaticFiles(directory=str(models_path), html=False, check_dir=True), name="models")
app.mount("/static", StaticFiles(directory=str(static_path), html=False, check_dir=True), name="static")

# ──────────────────────────────────────────────────────────────────────────────
# Minimal Celery-backed API for thumbnails (debug/ops)
# ──────────────────────────────────────────────────────────────────────────────
class ThumbnailJob(BaseModel):
  model_path: str = Field(..., description="Absolute path to STL/3MF on the server filesystem")
  model_id: str = Field(..., description="Model ID")
  user_id: str = Field(..., description="User ID")

@app.post("/api/v1/thumbnail", include_in_schema=False)
async def enqueue_thumbnail(job: ThumbnailJob):
    if generate_model_previews is None:
        raise HTTPException(status_code=503, detail="Celery worker not available.")
    task = generate_model_previews.delay(job.model_path, job.model_id, job.user_id)
    return {"status": "queued", "task_id": task.id}

@app.get("/api/v1/thumbnail/{task_id}", include_in_schema=False)
async def thumbnail_status(task_id: str):
    if celery_app_instance is None:
        raise HTTPException(status_code=503, detail="Celery worker not available.")
    # Avoid importing AsyncResult directly; use app instance for consistency
    result = celery_app_instance.AsyncResult(task_id)  # type: ignore[attr-defined]
    payload = {"task_id": task_id, "status": result.status}
    if result.ready():
        try:
            payload["result"] = result.result  # may be dict from the task
        except Exception:
            payload["result"] = None
    return payload

# ──────────────────────────────────────────────────────────────────────────────
# Mount helper + API routers
# ──────────────────────────────────────────────────────────────────────────────
def mount(router_module, prefix: str, tags: list[str]) -> None:
    router = getattr(router_module, "router", None)
    if router is None:
        logger.warning(f"⚠️ Router missing on module {router_module!r} ({prefix}); skipping mount.")
        return
    app.include_router(router, prefix=prefix, tags=tags)
    logger.info(f"🔌 Mounted: {prefix or '/'} — Tags: {', '.join(tags)}")

if health_router:
    app.include_router(health_router)

mount(auth, "/api/v1/auth", ["auth"])
mount(users, "/api/v1/users", ["users"])
mount(avatar, "/api/v1/avatar", ["avatar"])
mount(system, "/api/v1/system", ["system"])
mount(upload, "/api/v1", ["upload"])
mount(filaments, "/api/v1/filaments", ["filaments"])
mount(admin, "/api/v1/admin", ["admin"])
mount(cart, "/api/v1/cart", ["cart"])

if getattr(settings, "stripe_secret_key", ""):
    mount(checkout, "/api/v1/checkout", ["checkout"])
else:
    logger.warning("⚠️ STRIPE_SECRET_KEY is not set. Checkout routes not mounted.")

mount(models, "/api/v1/models", ["models"])
mount(metrics, "/metrics", ["metrics"])

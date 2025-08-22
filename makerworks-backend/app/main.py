# app/main.py

from __future__ import annotations

import asyncio
import logging
import os
import sys
import traceback
import inspect
import time
import re  # ← for duplicate error parsing
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
from pydantic import ValidationError

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
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip()
                if not key:
                    continue
                if (len(val) >= 2) and ((val[0] == val[-1]) and val[0] in ("'", '"')):
                    val = val[1:-1]
                if key not in os.environ:
                    os.environ[key] = val
                    count += 1
        safe_stderr(f"📦 Loaded {count} env keys from {path}")
    except FileNotFoundError:
        safe_stderr(f"📦 Env file not found: {path} (skipping)")
    except Exception:
        safe_stderr("📦 Env load error:\n" + "".join(traceback.format_exc()))
    return count

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
        def init_db():  # type: ignore
            return None

    # Routers: import modules (NOT aggregated router here)
    from app.routes import (
        admin, auth, avatar, cart, checkout, filaments, models,
        metrics, system, upload, users,
        inventory_levels, inventory_moves, user_inventory,
    )

    try:
        from app.routes.health import router as health_router  # type: ignore
    except Exception:
        health_router = None  # type: ignore

    from app.services.redis_service import redis_lifespan

    # 👑 Admin seeder: import direct ensure_admin_user
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

    # Celery hooks (optional)
    try:
        from app.worker.tasks import generate_model_previews  # Celery task
    except Exception:
        generate_model_previews = None  # type: ignore
    try:
        from app.worker import celery_app as celery_app_instance  # type: ignore
    except Exception:
        celery_app_instance = None  # type: ignore

except Exception:
    formatted_tb = "".join(traceback.format_exc())
    safe_stderr("=== STARTUP IMPORT FAILURE ===\n" + formatted_tb)
    raise

logger = logging.getLogger("uvicorn")

# ──────────────────────────────────────────────────────────────────────────────
# Small helper: call a fn whether it's sync or async
# ──────────────────────────────────────────────────────────────────────────────
async def _run_maybe_async(fn, *args, **kwargs):
    if fn is None:
        return None
    try:
        res = fn(*args, **kwargs)
        if inspect.isawaitable(res):
            return await res
        return res
    except TypeError:
        if inspect.iscoroutinefunction(fn):
            return await fn(*args, **kwargs)  # type: ignore
        raise

# ──────────────────────────────────────────────────────────────────────────────
# CORS helpers (robust parsing, credential-safe)
# ──────────────────────────────────────────────────────────────────────────────
def _clean_origin_token(token: str | None) -> Optional[str]:
    if token is None:
        return None
    t = str(token).strip()
    if not t:
        return None
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
    try:
        s = raw.strip()
        if s.startswith("[") and "'" in s and '"' not in s:
            parsed = _json.loads(s.replace("'", '"'))
            if isinstance(parsed, list):
                cleaned = [_clean_origin_token(x) for x in parsed]
                return [c for c in cleaned if c]
    except Exception:
        pass
    parts = [p for p in raw.split(",")]
    cleaned = [_clean_origin_token(p) for p in parts]
    return [c for c in cleaned if c]

def _normalize_origin(o: str | None) -> Optional[str]:
    return _clean_origin_token(o)

def resolve_allowed_origins() -> list[str]:
    origins: list[str] = []
    try:
        from_settings = getattr(settings, "cors_origins", None)
        if isinstance(from_settings, (list, tuple)):
            origins.extend([c for c in (_clean_origin_token(x) for x in from_settings) if c])
        elif isinstance(from_settings, str):
            origins.extend(_parse_cors_env(from_settings))
    except Exception:
        pass

    env_raw = os.getenv("CORS_ORIGINS", "")
    if env_raw:
        parsed = _parse_cors_env(env_raw)
        origins.extend(parsed)
        try:
            _json.loads(env_raw)
            parsed_ok = True
        except Exception:
            parsed_ok = False
        if not parsed_ok and any(ch in env_raw for ch in "[]'"):
            logger.warning("⚠️ CORS_ORIGINS looked malformed; parsed defensively: %r -> %s", env_raw, parsed)

    origins.extend([
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
    ])

    fe = os.getenv("FRONTEND_ORIGIN", "").strip()
    if fe:
        c = _clean_origin_token(fe)
        if c:
            origins.append(c)

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
        before_at, after_at = dsn.split("@", 1)
        proto, user_and_pass = before_at.split("://", 1)
        user = user_and_pass.split(":", 1)[0]
        return f"{proto}://{user}:***@{after_at}"
    except Exception:
        return "(redacted)"

def _active_db_dsn() -> Optional[str]:
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
# ──────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="MakerWorks API", version="1.0.0", description="MakerWorks backend API")
app.router.redirect_slashes = True

# ──────────────────────────────────────────────────────────────────────────────
# CORS FIRST (no regex when using credentials)
# ──────────────────────────────────────────────────────────────────────────────
ALLOWED_ORIGINS = resolve_allowed_origins()
ALLOW_CREDENTIALS = True
ALLOWED_METHODS: Sequence[str] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
ALLOWED_HEADERS: Sequence[str] = ["*"]
EXPOSED_HEADERS: Sequence[str] = ["set-cookie", "content-type"]
CORS_MAX_AGE = 86400  # 24h

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

@app.exception_handler(Exception)
async def unhandled_exc_handler(request: Request, exc: Exception):
    headers = _cors_headers_for_request(request)
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)

    p = request.url.path
    force_verbose = (
        p.startswith(("/api/v1/auth", "/api/v1/users"))
        or p.endswith(("/signup", "/register", "/login"))
    )

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

# ── smarter duplicate payloads ────────────────────────────────────────────────
_DUP_RE = re.compile(r"Key \((?P<cols>.+?)\)=\((?P<vals>.+?)\) already exists")

def _dup_payload_from_exc(exc: IntegrityError) -> dict:
    payload: dict = {"detail": "duplicate", "hint": "duplicate"}
    orig = getattr(exc, "orig", None)

    diag = getattr(orig, "diag", None)
    constraint = getattr(diag, "constraint_name", None)
    table = getattr(diag, "table_name", None)
    schema = getattr(diag, "schema_name", None)

    if constraint: payload["constraint"] = str(constraint)
    if table:      payload["table"] = str(table)
    if schema:     payload["schema"] = str(schema)

    msg = str(orig or exc)
    m = _DUP_RE.search(msg)
    if m:
        cols = [c.strip().strip('"') for c in m.group("cols").split(",")]
        vals = [v.strip() for v in m.group("vals").split(",")]
        payload["fields"] = cols
        payload["values"] = vals

    low_c = (constraint or "").lower() if constraint else ""
    low_t = (table or "").lower() if table else ""
    fields = [f.lower() for f in payload.get("fields", [])]

    if "user" in low_t:
        if "email" in low_c or "email" in fields:
            payload["hint"] = "email_taken"; return payload
        if "username" in low_c or "username" in fields:
            payload["hint"] = "username_taken"; return payload
        payload["hint"] = "user_duplicate"; return payload

    if "filament" in low_t or "uq_filament" in low_c or "filaments" in low_t:
        payload["hint"] = "filament_exists"; return payload

    if any(k in low_t for k in ("product", "variant", "sku")) or "sku" in fields:
        payload["hint"] = "sku_taken"; return payload

    return payload

@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    headers = _cors_headers_for_request(request)
    return JSONResponse(_dup_payload_from_exc(exc), status_code=409, headers=headers)

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
# Alembic + bootstrap helpers
# ──────────────────────────────────────────────────────────────────────────────
async def wait_for_db(timeout_sec: int = 45) -> bool:
    if not async_engine:
        logger.warning("⚠️ Async engine not available; skipping DB wait.")
        return False
    deadline = time.monotonic() + timeout_sec
    last_err: Optional[Exception] = None
    while time.monotonic() < deadline:
        try:
            async with async_engine.begin() as conn:
                await conn.execute(text("SELECT 1"))
            logger.info("[bootstrap] DB is reachable.")
            return True
        except Exception as e:
            last_err = e
            await asyncio.sleep(1.0)
    logger.warning("[bootstrap] DB not reachable after %ss: %s", timeout_sec, last_err)
    return False

def _find_alembic_ini() -> Path:
    candidates = [
        Path(os.getenv("ALEMBIC_INI", "")),
        Path("alembic.ini"),
        Path("/app/alembic.ini"),
    ]
    for c in candidates:
        if c and str(c) and c.exists():
            return c
    return Path("alembic.ini")  # harmless default; alembic will complain if missing

def _detect_script_location() -> str:
    for cand in ("alembic", "app/migrations", "migrations"):
        if Path(cand).exists():
            return cand
    return "alembic"

def run_alembic_upgrade() -> bool:
    try:
        cfg_path = _find_alembic_ini()
        alembic_cfg = AlembicConfig(str(cfg_path))
        if not alembic_cfg.get_main_option("script_location"):
            alembic_cfg.set_main_option("script_location", _detect_script_location())
        alembic_command.upgrade(alembic_cfg, "head")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to apply Alembic migrations: {e}")
        return False

async def create_all_fallback() -> None:
    try:
        try:
            from app.db.base import Base  # newer layout
        except Exception:
            from app.db.base_class import Base  # legacy layout
        if not async_engine:
            logger.warning("⚠️ No async engine; cannot run create_all fallback.")
            return
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("[bootstrap] Base.metadata.create_all completed.")
    except Exception as e2:
        logger.exception("[bootstrap] Fallback create_all() failed: %s", e2)

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

        logger.info(f"🔐 JWT_SECRET present: {bool(os.getenv('JWT_SECRET'))}")
        logger.info(f"🔐 SESSION_SECRET present: {bool(os.getenv('SESSION_SECRET'))}")
        logger.info(f"🔐 SECRET_KEY present: {bool(os.getenv('SECRET_KEY'))}")

        try:
            admin_email = os.getenv("ADMIN_EMAIL") or getattr(settings, "admin_email", None) or "(unset)"
            force_update_raw = os.getenv("ADMIN_FORCE_UPDATE") or getattr(settings, "admin_force_update", "")
            force_update = str(force_update_raw).lower() in {"1", "true", "yes", "on"}
            logger.info("👑 Admin config: email=%s force_update=%s dsn=%s",
                        admin_email, force_update, _redact_dsn(_active_db_dsn()))
        except Exception as _e:
            logger.warning(f"⚠️ Admin config log failed: {_e}")

        # 1) Ensure DB reachable
        await wait_for_db()

        # 2) Apply migrations; fallback to create_all if needed
        upgraded = run_alembic_upgrade()
        if upgraded:
            logger.info("✅ Alembic migrations applied at startup")
        else:
            logger.warning("⚠️ Alembic failed — falling back to ORM create_all()")
            await create_all_fallback()

        # 3) Log current revision
        await verify_alembic_revision()

        # 4) Redis startup tasks (non-fatal)
        try:
            async for _ in redis_lifespan():
                logger.info("✅ Redis startup tasks complete")
        except Exception as e:
            logger.error(f"❌ Redis startup tasks failed: {e}")

        # 5) App-specific DB initialization
        try:
            await _run_maybe_async(init_db)
        except Exception as e:
            logger.warning(f"⚠️ init_db failed/skipped: {e}")

        # 6) Ensure admin user exists (handles sync/async)
        try:
            if ensure_admin_user is None:
                logger.warning("⚠️ ensure_admin_user not available; skipping admin seed.")
            else:
                logger.info("[admin_seed] ensure_admin_user() starting…")
                await _run_maybe_async(ensure_admin_user)
                logger.info("[admin_seed] ensure_admin_user() finished.")
        except Exception as e:
            logger.exception("[admin_seed] ensure_admin_user crashed: %s", e)

        # 7) Celery worker ping (non-fatal)
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
static_path = _resolve_path(
    os.getenv("STATIC_DIR"),
    getattr(settings, "STATIC_DIR", None),
    "app/static",
    "./static",
    default="app/static",
)

os.environ.setdefault("UPLOAD_DIR", str(uploads_path))
os.environ.setdefault("THUMBNAILS_DIR", str(thumbnails_path))
os.environ.setdefault("MODELS_DIR", str(models_path))
os.environ.setdefault("STATIC_DIR", str(static_path))
os.environ.setdefault("THUMBNAIL_ROOT", str(thumbnails_path))

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

app.state.uploads_root = uploads_path
app.state.thumbnails_root = thumbnails_path
app.state.models_root = models_path
app.state.static_root = static_path

app.mount("/uploads", StaticFiles(directory=str(uploads_path), html=False, check_dir=True), name="uploads")
app.mount("/thumbnails", StaticFiles(directory=str(thumbnails_path), html=False, check_dir=True), name="thumbnails")
app.mount("/models", StaticFiles(directory=str(models_path), html=False, check_dir=True), name="models")
app.mount("/static", StaticFiles(directory=str(static_path), html=False, check_dir=True), name="static")

# ──────────────────────────────────────────────────────────────────────────────
# Minimal Celery-backed API for thumbnails (debug/ops)
# ──────────────────────────────────────────────────────────────────────────────
from pydantic import BaseModel, Field

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
    result = celery_app_instance.AsyncResult(task_id)  # type: ignore[attr-defined]
    payload = {"task_id": task_id, "status": result.status}
    if result.ready():
        try:
            payload["result"] = result.result
        except Exception:
            payload["result"] = None
    return payload

# ──────────────────────────────────────────────────────────────────────────────
# Mount helper + API routers
# ──────────────────────────────────────────────────────────────────────────────
def mount(router_module, prefix: str | None, tags: list[str] | None = None) -> None:
    """
    Include a router without accidentally double-prefixing.
    If the router already has a prefix (e.g., '/api/v1/filaments') and you
    also pass a prefix that overlaps, we drop the extra prefix.
    """
    router = getattr(router_module, "router", None)
    if router is None:
        logger.warning(f"⚠️ Router missing on module {router_module!r} ({prefix}); skipping mount.")
        return

    effective_prefix = prefix or ""
    try:
        existing = getattr(router, "prefix", "") or ""
        if existing and effective_prefix:
            # same, or overlapping? don't stack.
            if effective_prefix == existing or existing.startswith(effective_prefix) or effective_prefix.startswith(existing):
                effective_prefix = ""
    except Exception:
        pass

    app.include_router(router, prefix=effective_prefix, tags=tags)
    shown = existing if effective_prefix == "" else (effective_prefix or existing or "/")
    logger.info(f"🔌 Mounted: {shown} — Tags: {', '.join(tags or getattr(router, 'tags', []) or [])}")

if health_router:
    app.include_router(health_router)

# Specific first; broad later; upload LAST.
mount(auth,      "/api/v1/auth",      ["auth"])
mount(users,     "/api/v1/users",     ["users"])
mount(avatar,    "/api/v1/avatar",    ["avatar"])
mount(system,    "/api/v1/system",    ["system"])
mount(filaments, "/api/v1/filaments", ["filaments"])
mount(admin,     "/api/v1/admin",     ["admin"])
mount(cart,      "/api/v1/cart",      ["cart"])

# Inventory routes (these modules commonly define sub-prefixes themselves;
# the mount() helper will de-dupe if so)
mount(inventory_levels, "/api/v1", ["inventory"])
mount(inventory_moves,  "/api/v1", ["inventory"])
mount(user_inventory,   "/api/v1", ["user-inventory"])

if getattr(settings, "stripe_secret_key", ""):
    mount(checkout, "/api/v1/checkout", ["checkout"])
else:
    logger.warning("⚠️ STRIPE_SECRET_KEY is not set. Checkout routes not mounted.")

mount(models,    "/api/v1/models",    ["models"])
mount(metrics,   "/metrics",          ["metrics"])

UPLOAD_PREFIX = os.getenv("UPLOAD_API_PREFIX") or "/api/v1/upload"
if UPLOAD_PREFIX.rstrip("/") == "/api/v1":
    logger.warning("⚠️ UPLOAD_API_PREFIX is '/api/v1' which can shadow other routes; switching to '/api/v1/upload'.")
    UPLOAD_PREFIX = "/api/v1/upload"
mount(upload, UPLOAD_PREFIX, ["upload"])

# ──────────────────────────────────────────────────────────────────────────────
# Route inventory & duplicate detector (dev aid)
# ──────────────────────────────────────────────────────────────────────────────
def _dump_routes_inventory() -> None:
    from collections import defaultdict
    seen = defaultdict(list)
    for r in app.routes:
        path = getattr(r, "path", None)
        methods = sorted(list(getattr(r, "methods", set()) or []))
        name = getattr(r, "name", "")
        for m in (methods or ["_"]):
            seen[(m, path)].append(name)

    dups = []
    for (m, p), names in seen.items():
        if p and m != "HEAD" and len(names) > 1:
            dups.append((m, p, names))

    logger.info("🧭 Route count: %d", len(app.routes))
    if dups:
        logger.warning("🚨 Detected %d potentially duplicate method/path combos:", len(dups))
        for m, p, names in dups[:50]:
            logger.warning("   %s %s  ->  %s", m, p, ", ".join(names))
    else:
        logger.info("✅ No duplicate method/path combos detected.")

try:
    _dump_routes_inventory()
except Exception as e:
    logger.debug("route inventory failed: %s", e)

# quick dev helper to confirm filaments is mounted
@app.get("/api/v1/_has_filaments", include_in_schema=False)
async def has_filaments():
    return {
        "count": sum(1 for r in app.routes if getattr(r, "path", "").startswith("/api/v1/filaments")),
        "paths": [getattr(r, "path", "") for r in app.routes if "filament" in getattr(r, "path", "")],
    }

@app.get("/api/v1/_routes", include_in_schema=False)
async def routes_debug():
    items = []
    for r in app.routes:
        items.append({
            "path": getattr(r, "path", None),
            "name": getattr(r, "name", None),
            "methods": sorted(list(getattr(r, "methods", set()) or [])),
        })
    return {"count": len(items), "routes": items}

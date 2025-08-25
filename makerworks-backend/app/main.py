# app/main.py
from __future__ import annotations

import asyncio
import inspect
import json as _json
import logging
import os
import random
import re
import time
import traceback
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Sequence
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse, RedirectResponse
from starlette.staticfiles import StaticFiles

# ──────────────────────────────────────────────────────────────────────────────
# App config / dependencies (tolerant imports so the app still boots in dev)
# ──────────────────────────────────────────────────────────────────────────────
try:
    from app.core.config import settings  # your settings object
except Exception:  # pragma: no cover
    class _Settings:  # tiny stub so attribute access doesn’t explode
        env = "development"
        cors_origins: list[str] | str | None = None
        admin_email: str | None = None
        admin_force_update: bool | str | None = None

    settings = _Settings()  # type: ignore

try:
    from app.db.session import get_async_db, async_engine
except Exception:  # pragma: no cover
    async_engine = None

    async def get_async_db() -> AsyncSession:  # type: ignore
        raise RuntimeError("get_async_db unavailable")

try:
    from app.services.system import get_system_status_snapshot, random_boot_message, startup_banner
except Exception:  # pragma: no cover
    def get_system_status_snapshot() -> Dict[str, Any]:
        return {"uptime": "unknown", "env": getattr(settings, "env", "development")}

    def random_boot_message() -> str:
        return random.choice(["let’s print some plastic", "booting", "initializing"])

    def startup_banner() -> None:
        logging.getLogger("uvicorn").info("🌟 Startup complete")

try:
    # optional: redis lifespan helper
    from app.core.redis import lifespan as redis_lifespan  # async generator
except Exception:  # pragma: no cover
    async def redis_lifespan():
        if False:  # type: ignore
            yield None
        return

try:
    # optional: celery wiring
    from app.core.celery import celery_app as celery_app_instance  # type: ignore
except Exception:  # pragma: no cover
    celery_app_instance = None

try:
    # optional: initial DB seeding
    from app.db.init import init_db  # could be sync or async
except Exception:  # pragma: no cover
    init_db = None

try:
    # optional: admin seeding helper
    from app.services.admin_seed import ensure_admin_user  # could be sync or async
except Exception:  # pragma: no cover
    ensure_admin_user = None

# ORM models (optional at import time; endpoints below gracefully handle None)
try:
    from app.models import (
        PricingSettings,
        PricingVersion,
        Material,
        Printer,
        LaborRole,
        ProcessStep,
        QualityTier,
        Consumable,
        Rule,
    )
except Exception:  # pragma: no cover
    PricingSettings = PricingVersion = Material = Printer = LaborRole = ProcessStep = QualityTier = Consumable = Rule = None  # type: ignore

logger = logging.getLogger("uvicorn")

# ──────────────────────────────────────────────────────────────────────────────
# Unique operationId generator to avoid FastAPI duplicate warnings
# ──────────────────────────────────────────────────────────────────────────────
def generate_unique_id(route: APIRoute) -> str:
    method = sorted(route.methods)[0].lower() if route.methods else "get"
    safe_path = route.path.replace("/", "_").replace("{", "").replace("}", "")
    return f"{method}{safe_path}"

# ──────────────────────────────────────────────────────────────────────────────
# App
# ──────────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="MakerWorks API",
    version="1.0.0",
    description="MakerWorks backend API",
    generate_unique_id_function=generate_unique_id,
)
app.router.redirect_slashes = True

# ──────────────────────────────────────────────────────────────────────────────
# Little helpers
# ──────────────────────────────────────────────────────────────────────────────
def safe_stderr(msg: str) -> None:
    try:
        print(msg, file=os.sys.stderr, flush=True)
    except Exception:
        pass

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
            return await fn(*args, **kwargs)
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
    # 1) Try JSON list/string first
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

    # 2) Try bracketed list w/ quotes
    s = (raw or "").strip()
    if s.startswith("[") and s.endswith("]"):
        inner = s[1:-1]
        parts = [p.strip() for p in inner.split(",")]
        tokens: list[str] = []
        for p in parts:
            if len(p) >= 2 and ((p[0] == p[-1]) and p[0] in ("'", '"')):
                p = p[1:-1]
            tokens.append(p)
        cleaned = [_clean_origin_token(x) for x in tokens]
        return [c for c in cleaned if c]

    # 3) Fallback: comma separated
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

    origins.extend(
        [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:8000",
        ]
    )

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
    force_verbose = p.startswith(("/api/v1/auth", "/api/v1/users")) or p.endswith(("/signup", "/register", "/login"))

    env_name = os.getenv("ENV") or getattr(settings, "env", "development")
    dev_mode = (env_name.lower() != "production") or os.getenv("EXPOSE_ERRORS", "0") == "1"

    if dev_mode or force_verbose:
        tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        return JSONResponse(
            {"detail": str(exc), "error_type": type(exc).__name__, "trace": tb, "path": request.url.path, "method": request.method},
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

    if constraint:
        payload["constraint"] = str(constraint)
    if table:
        payload["table"] = str(table)
    if schema:
        payload["schema"] = str(schema)

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
            payload["hint"] = "email_taken"
            return payload
        if "username" in low_c or "username" in fields:
            payload["hint"] = "username_taken"
            return payload
        payload["hint"] = "user_duplicate"
        return payload

    if "filament" in low_t or "uq_filament" in low_c or "filaments" in low_t:
        payload["hint"] = "filament_exists"
        return payload

    if any(k in low_t for k in ("product", "variant", "sku")) or "sku" in fields:
        payload["hint"] = "sku_taken"
        return payload

    return payload

@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    headers = _cors_headers_for_request(request)
    return JSONResponse(_dup_payload_from_exc(exc), status_code=409, headers=headers)

@app.exception_handler(ValidationError)
async def validation_error_handler(request: Request, exc: ValidationError):
    headers = _cors_headers_for_request(request)
    return JSONResponse({"detail": "validation_error", "errors": exc.errors()}, status_code=422, headers=headers)

# ──────────────────────────────────────────────────────────────────────────────
# Manual OPTIONS (guarantee good preflight responses)
# ──────────────────────────────────────────────────────────────────────────────
@app.options("/{full_path:path}")
async def any_options(full_path: str, request: Request) -> Response:
    origin = _normalize_origin(request.headers.get("origin"))
    acrm = request.headers.get("access-control-request-method", "GET")
    acrh = request.headers.get("access-control-request-headers", "")

    logger.info(
        f"[CORS] Preflight OPTIONS {request.url.path} | Origin={origin} | "
        f"Req-Method={acrm} | Req-Headers={acrh} | Allowed={ALLOWED_ORIGINS}"
    )

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
    candidates = [Path(os.getenv("ALEMBIC_INI", "")), Path("alembic.ini"), Path("/app/alembic.ini")]
    for c in candidates:
        if c and str(c) and c.exists():
            return c
    return Path("alembic.ini")

def _detect_script_location() -> str:
    for cand in ("alembic", "app/migrations", "migrations"):
        if Path(cand).exists():
            return cand
    return "alembic"

def run_alembic_upgrade() -> bool:
    try:
        from alembic import command as alembic_command
        from alembic.config import Config as AlembicConfig
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
            return celery_app_instance.control.ping(timeout=1.0)  # type: ignore[attr-defined]
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

            admin_email = os.getenv("ADMIN_EMAIL") or getattr(settings, "admin_email", None) or "(unset)"
            force_update_raw = os.getenv("ADMIN_FORCE_UPDATE") or getattr(settings, "admin_force_update", "")
            force_update = str(force_update_raw).lower() in {"1", "true", "yes", "on"}
            logger.info("👑 Admin config: email=%s force_update=%s dsn=%s", admin_email, force_update, _redact_dsn(_active_db_dsn()))
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

# NEW: simple /_health that returns OK
@app.get("/_health", include_in_schema=False)
async def underscore_health():
    return {"ok": True}

# ──────────────────────────────────────────────────────────────────────────────
# VERSION endpoints — serve the repo's ./VERSION file (raw & JSON)
# ──────────────────────────────────────────────────────────────────────────────
def _find_version() -> str:
    here = Path(__file__).resolve()
    for p in [here, *here.parents]:
        vf = p / "VERSION"
        if vf.exists():
            try:
                return vf.read_text(encoding="utf-8").strip()
            except Exception:
                break
    return ""

@app.get("/VERSION", include_in_schema=False)
async def get_version_raw():
    v = _find_version()
    return Response(content=(v + "\n"), media_type="text/plain")

@app.get("/api/v1/system/version", include_in_schema=False)
async def get_version_json():
    return {"version": _find_version()}

# Celery health (optional)
@app.get("/api/v1/celery/health", include_in_schema=False)
async def celery_health():
    if celery_app_instance is None:
        raise HTTPException(status_code=503, detail="Celry worker not available.")
    loop = asyncio.get_event_loop()

    def _ping():
        try:
            return celery_app_instance.control.ping(timeout=1.0)  # type: ignore[attr-defined]
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

for label, path in (("Uploads", uploads_path), ("Thumbnails", thumbnails_path), ("Models", models_path), ("Static", static_path)):
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
class ThumbnailJob(BaseModel):
    model_path: str = Field(..., description="Absolute path to STL/3MF on the server filesystem")
    model_id: str = Field(..., description="Model ID")
    user_id: str = Field(..., description="User ID")

@app.post("/api/v1/thumbnail", include_in_schema=False)
async def enqueue_thumbnail(job: ThumbnailJob):
    try:
        from app.tasks.previews import generate_model_previews  # import here to avoid hard dep
    except Exception:
        generate_model_previews = None
    if generate_model_previews is None:
        raise HTTPException(status_code=503, detail="Celery worker not available.")
    task = generate_model_previews.delay(job.model_path, job.model_id, job.user_id)  # type: ignore[attr-defined]
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
            if effective_prefix == existing or existing.startswith(effective_prefix) or effective_prefix.startswith(existing):
                effective_prefix = ""
    except Exception:
        existing = ""

    app.include_router(router, prefix=effective_prefix, tags=tags)
    shown = existing if effective_prefix == "" else (effective_prefix or existing or "/")
    logger.info(f"🔌 Mounted: {shown} — Tags: {', '.join(tags or getattr(router, 'tags', []) or [])}")

# Optional health router
try:
    from app.routes.health import router as health_router  # type: ignore
    if health_router:
        app.include_router(health_router)
except Exception:
    pass

# Specific first; broad later; upload LAST.
from app.routes import (
    auth,
    users,
    avatar,
    system,
    filaments,
    admin,
    admin_backup,  # ← NEW
    cart,
    inventory_levels,
    inventory_moves,
    user_inventory,
    checkout,
    models as models_routes,
    metrics,
    upload,
)

mount(auth, "/api/v1/auth", ["auth"])
mount(users, "/api/v1/users", ["users"])
mount(avatar, "/api/v1/avatar", ["avatar"])
mount(system, "/api/v1/system", ["system"])
mount(filaments, "/api/v1/filaments", ["filaments"])
mount(admin, "/api/v1/admin", ["admin"])
mount(admin_backup, "/api/v1", ["admin.backup"])  # ← NEW: /api/v1/admin/backup/*
mount(cart, "/api/v1/cart", ["cart"])

# Inventory routes (some modules define sub-prefixes; the helper de-dupes)
mount(inventory_levels, "/api/v1", ["inventory"])
mount(inventory_moves, "/api/v1", ["inventory"])
mount(user_inventory, "/api/v1", ["user-inventory"])

if getattr(settings, "stripe_secret_key", ""):
    mount(checkout, "/api/v1/checkout", ["checkout"])
else:
    logger.warning("⚠️ STRIPE_SECRET_KEY is not set. Checkout routes not mounted.")

mount(models_routes, "/api/v1/models", ["models"])
mount(metrics, "/metrics", ["metrics"])

UPLOAD_PREFIX = os.getenv("UPLOAD_API_PREFIX") or "/api/v1/upload"
if UPLOAD_PREFIX.rstrip("/") == "/api/v1":
    logger.warning("⚠️ UPLOAD_API_PREFIX is '/api/v1' which can shadow other routes; switching to '/api/v1/upload'.")
    UPLOAD_PREFIX = "/api/v1/upload"
mount(upload, UPLOAD_PREFIX, ["upload"])

# Bambu Connect (LAN) — mount if present
try:
    from app.routes import bambu_connect  # router has prefix="/bambu"
    mount(bambu_connect, "/bambu", ["Bambu Connect"])
except Exception:
    pass

# ──────────────────────────────────────────────────────────────────────────────
# Read-only pricing/admin endpoints for the Admin UI (v2-safe)
# ──────────────────────────────────────────────────────────────────────────────
pricing_read = APIRouter(prefix="/api/v1", tags=["pricing-read"])
admin_read = APIRouter(prefix="/api/v1/admin", tags=["admin-read"])

class _ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

class PricingSettingsOut(_ORMBase):
    id: str | Any
    effective_from: datetime
    currency: str
    electricity_cost_per_kwh: float
    shop_overhead_per_day: float
    productive_hours_per_day: Optional[float] = None
    admin_note: Optional[str] = None

class MaterialOut(_ORMBase):
    id: str
    name: str
    type: Literal["FDM", "SLA"]
    cost_per_kg: Optional[float] = None
    cost_per_l: Optional[float] = None
    density_g_cm3: Optional[float] = None
    abrasive: bool
    waste_allowance_pct: float
    enabled: bool

class PrinterOut(_ORMBase):
    id: str
    name: str
    tech: Literal["FDM", "SLA"]
    nozzle_diameter_mm: Optional[float] = None
    chamber: Optional[bool] = None
    enclosed: Optional[bool] = None
    watts_idle: float
    watts_printing: float
    hourly_base_rate: float
    maintenance_rate_per_hour: float
    depreciation_per_hour: float
    enabled: bool

class LaborRoleOut(_ORMBase):
    id: str
    name: str
    hourly_rate: float
    min_bill_minutes: int

class ProcessStepOut(_ORMBase):
    id: str
    name: str
    default_minutes: int
    labor_role_id: str
    material_type_filter: Optional[Literal["FDM", "SLA"]] = None
    multiplier_per_cm3: Optional[float] = None
    enabled: bool

class QualityTierOut(_ORMBase):
    id: str
    name: str
    layer_height_mm: Optional[float] = None
    infill_pct: Optional[int] = None
    support_density_pct: Optional[int] = None
    qc_time_minutes: int
    price_multiplier: float
    notes: Optional[str] = None

class ConsumableOut(_ORMBase):
    id: str
    name: str
    unit: str
    cost_per_unit: float
    usage_per_print: float

class RuleOut(_ORMBase):
    id: str
    if_expression: str
    then_modifiers: Dict[str, Any]

class VersionRowOut(_ORMBase):
    id: str
    effective_from: datetime
    note: Optional[str] = None

async def _serialize_all(db: AsyncSession, model, out_schema, label: str):
    try:
        if model is None:
            logging.getLogger("uvicorn").warning("Model %s is None; returning []", label)
            return []
        res = await db.execute(select(model))
        rows = res.scalars().all()
        return [out_schema.model_validate(r, from_attributes=True) for r in rows]
    except Exception:
        logging.getLogger("uvicorn").exception("List fetch failed for %s", label)
        return []

def _dt_utc(s: str) -> datetime:
    try:
        if s.endswith("Z"):
            s = s.replace("Z", "+00:00")
        return datetime.fromisoformat(s)
    except Exception:
        return datetime.now(timezone.utc)

@pricing_read.get("/pricing/settings/latest", response_model=PricingSettingsOut)
async def pricing_settings_latest(db: AsyncSession = Depends(get_async_db)):
    if PricingSettings is None:
        return PricingSettingsOut(
            id="ver_dev",
            effective_from=_dt_utc("2025-01-01T00:00:00Z"),
            currency="CAD",
            electricity_cost_per_kwh=0.18,
            shop_overhead_per_day=35.0,
            productive_hours_per_day=6.0,
            admin_note="dev-fallback (models not imported)",
        )
    try:
        res = await db.execute(select(PricingSettings).order_by(PricingSettings.effective_from.desc()).limit(1))
        s = res.scalar_one_or_none()
        if not s:
            return PricingSettingsOut(
                id="ver_empty",
                effective_from=_dt_utc("2025-01-01T00:00:00Z"),
                currency="CAD",
                electricity_cost_per_kwh=0.18,
                shop_overhead_per_day=35.0,
                productive_hours_per_day=6.0,
                admin_note="seed-me",
            )
        return PricingSettingsOut.model_validate(s, from_attributes=True)
    except Exception:
        logging.getLogger("uvicorn").exception("Fetch latest PricingSettings failed")
        return PricingSettingsOut(
            id="ver_error",
            effective_from=_dt_utc("2025-01-01T00:00:00Z"),
            currency="CAD",
            electricity_cost_per_kwh=0.18,
            shop_overhead_per_day=35.0,
            productive_hours_per_day=6.0,
            admin_note="error-fallback",
        )

@pricing_read.get("/pricing/materials", response_model=List[MaterialOut])
async def pricing_materials(db: AsyncSession = Depends(get_async_db)):
    return await _serialize_all(db, Material, MaterialOut, "Material")

@pricing_read.get("/pricing/printers", response_model=List[PrinterOut])
async def pricing_printers(db: AsyncSession = Depends(get_async_db)):
    return await _serialize_all(db, Printer, PrinterOut, "Printer")

@pricing_read.get("/pricing/labor-roles", response_model=List[LaborRoleOut])
async def pricing_labor_roles(db: AsyncSession = Depends(get_async_db)):
    return await _serialize_all(db, LaborRole, LaborRoleOut, "LaborRole")

@pricing_read.get("/pricing/process-steps", response_model=List[ProcessStepOut])
async def pricing_process_steps(db: AsyncSession = Depends(get_async_db)):
    return await _serialize_all(db, ProcessStep, ProcessStepOut, "ProcessStep")

@pricing_read.get("/pricing/tiers", response_model=List[QualityTierOut])
async def pricing_tiers(db: AsyncSession = Depends(get_async_db)):
    return await _serialize_all(db, QualityTier, QualityTierOut, "QualityTier")

@pricing_read.get("/pricing/consumables", response_model=List[ConsumableOut])
async def pricing_consumables(db: AsyncSession = Depends(get_async_db)):
    return await _serialize_all(db, Consumable, ConsumableOut, "Consumable")

@pricing_read.get("/rules", response_model=List[RuleOut])
async def rules_root(db: AsyncSession = Depends(get_async_db)):
    return await _serialize_all(db, Rule, RuleOut, "Rule")

@pricing_read.get("/pricing/rules", response_model=List[RuleOut])
async def rules_pricing(db: AsyncSession = Depends(get_async_db)):
    return await _serialize_all(db, Rule, RuleOut, "Rule")

@admin_read.get("/rules", response_model=List[RuleOut])
async def admin_rules_get(db: AsyncSession = Depends(get_async_db)):
    return await _serialize_all(db, Rule, RuleOut, "Rule")

@pricing_read.get("/system/snapshot", response_model=List[VersionRowOut])
async def system_snapshot(db: AsyncSession = Depends(get_async_db)):
    try:
        if PricingVersion is not None:
            res = await db.execute(select(PricingVersion).order_by(PricingVersion.effective_from.desc()))
            rows = res.scalars().all()
            return [VersionRowOut.model_validate(r, from_attributes=True) for r in rows]
        if PricingSettings is not None:
            res2 = await db.execute(select(PricingSettings).order_by(PricingSettings.effective_from.desc()))
            rows2 = res2.scalars().all()
            out: List[VersionRowOut] = []
            for r in rows2:
                out.append(
                    VersionRowOut(
                        id=str(getattr(r, "id", getattr(r, "effective_from", "unknown"))),
                        effective_from=getattr(r, "effective_from", datetime.now(timezone.utc)),
                        note=getattr(r, "admin_note", None),
                    )
                )
            return out
    except Exception:
        logging.getLogger("uvicorn").exception("system_snapshot failed")
    return []

# mount the new routers
app.include_router(pricing_read)
app.include_router(admin_read)

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
        items.append(
            {
                "path": getattr(r, "path", None),
                "name": getattr(r, "name", None),
                "methods": sorted(list(getattr(r, "methods", set()) or [])),
            }
        )
    return {"count": len(items), "routes": items}

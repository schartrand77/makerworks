# app/main.py

import logging
import os
import re
import sys
import traceback
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, Sequence

from fastapi import FastAPI, Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

def safe_stderr(msg: str) -> None:
    try:
        os.write(sys.__stderr__.fileno(), msg.encode("utf-8"))
    except Exception:
        pass

# ──────────────────────────────────────────────────────────────────────────────
# Defensive imports
# ──────────────────────────────────────────────────────────────────────────────
try:
    from alembic.config import Config as AlembicConfig
    from alembic import command as alembic_command

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

    from app.routes import (
        admin, auth, avatar, cart, checkout, filaments, models,
        metrics, system, upload, users
    )

    try:
        from app.routes.health import router as health_router  # type: ignore
    except Exception:
        health_router = None  # type: ignore

    from app.services.cache.redis_service import verify_redis_connection
    from app.startup.admin_seed import ensure_admin_user
    from app.utils.boot_messages import random_boot_message
    from app.utils.system_info import get_system_status_snapshot

    try:
        from app.logging_config import startup_banner
    except Exception:
        def startup_banner() -> None:
            logging.getLogger("uvicorn").info("🚀 Backend startup (fallback banner)")
except Exception:
    formatted_tb = "".join(traceback.format_exc())
    safe_stderr("=== STARTUP IMPORT FAILURE ===\n" + formatted_tb + "\n")
    raise

logger = logging.getLogger("uvicorn")

# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────
def _parse_csv_env(name: str) -> list[str]:
    raw = os.getenv(name, "")
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]

def _normalize_origin(o: str) -> Optional[str]:
    if not o:
        return None
    o = o.strip()
    if o.startswith(("http://", "https://")):
        return o
    return f"http://{o}"

def resolve_allowed_origins() -> list[str]:
    from_settings = getattr(settings, "cors_origins", None)
    if isinstance(from_settings, (list, tuple)) and from_settings:
        origins = list(from_settings)
    else:
        env_origins = _parse_csv_env("CORS_ORIGINS")
        origins = env_origins if env_origins else [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://192.168.1.170:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]
    norm = []
    seen = set()
    for o in origins:
        n = _normalize_origin(o)
        if n and n not in seen:
            seen.add(n)
            norm.append(n)
    # Optional explicit single origin override
    frontend_origin = _normalize_origin(os.getenv("FRONTEND_ORIGIN", ""))
    if frontend_origin and frontend_origin not in seen:
        norm.append(frontend_origin)
    return norm

# ──────────────────────────────────────────────────────────────────────────────
# App
# ──────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="MakerWorks API", version="1.0.0", description="MakerWorks backend API")
app.router.redirect_slashes = True

# ──────────────────────────────────────────────────────────────────────────────
# CORS FIRST
# ──────────────────────────────────────────────────────────────────────────────
ALLOWED_ORIGINS = resolve_allowed_origins()
ALLOW_CREDENTIALS = True
ALLOWED_METHODS: Sequence[str] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
# Allow ANY header (uploads/chunking often use custom X-* headers)
ALLOWED_HEADERS: Sequence[str] = ["*"]
EXPOSED_HEADERS: Sequence[str] = ["*"]
CORS_MAX_AGE = 86400  # 24h

# Regex safety net for dev. Set CORS_ALLOW_ALL=1 to allow any http(s) origin.
if os.getenv("CORS_ALLOW_ALL", "0") == "1":
    allow_origin_regex = r"^https?://.+$"
else:
    # Common dev hosts/ports (localhost, 127.0.0.1, 192.168.x.x)
    allow_origin_regex = r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_methods=list(ALLOWED_METHODS),
    allow_headers=list(ALLOWED_HEADERS),   # wildcard
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
# Global exception handlers that keep ACAO on errors (so the browser chills)
# ──────────────────────────────────────────────────────────────────────────────
def _cors_headers_for_request(request: Request) -> dict:
    origin = request.headers.get("origin")
    if not origin:
        return {}
    ok = origin in ALLOWED_ORIGINS or re.match(allow_origin_regex, origin)
    if not ok:
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
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    headers = _cors_headers_for_request(request)
    return JSONResponse({"detail": "Internal server error"}, status_code=500, headers=headers)

# ──────────────────────────────────────────────────────────────────────────────
# Manual OPTIONS (still useful for debugging/logging)
# ──────────────────────────────────────────────────────────────────────────────
@app.options("/{full_path:path}")
async def any_options(full_path: str, request: Request) -> Response:
    origin = request.headers.get("origin")
    acrm = request.headers.get("access-control-request-method", "GET")
    acrh = request.headers.get("access-control-request-headers", "")

    # Verbose diagnostic
    logger.info(f"[CORS] Preflight OPTIONS {request.url.path} | Origin={origin} | "
                f"Req-Method={acrm} | Req-Headers={acrh} | Allowed={ALLOWED_ORIGINS} | Regex={allow_origin_regex}")

    headers = {}
    if origin:
        headers["Vary"] = "Origin"
        ok = origin in ALLOWED_ORIGINS or re.match(allow_origin_regex, origin)
        if ok:
            headers["Access-Control-Allow-Origin"] = origin
            if ALLOW_CREDENTIALS:
                headers["Access-Control-Allow-Credentials"] = "true"
            headers["Access-Control-Allow-Methods"] = ", ".join(ALLOWED_METHODS)
            # Echo what the browser asked for; don't hardcode
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
        logger.info(f"✅ CORS (regex): {allow_origin_regex}")
        logger.info(f"🎬 Boot Message: {random_boot_message()}")

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

        try:
            await ensure_admin_user()
        except Exception as e:
            logger.warning(f"⚠️ ensure_admin_user failed/skipped: {e}")

        startup_banner()
        logger.info("✅ Backend is up and ready to accept requests")
        yield

    except Exception:
        formatted_tb = "".join(traceback.format_exc())
        safe_stderr("=== STARTUP FAILURE ===\n" + formatted_tb + "\n")
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
        logger.debug(f"[CORS] Allowed (regex): {allow_origin_regex}")
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

# ──────────────────────────────────────────────────────────────────────────────
# Legacy avatar path compatibility: `/api/v1/users/avatar` → `/api/v1/avatar`
# ──────────────────────────────────────────────────────────────────────────────
@app.post("/api/v1/users/avatar", include_in_schema=False)
async def legacy_avatar_redirect():
    # 307 preserves method & body (needed for file upload)
    return RedirectResponse(url="/api/v1/avatar", status_code=status.HTTP_307_TEMPORARY_REDIRECT)

# ──────────────────────────────────────────────────────────────────────────────
# Route listing
# ──────────────────────────────────────────────────────────────────────────────
@app.get("/debug/routes", include_in_schema=False)
async def debug_routes():
    if not bool(getattr(settings, "debug", False)):
        raise HTTPException(status_code=404, detail="Route not available.")
    routes_info = []
    for route in app.router.routes:
        routes_info.append({
            "path": getattr(route, "path", None),
            "name": getattr(route, "name", None),
            "methods": list(getattr(route, "methods", [])),
            "tags": getattr(route, "tags", []),
        })
    return JSONResponse(routes_info)

# ──────────────────────────────────────────────────────────────────────────────
# Mount helper
# ──────────────────────────────────────────────────────────────────────────────
def mount(router, prefix: str, tags: list[str]) -> None:
    app.include_router(router, prefix=prefix, tags=tags)
    logger.info(f"🔌 Mounted: {prefix or '/'} — Tags: {', '.join(tags)}")

# ──────────────────────────────────────────────────────────────────────────────
# Mount routes
# ──────────────────────────────────────────────────────────────────────────────
if health_router:
    app.include_router(health_router)

mount(auth.router, "/api/v1/auth", ["auth"])
mount(users.router, "/api/v1/users", ["users"])
mount(avatar.router, "/api/v1/avatar", ["avatar"])
mount(system.router, "/api/v1/system", ["system"])
mount(upload.router, "/api/v1", ["upload"])
mount(filaments.router, "/api/v1/filaments", ["filaments"])
mount(admin.router, "/api/v1/admin", ["admin"])
mount(cart.router, "/api/v1/cart", ["cart"])

if getattr(settings, "stripe_secret_key", ""):
    mount(checkout.router, "/api/v1/checkout", ["checkout"])
else:
    logger.warning("⚠️ STRIPE_SECRET_KEY is not set. Checkout routes not mounted.")

mount(models.router, "/api/v1/models", ["models"])
mount(metrics.router, "/metrics", ["metrics"])

# ──────────────────────────────────────────────────────────────────────────────
# Static mounts
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
    default="/uploads/models",
)

for label, path in (("Uploads", uploads_path), ("Thumbnails", thumbnails_path), ("Models", models_path)):
    try:
        path.mkdir(parents=True, exist_ok=True)
        (path / ".write_test").touch()
        (path / ".write_test").unlink()
        logger.info(f"📁 {label} directory ready at: {path}")
    except Exception as e:
        logger.error(f"❌ {label} path check failed: {e}")

logger.info(f"📂 Using uploads path: {uploads_path}")
logger.info(f"📂 Using thumbnails path: {thumbnails_path}")
logger.info(f"📂 Using models path: {models_path}")

# Make the canonical roots visible to routes (e.g., avatar) so everyone writes to the same place.
app.state.uploads_root = uploads_path
app.state.thumbnails_root = thumbnails_path
app.state.models_root = models_path

app.mount("/uploads", StaticFiles(directory=str(uploads_path), html=False, check_dir=True), name="uploads")
app.mount("/thumbnails", StaticFiles(directory=str(thumbnails_path), html=False, check_dir=True), name="thumbnails")
app.mount("/models", StaticFiles(directory=str(models_path), html=False, check_dir=True), name="models")

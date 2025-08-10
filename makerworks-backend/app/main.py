# app/main.py

import logging
import os
import sys
import traceback
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.sessions import SessionMiddleware

def safe_stderr(msg: str):
    """Low-level safe write to stderr for startup/debug logs."""
    try:
        os.write(sys.__stderr__.fileno(), msg.encode("utf-8"))
    except Exception:
        pass

# Defensive import of core dependencies so startup errors are visible
try:
    from alembic.config import Config as AlembicConfig
    from alembic import command as alembic_command

    from app.config.settings import settings
    from app.db.database import init_db
    from app.db.session import async_engine
    from app.db.base import Base
    from app.routes import (
        admin, auth, avatar, cart, checkout, filaments, models,
        metrics, system, upload, users
    )
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

# ─── App Initialization ─────────────────────────────
app = FastAPI(title="MakerWorks API", version="1.0.0", description="MakerWorks backend API")
app.router.redirect_slashes = True  # Let FastAPI handle /path vs /path/ equivalently

# ─── Session Middleware ─────────────────────────────
SESSION_SECRET = os.getenv("SESSION_SECRET", "supersecretkey")
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    same_site="strict" if settings.env == "production" else "lax",
    https_only=settings.env == "production"
)

# ─── CORS + Compression ─────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ─── Alembic Revision Check ─────────────────────────
async def verify_alembic_revision():
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

def run_alembic_upgrade():
    """Apply Alembic migrations programmatically at startup."""
    try:
        alembic_cfg = AlembicConfig("/app/alembic.ini")
        alembic_command.upgrade(alembic_cfg, "head")
    except Exception as e:
        logger.error(f"❌ Failed to apply Alembic migrations: {e}")
        raise

# ─── Lifespan Tasks ─────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        snapshot = get_system_status_snapshot()
        logger.info("📊 System Snapshot on Startup:")
        for key, value in snapshot.items():
            logger.info(f"   {key}: {value}")

        docker_env = os.path.exists("/.dockerenv")
        logger.info(f"🐳 Running inside Docker: {docker_env}")
        logger.info(f"✅ CORS origins allowed: {settings.cors_origins}")
        logger.info(f"🎬 Boot Message: {random_boot_message()}")

        # Ensure DB schema exists
        try:
            async with async_engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("✅ Ensured all tables exist (auto-created missing tables).")
        except Exception as e:
            logger.error(f"❌ Failed to auto-create tables: {e}")

        # Run Alembic migrations
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

        await init_db()
        await ensure_admin_user()

        startup_banner()
        logger.info("✅ Backend is up and ready to accept requests")
        yield

    except Exception:
        formatted_tb = "".join(traceback.format_exc())
        safe_stderr("=== STARTUP FAILURE ===\n" + formatted_tb + "\n")
        raise

app.router.lifespan_context = lifespan

# ─── Debug CORS Middleware ──────────────────────────
@app.middleware("http")
async def debug_origin(request: Request, call_next):
    origin = request.headers.get("origin")
    logger.debug(f"[CORS] Incoming Origin: {origin}")
    logger.debug(f"[CORS] Allowed Origins: {settings.cors_origins}")
    return await call_next(request)

# ─── Debug Routes Endpoint ──────────────────────────
@app.get("/debug/routes", include_in_schema=False)
async def debug_routes():
    if not settings.debug:
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

# ─── Mount Helper ───────────────────────────────────
def mount(router, prefix: str, tags: list[str]):
    app.include_router(router, prefix=prefix, tags=tags)
    logger.info(f"🔌 Mounted: {prefix or '/'} — Tags: {', '.join(tags)}")

# ─── Mount All Routes ───────────────────────────────
mount(auth.router, "/api/v1/auth", ["auth"])
mount(users.router, "/api/v1/users", ["users"])
mount(avatar.router, "/api/v1/avatar", ["avatar"])
mount(system.router, "/api/v1/system", ["system"])
mount(upload.router, "/api/v1/upload", ["upload"])
mount(filaments.router, "/api/v1/filaments", ["filaments"])
mount(admin.router, "/api/v1/admin", ["admin"])
mount(cart.router, "/api/v1/cart", ["cart"])

if settings.stripe_secret_key:
    mount(checkout.router, "/api/v1/checkout", ["checkout"])
else:
    logger.warning("⚠️ STRIPE_SECRET_KEY is not set. Checkout routes not mounted.")

mount(models.router, "/api/v1/models", ["models"])
mount(metrics.router, "/metrics", ["metrics"])

# ─── Mount Static Directories ───────────────────────
# Uploads (user files)
uploads_path = Path(settings.uploads_path or "/uploads").resolve()
try:
    uploads_path.mkdir(parents=True, exist_ok=True)
    (uploads_path / ".write_test").touch()
    (uploads_path / ".write_test").unlink()
    logger.info(f"📁 Uploads directory ready at: {uploads_path}")
except Exception as e:
    logger.error(f"❌ Uploads path check failed: {e}")
logger.info(f"📂 Active uploads path from settings: {settings.uploads_path}")
logger.info(f"📂 Resolved absolute path: {uploads_path}")
app.mount("/uploads", StaticFiles(directory=str(uploads_path), html=False, check_dir=True), name="uploads")
logger.info(f"📁 Uploads served from {uploads_path} at /uploads")

# Thumbnails (flat library keyed by model id)
thumbnails_path = Path(getattr(settings, "thumbnails_path", "/thumbnails")).resolve()
try:
    thumbnails_path.mkdir(parents=True, exist_ok=True)
    (thumbnails_path / ".write_test").touch()
    (thumbnails_path / ".write_test").unlink()
    logger.info(f"📁 Thumbnails directory ready at: {thumbnails_path}")
except Exception as e:
    logger.error(f"❌ Thumbnails path check failed: {e}")
logger.info(f"📂 Active thumbnails path from settings: {getattr(settings, 'thumbnails_path', None)}")
logger.info(f"📂 Resolved absolute path: {thumbnails_path}")
app.mount("/thumbnails", StaticFiles(directory=str(thumbnails_path), html=False, check_dir=True), name="thumbnails")
logger.info(f"📁 Thumbnails served from {thumbnails_path} at /thumbnails")

# /app/startup/admin_seed.py
import asyncio
import datetime as dt
import logging
import os
from typing import Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import User
from app.utils.security import hash_password
from app.config.settings import settings  # Pydantic settings (loads .env.dev)
from app.db.database import async_session_maker  # same async session the app uses

log = logging.getLogger(__name__)

# --- Admin config from env/settings with sensible defaults ---
ADMIN_EMAIL: str = (
    os.getenv("ADMIN_EMAIL")
    or getattr(settings, "admin_email", None)
    or "admin@example.com"
)
ADMIN_USERNAME: str = (
    os.getenv("ADMIN_USERNAME")
    or getattr(settings, "admin_username", None)
    or "admin"
)
ADMIN_PASSWORD: str = (
    os.getenv("ADMIN_PASSWORD")
    or getattr(settings, "admin_password", None)
    or "change-me-please"
)
# If true, update the existing admin’s password & flags from env on startup.
ADMIN_FORCE_UPDATE: bool = (
    str(os.getenv("ADMIN_FORCE_UPDATE", "") or getattr(settings, "admin_force_update", "")).lower()
    in {"1", "true", "yes", "on"}
)

# Passwords we refuse to seed or rotate to (because… obviously).
PLACEHOLDER_PASSWORDS = {
    "change-me-please",
    "please-use-a-strong-unique-value",
    "changeme",
    "password",
    "admin",
    "",
}

def _redact_dsn(dsn: Optional[str]) -> str:
    if not dsn:
        return "(unset)"
    try:
        # postgresql+asyncpg://user:pass@host:5432/db
        before_at, after_at = dsn.split("@", 1)
        proto, user_and_pass = before_at.split("://", 1)
        user = user_and_pass.split(":", 1)[0]
        return f"{proto}://{user}:***@{after_at}"
    except Exception:
        return "(redacted)"

async def ensure_admin_user() -> None:
    """
    Ensure there is an admin user. If not present, create one from env/settings.
    If ADMIN_FORCE_UPDATE=true, update password/flags on each startup.
    Skips creation/rotation if ADMIN_PASSWORD is a placeholder.
    Safe to run multiple times (idempotent).
    """
    # Visibility (no secrets)
    dsn = getattr(settings, "database_url", None) or getattr(settings, "ASYNCPG_URL", None)
    log.info(
        "[admin_seed] DB=%s  admin_email=%s  force_update=%s",
        _redact_dsn(dsn),
        ADMIN_EMAIL,
        ADMIN_FORCE_UPDATE,
    )

    # Normalize inputs a bit
    admin_email = (ADMIN_EMAIL or "").strip()
    admin_username = (ADMIN_USERNAME or "").strip()
    admin_password = (ADMIN_PASSWORD or "").strip()

    async with async_session_maker() as session:  # type: AsyncSession
        # Wait for users table to exist (e.g., Alembic just ran)
        exists = await session.execute(
            text("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')")
        )
        if not bool(exists.scalar()):
            log.warning("[admin_seed] 'users' table not ready; skipping this cycle.")
            return

        # Look for the admin by email first
        res = await session.execute(select(User).where(User.email == admin_email))
        admin = res.scalar_one_or_none()

        # --- Admin exists: maybe rotate and/or fix flags ---
        if admin:
            changed = False

            # Only rotate password if explicitly forced AND not a placeholder
            if ADMIN_FORCE_UPDATE:
                if admin_password.lower() in PLACEHOLDER_PASSWORDS:
                    log.warning(
                        "[admin_seed] Skipping password rotation: ADMIN_PASSWORD is a placeholder."
                    )
                else:
                    admin.hashed_password = hash_password(admin_password)
                    changed = True
                    log.info("[admin_seed] ✅ Rotated admin password.")

            # Ensure privilege & flags every boot (idempotent)
            if getattr(admin, "role", None) != "admin":
                admin.role = "admin"; changed = True
            if getattr(admin, "is_verified", False) is not True:
                admin.is_verified = True; changed = True
            if getattr(admin, "is_active", False) is not True:
                admin.is_active = True; changed = True

            # Keep username in sync with env if possible (respect unique constraint in DB)
            if getattr(admin, "username", None) != admin_username and admin_username:
                admin.username = admin_username
                changed = True

            if changed:
                admin.updated_at = dt.datetime.utcnow()
                await session.commit()
                log.info("[admin_seed] ✅ Admin updated.")
            else:
                log.info("[admin_seed] ✅ Admin already present; no changes.")
            return

        # --- No admin with that email: respect any existing admin unless forced ---
        res2 = await session.execute(select(User).where(User.role == "admin"))
        other_admin = res2.scalar_one_or_none()
        if other_admin and not ADMIN_FORCE_UPDATE:
            log.info(
                "[admin_seed] ⚠️ Found existing admin '%s' (email=%s); leaving as-is. "
                "Set ADMIN_FORCE_UPDATE=true to override with env.",
                other_admin.username,
                other_admin.email,
            )
            return

        # --- Create the admin (but not with a garbage password) ---
        if admin_password.lower() in PLACEHOLDER_PASSWORDS:
            log.warning(
                "[admin_seed] Refusing to create admin: ADMIN_PASSWORD is a placeholder."
            )
            return

        new_admin = User(
            email=admin_email,
            username=admin_username or "admin",
            hashed_password=hash_password(admin_password),
            role="admin",
            is_verified=True,
            is_active=True,
            created_at=dt.datetime.utcnow(),
            updated_at=dt.datetime.utcnow(),
            last_login=dt.datetime.utcnow(),
        )
        session.add(new_admin)
        await session.commit()
        log.info("[admin_seed] 🎉 Created admin '%s' <%s>.", new_admin.username, new_admin.email)

def schedule_admin_seed_on_startup(app):
    """
    Call from FastAPI app factory to run the seeder on startup without blocking.
    Example:
      from app.startup.admin_seed import schedule_admin_seed_on_startup
      app = FastAPI()
      schedule_admin_seed_on_startup(app)
    """
    @app.on_event("startup")
    async def _seed_event():
        try:
            await ensure_admin_user()
        except Exception as e:
            log.exception("[admin_seed] Failed: %s", e)

if __name__ == "__main__":
    # Handy for manual runs:  python -m app.startup.admin_seed
    asyncio.run(ensure_admin_user())

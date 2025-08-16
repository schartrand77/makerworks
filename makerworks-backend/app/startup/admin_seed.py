# app/startup/admin_seed.py
from __future__ import annotations

import logging
import os
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

# session + models
try:
    from app.db.database import async_session_maker
except Exception as e:
    raise RuntimeError("async_session_maker not available") from e

from app.models.models import User  # uses 'role' string, hashed_password, etc.

log = logging.getLogger("admin_seed")


# --- password hashing resolver ------------------------------------------------
def _resolve_hasher():
    """
    Try to reuse the app's own password hasher; fall back to passlib bcrypt.
    """
    # Preferred: your auth service hasher
    try:
        from app.services.auth_service import get_password_hash as _hash  # type: ignore
        return _hash
    except Exception:
        pass
    # Alternate conventional location
    try:
        from app.core.security import get_password_hash as _hash  # type: ignore
        return _hash
    except Exception:
        pass
    # Fallback: passlib's bcrypt
    try:
        from passlib.hash import bcrypt as _bcrypt  # type: ignore
        return lambda s: _bcrypt.hash(s)
    except Exception as e:
        raise RuntimeError(
            "No password hasher available. Install passlib[bcrypt] or expose get_password_hash()."
        ) from e


# --- helpers ------------------------------------------------------------------
def _bool_env(name: str, default: bool = False) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return str(val).strip().lower() in {"1", "true", "yes", "on"}


async def _get_admin_count(session: AsyncSession) -> int:
    q = select(func.count()).select_from(User).where(
        func.lower(func.coalesce(User.role, "")) == "admin"
    )
    return int((await session.execute(q)).scalar_one())


async def _get_user_by_email(session: AsyncSession, email: str) -> Optional[User]:
    q = select(User).where(func.lower(User.email) == func.lower(email)).limit(1)
    res = await session.execute(q)
    return res.scalars().first()


async def _username_taken(session: AsyncSession, username: str) -> bool:
    q = select(func.count()).select_from(User).where(
        func.lower(User.username) == func.lower(username)
    )
    return int((await session.execute(q)).scalar_one()) > 0


async def ensure_admin_user() -> None:
    """
    Idempotently ensure there's at least one admin.
    - If ADMIN_EMAIL exists:
        - create it if missing;
        - if present and ADMIN_FORCE_UPDATE=true, normalize role/flags and reset password if provided.
    - If no ADMIN_EMAIL set and no admins exist: create a default admin user.
    Writes the first-generated password to ADMIN_FIRST_PASSWORD_FILE (default: /app/.admin_first_password)
    so first-run users can log in.
    """
    hasher = _resolve_hasher()

    # Config (env-first; reasonable defaults)
    email = os.getenv("ADMIN_EMAIL", "admin@example.com").strip()
    username = os.getenv("ADMIN_USERNAME", "admin").strip()
    pwd_env = os.getenv("ADMIN_PASSWORD", "").strip()
    force_update = _bool_env("ADMIN_FORCE_UPDATE", False)

    first_pw_file = os.getenv("ADMIN_FIRST_PASSWORD_FILE", "/app/.admin_first_password")

    generated_password = ""
    if not pwd_env:
        # generate a strong password for first run if none was supplied
        generated_password = secrets.token_urlsafe(18)
        password_to_set = generated_password
    else:
        password_to_set = pwd_env

    async with async_session_maker() as session:  # type: AsyncSession
        # If any admin exists and we are NOT forcing an update, bail out early.
        admin_count = await _get_admin_count(session)
        target_user = await _get_user_by_email(session, email)

        if target_user is None and admin_count > 0 and not force_update:
            log.info("[admin_seed] Admins already present (%d). Nothing to do.", admin_count)
            return

        # Create or update the configured admin account
        if target_user is None:
            # ensure username uniqueness
            base_username = username or "admin"
            final_username = base_username
            if await _username_taken(session, final_username):
                final_username = f"{base_username}-{str(uuid.uuid4())[:6]}"

            u = User(
                id=uuid.uuid4(),
                email=email,
                username=final_username,
                hashed_password=hasher(password_to_set),
                role="admin",
                is_verified=True,
                is_active=True,
                created_at=datetime.now(timezone.utc),
            )
            session.add(u)
            await session.commit()
            log.warning(
                "[admin_seed] Created admin user email=%s username=%s (force=%s)",
                email, final_username, force_update,
            )

            # If we generated the password, persist it for the installer
            if generated_password:
                try:
                    # avoid overwriting if already exists
                    if not os.path.exists(first_pw_file):
                        with open(first_pw_file, "w", encoding="utf-8") as fh:
                            fh.write(f"{email}:{generated_password}\n")
                    os.chmod(first_pw_file, 0o600)
                    log.warning(
                        "[admin_seed] First admin password written to %s. "
                        "DELETE THIS FILE after first login.",
                        first_pw_file,
                    )
                except Exception as e:
                    log.error("[admin_seed] Failed to write first password file: %s", e)

            return

        # target_user exists
        if force_update:
            changed = False
            # normalize role/flags
            if (target_user.role or "").lower() != "admin":
                target_user.role = "admin"; changed = True
            if getattr(target_user, "is_verified", False) is False:
                target_user.is_verified = True; changed = True
            if getattr(target_user, "is_active", True) is False:
                target_user.is_active = True; changed = True
            # rotate password only if ADMIN_PASSWORD provided; we never overwrite an existing
            # password with a *new* random one on force unless the caller explicitly set it.
            if pwd_env:
                target_user.hashed_password = hasher(password_to_set); changed = True

            if changed:
                await session.commit()
                log.warning(
                    "[admin_seed] Force-updated admin user email=%s (role/flags%s).",
                    email,
                    " +password" if pwd_env else "",
                )
            else:
                log.info("[admin_seed] No changes required for %s.", email)
        else:
            # Not forcing update and user exists: ensure it's admin (be safe)
            if (target_user.role or "").lower() != "admin":
                target_user.role = "admin"
                target_user.is_verified = True
                target_user.is_active = True
                await session.commit()
                log.warning("[admin_seed] Promoted existing %s to admin.", email)


def schedule_admin_seed_on_startup(app) -> None:
    """
    Optional: attach to FastAPI startup for apps not using lifespan to call ensure_admin_user().
    Your main.py already calls this if available.
    """
    @app.on_event("startup")
    async def _seed():
        try:
            await ensure_admin_user()
        except Exception as e:
            log.error("Admin seed failed: %s", e)

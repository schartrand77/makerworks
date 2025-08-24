# /app/startup/admin_seed.py
from __future__ import annotations

import asyncio
import datetime as dt
import logging
import os
import re
import secrets
import string
import uuid
from typing import Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker

# ---- project imports (match your working ones) --------------------------------
from app.db.session import async_engine
from app.models.models import User
from app.utils.security import hash_password

log = logging.getLogger(__name__)

# --- config from env -----------------------------------------------------------
ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "admin@example.com").strip()
ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", "admin").strip()
ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "").strip()

# anything in here is treated as "placeholder" and will trigger auto-generate
PLACEHOLDER_PASSWORDS = {
    "", "admin", "password", "changeme", "change-me-please", "please-use-a-strong-unique-value"
}

FIRST_ADMIN_FILE = os.getenv("FIRST_ADMIN_FILE", "/app/first-admin.txt")

def _gen_password(n: int = 18) -> str:
    # at least 1 of each class, otherwise random strong
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*()-_=+[]{}.,?"
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(n))
        if (re.search(r"[a-z]", pw) and re.search(r"[A-Z]", pw)
            and re.search(r"\d", pw) and re.search(r"[!@#$%^&*()\-\_\=\+\[\]{}.,?]", pw)):
            return pw

async def _users_table_exists(conn) -> bool:
    q = text(
        "select exists (select from information_schema.tables "
        "where table_schema='public' and table_name='users')"
    )
    return bool((await conn.execute(q)).scalar())

async def _id_info(conn):
    q = text("""
        select data_type, column_default
        from information_schema.columns
        where table_schema='public' and table_name='users' and column_name='id'
    """)
    row = (await conn.execute(q)).first()
    return (row[0], row[1]) if row else (None, None)

async def ensure_admin_user() -> None:
    """
    Create the admin on first install.
    - Never rotates password.
    - If password is placeholder/blank, generate a strong one and write it to FIRST_ADMIN_FILE.
    """
    Session = async_sessionmaker(async_engine, expire_on_commit=False)

    async with async_engine.begin() as conn:
        if not await _users_table_exists(conn):
            log.warning("[admin_seed] 'users' table not found; skipping this cycle.")
            return

        # already present?
        res = await conn.execute(text(
            "select 1 from public.users where email=:e or username=:u limit 1"
        ), {"e": ADMIN_EMAIL, "u": ADMIN_USERNAME})
        if res.first():
            log.info("[admin_seed] admin exists; not rotating password.")
            return

        # decide password
        password = ADMIN_PASSWORD
        generated = False
        if password.lower() in PLACEHOLDER_PASSWORDS:
            password = _gen_password()
            generated = True

        # figure out id column requirements
        data_type, col_default = await _id_info(conn)
        params = {
            "e": ADMIN_EMAIL,
            "u": ADMIN_USERNAME or "admin",
            "h": hash_password(password),
            "n": "Admin",
        }

        if data_type == "uuid":
            params["id"] = str(uuid.uuid4())
            sql = """
                insert into public.users
                  (id,email,username,hashed_password,name,is_active,is_verified,role,created_at)
                values
                  (:id,:e,:u,:h,:n,true,true,'admin',now())
            """
        elif data_type in ("integer", "bigint"):
            # try sequence if present
            if col_default and "nextval(" in (col_default or ""):
                seq = re.search(r"nextval\('([^']+)'::regclass\)", col_default).group(1)
                params["id"] = (await conn.execute(text("select nextval(:s)"), {"s": seq})).scalar()
            else:
                params["id"] = (await conn.execute(text("select coalesce(max(id),0)+1 from public.users"))).scalar()
            sql = """
                insert into public.users
                  (id,email,username,hashed_password,name,is_active,is_verified,role,created_at)
                values
                  (:id,:e,:u,:h,:n,true,true,'admin',now())
            """
        else:
            # best effort – hope default exists
            sql = """
                insert into public.users
                  (email,username,hashed_password,name,is_active,is_verified,role,created_at)
                values
                  (:e,:u,:h,:n,true,true,'admin',now())
            """

        await conn.execute(text(sql), params)

    # optional flags/ts via ORM (non-critical)
    async with Session() as s:
        user = (await s.execute(select(User).where(User.email == ADMIN_EMAIL))).scalar_one_or_none()
        if user:
            changed = False
            if getattr(user, "role", None) != "admin": user.role = "admin"; changed = True
            if getattr(user, "is_verified", False) is not True: user.is_verified = True; changed = True
            if getattr(user, "is_active", False) is not True: user.is_active = True; changed = True
            if hasattr(user, "created_at") and getattr(user, "created_at", None) is None:
                user.created_at = dt.datetime.utcnow(); changed = True
            if changed:
                await s.commit()

    if generated:
        # Write once to a file and log it (install-time convenience)
        try:
            with open(FIRST_ADMIN_FILE, "w") as f:
                f.write(f"email={ADMIN_EMAIL}\nusername={ADMIN_USERNAME}\npassword={password}\n")
            log.warning("[admin_seed] Generated admin password; wrote credentials to %s", FIRST_ADMIN_FILE)
        except Exception as e:
            log.warning("[admin_seed] Generated admin password; failed to write %s: %s", FIRST_ADMIN_FILE, e)
        print(f"🔑 FIRST ADMIN → {ADMIN_EMAIL} / {ADMIN_USERNAME} / {password}")

def schedule_admin_seed_on_startup(app) -> None:
    @app.on_event("startup")
    async def _seed_event():
        try:
            await ensure_admin_user()
        except Exception as e:
            log.exception("[admin_seed] failed: %s", e)

if __name__ == "__main__":
    asyncio.run(ensure_admin_user())

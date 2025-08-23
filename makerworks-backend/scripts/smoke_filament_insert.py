# scripts/smoke_filament_insert.py
import os
from pathlib import Path

# ── Force host paths & DB BEFORE importing app settings/db ───────────────────
HOST_ROOT = Path("/Users/stephenchartrand/Downloads/makerworks-repo/makerworks/makerworks-backend").resolve()
HOST_UPLOADS = HOST_ROOT / "uploads"
HOST_DATA = HOST_ROOT / "data"

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://makerworks:makerworks@127.0.0.1:5432/makerworks")
for k, v in {
    "APP_DIR": str(HOST_ROOT),
    "BASE_DIR": str(HOST_ROOT),
    "DATA_DIR": str(HOST_DATA),
    "UPLOAD_DIR": str(HOST_UPLOADS),
    "UPLOADS_DIR": str(HOST_UPLOADS),
    "THUMBNAILS_DIR": str(HOST_ROOT / "thumbnails"),
    "RUNNING_IN_DOCKER": "0",
    "DOCKER": "0",
    "CONTAINERIZED": "0",
}.items():
    os.environ.setdefault(k, v)

HOST_UPLOADS.mkdir(parents=True, exist_ok=True)
HOST_DATA.mkdir(parents=True, exist_ok=True)

# ── Now import deps ──────────────────────────────────────────────────────────
import asyncio
import logging
import math
from typing import Any, Dict, List, Set

from sqlalchemy import select, delete
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.inspection import inspect as sa_inspect

# Try to get a ready-made session maker; else construct one from the engine
try:
    from app.db.session import async_session_maker as _SessionMaker  # type: ignore[attr-defined]
    SessionMaker = _SessionMaker
except Exception:
    from importlib import import_module
    mod = import_module("app.db.session")
    async_engine = getattr(mod, "async_engine", None) or getattr(mod, "engine", None)
    if async_engine is None:
        raise ImportError("No async engine found in app.db.session (expected 'async_engine' or 'engine').")
    try:
        from sqlalchemy.ext.asyncio import async_sessionmaker as _async_sessionmaker  # SQLA 2.x
    except Exception:
        from sqlalchemy.ext.asyncio import AsyncSession
        from sqlalchemy.orm import sessionmaker as _async_sessionmaker
        SessionMaker = _async_sessionmaker(bind=async_engine, class_=AsyncSession, expire_on_commit=False)  # type: ignore
    else:
        SessionMaker = _async_sessionmaker(bind=async_engine, expire_on_commit=False)  # type: ignore

# models import after session setup to avoid circulars
from app.models import Filament

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("smoke-filaments")

# The seed-like payloads you showed
SEED_FILAMENTS: List[Dict[str, Any]] = [
    dict(
        name="Bambu PLA Matte Charcoal",
        type="PLA",
        subtype="Matte",
        color_name="Matte Charcoal",
        color="#333333",
        price_per_kg=25.99,
        currency="USD",
        texture="Matte",
        is_biodegradable=True,
        is_active=True,
    ),
    dict(
        name="Bambu PLA Matte Sakura Pink",
        type="PLA",
        subtype="Matte",
        color_name="Matte Sakura Pink",
        color="#F9CEDF",
        price_per_kg=25.99,
        currency="USD",
        texture="Matte",
        is_biodegradable=True,
        is_active=True,
    ),
]

EPS = 1e-6
def _eq(a: Any, b: Any) -> bool:
    if isinstance(a, float) or isinstance(b, float):
        try:
            return math.isclose(float(a), float(b), rel_tol=0, abs_tol=EPS)
        except Exception:
            return False
    return a == b

def _column_keys(model) -> Set[str]:
    mapper = sa_inspect(model)
    return {col.key for col in mapper.columns}

def _adapt_payload(payload: Dict[str, Any], allowed: Set[str]) -> Dict[str, Any]:
    """
    Map the seed keys to whatever your Filament model actually has.
    - Drops unknown keys (like 'subtype') that the model doesn't accept.
    - Remaps common alternates for 'type', 'subtype', 'color', 'price'.
    """
    out: Dict[str, Any] = {}

    def put_first_match(src_key: str, candidates: List[str]):
        if src_key not in payload:
            return
        for dest in candidates:
            if dest in allowed and dest not in out:
                out[dest] = payload[src_key]
                return
        # no destination found: drop silently

    # Always try 1:1 keys first
    for k in ("name", "color_name", "color", "price_per_kg", "currency", "texture", "is_biodegradable", "is_active"):
        if k in payload and k in allowed:
            out.setdefault(k, payload[k])

    # Map 'type' -> type/material/filament_type
    put_first_match("type", ["type", "material", "filament_type"])

    # Map 'subtype' -> subtype/finish/variant/grade (whatever exists)
    put_first_match("subtype", ["subtype", "finish", "variant", "grade"])

    # If hex color column is named differently
    if "color" in payload and "color" not in allowed:
        put_first_match("color", ["color_hex", "hex"])

    # Price alternatives
    if "price_per_kg" in payload and "price_per_kg" not in allowed:
        put_first_match("price_per_kg", ["price", "price_kg"])

    return out

async def main() -> int:
    failures = 0
    allowed = _column_keys(Filament)
    log.info("🧭 Filament columns detected: %s", ", ".join(sorted(allowed)))

    async with SessionMaker() as db:  # type: ignore[call-arg]
        for payload in SEED_FILAMENTS:
            name = payload["name"]

            # 1) Clean any prior rows
            log.info("🔄 Clearing existing rows for name=%r", name)
            await db.execute(delete(Filament).where(Filament.name == name))  # assumes 'name' column exists
            await db.commit()

            # 2) Build model-friendly payload
            adapted = _adapt_payload(payload, allowed)
            dropped = sorted(set(payload.keys()) - set(adapted.keys()))
            log.info("🧩 Adapted payload keys for %r: %s", name, ", ".join(sorted(adapted.keys())) or "(none)")
            if dropped:
                log.info("🙈 Dropped keys for %r (not in model): %s", name, ", ".join(dropped))

            if not adapted:
                log.error("⛔ Nothing left to insert for %r after adapting to model columns.", name)
                failures += 1
                continue

            # 3) Insert
            log.info("➕ Inserting %r", name)
            try:
                obj = Filament(**adapted)
                db.add(obj)
                await db.commit()
            except SQLAlchemyError:
                log.exception("⛔ Insert failed for %r (likely due to missing required columns). Adapted=%r", name, adapted)
                failures += 1
                continue

            # 4) Re-fetch and validate against adapted payload only
            try:
                result = await db.execute(select(Filament).where(Filament.name == name))
                row = result.scalar_one_or_none()
            except Exception:
                row = None
            if not row:
                log.error("⛔ Could not refetch filament %r after insert", name)
                failures += 1
                continue

            mismatches: List[str] = []
            for key, expected in adapted.items():
                got = getattr(row, key, None)
                if not _eq(got, expected):
                    mismatches.append(f"{key}: expected {expected!r}, got {got!r}")

            if mismatches:
                log.error("❌ Validation mismatches for %r:\n  - %s", name, "\n  - ".join(mismatches))
                failures += 1
            else:
                log.info("✅ Insert + readback OK for %r", name)

    if failures:
        log.error("❌ Smoke test finished with %d failure(s)", failures)
        return 1
    log.info("✅ All filaments validated successfully")
    return 0

if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

# app/api/v1/routes/system.py
from __future__ import annotations

import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Tuple

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_async_session
from app.utils.system_info import get_system_status_snapshot

router = APIRouter()


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sanitize_version(v: str) -> str:
    v = (v or "").strip()
    if not v:
        return ""
    # common prefixes to strip
    if v.startswith("refs/tags/"):
        v = v[len("refs/tags/") :]
    if v.lower().startswith("version "):
        v = v[len("version ") :]
    if v.startswith("v") and len(v) > 1 and v[1].isdigit():
        v = v[1:]
    return v


def _from_env() -> Tuple[str, str]:
    for key in ("APP_VERSION", "VITE_APP_VERSION", "VERSION", "GIT_TAG", "GIT_COMMIT", "GIT_SHA"):
        val = os.getenv(key, "").strip()
        if val:
            val = _sanitize_version(val)
            # If the only thing we have is a SHA, shorten it to 7
            if key in ("GIT_COMMIT", "GIT_SHA") and val:
                val = (val[:7] if len(val) >= 7 else val)
            return val, f"env:{key}"
    return "", ""


def _from_version_file() -> Tuple[str, str]:
    # Walk up parents looking for a VERSION file
    cur = Path(__file__).resolve()
    for p in [cur.parent, *cur.parents]:
        vf = p / "VERSION"
        if vf.exists():
            try:
                v = _sanitize_version(vf.read_text(encoding="utf-8"))
                if v:
                    return v, f"file:{vf}"
            except Exception:
                pass
    return "", ""


def _from_git() -> Tuple[str, str]:
    try:
        # Prefer annotated tags if present; fall back to short SHA
        res = subprocess.run(
            ["git", "describe", "--tags", "--always", "--dirty=-dirty"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=1.5,
            cwd=str(Path(__file__).resolve().parents[-1]),  # repo root best effort
        )
        cand = _sanitize_version(res.stdout)
        if cand:
            return cand, "git:describe"
    except Exception:
        pass
    return "", ""


def _detect_version() -> Tuple[str, str]:
    v, src = _from_env()
    if v:
        return v, src
    v, src = _from_version_file()
    if v:
        return v, src
    v, src = _from_git()
    if v:
        return v, src
    return "", "unknown"


@router.get("/status", tags=["system"], status_code=status.HTTP_200_OK)
async def system_status():
    return JSONResponse(
        {
            "status": "ok",
            "message": "📈 System is up",
            "timestamp": _utc_iso(),
        }
    )


@router.get("/version", tags=["system"], status_code=status.HTTP_200_OK)
async def system_version():
    version, source = _detect_version()
    # Frontend will show a skeleton if empty string; that's fine.
    return JSONResponse(
        {
            "version": version,
            "source": source,
            "timestamp": _utc_iso(),
        }
    )


@router.get("/env", tags=["system"], status_code=status.HTTP_200_OK)
async def system_env():
    env = (
        os.getenv("APP_ENV")
        or os.getenv("ENV")
        or os.getenv("ENVIRONMENT")
        or os.getenv("VITE_APP_ENV")
        or "development"
    )
    return JSONResponse(
        {
            "env": env,
            "timestamp": _utc_iso(),
        }
    )


@router.get("/ping", tags=["system"], status_code=status.HTTP_200_OK)
async def system_ping():
    return JSONResponse(
        {
            "status": "ok",
            "message": "🏓 pong",
            "timestamp": _utc_iso(),
        }
    )


@router.get("/tables", tags=["system"], status_code=status.HTTP_200_OK)
async def list_tables(session: AsyncSession = Depends(get_async_session)):
    query = text(
        """
        SELECT schemaname, tablename, tableowner
        FROM pg_tables
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY schemaname, tablename;
        """
    )
    result = await session.execute(query)
    rows = result.fetchall()
    return [{"schema": row[0], "table": row[1], "owner": row[2]} for row in rows]


@router.get("/handshake", tags=["system"], status_code=status.HTTP_200_OK)
@router.post("/handshake", tags=["system"], status_code=status.HTTP_200_OK)
async def system_handshake():
    return JSONResponse(
        {
            "status": "ok",
            "message": "🤝 handshake successful",
            "timestamp": _utc_iso(),
        }
    )


@router.get("/snapshot", tags=["system"], status_code=status.HTTP_200_OK)
async def system_snapshot():
    """Return a snapshot of system status for monitoring."""
    return JSONResponse(get_system_status_snapshot())

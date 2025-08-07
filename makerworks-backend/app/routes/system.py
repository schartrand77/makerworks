from datetime import datetime

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_async_session
from app.utils.system_info import get_system_status_snapshot

router = APIRouter()


@router.get("/status", tags=["system"], status_code=status.HTTP_200_OK)
async def system_status():
    return JSONResponse(
        {
            "status": "ok",
            "message": "📈 System is up",
            "timestamp": datetime.utcnow().isoformat(),
        }
    )


@router.get("/version", tags=["system"], status_code=status.HTTP_200_OK)
async def system_version():
    return JSONResponse(
        {
            "version": "1.0.0",
            "timestamp": datetime.utcnow().isoformat(),
        }
    )


@router.get("/env", tags=["system"], status_code=status.HTTP_200_OK)
async def system_env():
    return JSONResponse(
        {
            "env": "development",
            "timestamp": datetime.utcnow().isoformat(),
        }
    )


@router.get("/ping", tags=["system"], status_code=status.HTTP_200_OK)
async def system_ping():
    return JSONResponse(
        {
            "status": "ok",
            "message": "🏓 pong",
            "timestamp": datetime.utcnow().isoformat(),
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
            "timestamp": datetime.utcnow().isoformat(),
        }
    )


@router.get("/snapshot", tags=["system"], status_code=status.HTTP_200_OK)
async def system_snapshot():
    """Return a snapshot of system status for monitoring."""
    return JSONResponse(get_system_status_snapshot())

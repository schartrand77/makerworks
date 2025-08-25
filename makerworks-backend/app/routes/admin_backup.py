# app/routes/admin_backup.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import datetime as dt

from app.dependencies import get_db, admin_required
from app.services.backup import run_backup
from app.models.backup_jobs import BackupJob  # small declarative model reflecting the table

router = APIRouter(prefix="", tags=["admin.backup"])

@router.get("", summary="List backup jobs")
async def list_backups(
    db: AsyncSession = Depends(get_db),
    admin = Depends(admin_required),
    limit: int = Query(50, ge=1, le=200),
):
    rows = (await db.execute(
        select(BackupJob).order_by(BackupJob.started_at.desc()).limit(limit)
    )).scalars().all()
    def out(x: BackupJob):
        return {
            "id": str(x.id),
            "started_at": x.started_at,
            "finished_at": x.finished_at,
            "status": x.status,
            "kind": x.kind,
            "created_by": str(x.created_by) if x.created_by else None,
            "location": x.location,
            "db_bytes": x.db_bytes,
            "media_bytes": x.media_bytes,
            "total_bytes": x.total_bytes,
            "manifest_sha256": x.manifest_sha256,
            "error": x.error,
        }
    return {"items": [out(r) for r in rows]}

@router.post("/run", summary="Start a backup now")
async def run_backup_now(
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    admin = Depends(admin_required),
):
    # kick off in background to avoid blocking the HTTP worker
    # (we still write a 'running' job row immediately inside run_backup)
    async def task():
        # create a fresh session inside task if your DI doesn't carry over; simplified here
        await run_backup(db, created_by=getattr(admin, "id", None), kind="manual")
    background.add_task(task)
    return {"status": "started"}

@router.get("/{job_id}", summary="Get a backup job")
async def get_backup(job_id: str, db: AsyncSession = Depends(get_db), admin = Depends(admin_required)):
    row = await db.get(BackupJob, job_id)
    if not row:
        raise HTTPException(404, "Not found")
    return {
        "id": str(row.id),
        "started_at": row.started_at,
        "finished_at": row.finished_at,
        "status": row.status,
        "kind": row.kind,
        "created_by": str(row.created_by) if row.created_by else None,
        "location": row.location,
        "db_bytes": row.db_bytes,
        "media_bytes": row.media_bytes,
        "total_bytes": row.total_bytes,
        "manifest_sha256": row.manifest_sha256,
        "error": row.error,
    }

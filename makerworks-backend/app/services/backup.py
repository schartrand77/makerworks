# app/services/backup.py
from __future__ import annotations
import os, io, tarfile, json, hashlib, shutil, tempfile, subprocess, datetime as dt
from dataclasses import dataclass
from typing import Optional, Tuple, Dict

import boto3  # install if you use S3; otherwise safe to import gate behind provider
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import insert, update, select
from urllib.parse import urlparse

from app.models import User  # or wherever your User model is
from app.models.inventory import None as _ignore  # just to keep context; remove if unused
from app.db import get_async_engine  # if you have it; not required here
from app.models.backup_jobs import BackupJob  # create a small model or use raw SQL in routes

# If you don't have a model file, you can write raw SQL via SQLAlchemy Core inside the routes;
# Keeping a model is nicer. Example declarative for reference:
# class BackupJob(Base):
#     __tablename__ = "backup_jobs"
#     __table_args__ = {"schema": "public"}
#     id = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
#     ...

@dataclass
class BackupContext:
    provider: str             # 'local' | 's3'
    backup_dir: Optional[str]
    uploads_dir: Optional[str]
    database_url: str
    s3_bucket: Optional[str] = None
    s3_prefix: Optional[str] = None
    s3_endpoint_url: Optional[str] = None
    s3_sse: Optional[str] = None

def env(name: str, default: Optional[str]=None) -> Optional[str]:
    v = os.environ.get(name, default)
    return v if v not in ("", None) else default

def load_ctx() -> BackupContext:
    return BackupContext(
        provider = env("BACKUP_PROVIDER", "local"),
        backup_dir = env("BACKUP_DIR", "/var/backups/makerworks"),
        uploads_dir = env("UPLOADS_DIR", "/data/uploads"),
        database_url = os.environ["DATABASE_URL"],
        s3_bucket = env("S3_BUCKET"),
        s3_prefix = env("S3_PREFIX", "makerworks"),
        s3_endpoint_url = env("S3_ENDPOINT_URL"),
        s3_sse = env("S3_SSE"),
    )

def _sha256_bytes(data: bytes) -> str:
    h = hashlib.sha256(); h.update(data); return h.hexdigest()

def _sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(2**20), b""):
            h.update(chunk)
    return h.hexdigest()

def _pg_env_from_url(url: str) -> Dict[str, str]:
    u = urlparse(url.replace("+psycopg", ""))  # e.g. postgresql+psycopg://user:pass@host:5432/db
    pg = {
        "PGHOST": u.hostname or "localhost",
        "PGPORT": str(u.port or 5432),
        "PGUSER": u.username or "postgres",
        "PGPASSWORD": u.password or "",
        "PGDATABASE": (u.path or "/").lstrip("/") or "postgres",
    }
    return pg

def _run(cmd: list[str], extra_env: Dict[str,str]|None=None) -> None:
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)
    p = subprocess.run(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"Command failed ({p.returncode}): {' '.join(cmd)}\n{p.stdout}")

def _tar_dir(src_dir: str, out_path: str) -> int:
    if not os.path.isdir(src_dir):
        # Create an empty tar so downstream logic stays simple
        with tarfile.open(out_path, "w:gz") as tf:
            pass
        return 0
    total = 0
    with tarfile.open(out_path, "w:gz") as tf:
        for root, _, files in os.walk(src_dir):
            for name in files:
                path = os.path.join(root, name)
                try:
                    st = os.stat(path)
                    tf.add(path, arcname=os.path.relpath(path, src_dir))
                    total += st.st_size
                except FileNotFoundError:
                    # File disappeared mid-walk, ignore
                    continue
    return total

async def run_backup(db: AsyncSession, created_by: Optional[str], kind: str="manual") -> dict:
    ctx = load_ctx()
    stamp = dt.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    job_id = os.popen("uuidgen").read().strip() or stamp  # cheap cross-platform

    # Insert job row as 'running'
    await db.execute(insert(BackupJob).values(
        id=job_id, started_at=dt.datetime.utcnow(), status="running", kind=kind, created_by=created_by
    ))
    await db.commit()

    # Workspace
    tmp = tempfile.mkdtemp(prefix=f"mw_backup_{stamp}_")
    try:
        # 1) pg_dump (custom format .dump)
        pg_env = _pg_env_from_url(ctx.database_url)
        db_dump_path = os.path.join(tmp, f"db_{stamp}.dump")
        _run(["pg_dump", "--format=custom", "--no-owner", "--no-privileges", "--file", db_dump_path], extra_env=pg_env)
        db_bytes = os.path.getsize(db_dump_path)

        # 2) media tar.gz
        media_tar_path = os.path.join(tmp, f"media_{stamp}.tar.gz")
        media_bytes = _tar_dir(ctx.uploads_dir or "/data/uploads", media_tar_path)

        # 3) manifest.json
        manifest = {
            "version": 1,
            "created_at": dt.datetime.utcnow().isoformat() + "Z",
            "db_dump": os.path.basename(db_dump_path),
            "db_bytes": db_bytes,
            "db_sha256": _sha256_file(db_dump_path),
            "media_tar": os.path.basename(media_tar_path),
            "media_bytes": media_bytes,
            "media_sha256": _sha256_file(media_tar_path),
            "app": "makerworks",
        }
        manifest_bytes = json.dumps(manifest, indent=2).encode("utf-8")
        manifest_sha = _sha256_bytes(manifest_bytes)
        manifest_path = os.path.join(tmp, "manifest.json")
        with open(manifest_path, "wb") as f:
            f.write(manifest_bytes)

        total_bytes = db_bytes + media_bytes + len(manifest_bytes)

        # 4) Ship to destination
        if ctx.provider.lower() == "local":
            root = ctx.backup_dir or "/var/backups/makerworks"
            dest_dir = os.path.join(root, stamp)
            os.makedirs(dest_dir, exist_ok=True)
            for src in (db_dump_path, media_tar_path, manifest_path):
                shutil.move(src, os.path.join(dest_dir, os.path.basename(src)))
            location = dest_dir

        elif ctx.provider.lower() == "s3":
            if not ctx.s3_bucket:
                raise RuntimeError("S3_BUCKET is required for BACKUP_PROVIDER=s3")
            s3 = boto3.client("s3", endpoint_url=ctx.s3_endpoint_url) if ctx.s3_endpoint_url else boto3.client("s3")
            key_prefix = "/".join([p for p in [ctx.s3_prefix or "makerworks", stamp] if p])
            extra = {}
            if ctx.s3_sse:
                extra["ServerSideEncryption"] = ctx.s3_sse
            def put(path: str):
                key = f"{key_prefix}/{os.path.basename(path)}"
                s3.upload_file(path, ctx.s3_bucket, key, ExtraArgs=extra)
                return key
            k1 = put(db_dump_path)
            k2 = put(media_tar_path)
            k3 = put(manifest_path)
            location = f"s3://{ctx.s3_bucket}/{key_prefix}"
        else:
            raise RuntimeError(f"Unknown BACKUP_PROVIDER={ctx.provider}")

        # 5) mark job ok
        await db.execute(
            update(BackupJob)
            .where(BackupJob.id == job_id)
            .values(
                finished_at=dt.datetime.utcnow(),
                status="ok",
                location=location,
                db_bytes=db_bytes,
                media_bytes=media_bytes,
                total_bytes=total_bytes,
                manifest_sha256=manifest_sha,
                error=None,
            )
        )
        await db.commit()

        return {
            "id": job_id,
            "status": "ok",
            "location": location,
            "db_bytes": db_bytes,
            "media_bytes": media_bytes,
            "total_bytes": total_bytes,
            "manifest_sha256": manifest_sha,
        }

    except Exception as e:
        await db.execute(
            update(BackupJob)
            .where(BackupJob.id == job_id)
            .values(
                finished_at=dt.datetime.utcnow(),
                status="error",
                error=str(e)[:2000],
            )
        )
        await db.commit()
        raise
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

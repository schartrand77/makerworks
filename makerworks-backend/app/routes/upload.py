import logging
import shutil
import sys
import traceback
from pathlib import Path
from datetime import datetime
from uuid import uuid4
import os

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import sqlalchemy
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import load_only

try:
    from app.config.settings import settings
    from app.db.session import get_db, async_engine
    from app.dependencies.auth import get_current_user
    from app.models.models import User, ModelUpload
    from app.schemas.models import ModelUploadOut
    from app.tasks.thumbnails import generate_model_previews
    from app.utils.render_thumbnail import render_thumbnail
except ImportError as e:
    sys.__stderr__.write(f"❌ ImportError in upload.py: {e}\n")
    traceback.print_exc(file=sys.__stderr__)
    logging.shutdown()
    sys.exit(1)

logger = logging.getLogger(__name__)
router = APIRouter()

BASE_UPLOAD_DIR = Path(settings.uploads_path).resolve()
BASE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

THUMBNAIL_DIR = BASE_UPLOAD_DIR / "thumbnails"
THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)


def get_model_dir(user_id: str) -> Path:
    path = BASE_UPLOAD_DIR / "users" / str(user_id) / "models"
    path.mkdir(parents=True, exist_ok=True)
    return path


async def check_alembic_revision():
    try:
        async with async_engine.begin() as conn:
            tables = await conn.run_sync(
                lambda sync_conn: sqlalchemy.inspect(sync_conn).get_table_names()
            )
            if "model_uploads" not in tables:
                logger.error("❌ model_uploads table not found. Alembic migration may not be applied.")
                raise HTTPException(
                    status_code=500,
                    detail="Database schema out of sync. Apply Alembic migrations."
                )
    except ProgrammingError as e:
        logger.exception("❌ Alembic schema check failed")
        raise HTTPException(
            status_code=500,
            detail=f"Alembic schema check failed: {e}"
        )


@router.on_event("startup")
async def validate_upload_module_startup():
    try:
        sys.__stderr__.write("✅ upload.py startup validation running\n")
        await check_alembic_revision()
        sys.__stderr__.write("✅ upload.py passed startup validation\n")
    except Exception as e:
        sys.__stderr__.write(f"❌ upload.py startup validation failed: {e}\n")
        traceback.print_exc(file=sys.__stderr__)
        logging.shutdown()
        raise


@router.post("", response_model=ModelUploadOut)
async def upload_model(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await check_alembic_revision()

    user_id = current_user.id
    model_dir = get_model_dir(user_id)

    try:
        # ✅ Check for duplicate filename (case-insensitive)
        result = await db.execute(
            select(ModelUpload)
            .options(load_only(ModelUpload.id, ModelUpload.filename))
            .where(
                ModelUpload.user_id == user_id,
                sqlalchemy.func.lower(ModelUpload.filename) == file.filename.lower()
            )
        )
        existing_model = result.scalars().first()

        if existing_model:
            logger.warning("⚠️ Duplicate filename detected for user %s: %s", user_id, file.filename)
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Model with this filename already exists"
            )

        # ✅ Save uploaded STL to user dir
        file_path = model_dir / file.filename
        os.makedirs(model_dir, exist_ok=True)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        logger.info("📥 Uploaded model file: %s", file_path)

        # ✅ Generate unique ID for DB + thumbnail
        model_uuid = str(uuid4())

        # ✅ Generate thumbnail with UUID-based name using new render_thumbnail()
        thumb_path = render_thumbnail(file_path, model_uuid)
        logger.info("🖼️ Generated thumbnail: %s", thumb_path)

        # ✅ Queue turntable render (optional)
        task_id = str(uuid4())
        turntable_filename = f"{model_uuid}.webm"
        turntable_path = model_dir / turntable_filename
        try:
            generate_model_previews.apply_async(
                args=[str(file_path), model_uuid, str(turntable_path)],
                task_id=task_id
            )
            logger.info("🎨 Queued preview generation task %s", task_id)
        except Exception as e:
            logger.error("❌ Failed to queue Celery preview task: %s", e)
            turntable_path = None

        # ✅ Save DB entry with normalized relative thumbnail path
        new_model = ModelUpload(
            id=model_uuid,
            user_id=user_id,
            filename=file.filename,
            file_path=str(file_path),
            file_url=None,
            thumbnail_path=str(Path("uploads/thumbnails") / f"{model_uuid}_thumb.png"),
            turntable_path=str(turntable_path) if turntable_path else None,
            uploaded_at=datetime.utcnow(),
        )
        db.add(new_model)
        await db.commit()
        await db.refresh(new_model)
        logger.info("✅ Model record committed: %s", new_model.id)

        return ModelUploadOut(
            status="queued",
            message="Model uploaded successfully",
            model_id=str(new_model.id),
            user_id=str(user_id),
            filename=file.filename,
            file_path=file.filename,
            thumbnail=new_model.thumbnail_path,
            turntable=new_model.turntable_path,
            uploaded_at=new_model.uploaded_at,
            job_id=task_id
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("❌ Upload failed for user %s", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {e}"
        )

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


def get_model_dir(user_id: str) -> Path:
    """
    Always create a user-specific models folder under uploads/users/{user_id}/models
    """
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
        # ✅ Check duplicate filename per user
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

        # ✅ Save model file to user-specific folder
        file_path = model_dir / file.filename
        os.makedirs(model_dir, exist_ok=True)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        logger.info("📥 Saved model file: %s", file_path)

        # ✅ Unique UUID for model and thumbnail
        model_uuid = str(uuid4())

        # ✅ Thumbnail saved in user-specific folder
        thumb_rel = Path(f"users/{user_id}/thumbnails/{model_uuid}_thumb.png")
        thumb_abs = BASE_UPLOAD_DIR / thumb_rel
        thumb_abs.parent.mkdir(parents=True, exist_ok=True)

        render_thumbnail(file_path, thumb_abs)
        logger.info("🖼️ Generated thumbnail: %s", thumb_abs)

        # ✅ Turntable path in user folder
        turntable_rel = Path(f"users/{user_id}/models/{model_uuid}.webm")
        turntable_abs = BASE_UPLOAD_DIR / turntable_rel

        try:
            generate_model_previews.apply_async(
                args=[str(file_path), model_uuid, str(user_id), str(turntable_abs)],
                task_id=str(uuid4())
            )
            logger.info("🎨 Queued preview generation for %s", model_uuid)
        except Exception as e:
            logger.error("❌ Celery preview queue failed: %s", e)

        # ✅ Commit DB entry with user-aware relative paths
        new_model = ModelUpload(
            id=model_uuid,
            user_id=user_id,
            filename=file.filename,
            name=file.filename.rsplit(".", 1)[0],  # use filename as default name
            description=None,
            file_path=str(Path(f"users/{user_id}/models/{file.filename}")),
            file_url=f"/uploads/users/{user_id}/models/{file.filename}",
            thumbnail_path=str(thumb_rel),
            turntable_path=str(turntable_rel),
            uploaded_at=datetime.utcnow(),
        )
        db.add(new_model)
        await db.commit()
        await db.refresh(new_model)

        logger.info("✅ Model %s committed for user %s", new_model.id, user_id)

        return ModelUploadOut(
            status="queued",
            message="Model uploaded successfully",
            model_id=str(new_model.id),
            user_id=str(user_id),
            filename=file.filename,
            file_path=new_model.file_url,
            thumbnail=new_model.thumbnail_path,
            turntable=new_model.turntable_path,
            uploaded_at=new_model.uploaded_at,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("❌ Upload failed for user %s", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {e}"
        )

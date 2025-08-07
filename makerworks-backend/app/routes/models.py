# app/routes/models.py

import logging
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, status, Query, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, ConfigDict

from app.config.settings import settings
from app.db.session import get_db
from app.models.models import ModelUpload, User
from app.utils.filesystem import ensure_user_model_thumbnails_for_user

router = APIRouter()
logger = logging.getLogger(__name__)


class ModelItem(BaseModel):
    username: str
    filename: str
    path: str
    url: str
    thumbnail_url: Optional[str]
    webm_url: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class PaginatedModelListResponse(BaseModel):
    models: List[ModelItem]
    page: int
    page_size: int
    total: int
    pages: int


@router.get(
    "/browse",
    summary="List all models from filesystem (all users) with pagination",
    status_code=status.HTTP_200_OK,
    response_model=PaginatedModelListResponse,
)
async def browse_all_filesystem_models(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Number of models per page"),
    db: AsyncSession = Depends(get_db)
) -> PaginatedModelListResponse:
    """
    Scan /uploads/users/*/models and merge with DB entries to return paginated models.
    Ensures thumbnails exist for each STL/OBJ/3MF file.
    """
    uploads_root = Path(settings.uploads_path).resolve()
    models_root = uploads_root / "users"
    results: List[ModelItem] = []

    if not models_root.exists():
        logger.warning("📂 Models root %s does not exist.", models_root)
        return PaginatedModelListResponse(
            models=[], page=page, page_size=page_size, total=0, pages=0
        )

    logger.info("📂 Scanning models under: %s", models_root)

    try:
        # ✅ Preload ModelUpload + username with proper async-safe join
        stmt = (
            select(ModelUpload, User.username)
            .join(User, ModelUpload.user_id == User.id)
            .options(selectinload(ModelUpload.user))
        )
        db_models = await db.execute(stmt)
        db_entries = db_models.all()

        db_map = {
            Path(entry.ModelUpload.file_path).name: {
                "username": entry.username,
                "thumbnail": entry.ModelUpload.thumbnail_path,
                "turntable": getattr(entry.ModelUpload, "turntable_path", None),
            }
            for entry in db_entries
        }

        for user_dir in models_root.iterdir():
            if not user_dir.is_dir():
                continue

            models_dir = user_dir / "models"
            if not models_dir.exists():
                continue

            for model_file in models_dir.iterdir():
                if not model_file.is_file():
                    continue

                if model_file.suffix.lower() not in [".stl", ".obj", ".3mf"]:
                    continue

                if model_file.name.startswith(".") or model_file.name.startswith("~"):
                    continue

                try:
                    model_rel_path = model_file.relative_to(uploads_root).as_posix()
                except ValueError:
                    logger.warning("⚠️ Skipping suspicious path: %s", model_file)
                    continue

                model_url = f"/uploads/{model_rel_path}"

                # ✅ Use DB metadata if available
                meta = db_map.get(model_file.name)
                username = meta["username"] if meta else user_dir.name

                # ✅ Ensure thumbnail exists in user thumbnails folder
                if not (meta and meta["thumbnail"]):
                    ensure_user_model_thumbnails_for_user(user_dir.name)

                # ✅ Build thumbnail URL relative to /uploads
                thumb_url = None
                if meta and meta["thumbnail"]:
                    thumb_url = f"/uploads/{meta['thumbnail']}"
                else:
                    thumb_candidate = uploads_root / "users" / user_dir.name / "thumbnails" / f"{model_file.stem}_thumb.png"
                    if thumb_candidate.exists():
                        rel_thumb = thumb_candidate.relative_to(uploads_root).as_posix()
                        thumb_url = f"/uploads/{rel_thumb}"

                # ✅ Build turntable URL safely
                webm_url = None
                if meta and meta["turntable"]:
                    turntable_path = Path(meta["turntable"])
                    # Normalize to absolute under uploads_root if needed
                    if not turntable_path.is_absolute():
                        turntable_path = uploads_root / turntable_path
                    try:
                        rel_turntable = turntable_path.relative_to(uploads_root).as_posix()
                        webm_url = f"/uploads/{rel_turntable}"
                    except ValueError:
                        logger.warning("⚠️ Turntable path outside uploads root: %s", turntable_path)
                        webm_url = None
                else:
                    webm_file = model_file.with_suffix(".webm")
                    if webm_file.exists():
                        try:
                            webm_rel_path = webm_file.relative_to(uploads_root).as_posix()
                            webm_url = f"/uploads/{webm_rel_path}"
                        except ValueError:
                            logger.warning("⚠️ WebM file outside uploads root: %s", webm_file)

                results.append(
                    ModelItem(
                        username=username,
                        filename=model_file.name,
                        path=model_rel_path,
                        url=model_url,
                        thumbnail_url=thumb_url,
                        webm_url=webm_url,
                    )
                )

    except Exception as e:
        logger.exception("❌ Error while scanning models.")
        raise HTTPException(status_code=500, detail=f"Error browsing models: {e}")

    # ✅ Sort models for consistency
    results.sort(key=lambda m: (m.username.lower(), m.filename.lower()))

    total = len(results)
    pages = max(1, -(-total // page_size))  # ceil division
    if page > pages:
        page = pages

    start = (page - 1) * page_size
    end = start + page_size
    paginated = results[start:end]

    logger.info("✅ Returning page %d of %d (%d models total)", page, pages, total)

    return PaginatedModelListResponse(
        models=paginated,
        page=page,
        page_size=page_size,
        total=total,
        pages=pages
    )


@router.get(
    "",
    summary="List all models (alias of /browse)",
    status_code=status.HTTP_200_OK,
    response_model=PaginatedModelListResponse,
)
async def list_models(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Number of models per page"),
    db: AsyncSession = Depends(get_db)
) -> PaginatedModelListResponse:
    """
    Alias for /browse endpoint.
    """
    return await browse_all_filesystem_models(page=page, page_size=page_size, db=db)

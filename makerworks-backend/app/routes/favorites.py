import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.db.database import get_async_db
from app.models import ModelUpload, ModelMetadata, Favorite, User
from app.schemas.favorites import FavoriteOut
from app.dependencies.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/favorites", tags=["Favorites"])


@router.get(
    "/",
    summary="List the current user's favorite models with metadata",
    response_model=List[FavoriteOut],
    status_code=status.HTTP_200_OK,
)
async def list_favorites(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return all favorite models for the current user, including optional metadata.
    """
    logger.info("📋 Listing favorites for user %s", current_user.id)

    # ✅ Fixed JOIN: start from ModelUpload, join Favorite, left join ModelMetadata
    stmt = (
        select(ModelUpload)
        .join(Favorite, Favorite.model_id == ModelUpload.id)
        .options(joinedload(ModelUpload.metadata_entries))
        .where(Favorite.user_id == current_user.id)
    )

    result = await db.execute(stmt)
    uploads = result.scalars().unique().all()

    favorites_out = []
    for upload in uploads:
        metadata = upload.metadata_entries[0] if upload.metadata_entries else None
        favorites_out.append(
            FavoriteOut(
                id=upload.id,
                user_id=upload.user_id,
                filename=upload.filename,
                name=upload.name,
                description=upload.description,
                file_path=upload.file_path,
                thumbnail_path=upload.thumbnail_path,
                uploaded_at=upload.uploaded_at,
                volume=metadata.volume if metadata else None,
                surface_area=metadata.surface_area if metadata else None,
                bbox_x=metadata.bbox_x if metadata else None,
                bbox_y=metadata.bbox_y if metadata else None,
                bbox_z=metadata.bbox_z if metadata else None,
                faces=metadata.faces if metadata else None,
                vertices=metadata.vertices if metadata else None,
                geometry_hash=metadata.geometry_hash if metadata else None,
            )
        )

    logger.debug("✅ Found %d favorites for user %s", len(favorites_out), current_user.id)
    return favorites_out


@router.post(
    "/{model_id}",
    summary="Add a model to the current user's favorites",
    status_code=status.HTTP_201_CREATED,
)
async def add_favorite(
    model_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """
    Add a model to the current user's favorites.
    """
    logger.info("➕ Adding model %s to favorites for user %s", model_id, current_user.id)

    stmt = select(Favorite).where(
        Favorite.model_id == model_id,
        Favorite.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        return {"detail": "Already in favorites"}

    favorite = Favorite(model_id=model_id, user_id=current_user.id)
    db.add(favorite)
    await db.commit()

    logger.info("✅ Added model %s to favorites for user %s", model_id, current_user.id)
    return {"detail": "Favorite added"}


@router.delete(
    "/{model_id}",
    summary="Remove a model from the current user's favorites",
    status_code=status.HTTP_200_OK,
)
async def remove_favorite(
    model_id: str,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user),
):
    """
    Remove a model from the current user's favorites.
    """
    logger.info("🗑️ Removing model %s from favorites for user %s", model_id, current_user.id)

    stmt = select(Favorite).where(
        Favorite.model_id == model_id,
        Favorite.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    favorite = result.scalar_one_or_none()

    if not favorite:
        raise HTTPException(status_code=404, detail="Favorite not found")

    await db.delete(favorite)
    await db.commit()

    logger.info("✅ Removed model %s from favorites for user %s", model_id, current_user.id)
    return {"detail": "Favorite removed"}

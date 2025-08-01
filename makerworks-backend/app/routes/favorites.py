import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_async_db
from app.models import Filament
from app.schemas import FilamentOut
from app.dependencies.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/",
    summary="List filaments with optional filters and pagination",
    response_model=List[FilamentOut],
    status_code=status.HTTP_200_OK,
)
async def list_filaments(
    db: AsyncSession = Depends(get_async_db),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    type: Optional[str] = Query(None, description="Filter by type"),
    subtype: Optional[str] = Query(None, description="Filter by subtype"),
    color_name: Optional[str] = Query(None, description="Filter by color name"),
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(25, gt=0, le=100, description="Pagination limit"),
):
    """
    Return a list of filaments, optionally filtered and paginated.
    """
    logger.info("📋 Listing filaments with filters: is_active=%s, type=%s, subtype=%s, color=%s",
                is_active, type, subtype, color_name)

    stmt = select(Filament)

    if is_active is not None:
        stmt = stmt.where(Filament.is_active == is_active)
    if type:
        stmt = stmt.where(Filament.type.ilike(f"%{type}%"))
    if subtype:
        stmt = stmt.where(Filament.subtype.ilike(f"%{subtype}%"))
    if color_name:
        stmt = stmt.where(Filament.color_name.ilike(f"%{color_name}%"))

    stmt = stmt.offset(skip).limit(limit)

    result = await db.execute(stmt)
    filaments = result.scalars().all()

    logger.debug("✅ Found %d filaments", len(filaments))

    return [FilamentOut.model_validate(f).model_dump() for f in filaments]


@router.post(
    "/",
    summary="Create a new filament",
    response_model=FilamentOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_filament(
    filament_in: FilamentOut,
    db: AsyncSession = Depends(get_async_db),
    user=Depends(get_current_user),
):
    """
    Create a new filament entry.
    """
    logger.info("➕ Creating filament: %s", filament_in.model_dump())

    filament = Filament(**filament_in.model_dump())
    db.add(filament)
    await db.commit()
    await db.refresh(filament)

    logger.info("✅ Created filament with ID %s", filament.id)

    return FilamentOut.model_validate(filament).model_dump()


@router.put(
    "/{fid}",
    summary="Update an existing filament",
    response_model=FilamentOut,
    status_code=status.HTTP_200_OK,
)
async def update_filament(
    fid: int,
    filament_in: FilamentOut,
    db: AsyncSession = Depends(get_async_db),
    user=Depends(get_current_user),
):
    """
    Update a filament by ID.
    """
    logger.info("✏️ Updating filament ID %s", fid)

    stmt = select(Filament).where(Filament.id == fid)
    result = await db.execute(stmt)
    filament = result.scalar_one_or_none()

    if not filament:
        logger.warning("❌ Filament ID %s not found", fid)
        raise HTTPException(status_code=404, detail="Filament not found")

    for key, value in filament_in.model_dump().items():
        setattr(filament, key, value)

    await db.commit()
    await db.refresh(filament)

    logger.info("✅ Updated filament ID %s", fid)

    return FilamentOut.model_validate(filament).model_dump()


@router.delete(
    "/{fid}",
    summary="Delete a filament",
    status_code=status.HTTP_200_OK,
)
async def delete_filament(
    fid: int,
    db: AsyncSession = Depends(get_async_db),
    user=Depends(get_current_user),
):
    """
    Delete a filament by ID.
    """
    logger.info("🗑️ Deleting filament ID %s", fid)

    stmt = select(Filament).where(Filament.id == fid)
    result = await db.execute(stmt)
    filament = result.scalar_one_or_none()

    if not filament:
        logger.warning("❌ Filament ID %s not found", fid)
        raise HTTPException(status_code=404, detail="Filament not found")

    await db.delete(filament)
    await db.commit()

    logger.info("✅ Deleted filament ID %s", fid)

    return {"detail": "Filament deleted"}

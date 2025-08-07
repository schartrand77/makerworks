from pydantic import BaseModel, RootModel
from typing import Dict, List, Optional, Any

from fastapi import (
    APIRouter,
    Query,
    Depends,
    status,
    Body,
    HTTPException,
    Path,
)
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from collections import defaultdict

from app.db.database import get_async_db
from app.models.models import Filament
from app.schemas.filaments import FilamentOut, FilamentCreate
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "",
    summary="Get flat list of all filaments for Estimate page",
    status_code=status.HTTP_200_OK,
    response_model=List[FilamentOut],
)
async def list_filaments(
    db: AsyncSession = Depends(get_async_db),
):
    """
    Return a flat list of all active filaments for estimate dropdown.
    """
    stmt = select(Filament).where(Filament.is_active == True)
    result = await db.execute(stmt)
    filaments = result.scalars().all()

    logger.info(f"✅ Returned {len(filaments)} filaments for Estimate page.")
    return filaments


@router.post(
    "",
    summary="Create a new filament",
    status_code=status.HTTP_201_CREATED,
    response_model=FilamentOut,
)
async def create_filament(
    payload: FilamentCreate = Body(...),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Create a new filament entry.
    """
    new_filament = Filament(**payload.dict())
    db.add(new_filament)
    try:
        await db.commit()
        await db.refresh(new_filament)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Duplicate filament or constraint error")

    logger.info(f"➕ Created new filament: {new_filament.name}")
    return new_filament


@router.delete(
    "/{filament_id}",
    summary="Soft-delete a filament (set is_active=False)",
    status_code=status.HTTP_200_OK,
)
async def delete_filament(
    filament_id: int = Path(...),
    hard: bool = Query(False, description="Set true to permanently delete"),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Soft delete (is_active=False) or hard delete a filament.
    """
    stmt = select(Filament).where(Filament.id == filament_id)
    result = await db.execute(stmt)
    filament = result.scalar_one_or_none()

    if filament is None:
        raise HTTPException(status_code=404, detail="Filament not found")

    if hard:
        await db.delete(filament)
        logger.warning(f"🗑 Hard-deleted filament {filament_id}")
    else:
        filament.is_active = False
        logger.info(f"🛑 Soft-deleted filament {filament_id} (is_active=False)")

    await db.commit()
    return {"status": "ok", "deleted": filament_id, "hard": hard}


@router.patch(
    "/{filament_id}",
    summary="Update an existing filament",
    status_code=status.HTTP_200_OK,
    response_model=FilamentOut,
)
async def update_filament(
    filament_id: int = Path(..., description="Filament ID to update"),
    payload: FilamentCreate = Body(...),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Update a filament entry by ID.
    """
    stmt = select(Filament).where(Filament.id == filament_id)
    result = await db.execute(stmt)
    filament = result.scalar_one_or_none()

    if filament is None:
        raise HTTPException(status_code=404, detail="Filament not found")

    for field, value in payload.dict(exclude_unset=True).items():
        setattr(filament, field, value)

    try:
        await db.commit()
        await db.refresh(filament)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Update failed due to constraint error")

    logger.info(f"✏️ Updated filament {filament_id}: {filament.name}")
    return filament

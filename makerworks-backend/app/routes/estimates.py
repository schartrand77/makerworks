# app/routes/estimates.py

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_async_db
from app.dependencies.auth import get_user_from_headers
from app.models import User
from app.schemas.estimate import EstimateRequest, EstimateResponse
from app.services.estimate_service import calculate_estimate

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post(
    "/",
    summary="Calculate print time and cost estimate",
    response_model=EstimateResponse,
    status_code=status.HTTP_200_OK,
)
async def estimate_model(
    data: EstimateRequest,
    db: AsyncSession = Depends(get_async_db),
    user: User = Depends(get_user_from_headers),
):
    """
    Estimate print time and cost based on user-selected options and model metadata.
    """
    try:
        result = await calculate_estimate(data, db)
        return result
    except ValueError as e:
        # e.g., invalid input, missing metadata, etc.
        logger.warning(f"[ESTIMATE] Bad request: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid estimate request: {e!s}") from e
    except Exception as e:
        logger.exception(f"[ESTIMATE] Internal error: {e}")
        raise HTTPException(status_code=500, detail="Estimation failed due to server error.") from e

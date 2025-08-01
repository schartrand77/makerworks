from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import (
    EstimateSettings,
    Filament,
    FilamentPricing,
    ModelMetadata,
)
from app.schemas.estimate import EstimateRequest, EstimateResponse

PROFILE_SPEEDS = {
    "standard": 8.0,
    "quality": 5.0,
    "elite": 3.5,
}

# Average PLA density in g/mm^3 (1.24 g/cm^3)
DENSITY_G_PER_MM3 = 0.00124


def calculate_estimate(data: EstimateRequest, db: Session) -> EstimateResponse:
    # Get model volume from database (already extracted from geometry)
    stmt = select(ModelMetadata).where(ModelMetadata.id == data.model_id)
    model = db.execute(stmt).scalar_one_or_none()
    if not model:
        raise ValueError("Model not found.")

    volume_mm3 = model.volume_mm3

    # Get filament price
    fil_stmt = select(Filament).where(Filament.name == data.filament_type)
    filament = db.execute(fil_stmt).scalar_one_or_none()
    if not filament:
        raise ValueError("Filament not found.")

    price_stmt = (
        select(FilamentPricing)
        .where(FilamentPricing.filament_id == filament.id)
        .order_by(FilamentPricing.created_at.desc())
    )
    pricing = db.execute(price_stmt).scalar_one_or_none()
    if not pricing:
        raise ValueError("Filament pricing not found.")

    grams = volume_mm3 * DENSITY_G_PER_MM3
    cost = grams * pricing.price_per_gram

    # Custom text fee (optional)
    if data.custom_text:
        settings_stmt = select(EstimateSettings)
        settings = db.execute(settings_stmt).scalar_one_or_none()
        base_cost = settings.custom_text_base_cost if settings else 2.00
        per_char = settings.custom_text_cost_per_char if settings else 0.10
        cost += base_cost + len(data.custom_text) * per_char

    # Time estimate
    speed = PROFILE_SPEEDS.get(data.print_profile, 5.0)
    minutes = volume_mm3 / (speed * 60)

    return EstimateResponse(
        estimated_time_minutes=round(minutes, 2), estimated_cost_usd=round(cost, 2)
    )

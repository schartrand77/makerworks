# app/db/base.py

from sqlalchemy.orm import DeclarativeMeta
from app.db.base_class import Base as BaseClass
from app.models import models  # Ensures all models are imported and registered

from app.models.models import (
    User,
    Estimate,
    EstimateSettings,
    Favorite,
    Filament,
    ModelMetadata,
    AuditLog,
    FilamentPricing,
    UploadJob,
    CheckoutSession,
)

# ✅ Explicitly declare Base and metadata so Alembic can discover tables
Base: DeclarativeMeta = BaseClass
metadata = Base.metadata

# app/db/base.py

from sqlalchemy.orm import DeclarativeMeta
from app.db.base_class import Base  # ✅ <-- This is the missing import
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

# Explicitly reference Base's metadata so Alembic can autogenerate migrations
metadata = Base.metadata

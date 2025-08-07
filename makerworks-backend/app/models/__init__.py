# app/models/__init__.py

from app.db.database import Base  # ✅ Ensure Base is available

# ✅ All models are defined inside models/models.py
from .models import (
    User,
    ModelUpload,
    ModelMetadata,
    Estimate,
    EstimateSettings,
    Favorite,
    Filament,
    FilamentPricing,
    AuditLog,
    CheckoutSession,
    UploadJob,
)

# Alias for backwards compatibility if anything referenced Model3D
Model3D = ModelMetadata

__all__ = [
    "Base",
    "User",
    "ModelUpload",
    "ModelMetadata",
    "Model3D",
    "Estimate",
    "EstimateSettings",
    "Favorite",
    "Filament",
    "FilamentPricing",
    "AuditLog",
    "CheckoutSession",
    "UploadJob",
]

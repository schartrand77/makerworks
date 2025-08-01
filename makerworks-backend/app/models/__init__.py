# app/models/__init__.py

from app.models.models import (
    Base,
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

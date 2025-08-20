# app/models/__init__.py

"""
Aggregate exports for all ORM models.

- Keeps legacy models from app/models/models.py
- Adds inventory models from app/models/inventory.py
- Exposes a single Base for Alembic and metadata discovery
"""

# --- Resolve Base from your project (no new metadata objects) ---
try:
    # Common in this repo
    from app.db.database import Base  # type: ignore
except Exception:
    try:
        # Alternate layout
        from app.db.base import Base  # type: ignore
    except Exception:
        try:
            # Older layout
            from app.db.base_class import Base  # type: ignore
        except Exception:  # pragma: no cover
            # Last-resort fallback to avoid import explosions in dev.
            # NOTE: This creates a separate metadata; only used if your DB base isn’t importable.
            from sqlalchemy.orm import DeclarativeBase

            class Base(DeclarativeBase):  # type: ignore
                pass


# --- Legacy/core models (kept for compatibility) ---
from .models import (  # noqa: E402
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


# --- Inventory models (new) ---
# These do not import this __init__, so no circular import.
from .inventory import (  # noqa: E402
    Brand,
    Category,
    Product,
    ProductVariant,
    Media,
    Warehouse,
    InventoryLevel,
    Supplier,
    SupplierSKU,
    StockMove,
    UserItem,
)


__all__ = [
    # Base
    "Base",
    # Legacy/core
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
    # Inventory
    "Brand",
    "Category",
    "Product",
    "ProductVariant",
    "Media",
    "Warehouse",
    "InventoryLevel",
    "Supplier",
    "SupplierSKU",
    "StockMove",
    "UserItem",
]

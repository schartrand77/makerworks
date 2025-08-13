# app/models/models.py

from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import (
    Column,
    String,
    DateTime,
    ForeignKey,
    Boolean,
    Text,
    Float,
    Integer,
    event,
    JSON,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

# ── Settings (tolerate both module layouts) ────────────────────────────────────
try:
    from app.core.config import settings  # preferred
except Exception:
    from app.config.settings import settings  # legacy

# Base class
try:
    from app.db.base import Base  # newer layout
except Exception:
    from app.db.base_class import Base  # legacy layout

# Resolve uploads root safely (used by the path normalizer)
try:
    # Prefer the canonical root the app sets; fall back to settings/uploads
    uploads_root = Path(getattr(settings, "UPLOAD_DIR", getattr(settings, "uploads_path", "/uploads"))).resolve()
except Exception:
    logging.warning("⚠️ uploads path not configured, using /uploads fallback")
    uploads_root = Path("/uploads").resolve()


# =========================
# User Model
# =========================
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)

    name = Column(String, nullable=True)
    avatar = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    avatar_updated_at = Column(DateTime(timezone=True), nullable=True)

    bio = Column(Text, nullable=True)
    language = Column(String, default="en")
    theme = Column(String, default="light")

    role = Column(String, default="user")
    is_verified = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_login = Column(DateTime(timezone=True), nullable=True)

    uploads = relationship("ModelUpload", back_populates="user", cascade="all, delete-orphan")
    estimates = relationship("Estimate", back_populates="user", cascade="all, delete-orphan")
    favorites = relationship("Favorite", back_populates="user", cascade="all, delete-orphan")
    checkout_sessions = relationship("CheckoutSession", back_populates="user", cascade="all, delete-orphan")


# =========================
# Model Upload Table
# =========================
class ModelUpload(Base):
    __tablename__ = "model_uploads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Use Text for anything that can exceed 255 (filenames, file paths, URLs)
    filename = Column(Text, nullable=False)        # original filename
    file_path = Column(Text, nullable=False)       # filesystem path (container)
    file_url = Column(Text, nullable=True)         # served URL (e.g., /models/... or /uploads/...)

    thumbnail_path = Column(Text, nullable=True)
    turntable_path = Column(Text, nullable=True)

    name = Column(Text, nullable=True)
    description = Column(Text, nullable=True)

    uploaded_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Geometry / analysis
    volume = Column(Float, nullable=True)
    bbox = Column(JSON, nullable=True)             # store dict like {"x":..,"y":..,"z":..}
    faces = Column(Integer, nullable=True)
    vertices = Column(Integer, nullable=True)

    geometry_hash = Column(String(64), nullable=True, index=True)
    is_duplicate = Column(Boolean, default=False, nullable=False)

    user = relationship("User", back_populates="uploads")
    estimates = relationship("Estimate", back_populates="model", cascade="all, delete-orphan")
    favorites = relationship("Favorite", back_populates="model", cascade="all, delete-orphan")

    # Rich metadata rows
    metadata_entries = relationship(
        "ModelMetadata",
        back_populates="model",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        Index("ix_model_uploads_user_uploaded_at", "user_id", "uploaded_at"),
    )


# ✅ Normalize FS paths (NOT URLs) before insert/update to be relative to uploads_root
@event.listens_for(ModelUpload, "before_insert")
@event.listens_for(ModelUpload, "before_update")
def normalize_modelupload_paths(mapper, connection, target: ModelUpload):
    def normalize_path(value: str) -> str:
        if not value:
            return value
        p = Path(value)
        # if not absolute, interpret relative to uploads_root
        if not p.is_absolute():
            p = uploads_root / p
        try:
            # store relative-to-root path (portable across hosts)
            rel = p.relative_to(uploads_root).as_posix()
            return rel
        except Exception:
            logging.warning("⚠️ Path outside uploads root: %s (keeping as-is)", p)
            return value

    if target.file_path:
        target.file_path = normalize_path(target.file_path)
    if target.thumbnail_path:
        target.thumbnail_path = normalize_path(target.thumbnail_path)
    if target.turntable_path:
        target.turntable_path = normalize_path(target.turntable_path)
    # IMPORTANT: do NOT normalize file_url — it's already a URL rooted at /uploads or /models


# =========================
# Estimate Table
# =========================
class Estimate(Base):
    __tablename__ = "estimates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    model_id = Column(UUID(as_uuid=True), ForeignKey("model_uploads.id", ondelete="CASCADE"), nullable=False)

    filament_type = Column(String, nullable=False)
    filament_color = Column(String, nullable=True)
    custom_text = Column(String, nullable=True)

    x_size = Column(Float, nullable=False)
    y_size = Column(Float, nullable=False)
    z_size = Column(Float, nullable=False)

    estimated_volume = Column(Float, nullable=True)
    estimated_time = Column(Float, nullable=True)
    estimated_cost = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="estimates")
    model = relationship("ModelUpload", back_populates="estimates")


# =========================
# Estimate Settings
# =========================
class EstimateSettings(Base):
    __tablename__ = "estimate_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key = Column(String, unique=True, nullable=False)
    value = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


# =========================
# Favorites
# =========================
class Favorite(Base):
    __tablename__ = "favorites"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    model_id = Column(UUID(as_uuid=True), ForeignKey("model_uploads.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="favorites")
    model = relationship("ModelUpload", back_populates="favorites")


# =========================
# Filaments
# =========================
class Filament(Base):
    __tablename__ = "filaments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    material = Column(String, nullable=False)
    type = Column(String, nullable=False)
    color_name = Column(String, nullable=False)
    color_hex = Column(String, nullable=False)
    price_per_kg = Column(Float, nullable=False)
    attributes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class FilamentPricing(Base):
    __tablename__ = "filament_pricing"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filament_id = Column(UUID(as_uuid=True), ForeignKey("filaments.id", ondelete="CASCADE"), nullable=False)

    price_per_gram = Column(Float, nullable=False)
    price_per_mm3 = Column(Float, nullable=True)

    effective_date = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    filament = relationship("Filament")


# =========================
# Model Metadata
# =========================
class ModelMetadata(Base):
    __tablename__ = "model_metadata"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_id = Column(UUID(as_uuid=True), ForeignKey("model_uploads.id", ondelete="CASCADE"), nullable=False)

    volume = Column(Float, nullable=True)
    surface_area = Column(Float, nullable=True)
    bbox_x = Column(Float, nullable=True)
    bbox_y = Column(Float, nullable=True)
    bbox_z = Column(Float, nullable=True)
    faces = Column(Integer, nullable=True)
    vertices = Column(Integer, nullable=True)
    geometry_hash = Column(String(64), nullable=True, unique=True, index=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    model = relationship("ModelUpload", back_populates="metadata_entries")


# =========================
# Audit Log
# =========================
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String, nullable=False)
    details = Column(Text, nullable=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User")


# =========================
# Checkout Session
# =========================
class CheckoutSession(Base):
    __tablename__ = "checkout_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    session_id = Column(String, nullable=False, unique=True)
    payment_intent = Column(String, nullable=True)
    amount_total = Column(Float, nullable=False)
    currency = Column(String, default="usd")
    status = Column(String, default="pending")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="checkout_sessions")


# =========================
# Upload Jobs
# =========================
class UploadJob(Base):
    __tablename__ = "upload_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_id = Column(UUID(as_uuid=True), ForeignKey("model_uploads.id", ondelete="CASCADE"), nullable=False)

    status = Column(String, default="pending")
    progress = Column(Float, default=0.0)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    model = relationship("ModelUpload", lazy="joined")

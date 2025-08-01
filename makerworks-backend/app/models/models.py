# app/models/models.py

import uuid
from datetime import datetime
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
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.base_class import Base
from app.config.settings import settings

# Resolve uploads root safely
try:
    uploads_root = Path(settings.uploads_path).resolve()
except Exception:
    import logging
    logging.warning("⚠️ uploads_path not configured, using /app/uploads fallback")
    uploads_root = Path("/app/uploads").resolve()


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
    avatar_updated_at = Column(DateTime, nullable=True)

    bio = Column(Text, nullable=True)
    language = Column(String, default="en")
    theme = Column(String, default="light")

    role = Column(String, default="user")
    is_verified = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

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
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_url = Column(String, nullable=True)

    thumbnail_path = Column(String, nullable=True)
    turntable_path = Column(String, nullable=True)

    name = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    uploaded_at = Column(DateTime, default=datetime.utcnow)

    volume = Column(String, nullable=True)
    bbox = Column(String, nullable=True)
    faces = Column(String, nullable=True)
    vertices = Column(String, nullable=True)

    geometry_hash = Column(String, nullable=True)
    is_duplicate = Column(Boolean, default=False, nullable=False)

    user = relationship("User", back_populates="uploads")
    estimates = relationship("Estimate", back_populates="model", cascade="all, delete-orphan")
    favorites = relationship("Favorite", back_populates="model", cascade="all, delete-orphan")
    metadata_entries = relationship("ModelMetadata", back_populates="model", cascade="all, delete-orphan")


# ✅ Normalize all upload-related paths before insert/update
@event.listens_for(ModelUpload, "before_insert")
@event.listens_for(ModelUpload, "before_update")
def normalize_modelupload_paths(mapper, connection, target):
    def normalize_path(value: str) -> str:
        if not value:
            return value
        path = Path(value)
        if not path.is_absolute():
            path = uploads_root / path
        try:
            return path.relative_to(uploads_root).as_posix()
        except ValueError:
            import logging
            logging.warning("⚠️ Path outside uploads root: %s", path)
            return value

    if target.file_path:
        target.file_path = normalize_path(target.file_path)
    if target.thumbnail_path:
        target.thumbnail_path = normalize_path(target.thumbnail_path)
    if target.turntable_path:
        target.turntable_path = normalize_path(target.turntable_path)


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

    created_at = Column(DateTime, default=datetime.utcnow)

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
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# =========================
# Favorites
# =========================
class Favorite(Base):
    __tablename__ = "favorites"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    model_id = Column(UUID(as_uuid=True), ForeignKey("model_uploads.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

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
    is_active = Column(Boolean, default=True, nullable=False, server_default="true")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class FilamentPricing(Base):
    __tablename__ = "filament_pricing"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filament_id = Column(UUID(as_uuid=True), ForeignKey("filaments.id", ondelete="CASCADE"), nullable=False)

    price_per_gram = Column(Float, nullable=False)
    price_per_mm3 = Column(Float, nullable=True)

    effective_date = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

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
    geometry_hash = Column(String, nullable=True, unique=True)

    created_at = Column(DateTime, default=datetime.utcnow)

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
    created_at = Column(DateTime, default=datetime.utcnow)

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
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

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

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    model = relationship("ModelUpload")

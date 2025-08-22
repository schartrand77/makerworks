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
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.ext.hybrid import hybrid_property

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
    printed_examples = relationship("PrintedExample", back_populates="user", cascade="all, delete-orphan")

    __table_args__ = (Index("ix_users_role", "role"),)

    @hybrid_property
    def is_admin(self) -> bool:
        return (self.role or "").strip().lower() == "admin"

    @is_admin.expression  # type: ignore
    def is_admin(cls):
        return func.lower(func.coalesce(cls.role, "")) == "admin"

    def __repr__(self) -> str:
        return f"<User {self.username} ({self.email}) role={self.role}>"


# =========================
# Model Upload Table
# =========================
class ModelUpload(Base):
    __tablename__ = "model_uploads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    filename = Column(Text, nullable=False)
    file_path = Column(Text, nullable=False)
    file_url = Column(Text, nullable=True)

    thumbnail_path = Column(Text, nullable=True)
    turntable_path = Column(Text, nullable=True)

    name = Column(Text, nullable=True)
    description = Column(Text, nullable=True)

    uploaded_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    volume = Column(Float, nullable=True)
    bbox = Column(JSON, nullable=True)
    faces = Column(Integer, nullable=True)
    vertices = Column(Integer, nullable=True)

    geometry_hash = Column(String(64), nullable=True, index=True)
    is_duplicate = Column(Boolean, default=False, nullable=False)

    user = relationship("User", back_populates="uploads")
    estimates = relationship("Estimate", back_populates="model", cascade="all, delete-orphan")
    favorites = relationship("Favorite", back_populates="model", cascade="all, delete-orphan")

    metadata_entries = relationship("ModelMetadata", back_populates="model", cascade="all, delete-orphan", lazy="selectin")
    printed_examples = relationship("PrintedExample", back_populates="model", cascade="all, delete-orphan", lazy="selectin")

    __table_args__ = (Index("ix_model_uploads_user_uploaded_at", "user_id", "uploaded_at"),)


@event.listens_for(ModelUpload, "before_insert")
@event.listens_for(ModelUpload, "before_update")
def normalize_modelupload_paths(mapper, connection, target: "ModelUpload"):
    def normalize_path(value: str) -> str:
        if not value:
            return value
        p = Path(value)
        if not p.is_absolute():
            p = uploads_root / p
        try:
            return p.resolve().relative_to(uploads_root).as_posix()
        except Exception as exc:
            raise ValueError(f"Path outside uploads root: {p}") from exc

    if target.file_path:
        target.file_path = normalize_path(target.file_path)
    if target.thumbnail_path:
        target.thumbnail_path = normalize_path(target.thumbnail_path)
    if target.turntable_path:
        target.turntable_path = normalize_path(target.turntable_path)


# =========================
# Printed Examples
# =========================
class PrintedExample(Base):
    __tablename__ = "printed_examples"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_id = Column(UUID(as_uuid=True), ForeignKey("model_uploads.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    title = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    printer_brand = Column(String, nullable=True)
    printer_model = Column(String, nullable=True)
    slicer = Column(String, nullable=True)

    filament_material = Column(String, nullable=True)
    filament_brand = Column(String, nullable=True)
    filament_color_name = Column(String, nullable=True)
    filament_color_hex = Column(String, nullable=True)

    nozzle_mm = Column(Float, nullable=True)
    layer_height_mm = Column(Float, nullable=True)
    infill_percent = Column(Float, nullable=True)
    wall_count = Column(Integer, nullable=True)
    supports = Column(Boolean, nullable=True)
    adhesion = Column(String, nullable=True)

    nozzle_temp_c = Column(Integer, nullable=True)
    bed_temp_c = Column(Integer, nullable=True)
    speed_mm_s = Column(Float, nullable=True)

    scale_percent = Column(Float, nullable=True)
    orientation = Column(JSON, nullable=True)

    print_time_sec = Column(Integer, nullable=True)
    filament_used_g = Column(Float, nullable=True)
    cost_estimated = Column(Float, nullable=True)

    visibility = Column(String, default="public")
    license = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    model = relationship("ModelUpload", back_populates="printed_examples")
    user = relationship("User", back_populates="printed_examples")
    images = relationship("ExampleImage", back_populates="example", cascade="all, delete-orphan", lazy="selectin")

    __table_args__ = (
        Index("ix_printed_examples_model_created_at", "model_id", "created_at"),
        Index("ix_printed_examples_user_created_at", "user_id", "created_at"),
    )


class ExampleImage(Base):
    __tablename__ = "example_images"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    example_id = Column(UUID(as_uuid=True), ForeignKey("printed_examples.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    file_path = Column(Text, nullable=False)
    file_url = Column(Text, nullable=True)
    thumbnail_path = Column(Text, nullable=True)

    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    exif = Column(JSON, nullable=True)

    sha256 = Column(String(64), nullable=True, index=True)
    blurhash = Column(String, nullable=True)

    order_index = Column(Integer, default=0, nullable=False)
    is_primary = Column(Boolean, default=False, nullable=False)
    status = Column(String, default="active", nullable=False)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    example = relationship("PrintedExample", back_populates="images")
    user = relationship("User")

    __table_args__ = (Index("ix_example_images_example_order", "example_id", "order_index"),)


@event.listens_for(ExampleImage, "before_insert")
@event.listens_for(ExampleImage, "before_update")
def normalize_exampleimage_paths(mapper, connection, target: "ExampleImage"):
    def normalize_path(value: str) -> str:
        if not value:
            return value
        p = Path(value)
        if not p.is_absolute():
            p = uploads_root / p
        try:
            return p.relative_to(uploads_root).as_posix()
        except Exception:
            logging.warning("⚠️ Path outside uploads root: %s (keeping as-is)", p)
            return value

    if target.file_path:
        target.file_path = normalize_path(target.file_path)
    if target.thumbnail_path:
        target.thumbnail_path = normalize_path(target.thumbnail_path)
    # do not touch file_url


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


# ─────────────────────────────────────────────────────────────────────
# Filaments (canonical + legacy compatibility) and FilamentPricing
# ─────────────────────────────────────────────────────────────────────
class Filament(Base):
    __tablename__ = "filaments"
    __table_args__ = (
        # allow multiple NULLs; still dedupe real entries
        UniqueConstraint("name", "category", "color_hex", name="uq_public_filaments_name_category_colorhex"),
        Index("ix_public_filaments_type_color_hex", "type", "color_name", "color_hex"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Canonical (now tolerant / nullable to avoid 500s on partial input)
    name = Column(String(128), nullable=True)
    category = Column(String(64), nullable=True)
    color_hex = Column(String(16), nullable=True)
    price_per_kg = Column(Float, nullable=True, default=0.0)

    # Legacy (kept nullable)
    material = Column(String, nullable=True)
    type = Column(String, nullable=True)          # legacy alias of category
    color_name = Column(String, nullable=True)    # legacy alias of color/name

    attributes = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    pricing = relationship("FilamentPricing", back_populates="filament", cascade="all, delete-orphan", lazy="selectin")

    # ---------- Hybrid compatibility aliases ----------
    @hybrid_property
    def color(self) -> str | None:
        return self.color_name

    @color.expression  # type: ignore[misc]
    def color(cls):
        return cls.color_name

    @hybrid_property
    def hex(self) -> str | None:
        return self.color_hex

    @hex.expression  # type: ignore[misc]
    def hex(cls):
        return cls.color_hex

    @hybrid_property
    def name_display(self) -> str:
        base = f"{(self.category or self.type or '').strip()} {(self.color_name or '').strip()}".strip()
        return base or (self.name or "")

    @name_display.expression  # type: ignore[misc]
    def name_display(cls):
        return func.concat_ws(" ", func.coalesce(cls.category, cls.type), cls.color_name)

    def __repr__(self) -> str:
        cat = self.category or self.type or "?"
        col = self.color_name or "?"
        hx = self.color_hex or "??????"
        price = self.price_per_kg if self.price_per_kg is not None else 0.0
        return f"<Filament {cat}/{col} #{hx} ${price}/kg>"


def _norm_hex(v: str | None) -> str | None:
    if not v:
        return v
    v = v.strip()
    if not v:
        return None
    if not v.startswith("#"):
        v = "#" + v
    return v


@event.listens_for(Filament, "before_insert")
@event.listens_for(Filament, "before_update")
def normalize_and_derive_filament(mapper, connection, target: "Filament"):
    """
    Make the model resilient to partial/legacy payloads:
    - ensure hex fields start with '#'
    - derive category/type/name when missing
    - default price_per_kg to 0.0 if None
    """
    target.color_hex = _norm_hex(target.color_hex)
    # keep legacy alias in sync if only one is present
    if target.hex and not target.color_hex:
        target.color_hex = _norm_hex(target.hex)  # type: ignore[attr-defined]
    if target.color_hex and not target.hex:
        target.hex = target.color_hex  # hybrid_property allows assignment on instance

    # Derive category from legacy 'type'
    if not (target.category or "").strip() and (target.type or "").strip():
        target.category = (target.type or "").strip()

    # Derive display-ish name if empty
    if not (target.name or "").strip():
        derived = " ".join(x for x in [(target.category or target.type or "").strip(), (target.color_name or "").strip()] if x)
        target.name = derived or None

    # Price default
    if target.price_per_kg is None:
        target.price_per_kg = 0.0


class FilamentPricing(Base):
    __tablename__ = "filament_pricing"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filament_id = Column(UUID(as_uuid=True), ForeignKey("filaments.id", ondelete="CASCADE"), nullable=False)

    price_per_gram = Column(Float, nullable=False)
    price_per_mm3 = Column(Float, nullable=True)

    effective_date = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    filament = relationship("Filament", back_populates="pricing", lazy="joined")

    def __repr__(self) -> str:
        return f"<FilamentPricing filament={self.filament_id} g={self.price_per_gram} mm3={self.price_per_mm3}>"


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

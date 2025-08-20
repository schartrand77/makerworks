# app/models/inventory.py
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, DeclarativeBase, mapped_column, relationship

# Use your project's Base if present; otherwise define one.
try:
    from app.db.base import Base  # type: ignore
except Exception:
    try:
        from app.db.base_class import Base  # type: ignore
    except Exception:
        class Base(DeclarativeBase):  # type: ignore
            pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ──────────────────────────────────────────────────────────────────────────────
# Catalog
# ──────────────────────────────────────────────────────────────────────────────
class Brand(Base):
    __tablename__ = "brands"
    __table_args__ = {"schema": "public"}

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    website: Mapped[Optional[str]] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    products: Mapped[List["Product"]] = relationship(back_populates="brand")


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = {"schema": "public"}

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    parent_id: Mapped[Optional[UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("public.categories.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    parent: Mapped[Optional["Category"]] = relationship(
        back_populates="children",
        remote_side="Category.id",
    )
    children: Mapped[List["Category"]] = relationship(
        back_populates="parent",
        cascade="all, delete-orphan",
    )

    products: Mapped[List["Product"]] = relationship(back_populates="category")


class Product(Base):
    __tablename__ = "products"
    __table_args__ = {"schema": "public"}

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    brand_id: Mapped[Optional[UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("public.brands.id"))
    category_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("public.categories.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    brand: Mapped[Optional[Brand]] = relationship(back_populates="products")
    category: Mapped[Category] = relationship(back_populates="products")
    variants: Mapped[List["ProductVariant"]] = relationship(back_populates="product", cascade="all, delete-orphan")
    media: Mapped[List["Media"]] = relationship(back_populates="product", cascade="all, delete-orphan")


class ProductVariant(Base):
    __tablename__ = "product_variants"
    __table_args__ = {"schema": "public"}

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    product_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("public.products.id", ondelete="CASCADE"),
        nullable=False,
    )
    sku: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    price_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    compare_at_cents: Mapped[Optional[int]] = mapped_column(Integer)
    attributes: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    product: Mapped[Product] = relationship(back_populates="variants")
    media: Mapped[List["Media"]] = relationship(back_populates="variant", cascade="all, delete-orphan")
    inventory_levels: Mapped[List["InventoryLevel"]] = relationship(back_populates="variant", cascade="all, delete-orphan")
    supplier_skus: Mapped[List["SupplierSKU"]] = relationship(back_populates="variant", cascade="all, delete-orphan")
    user_items: Mapped[List["UserItem"]] = relationship(back_populates="variant", cascade="all, delete-orphan")


class Media(Base):
    __tablename__ = "media"
    __table_args__ = {"schema": "public"}

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    product_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("public.products.id", ondelete="CASCADE"),
    )
    variant_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("public.product_variants.id", ondelete="CASCADE"),
    )
    url: Mapped[str] = mapped_column(String(512), nullable=False)
    alt: Mapped[Optional[str]] = mapped_column(String(200))
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    product: Mapped[Optional[Product]] = relationship(back_populates="media")
    variant: Mapped[Optional[ProductVariant]] = relationship(back_populates="media")


# ──────────────────────────────────────────────────────────────────────────────
# Stock & Warehousing
# ──────────────────────────────────────────────────────────────────────────────
class Warehouse(Base):
    __tablename__ = "warehouses"
    __table_args__ = {"schema": "public"}

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    levels: Mapped[List["InventoryLevel"]] = relationship(back_populates="warehouse", cascade="all, delete-orphan")
    moves: Mapped[List["StockMove"]] = relationship(back_populates="warehouse", cascade="all, delete-orphan")


class InventoryLevel(Base):
    __tablename__ = "inventory_levels"
    __table_args__ = {"schema": "public"}

    variant_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("public.product_variants.id", ondelete="CASCADE"),
        primary_key=True,
    )
    warehouse_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("public.warehouses.id", ondelete="CASCADE"),
        primary_key=True,
    )
    on_hand: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reserved: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    variant: Mapped[ProductVariant] = relationship(back_populates="inventory_levels")
    warehouse: Mapped[Warehouse] = relationship(back_populates="levels")


class Supplier(Base):
    __tablename__ = "suppliers"
    __table_args__ = {"schema": "public"}

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    contact_email: Mapped[Optional[str]] = mapped_column(String(200))
    website: Mapped[Optional[str]] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    skus: Mapped[List["SupplierSKU"]] = relationship(back_populates="supplier", cascade="all, delete-orphan")


class SupplierSKU(Base):
    __tablename__ = "supplier_skus"
    __table_args__ = (
        UniqueConstraint("supplier_id", "variant_id", name="uq_supplier_variant"),
        {"schema": "public"},
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    supplier_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("public.suppliers.id", ondelete="CASCADE"),
        nullable=False,
    )
    variant_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("public.product_variants.id", ondelete="CASCADE"),
        nullable=False,
    )
    supplier_sku: Mapped[str] = mapped_column(String(120), nullable=False)
    cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    supplier: Mapped[Supplier] = relationship(back_populates="skus")
    variant: Mapped[ProductVariant] = relationship(back_populates="supplier_skus")


StockMoveType = Enum("purchase", "sale", "adjust", "transfer", name="stock_move_type")


class StockMove(Base):
    __tablename__ = "stock_moves"
    __table_args__ = {"schema": "public"}

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    variant_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("public.product_variants.id", ondelete="CASCADE"),
        nullable=False,
    )
    warehouse_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("public.warehouses.id", ondelete="CASCADE"),
        nullable=False,
    )
    qty: Mapped[int] = mapped_column(Integer, nullable=False)  # positive; sign implied by type
    type: Mapped[str] = mapped_column(StockMoveType, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    warehouse: Mapped[Warehouse] = relationship(back_populates="moves")
    variant: Mapped[ProductVariant] = relationship()


# ──────────────────────────────────────────────────────────────────────────────
# User-owned inventory
# ──────────────────────────────────────────────────────────────────────────────
class UserItem(Base):
    __tablename__ = "user_items"
    __table_args__ = {"schema": "public"}

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    variant_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("public.product_variants.id", ondelete="CASCADE"),
        nullable=False,
    )
    qty: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    cost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    variant: Mapped[ProductVariant] = relationship(back_populates="user_items")

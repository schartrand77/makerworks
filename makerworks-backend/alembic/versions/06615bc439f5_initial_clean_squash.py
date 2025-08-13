"""initial_clean_squash (BASE SCHEMA)

This is a full base migration that creates the current schema from scratch:
- All core tables (users, model_uploads, model_metadata, favorites, estimates, estimate_settings,
  filaments, filament_pricing, checkout_sessions, upload_jobs, audit_logs)
- FKs, indexes and sensible defaults
- The compatibility VIEW public.models and its INSTEAD OF triggers

For existing databases that already match this schema, do:
    alembic stamp 06615bc439f5

For fresh installs, do:
    alembic upgrade head

Revision ID: 06615bc439f5
Revises: None
Create Date: 2025-08-13 22:07:18.590165
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "06615bc439f5"
down_revision: Union[str, None] = None  # <- BASE
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ──────────────────────────────────────────────────────────────────────────────
# Helper short-hands
# ──────────────────────────────────────────────────────────────────────────────
UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    # ──────────────────────────────────────────────────────────────────────
    # users
    # ──────────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("avatar", sa.String(), nullable=True),
        sa.Column("avatar_url", sa.String(), nullable=True),
        sa.Column("avatar_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("language", sa.String(), nullable=False, server_default=sa.text("'en'")),
        sa.Column("theme", sa.String(), nullable=False, server_default=sa.text("'light'")),
        sa.Column("role", sa.String(), nullable=False, server_default=sa.text("'user'")),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
        schema="public",
    )
    op.create_index("ix_public_users_email", "users", ["email"], unique=True, schema="public")
    op.create_index("ix_public_users_username", "users", ["username"], unique=True, schema="public")

    # ──────────────────────────────────────────────────────────────────────
    # model_uploads
    # ──────────────────────────────────────────────────────────────────────
    op.create_table(
        "model_uploads",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("user_id", UUID, sa.ForeignKey("public.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.Text(), nullable=False),           # original filename
        sa.Column("file_path", sa.Text(), nullable=False),          # absolute FS path in container
        sa.Column("file_url", sa.Text(), nullable=True),            # served URL (/uploads/... or /models/...)
        sa.Column("thumbnail_path", sa.Text(), nullable=True),
        sa.Column("turntable_path", sa.Text(), nullable=True),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("volume", sa.Float(), nullable=True),
        sa.Column("bbox", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("faces", sa.Integer(), nullable=True),
        sa.Column("vertices", sa.Integer(), nullable=True),
        sa.Column("geometry_hash", sa.String(length=64), nullable=True),
        sa.Column("is_duplicate", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        schema="public",
    )
    op.create_index("ix_public_model_uploads_user_id", "model_uploads", ["user_id"], unique=False, schema="public")
    op.create_index("ix_public_model_uploads_geometry_hash", "model_uploads", ["geometry_hash"], unique=False, schema="public")
    op.create_index(
        "ix_model_uploads_user_uploaded_at",
        "model_uploads",
        ["user_id", "uploaded_at"],
        unique=False,
        schema="public",
    )

    # ──────────────────────────────────────────────────────────────────────
    # model_metadata
    # ──────────────────────────────────────────────────────────────────────
    op.create_table(
        "model_metadata",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("model_id", UUID, sa.ForeignKey("public.model_uploads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("volume", sa.Float(), nullable=True),
        sa.Column("surface_area", sa.Float(), nullable=True),
        sa.Column("bbox_x", sa.Float(), nullable=True),
        sa.Column("bbox_y", sa.Float(), nullable=True),
        sa.Column("bbox_z", sa.Float(), nullable=True),
        sa.Column("faces", sa.Integer(), nullable=True),
        sa.Column("vertices", sa.Integer(), nullable=True),
        sa.Column("geometry_hash", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        schema="public",
    )
    # unique geometry hash (if you compute it)
    op.create_index(
        "ix_public_model_metadata_geometry_hash",
        "model_metadata",
        ["geometry_hash"],
        unique=True,
        schema="public",
    )

    # ──────────────────────────────────────────────────────────────────────
    # favorites
    # ──────────────────────────────────────────────────────────────────────
    op.create_table(
        "favorites",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("user_id", UUID, sa.ForeignKey("public.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("model_id", UUID, sa.ForeignKey("public.model_uploads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        schema="public",
    )

    # ──────────────────────────────────────────────────────────────────────
    # estimates
    # ──────────────────────────────────────────────────────────────────────
    op.create_table(
        "estimates",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("user_id", UUID, sa.ForeignKey("public.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("model_id", UUID, sa.ForeignKey("public.model_uploads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filament_type", sa.String(), nullable=False),
        sa.Column("filament_color", sa.String(), nullable=True),
        sa.Column("custom_text", sa.String(), nullable=True),
        sa.Column("x_size", sa.Float(), nullable=False),
        sa.Column("y_size", sa.Float(), nullable=False),
        sa.Column("z_size", sa.Float(), nullable=False),
        sa.Column("estimated_volume", sa.Float(), nullable=True),
        sa.Column("estimated_time", sa.Float(), nullable=True),
        sa.Column("estimated_cost", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        schema="public",
    )

    # ──────────────────────────────────────────────────────────────────────
    # estimate_settings
    # ──────────────────────────────────────────────────────────────────────
    op.create_table(
        "estimate_settings",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("key", sa.String(), nullable=False, unique=True),
        sa.Column("value", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        schema="public",
    )

    # ──────────────────────────────────────────────────────────────────────
    # filaments
    # ──────────────────────────────────────────────────────────────────────
    op.create_table(
        "filaments",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("material", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("color_name", sa.String(), nullable=False),
        sa.Column("color_hex", sa.String(), nullable=False),
        sa.Column("price_per_kg", sa.Float(), nullable=False),
        sa.Column("attributes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        schema="public",
    )

    # ──────────────────────────────────────────────────────────────────────
    # filament_pricing
    # ──────────────────────────────────────────────────────────────────────
    op.create_table(
        "filament_pricing",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("filament_id", UUID, sa.ForeignKey("public.filaments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("price_per_gram", sa.Float(), nullable=False),
        sa.Column("price_per_mm3", sa.Float(), nullable=True),
        sa.Column("effective_date", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        schema="public",
    )

    # ──────────────────────────────────────────────────────────────────────
    # checkout_sessions
    # ──────────────────────────────────────────────────────────────────────
    op.create_table(
        "checkout_sessions",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("user_id", UUID, sa.ForeignKey("public.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False, unique=True),
        sa.Column("payment_intent", sa.String(), nullable=True),
        sa.Column("amount_total", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(), nullable=False, server_default=sa.text("'usd'")),
        sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        schema="public",
    )

    # ──────────────────────────────────────────────────────────────────────
    # upload_jobs
    # ──────────────────────────────────────────────────────────────────────
    op.create_table(
        "upload_jobs",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("model_id", UUID, sa.ForeignKey("public.model_uploads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("progress", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        schema="public",
    )

    # ──────────────────────────────────────────────────────────────────────
    # audit_logs
    # ──────────────────────────────────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("user_id", UUID, sa.ForeignKey("public.users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("user_agent", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.text("now()")),
        schema="public",
    )

    # ──────────────────────────────────────────────────────────────────────
    # Compatibility VIEW + triggers (public.models)
    # ──────────────────────────────────────────────────────────────────────
    op.execute("""
    CREATE VIEW public.models AS
    SELECT
      mu.id,
      mu.user_id,
      mu.name,
      mu.description,
      mu.filename,
      mu.file_path,
      mu.file_url,
      mu.thumbnail_path,
      NULL::varchar AS thumbnail_url,
      mu.turntable_path,
      mu.uploaded_at
    FROM public.model_uploads mu;
    """)

    op.execute("""
    CREATE OR REPLACE FUNCTION public.models_ins_redirect()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.id IS NULL THEN
        RAISE EXCEPTION 'public.models insert requires id';
      END IF;
      IF NEW.user_id IS NULL THEN
        RAISE EXCEPTION 'public.models insert requires user_id';
      END IF;

      INSERT INTO public.model_uploads (
        id, user_id, filename, file_path, file_url, thumbnail_path,
        turntable_path, name, description, uploaded_at,
        volume, bbox, faces, vertices, geometry_hash, is_duplicate
      ) VALUES (
        NEW.id,
        NEW.user_id,
        COALESCE(NEW.filename, NEW.name || '.stl'),
        COALESCE(NEW.file_path, ''),
        NEW.file_url,
        NEW.thumbnail_path,
        NEW.turntable_path,
        NEW.name,
        NEW.description,
        COALESCE(NEW.uploaded_at, now()),
        NULL, NULL, NULL, NULL, NULL, FALSE
      );
      RETURN NEW;
    END
    $$;
    """)

    op.execute("""
    CREATE OR REPLACE FUNCTION public.models_upd_redirect()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      UPDATE public.model_uploads SET
        user_id        = COALESCE(NEW.user_id, user_id),
        filename       = COALESCE(NEW.filename, filename),
        file_path      = COALESCE(NEW.file_path, file_path),
        file_url       = NEW.file_url,
        thumbnail_path = NEW.thumbnail_path,
        turntable_path = NEW.turntable_path,
        name           = COALESCE(NEW.name, name),
        description    = COALESCE(NEW.description, description),
        uploaded_at    = COALESCE(NEW.uploaded_at, uploaded_at)
      WHERE id = COALESCE(NEW.id, OLD.id);
      RETURN NEW;
    END
    $$;
    """)

    op.execute("""
    CREATE OR REPLACE FUNCTION public.models_del_redirect()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      DELETE FROM public.model_uploads WHERE id = OLD.id;
      RETURN OLD;
    END
    $$;
    """)

    op.execute("""
    CREATE TRIGGER models_ins_redirect
      INSTEAD OF INSERT ON public.models
      FOR EACH ROW EXECUTE FUNCTION public.models_ins_redirect();
    """)
    op.execute("""
    CREATE TRIGGER models_upd_redirect
      INSTEAD OF UPDATE ON public.models
      FOR EACH ROW EXECUTE FUNCTION public.models_upd_redirect();
    """)
    op.execute("""
    CREATE TRIGGER models_del_redirect
      INSTEAD OF DELETE ON public.models
      FOR EACH ROW EXECUTE FUNCTION public.models_del_redirect();
    """)


def downgrade() -> None:
    # Drop VIEW + triggers/functions first
    op.execute("DROP TRIGGER IF EXISTS models_ins_redirect ON public.models;")
    op.execute("DROP TRIGGER IF EXISTS models_upd_redirect ON public.models;")
    op.execute("DROP TRIGGER IF EXISTS models_del_redirect ON public.models;")
    op.execute("DROP FUNCTION IF EXISTS public.models_ins_redirect();")
    op.execute("DROP FUNCTION IF EXISTS public.models_upd_redirect();")
    op.execute("DROP FUNCTION IF EXISTS public.models_del_redirect();")
    op.execute("DROP VIEW IF EXISTS public.models;")

    # Drop tables in reverse dependency order
    op.drop_table("audit_logs", schema="public")
    op.drop_table("upload_jobs", schema="public")
    op.drop_table("checkout_sessions", schema="public")
    op.drop_table("filament_pricing", schema="public")
    op.drop_table("filaments", schema="public")
    op.drop_table("estimate_settings", schema="public")
    op.drop_table("estimates", schema="public")
    op.drop_table("favorites", schema="public")
    op.drop_index("ix_public_model_metadata_geometry_hash", table_name="model_metadata", schema="public")
    op.drop_table("model_metadata", schema="public")
    op.drop_index("ix_model_uploads_user_uploaded_at", table_name="model_uploads", schema="public")
    op.drop_index("ix_public_model_uploads_geometry_hash", table_name="model_uploads", schema="public")
    op.drop_index("ix_public_model_uploads_user_id", table_name="model_uploads", schema="public")
    op.drop_table("model_uploads", schema="public")
    op.drop_index("ix_public_users_username", table_name="users", schema="public")
    op.drop_index("ix_public_users_email", table_name="users", schema="public")
    op.drop_table("users", schema="public")

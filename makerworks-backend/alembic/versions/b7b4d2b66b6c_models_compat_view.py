"""models compat view + triggers; unique constraint on (user_id, filename)

Revision ID: b7b4d2b66b6c
Revises: 764ffce01923
Create Date: 2025-08-10 16:20:00
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "b7b4d2b66b6c"
down_revision = "764ffce01923"
branch_labels = None
depends_on = None


def upgrade():
    # 0) Make sure the base table exists (you stamped past the creator)
    op.execute("""
    CREATE TABLE IF NOT EXISTS public.model_uploads (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      filename VARCHAR NOT NULL,
      file_path VARCHAR NOT NULL,
      file_url VARCHAR,
      thumbnail_path VARCHAR,
      turntable_path VARCHAR,
      name VARCHAR,
      description TEXT,
      uploaded_at TIMESTAMP WITHOUT TIME ZONE,
      volume VARCHAR,
      bbox VARCHAR,
      faces VARCHAR,
      vertices VARCHAR,
      geometry_hash VARCHAR,
      is_duplicate BOOLEAN NOT NULL DEFAULT FALSE
    );
    """)
    # Add FK to users if table exists and constraint not already present
    op.execute("""
    DO $$
    BEGIN
      IF to_regclass('public.users') IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'fk_model_uploads_user_id'
             AND conrelid = 'public.model_uploads'::regclass
         ) THEN
        ALTER TABLE public.model_uploads
          ADD CONSTRAINT fk_model_uploads_user_id
          FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
      END IF;
    END $$;
    """)

    # 1) Compatibility VIEW: public.models → public.model_uploads
    op.execute("""
    CREATE OR REPLACE VIEW public.models AS
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

    # 2) Redirect functions (INSTEAD OF triggers on the VIEW)
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

    # 3) Triggers on the VIEW
    op.execute("DROP TRIGGER IF EXISTS models_ins_redirect ON public.models;")
    op.execute("DROP TRIGGER IF EXISTS models_upd_redirect ON public.models;")
    op.execute("DROP TRIGGER IF EXISTS models_del_redirect ON public.models;")

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

    # 4) Helpful index for list views
    op.execute("""
    CREATE INDEX IF NOT EXISTS ix_model_uploads_user_date
      ON public.model_uploads (user_id, uploaded_at DESC);
    """)

    # 5) Unique constraint on (user_id, filename)
    op.execute("""
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_model_uploads_user_filename'
              AND conrelid = 'public.model_uploads'::regclass
      ) THEN
        ALTER TABLE public.model_uploads
          ADD CONSTRAINT uq_model_uploads_user_filename
          UNIQUE (user_id, filename);
      END IF;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END $$;
    """)


def downgrade():
    # Drop triggers
    op.execute("DROP TRIGGER IF EXISTS models_ins_redirect ON public.models;")
    op.execute("DROP TRIGGER IF EXISTS models_upd_redirect ON public.models;")
    op.execute("DROP TRIGGER IF EXISTS models_del_redirect ON public.models;")

    # Drop functions
    op.execute("DROP FUNCTION IF EXISTS public.models_ins_redirect();")
    op.execute("DROP FUNCTION IF EXISTS public.models_upd_redirect();")
    op.execute("DROP FUNCTION IF EXISTS public.models_del_redirect();")

    # Drop view
    op.execute("DROP VIEW IF EXISTS public.models;")

    # Drop unique constraint and index
    op.execute("""
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_model_uploads_user_filename'
              AND conrelid = 'public.model_uploads'::regclass
      ) THEN
        ALTER TABLE public.model_uploads
          DROP CONSTRAINT uq_model_uploads_user_filename;
      END IF;
    END $$;
    """)
    op.execute("DROP INDEX IF EXISTS ix_model_uploads_user_date;")

"""Normalize turntable_path values to be relative to /uploads"""

from alembic import op
import sqlalchemy as sa
from pathlib import Path

# revision identifiers, used by Alembic.

revision = "20250731_norm_turntable"
down_revision = "7075ee0627a7"
branch_labels = None
depends_on = None

UPLOADS_ROOT = "/app/uploads"  # adjust if different in production


def upgrade():
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT id, turntable_path FROM model_uploads WHERE turntable_path IS NOT NULL"
    ))
    rows = result.fetchall()

    for row in rows:
        model_id = row.id
        tpath = row.turntable_path
        if not tpath:
            continue

        abs_path = Path(tpath)
        if not abs_path.is_absolute():
            abs_path = Path(UPLOADS_ROOT) / abs_path

        try:
            rel_path = abs_path.relative_to(UPLOADS_ROOT).as_posix()
        except ValueError:
            # Path outside uploads root, skip
            continue

        conn.execute(
            sa.text("UPDATE model_uploads SET turntable_path = :rel WHERE id = :id"),
            {"rel": rel_path, "id": model_id},
        )


def downgrade():
    # Cannot restore absolute paths reliably
    pass

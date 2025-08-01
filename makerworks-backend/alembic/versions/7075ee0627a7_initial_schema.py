"""initial schema"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '7075ee0627a7'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ✅ Users table
    op.create_table(
        'users',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('email', sa.String(255), unique=True, nullable=False),
        sa.Column('username', sa.String(50), unique=True, nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('avatar', sa.String(), nullable=True),
        sa.Column('avatar_url', sa.String(), nullable=True),
        sa.Column('avatar_updated_at', sa.DateTime(), nullable=True),
        sa.Column('bio', sa.Text(), nullable=True),
        sa.Column('language', sa.String(), nullable=True, server_default='en'),
        sa.Column('theme', sa.String(), nullable=True, server_default='light'),
        sa.Column('role', sa.String(), nullable=False, server_default='user'),
        sa.Column('is_verified', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('last_login', sa.DateTime(), nullable=True),
        schema='public'
    )

    # ✅ Model Uploads table
    op.create_table(
        'model_uploads',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('public.users.id', ondelete='CASCADE')),
        sa.Column('filename', sa.String(), nullable=False),
        sa.Column('file_path', sa.String(), nullable=False),
        sa.Column('file_url', sa.String(), nullable=True),
        sa.Column('thumbnail_path', sa.String(), nullable=True),
        sa.Column('turntable_path', sa.String(), nullable=True),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(), nullable=False),
        sa.Column('volume', sa.String(), nullable=True),
        sa.Column('bbox', sa.String(), nullable=True),
        sa.Column('faces', sa.String(), nullable=True),
        sa.Column('vertices', sa.String(), nullable=True),
        sa.Column('geometry_hash', sa.String(), nullable=True),
        sa.Column('is_duplicate', sa.Boolean(), nullable=False, server_default='false'),
        schema='public'
    )

    # ✅ Audit Logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('public.users.id', ondelete='SET NULL')),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('ip_address', sa.String(), nullable=True),
        sa.Column('user_agent', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        schema='public'
    )


def downgrade() -> None:
    op.drop_table('audit_logs', schema='public')
    op.drop_table('model_uploads', schema='public')
    op.drop_table('users', schema='public')

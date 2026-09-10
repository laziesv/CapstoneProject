"""drop audit_trails

Revision ID: d2f4a6b8c1e3
Revises: b7e2c1a90f34
Create Date: 2026-08-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "d2f4a6b8c1e3"
down_revision: Union[str, None] = "b7e2c1a90f34"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "audit_trails" not in inspector.get_table_names():
        # การรวม migration: dev อาจลบตารางนี้ไปแล้วก่อนเดินอีก branch
        return

    existing_indexes = {
        index["name"] for index in inspector.get_indexes("audit_trails")
    }
    for index_name in (
        "ix_audit_trails_user_id",
        "ix_audit_trails_entity_type",
        "ix_audit_trails_entity_id",
        "ix_audit_trails_created_at",
        "ix_audit_trails_accessed_at",
    ):
        if index_name in existing_indexes:
            op.drop_index(index_name, table_name="audit_trails")
    op.drop_table("audit_trails")


def downgrade() -> None:
    op.create_table(
        "audit_trails",
        sa.Column("audit_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=True),
        sa.Column(
            "action_type",
            postgresql.ENUM(
                "VIEW",
                "DOWNLOAD",
                "QUERY",
                name="auditaction",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "old_values",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "new_values",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column(
            "result",
            postgresql.ENUM(
                "SUCCESS",
                "FAILED",
                name="auditresult",
                create_type=False,
            ),
            server_default="SUCCESS",
            nullable=False,
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "accessed_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.user_id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("audit_id"),
    )
    for index_name, column_name in (
        ("ix_audit_trails_accessed_at", "accessed_at"),
        ("ix_audit_trails_created_at", "created_at"),
        ("ix_audit_trails_entity_id", "entity_id"),
        ("ix_audit_trails_entity_type", "entity_type"),
        ("ix_audit_trails_user_id", "user_id"),
    ):
        op.create_index(index_name, "audit_trails", [column_name], unique=False)

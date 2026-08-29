"""drop audit_trails

ตาราง audit_trails ไม่ถูกใช้จริง (ไม่มี service/route เขียนหรืออ่าน) — การพิสูจน์ว่า
ข้อมูล/หลักฐานไม่ถูกแก้ ใช้ blockchain_transactions เป็นหลักอยู่แล้ว จึงลบทิ้ง
(enum auditaction / auditresult ยังคงอยู่ เพราะ access_logs ใช้ร่วม)

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
    op.drop_index(op.f("ix_audit_trails_user_id"), table_name="audit_trails")
    op.drop_index(op.f("ix_audit_trails_entity_type"), table_name="audit_trails")
    op.drop_index(op.f("ix_audit_trails_entity_id"), table_name="audit_trails")
    op.drop_index(op.f("ix_audit_trails_created_at"), table_name="audit_trails")
    op.drop_index(op.f("ix_audit_trails_accessed_at"), table_name="audit_trails")
    op.drop_table("audit_trails")


def downgrade() -> None:
    # สร้างตารางคืน — อ้าง enum ที่มีอยู่แล้ว (create_type=False) ไม่สร้าง type ซ้ำ
    op.create_table(
        "audit_trails",
        sa.Column("audit_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=True),
        sa.Column(
            "action_type",
            postgresql.ENUM("VIEW", "DOWNLOAD", "QUERY", name="auditaction", create_type=False),
            nullable=False,
        ),
        sa.Column("old_values", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("new_values", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column(
            "result",
            postgresql.ENUM("SUCCESS", "FAILED", name="auditresult", create_type=False),
            server_default="SUCCESS",
            nullable=False,
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("accessed_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("audit_id"),
    )
    op.create_index(op.f("ix_audit_trails_accessed_at"), "audit_trails", ["accessed_at"], unique=False)
    op.create_index(op.f("ix_audit_trails_created_at"), "audit_trails", ["created_at"], unique=False)
    op.create_index(op.f("ix_audit_trails_entity_id"), "audit_trails", ["entity_id"], unique=False)
    op.create_index(op.f("ix_audit_trails_entity_type"), "audit_trails", ["entity_type"], unique=False)
    op.create_index(op.f("ix_audit_trails_user_id"), "audit_trails", ["user_id"], unique=False)

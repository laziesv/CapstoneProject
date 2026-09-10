"""add durable pending VIEW lifecycle

Revision ID: a6c8e1f4b2d9
Revises: e8b4c2d7a901
Create Date: 2026-09-10 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a6c8e1f4b2d9"
down_revision: Union[str, Sequence[str], None] = "e8b4c2d7a901"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # การเชื่อมต่อ Blockchain: receipt timeout ยังไม่ใช่ผลล้มเหลว จึงต้องมี
    # สถานะ PENDING ที่คงอยู่เพื่อให้ session เดิมกลับมาตรวจสอบต่อได้
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE auditresult ADD VALUE IF NOT EXISTS 'PENDING'")

    op.create_index(
        "uq_access_logs_pending_view",
        "access_logs",
        ["user_id", "evidence_id"],
        unique=True,
        postgresql_where=sa.text("action = 'VIEW' AND result = 'PENDING'"),
    )


def downgrade() -> None:
    op.drop_index("uq_access_logs_pending_view", table_name="access_logs")
    # PostgreSQL ไม่มีคำสั่งลบ enum value แบบปลอดภัยโดยไม่สร้าง type ใหม่
    # จึงคง PENDING ไว้เพื่อไม่ rewrite ตารางหรือทำลายข้อมูล audit เดิม

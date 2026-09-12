"""ผู้รับผิดชอบคดีหลายคน และสิทธิ์ที่ไม่หลุดเมื่อย้ายหัวหน้า

เดิมคดีเก็บผู้รับผิดชอบได้คนเดียวที่คอลัมน์ cases.assigned_officer ทั้งที่หน้าเว็บ
ให้ติ๊กได้หลายคน คนที่ 2 เป็นต้นไปจึงถูกทิ้งเงียบ ๆ และเข้าถึงคดีได้ทางสาย
บังคับบัญชาเท่านั้น พอย้ายหัวหน้าก็หลุดสิทธิ์ทันที

ตารางนี้ทำให้การมอบหมายเป็นสิทธิ์ตรงที่ผูกกับตัวคน ไม่ขึ้นกับสายบังคับบัญชา
ณ ปัจจุบัน จึงคงอยู่ถาวรแม้ภายหลังจะย้ายหัวหน้า

คอลัมน์ assigned_officer เดิมยังอยู่ ใช้เป็น "ผู้รับผิดชอบหลัก" สำหรับแสดงผล
และเพื่อไม่ให้โค้ดส่วนอื่นที่อ้างถึงพัง

Revision ID: b9d3e7c15a24
Revises: a6c8e1f4b2d9
Create Date: 2026-09-12 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "b9d3e7c15a24"
down_revision: Union[str, Sequence[str], None] = "a6c8e1f4b2d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "case_assignees",
        sa.Column("case_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "assigned_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        # ผู้ที่มอบหมาย — เก็บไว้เพื่อตรวจสอบย้อนหลังว่าใครให้สิทธิ์ใคร
        # SET NULL เพราะการลบบัญชีผู้มอบหมายไม่ควรเพิกถอนสิทธิ์ของผู้รับผิดชอบ
        sa.Column("assigned_by", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["case_id"], ["cases.case_id"], ondelete="CASCADE"
        ),
        # RESTRICT: ห้ามลบผู้ใช้ที่ยังรับผิดชอบคดีอยู่ (เหมือน assigned_officer เดิม)
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.user_id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["assigned_by"], ["users.user_id"], ondelete="SET NULL"
        ),
        # คนเดียวถูกมอบหมายซ้ำในคดีเดียวกันไม่ได้
        sa.PrimaryKeyConstraint("case_id", "user_id"),
    )
    # ใช้ค้นว่า "ผู้ใช้คนนี้รับผิดชอบคดีอะไรบ้าง" ซึ่งเป็นทิศที่ตรวจสิทธิ์ใช้จริง
    op.create_index(
        "ix_case_assignees_user_id", "case_assignees", ["user_id"]
    )

    # ย้ายข้อมูลเดิมเข้ามา เพื่อไม่ให้ใครเสียสิทธิ์ที่เคยมีตอนอัปเกรด
    op.execute(
        """
        INSERT INTO case_assignees (case_id, user_id, assigned_by)
        SELECT case_id, assigned_officer, created_by
        FROM cases
        WHERE assigned_officer IS NOT NULL
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("ix_case_assignees_user_id", table_name="case_assignees")
    op.drop_table("case_assignees")

"""add access_logs.case_id

โมเดล AccessLog มีคอลัมน์ case_id (FK -> cases) แต่ schema เดิมยังไม่มี
เพิ่มให้ DB ตรงกับโมเดล ไม่งั้น ORM SELECT ตาราง access_logs จะพัง

Revision ID: b7e2c1a90f34
Revises: 4eac92bd79a8
Create Date: 2026-08-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7e2c1a90f34"
down_revision: Union[str, None] = "4eac92bd79a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("access_logs", sa.Column("case_id", sa.UUID(), nullable=True))
    op.create_index(op.f("ix_access_logs_case_id"), "access_logs", ["case_id"], unique=False)
    op.create_foreign_key(
        "fk_access_logs_case_id_cases",
        "access_logs",
        "cases",
        ["case_id"],
        ["case_id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("fk_access_logs_case_id_cases", "access_logs", type_="foreignkey")
    op.drop_index(op.f("ix_access_logs_case_id"), table_name="access_logs")
    op.drop_column("access_logs", "case_id")

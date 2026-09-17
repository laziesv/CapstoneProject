"""remove unused blockchain input data hash

Revision ID: c7d9e2a4f6b1
Revises: a6c8e1f4b2d9
Create Date: 2026-09-13 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c7d9e2a4f6b1"
down_revision: Union[str, Sequence[str], None] = "a6c8e1f4b2d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_input_data_hash() -> bool:
    inspector = sa.inspect(op.get_bind())
    return "input_data_hash" in {
        column["name"]
        for column in inspector.get_columns("blockchain_transactions")
    }


def upgrade() -> None:
    # metadata ธุรกรรม Blockchain: ลบฟิลด์ที่ไม่มี canonical semantics หรือผู้ใช้งาน
    #
    # เช็คก่อนลบเพราะสาย deploy มี 7c2a4d9b8e13 ที่ลบคอลัมน์เดียวกัน พอรวมสองสาย
    # เข้าด้วยกันตัวที่รันทีหลังจะเจอคอลัมน์หายไปแล้ว ต้องปล่อยผ่านไม่ใช่ล้ม
    if _has_input_data_hash():
        op.drop_column("blockchain_transactions", "input_data_hash")


def downgrade() -> None:
    if not _has_input_data_hash():
        op.add_column(
            "blockchain_transactions",
            sa.Column("input_data_hash", sa.Text(), nullable=True),
        )

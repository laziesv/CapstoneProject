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


def upgrade() -> None:
    # metadata ธุรกรรม Blockchain: ลบฟิลด์ที่ไม่มี canonical semantics หรือผู้ใช้งาน
    op.drop_column("blockchain_transactions", "input_data_hash")


def downgrade() -> None:
    op.add_column(
        "blockchain_transactions",
        sa.Column("input_data_hash", sa.Text(), nullable=True),
    )

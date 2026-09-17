"""drop blockchain transaction input data hash

Revision ID: 7c2a4d9b8e13
Revises: b9d3e7c15a24
Create Date: 2026-09-13 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7c2a4d9b8e13"
down_revision: Union[str, None] = "b9d3e7c15a24"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("blockchain_transactions")}
    if "input_data_hash" in columns:
        op.drop_column("blockchain_transactions", "input_data_hash")


def downgrade() -> None:
    # เช็คก่อนเพิ่มเพราะสาย main มี c7d9e2a4f6b1 ที่ downgrade แล้วเพิ่มคอลัมน์เดียวกัน
    # ตัวที่รันทีหลังจะเจอคอลัมน์อยู่แล้ว ต้องปล่อยผ่านไม่ใช่ล้มด้วย DuplicateColumn
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("blockchain_transactions")}
    if "input_data_hash" not in columns:
        op.add_column(
            "blockchain_transactions",
            sa.Column("input_data_hash", sa.Text(), nullable=True),
        )

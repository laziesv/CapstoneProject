"""บังคับเปลี่ยนรหัสผ่านหลัง admin รีเซ็ตให้

ผู้ใช้ที่ลืมรหัสผ่านให้ admin รีเซ็ตเป็นรหัสชั่วคราว admin จึงรู้รหัสนั้น
คอลัมน์นี้บังคับให้ผู้ใช้ตั้งรหัสใหม่ของตัวเองก่อนใช้งานส่วนอื่นของระบบ

Revision ID: c4a8f2e61d37
Revises: 7c2a4d9b8e13
Create Date: 2026-09-13 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c4a8f2e61d37"
down_revision: Union[str, Sequence[str], None] = "7c2a4d9b8e13"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "must_change_password")

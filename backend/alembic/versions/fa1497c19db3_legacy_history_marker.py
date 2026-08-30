"""preserve the legacy initial revision

Revision ID: fa1497c19db3
Revises:
Create Date: 2026-06-29 16:49:43.469557

"""
from typing import Sequence, Union


revision: str = 'fa1497c19db3'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # เก็บ revision เดิมไว้เป็น marker โดยไม่สร้าง schema เก่าซ้ำ
    pass


def downgrade() -> None:
    # marker ไม่มี schema operation ให้ย้อนกลับ
    pass

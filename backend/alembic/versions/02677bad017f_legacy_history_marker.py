"""preserve the legacy cleanup revision

Revision ID: 02677bad017f
Revises: fa1497c19db3
Create Date: 2026-06-29 17:28:14.693832

"""
from typing import Sequence, Union


revision: str = '02677bad017f'
down_revision: Union[str, None] = 'fa1497c19db3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # DB เดิมใช้ revision นี้อยู่แล้ว จึงไม่ทำ operation ซ้ำ
    pass


def downgrade() -> None:
    # marker ไม่มี schema operation ให้ย้อนกลับ
    pass

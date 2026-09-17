"""รวมสาย migration ของ main กับ deploy เข้าด้วยกัน

สองสายแยกกันไปจาก a6c8e1f4b2d9 แล้วต่างคนต่างลบคอลัมน์ blockchain_transactions.input_data_hash
- main   : c7d9e2a4f6b1
- deploy : 7c2a4d9b8e13 -> c4a8f2e61d37 (must_change_password)

revision นี้ไม่แก้ schema เพิ่ม ทำหน้าที่รวมสอง head ให้ alembic upgrade head ทำงานได้
ส่วนการลบคอลัมน์ซ้ำถูกกันไว้แล้วด้วยการเช็คคอลัมน์ก่อนใน migration ทั้งสองตัว

Revision ID: f4853adb76f5
Revises: c4a8f2e61d37, c7d9e2a4f6b1
Create Date: 2026-09-18 01:30:39.859024
"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "f4853adb76f5"
down_revision: Union[str, Sequence[str], None] = ("c4a8f2e61d37", "c7d9e2a4f6b1")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

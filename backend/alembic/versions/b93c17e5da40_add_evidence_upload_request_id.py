"""เพิ่ม evidence_items.upload_request_id สำหรับกันอัปโหลดซ้ำ

หน้าเว็บสร้าง UUID ต่อไฟล์ตั้งแต่ตอนเลือกไฟล์ แล้วส่งมาทุกครั้งที่อัปโหลด
ถ้าค่านี้เคยบันทึกสำเร็จแล้ว backend คืนผลเดิมกลับไปโดยไม่ยิงธุรกรรมใหม่ขึ้นเชน
เพราะธุรกรรมบนเชนลบไม่ได้ ถ้าปล่อยให้ซ้ำจะมีหลักฐานผีค้างอยู่ตลอดไป

คอลัมน์เป็น nullable และมี unique index — แถวเดิมที่ยังไม่มีค่าอยู่ร่วมกันได้
เพราะ PostgreSQL ถือว่า NULL ไม่ชนกันเอง

Revision ID: b93c17e5da40
Revises: f4853adb76f5
Create Date: 2026-09-19 10:42:11.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "b93c17e5da40"
down_revision: Union[str, Sequence[str], None] = "f4853adb76f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE = "evidence_items"
COLUMN = "upload_request_id"
INDEX = "ix_evidence_items_upload_request_id"


def _has_column() -> bool:
    inspector = sa.inspect(op.get_bind())
    return COLUMN in {c["name"] for c in inspector.get_columns(TABLE)}


def _has_index() -> bool:
    inspector = sa.inspect(op.get_bind())
    return INDEX in {i["name"] for i in inspector.get_indexes(TABLE)}


def upgrade() -> None:
    if not _has_column():
        op.add_column(
            TABLE,
            sa.Column(COLUMN, postgresql.UUID(as_uuid=True), nullable=True),
        )
    if not _has_index():
        op.create_index(INDEX, TABLE, [COLUMN], unique=True)


def downgrade() -> None:
    if _has_index():
        op.drop_index(INDEX, table_name=TABLE)
    if _has_column():
        op.drop_column(TABLE, COLUMN)

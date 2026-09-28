"""เพิ่ม evidence_items.static_watermark_hash สำหรับค้นหลักฐานจากลายน้ำ

การตรวจลายน้ำเดิมไล่ extract() ภาพที่ตรวจกับต้นฉบับของหลักฐานทุกชิ้นในระบบ
เวลาจึงโตตามจำนวนหลักฐาน (ภาพ 12 MP ใช้ราว 4 วินาทีต่อชิ้น) คอลัมน์นี้เก็บค่าที่ฝังใน
Static Watermark = sha256(str(evidence_id)) ทำให้ถอด QR ครั้งเดียวแล้วค้นผ่าน index ได้

แถวเดิมเติมค่าด้วย sha256() ของ PostgreSQL ซึ่งให้ผลเดียวกับ hashlib ฝั่ง Python
เพราะ evidence_id::text ให้ UUID ตัวพิมพ์เล็กมีขีดคั่น เหมือน str(uuid.UUID)

Revision ID: c5e1a9d3f7b2
Revises: b93c17e5da40
Create Date: 2026-09-28 10:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c5e1a9d3f7b2"
down_revision: Union[str, Sequence[str], None] = "b93c17e5da40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE = "evidence_items"
COLUMN = "static_watermark_hash"
INDEX = "ix_evidence_items_static_watermark_hash"


def _has_column() -> bool:
    inspector = sa.inspect(op.get_bind())
    return COLUMN in {c["name"] for c in inspector.get_columns(TABLE)}


def _has_index() -> bool:
    inspector = sa.inspect(op.get_bind())
    return INDEX in {i["name"] for i in inspector.get_indexes(TABLE)}


def upgrade() -> None:
    if not _has_column():
        op.add_column(TABLE, sa.Column(COLUMN, sa.String(64), nullable=True))

    op.execute(
        f"""
        UPDATE {TABLE}
        SET {COLUMN} = encode(sha256(convert_to(evidence_id::text, 'UTF8')), 'hex')
        WHERE {COLUMN} IS NULL
        """
    )

    if not _has_index():
        op.create_index(INDEX, TABLE, [COLUMN], unique=True)


def downgrade() -> None:
    if _has_index():
        op.drop_index(INDEX, table_name=TABLE)
    if _has_column():
        op.drop_column(TABLE, COLUMN)

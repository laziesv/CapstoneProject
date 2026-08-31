"""merge legacy and integration database histories

Revision ID: c3f7a1d9e2b4
Revises: 02677bad017f, 14f1bea4590d
Create Date: 2026-08-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3f7a1d9e2b4'
down_revision: Union[str, Sequence[str], None] = (
    '02677bad017f',
    '14f1bea4590d',
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_REQUIRED_TABLES = {
    'users',
    'evidence_items',
    'evidence_files',
    'blockchain_transactions',
    'access_logs',
    'watermark_records',
}


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {column['name'] for column in inspector.get_columns(table_name)}


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {index['name'] for index in inspector.get_indexes(table_name)}


def _add_enum_value(enum_name: str, value: str) -> None:
    # ชื่อ enum และค่ามาจาก constant ภายใน migration เท่านั้น
    op.execute(
        f'ALTER TYPE "{enum_name}" ADD VALUE IF NOT EXISTS \'{value}\''
    )


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    missing_tables = _REQUIRED_TABLES - existing_tables
    if missing_tables:
        raise RuntimeError(
            'schema ไม่ครบ จึงหยุด migration ก่อนแก้ข้อมูล: '
            + ', '.join(sorted(missing_tables))
        )

    # รองรับทั้ง label เดิมและ label ที่ flow ปัจจุบันต้องใช้
    for value in ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'ORIGINAL', 'WATERMARKED'):
        _add_enum_value('filetype', value)
    for value in ('CREATE', 'UPDATE', 'DELETE', 'VIEW', 'DOWNLOAD'):
        _add_enum_value('auditaction', value)

    evidence_columns = _column_names(inspector, 'evidence_items')
    if 'category' in evidence_columns:
        op.alter_column(
            'evidence_items',
            'category',
            existing_type=sa.String(length=50),
            nullable=True,
        )

    if 'audit_trails' in existing_tables:
        # การรวม migration: ปรับ audit_trails เฉพาะเมื่อ dev ยังไม่ได้ลบตาราง
        audit_columns = _column_names(inspector, 'audit_trails')
        if 'accessed_at' not in audit_columns:
            op.add_column(
                'audit_trails',
                sa.Column(
                    'accessed_at',
                    sa.TIMESTAMP(timezone=True),
                    server_default=sa.text('now()'),
                    nullable=False,
                ),
            )
        inspector = sa.inspect(bind)
        if 'ix_audit_trails_accessed_at' not in _index_names(
            inspector, 'audit_trails'
        ):
            op.create_index(
                'ix_audit_trails_accessed_at',
                'audit_trails',
                ['accessed_at'],
                unique=False,
            )

    watermark_columns = _column_names(inspector, 'watermark_records')
    if 'dwt_level' not in watermark_columns:
        op.add_column(
            'watermark_records',
            sa.Column('dwt_level', sa.Integer(), nullable=True),
        )
    if 'embed_params' not in watermark_columns:
        op.add_column(
            'watermark_records',
            sa.Column('embed_params', sa.JSON(), nullable=True),
        )


def downgrade() -> None:
    # การเปลี่ยนแปลงเป็น additive และอาจมีข้อมูลใหม่แล้ว จึงไม่ลบย้อนหลัง
    pass

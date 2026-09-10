"""merge blockchain integration and dev database histories

Revision ID: e8b4c2d7a901
Revises: c3f7a1d9e2b4, d2f4a6b8c1e3
Create Date: 2026-08-31 00:00:00.000000
"""
from typing import Sequence, Union


revision: str = "e8b4c2d7a901"
down_revision: Union[str, Sequence[str], None] = (
    "c3f7a1d9e2b4",
    "d2f4a6b8c1e3",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

import uuid

from sqlalchemy import (
    Column,
    ForeignKey,
    String,
    Float,
    Enum,
    TIMESTAMP,
    func,
)

from sqlalchemy.dialects.postgresql import UUID

from app.database import Base
from app.models.enums import WatermarkAlgorithm


class WatermarkRecord(Base):
    __tablename__ = "watermark_records"

    watermark_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    evidence_id = Column(
        UUID(as_uuid=True),
        ForeignKey("evidence_items.evidence_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    embedded_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="RESTRICT"),
    )

    # ไฟล์ต้นฉบับก่อนฝังลายน้ำ
    original_image_id = Column(
        UUID(as_uuid=True),
        ForeignKey("evidence_files.file_id", ondelete="RESTRICT"),
    )

    # ไฟล์ผลลัพธ์หลังฝังลายน้ำ
    watermarked_image_id = Column(
        UUID(as_uuid=True),
        ForeignKey("evidence_files.file_id", ondelete="RESTRICT"),
    )

    watermark_hash = Column(String(64))  # SHA-256 hex

    strength = Column(Float)

    algorithm = Column(Enum(WatermarkAlgorithm))

    embed_band = Column(String(50))

    verification_score = Column(Float)

    embedded_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

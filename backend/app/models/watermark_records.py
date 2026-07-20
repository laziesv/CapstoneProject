import uuid

from sqlalchemy import (
    Column,
    ForeignKey,
    Integer,
    String,
    Float,
    TIMESTAMP,
    JSON,
    func,
)

from sqlalchemy.dialects.postgresql import UUID

from app.database import Base

class WatermarkRecord(Base):
    __tablename__ = "watermark_records"

    watermark_id = Column(UUID(as_uuid=True),primary_key=True,default=uuid.uuid4)

    evidence_id = Column(UUID(as_uuid=True),ForeignKey("evidence_items.evidence_id", ondelete="RESTRICT"),nullable=False,index=True,)

    embedded_by = Column(UUID(as_uuid=True),ForeignKey("users.user_id", ondelete="RESTRICT"),)

    original_image_id = Column(UUID(as_uuid=True),ForeignKey("evidence_files.file_id", ondelete="RESTRICT"),)

    watermarked_image_id = Column(UUID(as_uuid=True),ForeignKey("evidence_files.file_id", ondelete="RESTRICT"),)

    watermark_hash = Column(String(64))  # SHA-256 hex

    strength = Column(Float)

    embed_band = Column(String(50))

    embedded_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    dwt_level = Column(Integer)

    embed_params = Column(JSON)


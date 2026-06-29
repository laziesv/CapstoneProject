import uuid

from sqlalchemy import (
    Column,
    String,
    Integer,
    ForeignKey,
    BigInteger,
    Boolean,
    Enum,
    TIMESTAMP,
    func,
)

from sqlalchemy.dialects.postgresql import UUID

from app.database import Base
from app.models.enums import FileType


class EvidenceFile(Base):
    __tablename__ = "evidence_files"

    file_id = Column(
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

    file_type = Column(Enum(FileType))

    file_path = Column(String)

    file_url = Column(String)

    mime_type = Column(String(50))

    file_size_bytes = Column(BigInteger)

    file_hash = Column(String(64), nullable=False)  # SHA-256 hex

    # ไฟล์ต้นฉบับ vs ไฟล์ derivative (เช่นที่ฝัง watermark แล้ว)
    is_original = Column(Boolean, nullable=False, server_default="true")

    version = Column(Integer, nullable=False, server_default="1")

    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

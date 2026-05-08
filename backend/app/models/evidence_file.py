import uuid

from sqlalchemy import (
    Column,
    String,
    ForeignKey,
    BigInteger,
    Enum,
    TIMESTAMP
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
        ForeignKey("evidence_items.evidence_id")
    )

    file_type = Column(Enum(FileType))

    file_path = Column(String)

    file_url = Column(String)

    mime_type = Column(String(50))

    file_size_bytes = Column(BigInteger)

    file_hash = Column(String(64))

    created_at = Column(TIMESTAMP)
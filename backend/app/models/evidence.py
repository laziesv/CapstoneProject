import uuid

from sqlalchemy import (
    Column,
    String,
    ForeignKey,
    Enum,
    Boolean,
    TIMESTAMP,
    Text
)

from sqlalchemy.dialects.postgresql import UUID

from app.database import Base
from app.models.enums import EvidenceStatus


class EvidenceItem(Base):
    __tablename__ = "evidence_items"

    evidence_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    evidence_number = Column(String(30), unique=True)

    case_id = Column(
        UUID(as_uuid=True),
        ForeignKey("cases.case_id")
    )

    uploaded_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id")
    )

    category = Column(String(50))

    description = Column(Text)

    original_filename = Column(String(255))

    status = Column(Enum(EvidenceStatus))

    is_watermarked = Column(Boolean, default=False)

    is_blockchain_verified = Column(Boolean, default=False)

    captured_at = Column(TIMESTAMP)

    uploaded_at = Column(TIMESTAMP)

    verified_at = Column(TIMESTAMP)
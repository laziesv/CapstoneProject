import uuid

from sqlalchemy import (
    Column,
    String,
    ForeignKey,
    Enum,
    Boolean,
    TIMESTAMP,
    Text,
    func,
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

    evidence_number = Column(String(30), unique=True, nullable=False, index=True)

    case_id = Column(
        UUID(as_uuid=True),
        ForeignKey("cases.case_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    uploaded_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    category = Column(String(50), nullable=False)

    description = Column(Text)

    original_filename = Column(String(255))

    # canonical hash ของหลักฐาน (SHA-256 hex = 64 ตัว)
    file_hash_sha256 = Column(String(64), index=True)

    status = Column(
        Enum(EvidenceStatus),
        nullable=False,
        server_default=EvidenceStatus.PENDING.value,
        index=True,
    )

    is_watermarked = Column(Boolean, nullable=False, server_default="false")

    is_blockchain_verified = Column(Boolean, nullable=False, server_default="false")

    # ── retention / legal hold ──────────────────────────
    legal_hold = Column(Boolean, nullable=False, server_default="false")

    retention_until = Column(TIMESTAMP(timezone=True))

    # ── soft delete ─────────────────────────────────────
    is_deleted = Column(Boolean, nullable=False, server_default="false", index=True)

    deleted_at = Column(TIMESTAMP(timezone=True))

    captured_at = Column(TIMESTAMP(timezone=True))

    uploaded_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    verified_at = Column(TIMESTAMP(timezone=True))

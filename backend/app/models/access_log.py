import uuid

from sqlalchemy import (
    Column,
    String,
    ForeignKey,
    Enum,
    TIMESTAMP,
    Text
)

from sqlalchemy.dialects.postgresql import UUID

from app.database import Base
from app.models.enums import AuditAction, AuditResult


class AccessLog(Base):
    __tablename__ = "access_logs"

    log_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id")
    )

    evidence_id = Column(
        UUID(as_uuid=True),
        ForeignKey("evidence_items.evidence_id")
    )

    action = Column(Enum(AuditAction))

    action_type = Column(String(50))

    ip_address = Column(String(45))

    user_agent = Column(Text)

    tx_internal_id = Column(Text)

    result = Column(Enum(AuditResult))

    reason = Column(Text)

    accessed_at = Column(TIMESTAMP)
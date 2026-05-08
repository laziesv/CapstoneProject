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
from sqlalchemy.dialects.postgresql import JSONB

from app.database import Base
from app.models.enums import AuditAction, AuditResult


class AuditTrail(Base):
    __tablename__ = "audit_trails"

    audit_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id")
    )

    entity_type = Column(String(50))

    entity_id = Column(UUID(as_uuid=True))

    action_type = Column(Enum(AuditAction))

    old_values = Column(JSONB)

    new_values = Column(JSONB)

    ip_address = Column(String(45))

    result = Column(Enum(AuditResult))

    reason = Column(Text)

    accessed_at = Column(TIMESTAMP)

    created_at = Column(TIMESTAMP)
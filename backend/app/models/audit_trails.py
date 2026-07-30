import uuid

from sqlalchemy import (
    Column,
    String,
    ForeignKey,
    Enum,
    TIMESTAMP,
    Text,
    func,
)

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.dialects.postgresql import JSONB

from app.database import Base
from app.models.enums import AuditAction, AuditResult


class AuditTrail(Base):
    __tablename__ = "audit_trails"

    audit_id = Column(UUID(as_uuid=True),primary_key=True,default=uuid.uuid4)

    user_id = Column(UUID(as_uuid=True),ForeignKey("users.user_id", ondelete="RESTRICT"),index=True,)

    entity_type = Column(String(50), nullable=False, index=True)

    entity_id = Column(UUID(as_uuid=True), index=True)

    action_type = Column(Enum(AuditAction), nullable=False)

    old_values = Column(JSONB)

    new_values = Column(JSONB)

    ip_address = Column(String(45))

    result = Column(Enum(AuditResult), nullable=False, server_default=AuditResult.SUCCESS.value)

    reason = Column(Text)

    accessed_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), index=True)

    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), index=True)

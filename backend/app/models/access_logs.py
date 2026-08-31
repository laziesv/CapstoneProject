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
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.enums import AuditAction, AuditResult


class AccessLog(Base):
    __tablename__ = "access_logs"

    log_id = Column(UUID(as_uuid=True),primary_key=True,default=uuid.uuid4)

    user_id = Column(UUID(as_uuid=True),ForeignKey("users.user_id", ondelete="RESTRICT"),nullable=False,index=True,)

    # การรวม migration: ให้ metadata ตรงกับ case_id แบบ nullable ใน schema ของ dev
    case_id = Column(UUID(as_uuid=True),ForeignKey("cases.case_id", ondelete="RESTRICT"),index=True,)

    evidence_id = Column(UUID(as_uuid=True),ForeignKey("evidence_items.evidence_id", ondelete="RESTRICT"),index=True,)

    action = Column(Enum(AuditAction), nullable=False)

    ip_address = Column(String(45))

    user_agent = Column(Text)

    tx_internal_id = Column(UUID(as_uuid=True),ForeignKey("blockchain_transactions.tx_internal_id", ondelete="SET NULL"),)

    result = Column(Enum(AuditResult), nullable=False, server_default=AuditResult.SUCCESS.value)

    accessed_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), index=True)

    user = relationship("User", lazy="selectin")
    evidence = relationship("EvidenceItem", lazy="selectin")

    @property
    def user_name(self):
        if not self.user:
            return None
        return self.user.full_name or self.user.username

    @property
    def evidence_number(self):
        return self.evidence.evidence_number if self.evidence else None

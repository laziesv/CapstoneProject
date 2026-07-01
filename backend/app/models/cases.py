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
from app.models.enums import CaseStatus


class Case(Base):
    __tablename__ = "cases"

    case_id = Column(UUID(as_uuid=True),primary_key=True,default=uuid.uuid4)

    case_number = Column(String(30), unique=True, nullable=False, index=True)

    title = Column(String(255), nullable=False)

    description = Column(Text)

    status = Column(Enum(CaseStatus),nullable=False,server_default=CaseStatus.OPEN.value,index=True,)

    created_by = Column(UUID(as_uuid=True),ForeignKey("users.user_id", ondelete="RESTRICT"),nullable=False,index=True,)

    assigned_officer = Column(UUID(as_uuid=True),ForeignKey("users.user_id", ondelete="RESTRICT"),index=True,)

    incident_date = Column(TIMESTAMP(timezone=True))

    location = Column(String(255))

    deleted_at = Column(TIMESTAMP(timezone=True))

    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    updated_at = Column(TIMESTAMP(timezone=True), onupdate=func.now())

    closed_at = Column(TIMESTAMP(timezone=True))

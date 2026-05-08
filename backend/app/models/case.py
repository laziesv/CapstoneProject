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
from app.models.enums import CaseStatus


class Case(Base):
    __tablename__ = "cases"

    case_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    case_number = Column(String(30), unique=True)

    title = Column(String(255))

    description = Column(Text)

    status = Column(Enum(CaseStatus))

    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id")
    )

    assigned_officer = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id")
    )

    incident_date = Column(TIMESTAMP)

    location = Column(String(255))

    created_at = Column(TIMESTAMP)

    updated_at = Column(TIMESTAMP)

    closed_at = Column(TIMESTAMP)
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.enums import AuditAction, AuditResult


class AccessLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    log_id: UUID

    user_id: UUID
    case_id: UUID | None = None
    evidence_id: UUID | None = None

    action: AuditAction

    ip_address: str | None = None
    user_agent: str | None = None

    tx_internal_id: UUID | None = None

    result: AuditResult

    accessed_at: datetime
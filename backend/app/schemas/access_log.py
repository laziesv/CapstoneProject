from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator


class AccessLogResponse(BaseModel):
    log_id: UUID
    user_id: UUID
    user_name: str | None = None
    case_id: UUID | None = None
    evidence_id: UUID | None = None
    evidence_number: str | None = None
    action: str
    ip_address: str | None = None
    user_agent: str | None = None
    result: str
    accessed_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("action", "result", mode="before")
    @classmethod
    def _lower_enum(cls, value):
        if hasattr(value, "value"):
            value = value.value
        return str(value).lower() if value is not None else value


class AccessLogPage(BaseModel):
    items: list[AccessLogResponse]
    total: int
    limit: int | None = None
    offset: int = 0

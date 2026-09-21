from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class DatabaseIntegrityAlert(BaseModel):
    alert_type: str
    evidence_id: UUID | None
    evidence_number: str | None
    original_filename: str | None = None
    access_log_id: UUID | None = None
    access_session_ref: str | None = None
    detected_at: datetime
    database_hash: str | None = None
    blockchain_hash: str | None = None
    status: str


class DatabaseIntegrityAlertResponse(BaseModel):
    alert_count: int
    checked_count: int
    access_log_checked_count: int
    alerts: list[DatabaseIntegrityAlert]

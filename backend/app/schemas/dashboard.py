from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_evidence: int
    active_cases: int
    blockchain_tx: int
    verified: int


class RecentEvidence(BaseModel):
    evidence_id: UUID
    evidence_number: str | None = None
    description: str | None = None
    display_file_id: UUID | None = None
    is_watermarked: bool
    is_blockchain_verified: bool


class RecentActivity(BaseModel):
    log_id: UUID
    user_name: str | None = None
    action: str | None = None
    evidence_number: str | None = None
    result: str
    accessed_at: datetime | None = None


class DashboardResponse(BaseModel):
    stats: DashboardStats
    recent_evidence: list[RecentEvidence]
    recent_activity: list[RecentActivity]

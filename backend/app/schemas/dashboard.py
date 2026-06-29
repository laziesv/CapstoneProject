from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_evidence: int
    active_cases: int
    blockchain_tx: int
    verified: int


class RecentEvidence(BaseModel):
    evidence_id: UUID
    evidence_number: Optional[str] = None
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    is_watermarked: bool
    is_blockchain_verified: bool


class RecentActivity(BaseModel):
    log_id: UUID
    user_name: Optional[str] = None
    action: Optional[str] = None
    evidence_number: Optional[str] = None
    result: str
    accessed_at: Optional[datetime] = None


class DashboardResponse(BaseModel):
    stats: DashboardStats
    recent_evidence: list[RecentEvidence]
    recent_activity: list[RecentActivity]

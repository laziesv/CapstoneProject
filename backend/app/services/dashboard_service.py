from sqlalchemy.orm import Session

from app.repositories.dashboard_repository import DashboardRepository
from app.schemas.dashboard import (
    DashboardResponse,
    DashboardStats,
    RecentActivity,
    RecentEvidence,
)


def get_dashboard(db: Session) -> DashboardResponse:
    stats = DashboardRepository.get_dashboard_stats(db)
    evidence_rows = DashboardRepository.get_recent_evidence(db)
    log_rows = DashboardRepository.get_recent_activity(db)

    return DashboardResponse(
        stats=DashboardStats(**stats),
        recent_evidence=[
            RecentEvidence(
                evidence_id=evidence.evidence_id,
                evidence_number=evidence.evidence_number,
                description=evidence.description,
                display_file_id=evidence.display_file_id,
                is_watermarked=bool(evidence.is_watermarked),
                is_blockchain_verified=bool(evidence.is_blockchain_verified),
            )
            for evidence in evidence_rows
        ],
        recent_activity=[
            RecentActivity(
                log_id=log.log_id,
                user_name=log.user_name,
                action=log.action.value.lower() if log.action else None,
                evidence_number=log.evidence_number,
                result=log.result.value.lower() if log.result else "success",
                accessed_at=log.accessed_at,
            )
            for log in log_rows
        ],
    )

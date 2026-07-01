from sqlalchemy.orm import Session

from app.repositories.dashboard_repository import DashboardRepository

from app.schemas.dashboard import (
    DashboardResponse,
    DashboardStats,
    RecentEvidence,
    RecentActivity,
)


def _thumb(evidence_number: str | None) -> str |None:
    if not evidence_number:
        return None
    return f"https://picsum.photos/seed/{evidence_number}/400/300"


def get_dashboard(db: Session) -> DashboardResponse:
    stats = DashboardRepository.get_dashboard_stats(db)

    evidence_rows = DashboardRepository.get_recent_evidence(db)

    log_rows = DashboardRepository.get_recent_activity(db)

    recent_evidence = [
        RecentEvidence(
            evidence_id=e.evidence_id,
            evidence_number=e.evidence_number,
            description=e.description,
            thumbnail_url=_thumb(e.evidence_number),
            is_watermarked=bool(e.is_watermarked),
            is_blockchain_verified=bool(e.is_blockchain_verified),
        )
        for e in evidence_rows
    ]

    recent_activity = [
        RecentActivity(
            log_id=log.log_id,
            user_name=full_name,
            action=log.action.value,
            evidence_number=evidence_number,
            result=(log.result.value.lower() if log.result else "success"),
            accessed_at=log.accessed_at,
        )
        for log, full_name, evidence_number in log_rows
    ]

    return DashboardResponse(
        stats=DashboardStats(
            total_evidence=stats["total_evidence"],
            active_cases=stats["active_cases"],
            blockchain_tx=stats["blockchain_tx"],
            verified=stats["verified"],
        ),
        recent_evidence=recent_evidence,
        recent_activity=recent_activity,
    )
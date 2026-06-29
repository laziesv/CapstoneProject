from sqlalchemy.orm import Session

from app.models.case import Case
from app.models.evidence import EvidenceItem
from app.models.blockchain_transaction import BlockchainTransaction
from app.models.access_log import AccessLog
from app.models.user import User
from app.models.enums import CaseStatus, EvidenceStatus

from app.schemas.dashboard import (
    DashboardResponse,
    DashboardStats,
    RecentEvidence,
    RecentActivity,
)


def _thumb(evidence_number: str | None) -> str | None:
    if not evidence_number:
        return None
    return f"https://picsum.photos/seed/{evidence_number}/400/300"


def get_dashboard(db: Session) -> DashboardResponse:
    # ── stats ───────────────────────────────────────────
    total_evidence = db.query(EvidenceItem).count()

    verified = (
        db.query(EvidenceItem)
        .filter(EvidenceItem.status == EvidenceStatus.VERIFIED)
        .count()
    )

    active_cases = (
        db.query(Case)
        .filter(Case.status != CaseStatus.CLOSED)
        .count()
    )

    blockchain_tx = db.query(BlockchainTransaction).count()

    # ── recent evidence ─────────────────────────────────
    evidence_rows = (
        db.query(EvidenceItem)
        .order_by(EvidenceItem.uploaded_at.desc().nullslast())
        .limit(5)
        .all()
    )

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

    # ── recent activity (join user + evidence) ──────────
    log_rows = (
        db.query(AccessLog, User.full_name, EvidenceItem.evidence_number)
        .outerjoin(User, AccessLog.user_id == User.user_id)
        .outerjoin(EvidenceItem, AccessLog.evidence_id == EvidenceItem.evidence_id)
        .order_by(AccessLog.accessed_at.desc().nullslast())
        .limit(5)
        .all()
    )

    recent_activity = [
        RecentActivity(
            log_id=log.log_id,
            user_name=full_name,
            action=log.action_type,
            evidence_number=evidence_number,
            result=(log.result.value.lower() if log.result else "success"),
            accessed_at=log.accessed_at,
        )
        for log, full_name, evidence_number in log_rows
    ]

    return DashboardResponse(
        stats=DashboardStats(
            total_evidence=total_evidence,
            active_cases=active_cases,
            blockchain_tx=blockchain_tx,
            verified=verified,
        ),
        recent_evidence=recent_evidence,
        recent_activity=recent_activity,
    )

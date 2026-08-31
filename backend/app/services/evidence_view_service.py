from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from blockchain_client import (
    derive_access_session_ref,
    derive_actor_ref,
    derive_evidence_ref,
)
from sqlalchemy.orm import Session

from app.models.enums import AuditAction
from app.models.users import User
from app.repositories.access_log_repository import AccessLogRepository
from app.repositories.case_repository import CaseRepository
from app.repositories.evidence_items_repository import EvidenceRepository
from app.services.case_authorization import can_access_case


class EvidenceViewNotFoundError(LookupError):
    """Raised when an evidence view is missing or unauthorized."""


@dataclass(frozen=True)
class ViewAccessPreparation:
    access_log_id: UUID
    evidence_id: UUID
    action: AuditAction
    occurred_at: datetime
    evidence_ref: str
    officer_ref: str
    access_session_ref: str


class EvidenceViewPreparationService:
    @staticmethod
    def prepare(
        db: Session,
        *,
        evidence_id: UUID,
        current_user: User,
        ip_address: str | None,
        user_agent: str | None,
        occurred_at: datetime | None = None,
    ) -> ViewAccessPreparation:
        evidence = EvidenceRepository.get_by_id(db, evidence_id)
        case = CaseRepository.get_by_id(db, evidence.case_id) if evidence else None
        if case is None or not can_access_case(db, current_user, case):
            raise EvidenceViewNotFoundError("Evidence not found")

        event_time = occurred_at or datetime.now(timezone.utc)
        if event_time.tzinfo is None:
            raise ValueError("occurred_at must be timezone-aware")
        event_time = event_time.astimezone(timezone.utc).replace(microsecond=0)

        access_log = AccessLogRepository.stage_view(
            db,
            user_id=current_user.user_id,
            evidence_id=evidence.evidence_id,
            case_id=evidence.case_id,
            accessed_at=event_time,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        # จุดเชื่อม V3 จะใช้ค่าชุดนี้เขียนเชนก่อน link transaction และ commit
        return ViewAccessPreparation(
            access_log_id=access_log.log_id,
            evidence_id=evidence.evidence_id,
            action=AuditAction.VIEW,
            occurred_at=event_time,
            evidence_ref=derive_evidence_ref(evidence.evidence_id),
            officer_ref=derive_actor_ref(current_user.user_id),
            access_session_ref=derive_access_session_ref(access_log.log_id),
        )

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from blockchain_client import (
    AccessAction,
    derive_access_session_ref,
    derive_actor_ref,
    derive_evidence_ref,
)
from sqlalchemy.orm import Session

from app.integrations.blockchain import BlockchainIntegrationService
from app.integrations.blockchain.transaction_repository import (
    BlockchainTransactionRepository,
)
from app.models.enums import AuditAction
from app.models.users import User
from app.repositories.access_log_repository import AccessLogRepository
from app.repositories.case_repository import CaseRepository
from app.repositories.evidence_items_repository import EvidenceRepository
from app.services.case_authorization import can_access_case


class EvidenceViewNotFoundError(LookupError):
    """Raised when an evidence view is missing or unauthorized."""


class EvidenceViewBlockchainWriteError(RuntimeError):
    """Raised when a VIEW session cannot be persisted consistently."""


@dataclass(frozen=True)
class ViewAccessPreparation:
    access_log_id: UUID
    evidence_id: UUID
    action: AuditAction
    occurred_at: datetime
    evidence_ref: str
    officer_ref: str
    access_session_ref: str
    access_log: Any


@dataclass(frozen=True)
class EvidenceViewSession:
    access_log_id: UUID
    evidence_id: UUID
    access_session_ref: str
    action: AuditAction
    occurred_at: datetime
    tx_hash: str
    block_number: int


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
            access_log=access_log,
        )

    @staticmethod
    def create_session(
        db: Session,
        *,
        evidence_id: UUID,
        current_user: User,
        ip_address: str | None,
        user_agent: str | None,
        blockchain_service: BlockchainIntegrationService | None = None,
    ) -> EvidenceViewSession:
        try:
            prepared = EvidenceViewPreparationService.prepare(
                db,
                evidence_id=evidence_id,
                current_user=current_user,
                ip_address=ip_address,
                user_agent=user_agent,
            )
        except EvidenceViewNotFoundError:
            raise
        except Exception as exc:
            db.rollback()
            raise EvidenceViewBlockchainWriteError(
                "Evidence view could not be staged"
            ) from exc

        try:
            service = blockchain_service or BlockchainIntegrationService()
            chain_result = service.record_access(
                evidence_id=prepared.evidence_id,
                officer_user_id=current_user.user_id,
                access_log_id=prepared.access_log_id,
                action=AccessAction.VIEW,
                occurred_at=int(prepared.occurred_at.timestamp()),
            )
            transaction = BlockchainTransactionRepository.stage_access(
                db,
                tx_hash=chain_result["tx_hash"],
                evidence_id=prepared.evidence_id,
                initiated_by=current_user.user_id,
                block_number=chain_result["block_number"],
                contract_address=chain_result["contract_address"],
            )
            prepared.access_log.tx_internal_id = transaction.tx_internal_id
            # การเชื่อมต่อ Blockchain: commit VIEW log และ metadata หลังธุรกรรมยืนยันแล้วเท่านั้น
            db.commit()
        except Exception as exc:
            db.rollback()
            raise EvidenceViewBlockchainWriteError(
                "Evidence view could not be recorded"
            ) from exc

        return EvidenceViewSession(
            access_log_id=prepared.access_log_id,
            evidence_id=prepared.evidence_id,
            access_session_ref=prepared.access_session_ref,
            action=prepared.action,
            occurred_at=prepared.occurred_at,
            tx_hash=chain_result["tx_hash"],
            block_number=chain_result["block_number"],
        )

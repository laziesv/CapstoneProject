from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any
from uuid import UUID

from blockchain_client import (
    AccessAction,
    derive_access_session_ref,
    derive_actor_ref,
    derive_evidence_ref,
)
from blockchain_client.exceptions import (
    BlockchainClientError,
    ContractConnectionError,
    NonceError,
    TransactionBuildError,
    TransactionConfirmationTimeoutError,
    TransactionRevertedError,
    TransactionSigningError,
    TransactionSubmissionUncertainError,
    TransactionTimeoutError,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.integrations.blockchain import BlockchainIntegrationService
from app.integrations.blockchain.transaction_repository import (
    BlockchainTransactionRepository,
)
from app.models.enums import AuditAction, AuditResult
from app.models.users import User
from app.repositories.access_log_repository import AccessLogRepository
from app.repositories.case_repository import CaseRepository
from app.repositories.evidence_items_repository import EvidenceRepository
from app.services.case_authorization import can_access_case


class EvidenceViewNotFoundError(LookupError):
    """Raised when an evidence view is missing or unauthorized."""


class EvidenceViewSessionConflictError(RuntimeError):
    """Raised when an idempotency UUID belongs to another logical VIEW."""


class EvidenceViewBlockchainWriteError(RuntimeError):
    """Raised when a VIEW transaction has a definitive failure."""

    def __init__(self, message: str, *, code: str = "BLOCKCHAIN_VIEW_FAILED") -> None:
        super().__init__(message)
        self.code = code


class _EvidenceViewReconciliationUnavailable(RuntimeError):
    """Raised when an existing pending session cannot be read safely yet."""


class EvidenceViewState(str, Enum):
    WAITING_FOR_BLOCKCHAIN = "WAITING_FOR_BLOCKCHAIN"
    PENDING_BLOCKCHAIN_CONFIRMATION = "PENDING_BLOCKCHAIN_CONFIRMATION"
    CONFIRMED = "CONFIRMED"


@dataclass(frozen=True)
class ViewAccessPreparation:
    access_log_id: UUID
    evidence_id: UUID
    user_id: UUID
    action: AuditAction
    occurred_at: datetime
    evidence_ref: str
    officer_ref: str
    access_session_ref: str


@dataclass(frozen=True)
class EvidenceViewSession:
    access_log_id: UUID
    evidence_id: UUID
    access_session_ref: str
    action: AuditAction
    occurred_at: datetime
    status: EvidenceViewState
    tx_hash: str | None = None
    block_number: int | None = None
    retry_after_seconds: int | None = None


@dataclass(frozen=True)
class _TransactionSnapshot:
    tx_hash: str
    status: str
    block_number: int | None
    created_at: datetime | None


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
        access_log_id: UUID | None = None,
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
            log_id=access_log_id,
            user_id=current_user.user_id,
            evidence_id=evidence.evidence_id,
            case_id=evidence.case_id,
            accessed_at=event_time,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return EvidenceViewPreparationService._preparation(access_log)

    @staticmethod
    def create_session(
        db: Session,
        *,
        evidence_id: UUID,
        current_user: User,
        ip_address: str | None,
        user_agent: str | None,
        request_id: UUID | None = None,
        blockchain_service: BlockchainIntegrationService | None = None,
    ) -> EvidenceViewSession:
        service = blockchain_service or BlockchainIntegrationService()
        prepared, created = EvidenceViewPreparationService._load_or_create(
            db,
            evidence_id=evidence_id,
            current_user=current_user,
            ip_address=ip_address,
            user_agent=user_agent,
            request_id=request_id,
            service=service,
        )
        return EvidenceViewPreparationService._advance(
            db,
            prepared=prepared,
            service=service,
            inspect_chain_before_submit=not created,
            preflight_checked=created,
        )

    @staticmethod
    def _load_or_create(
        db: Session,
        *,
        evidence_id: UUID,
        current_user: User,
        ip_address: str | None,
        user_agent: str | None,
        request_id: UUID | None,
        service: BlockchainIntegrationService,
    ) -> tuple[ViewAccessPreparation, bool]:
        EvidenceViewPreparationService._require_authorized_evidence(
            db,
            evidence_id=evidence_id,
            current_user=current_user,
        )

        if request_id is not None:
            existing = AccessLogRepository.get_by_id(db, request_id)
            if existing is not None:
                prepared = EvidenceViewPreparationService._validated_existing(
                    existing,
                    evidence_id=evidence_id,
                    user_id=current_user.user_id,
                )
                db.rollback()
                return prepared, False

        existing = AccessLogRepository.get_pending_view(
            db,
            user_id=current_user.user_id,
            evidence_id=evidence_id,
        )
        if existing is not None:
            prepared = EvidenceViewPreparationService._preparation(existing)
            db.rollback()
            return prepared, False

        db.rollback()
        # การเชื่อมต่อ Blockchain: คำขอใหม่ต้องผ่าน preflight ก่อนสร้าง
        # AccessLog เพื่อไม่ทิ้ง PENDING ที่ยังไม่เคย broadcast เมื่อ chain หยุดทำงาน
        EvidenceViewPreparationService._require_new_session_liveness(service)

        try:
            prepared = EvidenceViewPreparationService.prepare(
                db,
                evidence_id=evidence_id,
                current_user=current_user,
                ip_address=ip_address,
                user_agent=user_agent,
                access_log_id=request_id,
            )
            # การเชื่อมต่อ Blockchain: checkpoint นี้ทำให้ logical VIEW คงอยู่
            # ก่อนออกไปเรียก RPC และก่อนรอ consensus/receipt
            db.commit()
            return prepared, True
        except IntegrityError:
            db.rollback()
            existing = AccessLogRepository.get_pending_view(
                db,
                user_id=current_user.user_id,
                evidence_id=evidence_id,
            )
            if existing is None:
                raise
            prepared = EvidenceViewPreparationService._preparation(existing)
            db.rollback()
            return prepared, False
        except EvidenceViewNotFoundError:
            db.rollback()
            raise
        except Exception as exc:
            db.rollback()
            raise EvidenceViewBlockchainWriteError(
                "Evidence view could not be staged",
                code="VIEW_SESSION_NOT_STAGED",
            ) from exc

    @staticmethod
    def _advance(
        db: Session,
        *,
        prepared: ViewAccessPreparation,
        service: BlockchainIntegrationService,
        inspect_chain_before_submit: bool,
        preflight_checked: bool,
    ) -> EvidenceViewSession:
        access_log = AccessLogRepository.get_by_id(db, prepared.access_log_id)
        if access_log is None:
            db.rollback()
            raise EvidenceViewNotFoundError("Evidence view session not found")
        result = access_log.result
        transaction = (
            BlockchainTransactionRepository.get_by_id(db, access_log.tx_internal_id)
            if access_log.tx_internal_id is not None
            else None
        )
        transaction_snapshot = (
            _TransactionSnapshot(
                tx_hash=str(transaction.tx_hash),
                status=str(transaction.status),
                block_number=transaction.block_number,
                created_at=getattr(transaction, "created_at", None),
            )
            if transaction is not None
            else None
        )
        db.rollback()

        if (
            result == AuditResult.SUCCESS
            and transaction_snapshot is not None
            and transaction_snapshot.status == "confirmed"
            and transaction_snapshot.block_number is not None
        ):
            return EvidenceViewPreparationService._response(
                prepared,
                EvidenceViewState.CONFIRMED,
                tx_hash=transaction_snapshot.tx_hash,
                block_number=transaction_snapshot.block_number,
            )
        if result == AuditResult.FAILED:
            raise EvidenceViewBlockchainWriteError(
                "Evidence view transaction failed",
                code="BLOCKCHAIN_VIEW_FAILED",
            )
        if transaction_snapshot is not None:
            pending_or_confirmed = EvidenceViewPreparationService._confirm(
                db,
                prepared=prepared,
                service=service,
                tx_hash=transaction_snapshot.tx_hash,
                wait_for_receipt=False,
            )
            if pending_or_confirmed.status == EvidenceViewState.CONFIRMED:
                return pending_or_confirmed
            try:
                recovered = EvidenceViewPreparationService._recover_by_session_ref(
                    db,
                    prepared=prepared,
                    service=service,
                )
            except _EvidenceViewReconciliationUnavailable:
                return pending_or_confirmed
            if recovered is not None:
                return recovered
            try:
                resubmitted = EvidenceViewPreparationService._recover_dropped_transaction(
                    db,
                    prepared=prepared,
                    service=service,
                    snapshot=transaction_snapshot,
                )
            except _EvidenceViewReconciliationUnavailable:
                return pending_or_confirmed
            return resubmitted or pending_or_confirmed

        if inspect_chain_before_submit:
            try:
                recovered = EvidenceViewPreparationService._recover_by_session_ref(
                    db,
                    prepared=prepared,
                    service=service,
                )
            except _EvidenceViewReconciliationUnavailable:
                # การเชื่อมต่อ Blockchain: ถ้าอ่าน session เดิมไม่ได้ชั่วคราว
                # ต้องรอก่อนเพื่อไม่ broadcast ธุรกรรมซ้ำโดยไม่ทราบสถานะเดิม
                return EvidenceViewPreparationService._response(
                    prepared,
                    EvidenceViewState.WAITING_FOR_BLOCKCHAIN,
                    retry_after_seconds=2,
                )
            if recovered is not None:
                return recovered

        if not preflight_checked:
            try:
                liveness = service.check_write_liveness()
            except Exception as exc:
                EvidenceViewPreparationService._mark_failed(db, prepared.access_log_id)
                raise EvidenceViewBlockchainWriteError(
                    "Blockchain write configuration is unavailable",
                    code="BLOCKCHAIN_NOT_SUBMITTED",
                ) from exc
            if not liveness["ready"]:
                return EvidenceViewPreparationService._response(
                    prepared,
                    EvidenceViewState.WAITING_FOR_BLOCKCHAIN,
                    retry_after_seconds=2,
                )

        access_log = AccessLogRepository.get_by_id_for_update(db, prepared.access_log_id)
        if access_log is None:
            db.rollback()
            raise EvidenceViewNotFoundError("Evidence view session not found")
        if access_log.result != AuditResult.PENDING or access_log.tx_internal_id is not None:
            db.rollback()
            return EvidenceViewPreparationService._advance(
                db,
                prepared=prepared,
                service=service,
                inspect_chain_before_submit=False,
                preflight_checked=False,
            )

        try:
            submission = service.submit_access(
                evidence_id=prepared.evidence_id,
                officer_user_id=prepared.user_id,
                access_log_id=prepared.access_log_id,
                action=AccessAction.VIEW,
                occurred_at=int(prepared.occurred_at.timestamp()),
            )
            transaction = BlockchainTransactionRepository.stage_submitted_access(
                db,
                tx_hash=submission["tx_hash"],
                evidence_id=prepared.evidence_id,
                initiated_by=prepared.user_id,
                contract_address=submission["contract_address"],
            )
            access_log.tx_internal_id = transaction.tx_internal_id
            # การเชื่อมต่อ Blockchain: commit hash ก่อนรอ receipt เพื่อให้ timeout
            # กลับมาตรวจ transaction เดิมได้โดยไม่ broadcast ซ้ำ
            db.commit()
        except TransactionSubmissionUncertainError as exc:
            transaction = BlockchainTransactionRepository.stage_submitted_access(
                db,
                tx_hash=exc.tx_hash,
                evidence_id=prepared.evidence_id,
                initiated_by=prepared.user_id,
                contract_address=service.contract_address or "",
                status="submission_unknown",
            )
            access_log.tx_internal_id = transaction.tx_internal_id
            db.commit()
            return EvidenceViewPreparationService._response(
                prepared,
                EvidenceViewState.PENDING_BLOCKCHAIN_CONFIRMATION,
                tx_hash=exc.tx_hash,
                retry_after_seconds=2,
            )
        except (TransactionBuildError, TransactionSigningError, NonceError) as exc:
            access_log.result = AuditResult.FAILED
            db.commit()
            raise EvidenceViewBlockchainWriteError(
                "Blockchain VIEW transaction was not submitted",
                code="BLOCKCHAIN_NOT_SUBMITTED",
            ) from exc
        except BlockchainClientError as exc:
            access_log.result = AuditResult.FAILED
            db.commit()
            raise EvidenceViewBlockchainWriteError(
                "Blockchain VIEW transaction was not submitted",
                code="BLOCKCHAIN_NOT_SUBMITTED",
            ) from exc
        except Exception:
            db.rollback()
            raise

        return EvidenceViewPreparationService._confirm(
            db,
            prepared=prepared,
            service=service,
            tx_hash=submission["tx_hash"],
            wait_for_receipt=True,
        )

    @staticmethod
    def _confirm(
        db: Session,
        *,
        prepared: ViewAccessPreparation,
        service: BlockchainIntegrationService,
        tx_hash: str,
        wait_for_receipt: bool,
    ) -> EvidenceViewSession:
        try:
            result = service.confirm_access(
                tx_hash=tx_hash,
                evidence_id=prepared.evidence_id,
                officer_user_id=prepared.user_id,
                access_log_id=prepared.access_log_id,
                action=AccessAction.VIEW,
                occurred_at=int(prepared.occurred_at.timestamp()),
                wait_for_receipt=wait_for_receipt,
            )
        except (
            TransactionTimeoutError,
            TransactionConfirmationTimeoutError,
            ContractConnectionError,
        ):
            # การเชื่อมต่อ Blockchain: receipt timeout ไม่ใช่ transaction failure
            # จึงคง session/tx hash ไว้ให้ request เดิมตรวจสอบต่อภายหลัง
            return EvidenceViewPreparationService._response(
                prepared,
                EvidenceViewState.PENDING_BLOCKCHAIN_CONFIRMATION,
                tx_hash=tx_hash,
                retry_after_seconds=2,
            )
        except TransactionRevertedError as exc:
            EvidenceViewPreparationService._mark_failed(
                db,
                prepared.access_log_id,
                transaction_status="reverted",
            )
            raise EvidenceViewBlockchainWriteError(
                "Blockchain VIEW transaction reverted",
                code="BLOCKCHAIN_VIEW_REVERTED",
            ) from exc
        except BlockchainClientError as exc:
            EvidenceViewPreparationService._mark_failed(
                db,
                prepared.access_log_id,
                transaction_status="failed",
            )
            raise EvidenceViewBlockchainWriteError(
                "Blockchain VIEW confirmation failed",
                code="BLOCKCHAIN_VIEW_FAILED",
            ) from exc
        except Exception:
            return EvidenceViewPreparationService._response(
                prepared,
                EvidenceViewState.PENDING_BLOCKCHAIN_CONFIRMATION,
                tx_hash=tx_hash,
                retry_after_seconds=2,
            )

        if result is None:
            return EvidenceViewPreparationService._response(
                prepared,
                EvidenceViewState.PENDING_BLOCKCHAIN_CONFIRMATION,
                tx_hash=tx_hash,
                retry_after_seconds=2,
            )
        return EvidenceViewPreparationService._mark_confirmed(
            db,
            prepared=prepared,
            result=result,
        )

    @staticmethod
    def _recover_by_session_ref(
        db: Session,
        *,
        prepared: ViewAccessPreparation,
        service: BlockchainIntegrationService,
    ) -> EvidenceViewSession | None:
        try:
            record = service.get_access_by_session(prepared.access_session_ref)
            if record is None:
                return None
            action = record["action"]
            if not isinstance(action, AccessAction):
                action = AccessAction(int(action))
            if (
                record["evidence_ref"] != prepared.evidence_ref
                or record["officer_ref"] != prepared.officer_ref
                or action != AccessAction.VIEW
                or int(record["occurred_at"]) != int(prepared.occurred_at.timestamp())
            ):
                EvidenceViewPreparationService._mark_failed(db, prepared.access_log_id)
                raise EvidenceViewBlockchainWriteError(
                    "Blockchain access session does not match the pending VIEW",
                    code="BLOCKCHAIN_VIEW_MISMATCH",
                )
            event = service.get_access_event_by_session(prepared.access_session_ref)
        except EvidenceViewBlockchainWriteError:
            raise
        except Exception as exc:
            raise _EvidenceViewReconciliationUnavailable(
                "pending VIEW reconciliation is temporarily unavailable"
            ) from exc
        if event is None:
            return EvidenceViewPreparationService._response(
                prepared,
                EvidenceViewState.PENDING_BLOCKCHAIN_CONFIRMATION,
                retry_after_seconds=2,
            )

        access_log = AccessLogRepository.get_by_id_for_update(db, prepared.access_log_id)
        if access_log is None:
            db.rollback()
            raise EvidenceViewNotFoundError("Evidence view session not found")
        if access_log.tx_internal_id is None:
            transaction = BlockchainTransactionRepository.stage_submitted_access(
                db,
                tx_hash=event["tx_hash"],
                evidence_id=prepared.evidence_id,
                initiated_by=prepared.user_id,
                contract_address=service.contract_address or "",
            )
            access_log.tx_internal_id = transaction.tx_internal_id
        else:
            transaction = BlockchainTransactionRepository.get_by_id(
                db,
                access_log.tx_internal_id,
            )
            if transaction is None:
                db.rollback()
                raise EvidenceViewBlockchainWriteError(
                    "Submitted VIEW transaction metadata is missing",
                    code="VIEW_SESSION_METADATA_MISSING",
                )
            transaction.tx_hash = event["tx_hash"]
            transaction.contract_address = service.contract_address or ""
            transaction.status = "pending_confirmation"
        db.commit()
        return EvidenceViewPreparationService._confirm(
            db,
            prepared=prepared,
            service=service,
            tx_hash=event["tx_hash"],
            wait_for_receipt=False,
        )

    @staticmethod
    def _recover_dropped_transaction(
        db: Session,
        *,
        prepared: ViewAccessPreparation,
        service: BlockchainIntegrationService,
        snapshot: _TransactionSnapshot,
    ) -> EvidenceViewSession | None:
        if snapshot.status != "pending_confirmation":
            return None
        if not EvidenceViewPreparationService._recovery_delay_elapsed(
            snapshot.created_at,
            service.transaction_recovery_delay_seconds,
        ):
            return None

        try:
            if service.transaction_exists(snapshot.tx_hash):
                return None
            liveness = service.check_write_liveness()
        except Exception as exc:
            raise _EvidenceViewReconciliationUnavailable(
                "dropped VIEW transaction diagnosis is temporarily unavailable"
            ) from exc
        if not liveness["ready"]:
            return None

        access_log = AccessLogRepository.get_by_id_for_update(db, prepared.access_log_id)
        if access_log is None:
            db.rollback()
            raise EvidenceViewNotFoundError("Evidence view session not found")
        if access_log.result != AuditResult.PENDING or access_log.tx_internal_id is None:
            db.rollback()
            return None
        transaction = BlockchainTransactionRepository.get_by_id(
            db,
            access_log.tx_internal_id,
        )
        if transaction is None:
            db.rollback()
            raise EvidenceViewBlockchainWriteError(
                "Submitted VIEW transaction metadata is missing",
                code="VIEW_SESSION_METADATA_MISSING",
            )
        if (
            str(transaction.tx_hash) != snapshot.tx_hash
            or str(transaction.status) != snapshot.status
        ):
            current_hash = str(transaction.tx_hash)
            db.rollback()
            return EvidenceViewPreparationService._response(
                prepared,
                EvidenceViewState.PENDING_BLOCKCHAIN_CONFIRMATION,
                tx_hash=current_hash,
                retry_after_seconds=2,
            )

        try:
            # การเชื่อมต่อ Blockchain: ตรวจ hash และ session ซ้ำภายใต้ row lock
            # ก่อนส่ง logical VIEW เดิม เพื่อกัน concurrent poll ส่งธุรกรรมซ้ำ
            if service.transaction_exists(snapshot.tx_hash):
                db.rollback()
                return None
            if service.get_access_by_session(prepared.access_session_ref) is not None:
                db.rollback()
                return EvidenceViewPreparationService._recover_by_session_ref(
                    db,
                    prepared=prepared,
                    service=service,
                )
            submission = service.submit_access(
                evidence_id=prepared.evidence_id,
                officer_user_id=prepared.user_id,
                access_log_id=prepared.access_log_id,
                action=AccessAction.VIEW,
                occurred_at=int(prepared.occurred_at.timestamp()),
            )
            BlockchainTransactionRepository.replace_access_submission(
                transaction,
                tx_hash=submission["tx_hash"],
                contract_address=submission["contract_address"],
            )
            # การเชื่อมต่อ Blockchain: commit replacement hash ก่อนรอ receipt
            # โดยคง AccessLog และ BlockchainTransaction แถวเดิมไว้
            db.commit()
        except TransactionSubmissionUncertainError as exc:
            BlockchainTransactionRepository.replace_access_submission(
                transaction,
                tx_hash=exc.tx_hash,
                contract_address=service.contract_address or "",
                status="submission_unknown",
            )
            db.commit()
            return EvidenceViewPreparationService._response(
                prepared,
                EvidenceViewState.PENDING_BLOCKCHAIN_CONFIRMATION,
                tx_hash=exc.tx_hash,
                retry_after_seconds=2,
            )
        except BlockchainClientError as exc:
            db.rollback()
            raise EvidenceViewBlockchainWriteError(
                "Dropped VIEW transaction could not be resubmitted",
                code="BLOCKCHAIN_VIEW_RECOVERY_FAILED",
            ) from exc
        except Exception as exc:
            db.rollback()
            raise _EvidenceViewReconciliationUnavailable(
                "dropped VIEW transaction recovery is temporarily unavailable"
            ) from exc

        return EvidenceViewPreparationService._confirm(
            db,
            prepared=prepared,
            service=service,
            tx_hash=submission["tx_hash"],
            wait_for_receipt=True,
        )

    @staticmethod
    def _recovery_delay_elapsed(
        created_at: datetime | None,
        recovery_delay_seconds: int,
    ) -> bool:
        if created_at is None:
            return False
        normalized = (
            created_at.replace(tzinfo=timezone.utc)
            if created_at.tzinfo is None
            else created_at.astimezone(timezone.utc)
        )
        return datetime.now(timezone.utc) - normalized >= timedelta(
            seconds=recovery_delay_seconds
        )

    @staticmethod
    def _mark_confirmed(
        db: Session,
        *,
        prepared: ViewAccessPreparation,
        result: dict[str, Any],
    ) -> EvidenceViewSession:
        access_log = AccessLogRepository.get_by_id_for_update(db, prepared.access_log_id)
        if access_log is None or access_log.tx_internal_id is None:
            db.rollback()
            raise EvidenceViewBlockchainWriteError(
                "Submitted VIEW metadata is missing",
                code="VIEW_SESSION_METADATA_MISSING",
            )
        transaction = BlockchainTransactionRepository.get_by_id(
            db,
            access_log.tx_internal_id,
        )
        if transaction is None:
            db.rollback()
            raise EvidenceViewBlockchainWriteError(
                "Submitted VIEW transaction metadata is missing",
                code="VIEW_SESSION_METADATA_MISSING",
            )
        BlockchainTransactionRepository.confirm_access(
            transaction,
            block_number=result["block_number"],
            block_timestamp=result["block_timestamp"],
            contract_address=result["contract_address"],
            gas_used=result.get("gas_used"),
        )
        access_log.result = AuditResult.SUCCESS
        db.commit()
        return EvidenceViewPreparationService._response(
            prepared,
            EvidenceViewState.CONFIRMED,
            tx_hash=result["tx_hash"],
            block_number=result["block_number"],
        )

    @staticmethod
    def _mark_failed(
        db: Session,
        access_log_id: UUID,
        *,
        transaction_status: str | None = None,
    ) -> None:
        access_log = AccessLogRepository.get_by_id_for_update(db, access_log_id)
        if access_log is None:
            db.rollback()
            return
        access_log.result = AuditResult.FAILED
        if transaction_status and access_log.tx_internal_id is not None:
            transaction = BlockchainTransactionRepository.get_by_id(
                db,
                access_log.tx_internal_id,
            )
            if transaction is not None:
                BlockchainTransactionRepository.fail_access(
                    transaction,
                    status=transaction_status,
                )
        db.commit()

    @staticmethod
    def _require_new_session_liveness(
        service: BlockchainIntegrationService,
    ) -> None:
        try:
            liveness = service.check_write_liveness()
        except Exception as exc:
            raise EvidenceViewBlockchainWriteError(
                "Blockchain write configuration is unavailable",
                code="BLOCKCHAIN_NOT_SUBMITTED",
            ) from exc
        if liveness["ready"]:
            return
        reason = str(liveness.get("reason") or "BLOCKCHAIN_UNAVAILABLE")
        code = (
            "BLOCKCHAIN_STALLED"
            if reason == "BLOCKCHAIN_STALLED"
            else "BLOCKCHAIN_UNAVAILABLE"
        )
        raise EvidenceViewBlockchainWriteError(
            "Blockchain is not ready for a new VIEW session",
            code=code,
        )

    @staticmethod
    def _response(
        prepared: ViewAccessPreparation,
        status: EvidenceViewState,
        *,
        tx_hash: str | None = None,
        block_number: int | None = None,
        retry_after_seconds: int | None = None,
    ) -> EvidenceViewSession:
        return EvidenceViewSession(
            access_log_id=prepared.access_log_id,
            evidence_id=prepared.evidence_id,
            access_session_ref=prepared.access_session_ref,
            action=prepared.action,
            occurred_at=prepared.occurred_at,
            status=status,
            tx_hash=tx_hash,
            block_number=block_number,
            retry_after_seconds=retry_after_seconds,
        )

    @staticmethod
    def _require_authorized_evidence(
        db: Session,
        *,
        evidence_id: UUID,
        current_user: User,
    ) -> Any:
        evidence = EvidenceRepository.get_by_id(db, evidence_id)
        case = CaseRepository.get_by_id(db, evidence.case_id) if evidence else None
        if case is None or not can_access_case(db, current_user, case):
            raise EvidenceViewNotFoundError("Evidence not found")
        return evidence

    @staticmethod
    def _validated_existing(
        access_log: Any,
        *,
        evidence_id: UUID,
        user_id: UUID,
    ) -> ViewAccessPreparation:
        if (
            access_log.evidence_id != evidence_id
            or access_log.user_id != user_id
            or access_log.action != AuditAction.VIEW
        ):
            raise EvidenceViewSessionConflictError(
                "VIEW request identifier is already used by another operation"
            )
        return EvidenceViewPreparationService._preparation(access_log)

    @staticmethod
    def _preparation(access_log: Any) -> ViewAccessPreparation:
        return ViewAccessPreparation(
            access_log_id=access_log.log_id,
            evidence_id=access_log.evidence_id,
            user_id=access_log.user_id,
            action=AuditAction.VIEW,
            occurred_at=access_log.accessed_at,
            evidence_ref=derive_evidence_ref(access_log.evidence_id),
            officer_ref=derive_actor_ref(access_log.user_id),
            access_session_ref=derive_access_session_ref(access_log.log_id),
        )

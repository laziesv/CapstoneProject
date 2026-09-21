from datetime import datetime, timezone
from typing import Any

from blockchain_client import (
    AccessAction,
    derive_access_session_ref,
    derive_actor_ref,
    derive_evidence_ref,
)
from blockchain_client.exceptions import ReferenceValidationError
from blockchain_client.references import normalize_bytes32
from sqlalchemy.orm import Session

from app.integrations.blockchain import BlockchainIntegrationService
from app.repositories.access_log_repository import AccessLogRepository
from app.repositories.evidence_items_repository import EvidenceRepository
from app.schemas.integrity_alert import (
    DatabaseIntegrityAlert,
    DatabaseIntegrityAlertResponse,
)


class DatabaseIntegrityAlertUnavailableError(Exception):
    pass


class DatabaseIntegrityAlertService:
    """Compare mutable evidence and access data with immutable Blockchain records."""

    def __init__(
        self,
        blockchain_service: BlockchainIntegrationService | None = None,
    ) -> None:
        self._blockchain = blockchain_service or BlockchainIntegrationService()

    def scan(self, db: Session) -> DatabaseIntegrityAlertResponse:
        evidence_items = EvidenceRepository.get_all(db)
        access_logs, _ = AccessLogRepository.list(db)
        access_logs_by_session = {
            derive_access_session_ref(access_log.log_id): access_log
            for access_log in access_logs
        }
        evidence_by_id = {
            evidence.evidence_id: evidence for evidence in evidence_items
        }
        matched_access_sessions: set[str] = set()
        alerts: list[DatabaseIntegrityAlert] = []

        for evidence in evidence_items:
            evidence_ref = derive_evidence_ref(evidence.evidence_id)
            try:
                chain_record = self._blockchain.get_evidence(evidence_ref)
                chain_history = self._blockchain.get_evidence_history_by_ref(
                    evidence_ref
                )
            except Exception as exc:
                raise DatabaseIntegrityAlertUnavailableError(
                    "Unable to read integrity records from Blockchain"
                ) from exc

            original_file = evidence.original_file
            database_hash = self._normalize_hash(
                original_file.file_hash if original_file else None
            )
            blockchain_hash = self._chain_hash(chain_record)
            if database_hash != blockchain_hash or blockchain_hash is None:
                alerts.append(
                    DatabaseIntegrityAlert(
                        alert_type="EVIDENCE_HASH",
                        evidence_id=evidence.evidence_id,
                        evidence_number=evidence.evidence_number,
                        original_filename=evidence.original_filename,
                        detected_at=datetime.now(timezone.utc),
                        database_hash=database_hash,
                        blockchain_hash=blockchain_hash,
                        status=(
                            "DATABASE_HASH_MISMATCH"
                            if blockchain_hash is not None
                            else "MISSING_ON_CHAIN"
                        ),
                    )
                )

            for chain_access in chain_history.get("access_history", []):
                session_ref = self._normalize_ref(
                    chain_access.get("access_session_ref"),
                    "access_session_ref",
                )
                if session_ref is None:
                    continue
                matched_access_sessions.add(session_ref)
                access_log = access_logs_by_session.get(session_ref)
                mismatch_status = self._access_mismatch_status(
                    access_log=access_log,
                    chain_access=chain_access,
                )
                if mismatch_status is None:
                    continue
                alerts.append(
                    self._access_alert(
                        evidence=evidence,
                        access_log=access_log,
                        session_ref=session_ref,
                        status=mismatch_status,
                    )
                )

        # แถว AccessLog ที่อ้างธุรกรรม Blockchain แต่หา session บน chain ไม่พบ
        # จะถูกแจ้งเตือนด้วย ครอบคลุมกรณีแก้ evidence_id/log_id ในฐานข้อมูล
        for session_ref, access_log in access_logs_by_session.items():
            if access_log.tx_internal_id is None or session_ref in matched_access_sessions:
                continue
            evidence = evidence_by_id.get(access_log.evidence_id)
            alerts.append(
                self._access_alert(
                    evidence=evidence,
                    access_log=access_log,
                    session_ref=session_ref,
                    status="ACCESS_LOG_MISSING_ON_CHAIN",
                )
            )

        return DatabaseIntegrityAlertResponse(
            alert_count=len(alerts),
            checked_count=len(evidence_items),
            access_log_checked_count=len(access_logs),
            alerts=alerts,
        )

    def _access_mismatch_status(
        self,
        *,
        access_log: Any,
        chain_access: dict[str, Any],
    ) -> str | None:
        if access_log is None:
            return "ACCESS_LOG_MISSING_IN_DATABASE"

        chain_evidence_ref = self._normalize_ref(
            chain_access.get("evidence_ref"), "evidence_ref"
        )
        chain_officer_ref = self._normalize_ref(
            chain_access.get("officer_ref"), "officer_ref"
        )
        database_action = self._enum_value(access_log.action)
        chain_action = self._chain_action(chain_access.get("action"))
        database_occurred_at = (
            int(access_log.accessed_at.timestamp())
            if access_log.accessed_at is not None
            else None
        )

        matches = (
            access_log.evidence_id is not None
            and derive_evidence_ref(access_log.evidence_id) == chain_evidence_ref
            and derive_actor_ref(access_log.user_id) == chain_officer_ref
            and database_action == chain_action
            and database_occurred_at == chain_access.get("occurred_at")
        )
        return None if matches else "ACCESS_LOG_MISMATCH"

    @staticmethod
    def _access_alert(
        *,
        evidence: Any,
        access_log: Any,
        session_ref: str,
        status: str,
    ) -> DatabaseIntegrityAlert:
        return DatabaseIntegrityAlert(
            alert_type="ACCESS_LOG",
            evidence_id=(
                evidence.evidence_id
                if evidence is not None
                else getattr(access_log, "evidence_id", None)
            ),
            evidence_number=(evidence.evidence_number if evidence else None),
            access_log_id=(access_log.log_id if access_log is not None else None),
            access_session_ref=session_ref,
            detected_at=datetime.now(timezone.utc),
            status=status,
        )

    @classmethod
    def _chain_hash(cls, record: Any) -> str | None:
        if not isinstance(record, dict) or record.get("exists") is not True:
            return None
        return cls._normalize_hash(record.get("evidence_hash"))

    @staticmethod
    def _normalize_hash(value: Any) -> str | None:
        return DatabaseIntegrityAlertService._normalize_ref(value, "evidence_hash", strip_prefix=True)

    @staticmethod
    def _normalize_ref(
        value: Any,
        field_name: str,
        *,
        strip_prefix: bool = False,
    ) -> str | None:
        if not value:
            return None
        try:
            normalized = normalize_bytes32(value, field_name)
            return normalized[2:].lower() if strip_prefix else normalized
        except (AttributeError, ReferenceValidationError):
            return None

    @staticmethod
    def _chain_action(value: Any) -> str | None:
        try:
            if isinstance(value, AccessAction):
                return value.name
            if isinstance(value, str):
                return AccessAction[value.upper()].name
            return AccessAction(value).name
        except (KeyError, TypeError, ValueError):
            return None

    @staticmethod
    def _enum_value(value: Any) -> str:
        return value.value if hasattr(value, "value") else str(value)

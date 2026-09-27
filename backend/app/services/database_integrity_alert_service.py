from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from threading import Lock
from time import monotonic
from collections.abc import Callable
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

    # Blockchain state is immutable once confirmed. Reusing recent reads avoids
    # rescanning the same block range for every UI poll. The short history TTL
    # still makes newly confirmed access events visible quickly.
    _EVIDENCE_CACHE_TTL_SECONDS = 300.0
    _HISTORY_CACHE_TTL_SECONDS = 10.0
    _MAX_PARALLEL_CHAIN_READS = 4
    _cache_lock = Lock()
    _evidence_cache: dict[str, tuple[float, Any]] = {}
    _history_cache: dict[str, tuple[float, Any]] = {}
    _load_locks: dict[tuple[int, str], Lock] = {}

    def __init__(
        self,
        blockchain_service: BlockchainIntegrationService | None = None,
    ) -> None:
        self._blockchain = blockchain_service or BlockchainIntegrationService()

    def scan(self, db: Session) -> DatabaseIntegrityAlertResponse:
        evidence_items = EvidenceRepository.get_all_for_integrity(db)
        access_logs = AccessLogRepository.get_all_for_integrity(db)
        access_logs_by_session = {
            derive_access_session_ref(access_log.log_id): access_log
            for access_log in access_logs
        }
        evidence_by_id = {
            evidence.evidence_id: evidence for evidence in evidence_items
        }
        matched_access_sessions: set[str] = set()
        alerts: list[DatabaseIntegrityAlert] = []

        chain_states = self._load_chain_states(evidence_items)

        for evidence in evidence_items:
            evidence_ref = derive_evidence_ref(evidence.evidence_id)
            chain_record, chain_history = chain_states[evidence_ref]

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

    def _load_chain_states(
        self,
        evidence_items: list[Any],
    ) -> dict[str, tuple[Any, Any]]:
        """Load independent evidence records concurrently with bounded fan-out."""

        evidence_refs = [
            derive_evidence_ref(evidence.evidence_id)
            for evidence in evidence_items
        ]
        if not evidence_refs:
            return {}

        if len(evidence_refs) == 1:
            evidence_ref = evidence_refs[0]
            return {evidence_ref: self._load_chain_state(evidence_ref)}

        workers = min(self._MAX_PARALLEL_CHAIN_READS, len(evidence_refs))
        states: dict[str, tuple[Any, Any]] = {}
        try:
            with ThreadPoolExecutor(max_workers=workers) as executor:
                futures = {
                    executor.submit(self._load_chain_state, evidence_ref): evidence_ref
                    for evidence_ref in evidence_refs
                }
                for future in as_completed(futures):
                    evidence_ref = futures[future]
                    states[evidence_ref] = future.result()
        except Exception as exc:
            raise DatabaseIntegrityAlertUnavailableError(
                "Unable to read integrity records from Blockchain"
            ) from exc
        return states

    def _load_chain_state(self, evidence_ref: str) -> tuple[Any, Any]:
        chain_record = self._cached_chain_read(
            cache=self._evidence_cache,
            key=evidence_ref,
            ttl_seconds=self._EVIDENCE_CACHE_TTL_SECONDS,
            loader=lambda: self._blockchain.get_evidence(evidence_ref),
        )
        chain_history = self._cached_chain_read(
            cache=self._history_cache,
            key=evidence_ref,
            ttl_seconds=self._HISTORY_CACHE_TTL_SECONDS,
            loader=lambda: self._blockchain.get_evidence_history_by_ref(evidence_ref),
        )
        return chain_record, chain_history

    @classmethod
    def _cached_chain_read(
        cls,
        *,
        cache: dict[str, tuple[float, Any]],
        key: str,
        ttl_seconds: float,
        loader: Callable[[], Any],
    ) -> Any:
        now = monotonic()
        with cls._cache_lock:
            cached = cache.get(key)
            if cached is not None and cached[0] > now:
                return cached[1]
            lock_key = (id(cache), key)
            load_lock = cls._load_locks.setdefault(lock_key, Lock())

        # Only one request loads a missing key. Concurrent callers reuse it.
        with load_lock:
            now = monotonic()
            with cls._cache_lock:
                cached = cache.get(key)
                if cached is not None and cached[0] > now:
                    return cached[1]

            value = loader()
            effective_ttl = ttl_seconds
            # A not-yet-registered record can become available shortly after a
            # transaction confirms, so negative reads must expire quickly.
            if isinstance(value, dict) and value.get("exists") is False:
                effective_ttl = min(effective_ttl, 5.0)
            with cls._cache_lock:
                cache[key] = (monotonic() + effective_ttl, value)
                # Keep the process cache bounded even after evidence is removed.
                if len(cache) > 2_000:
                    expired = [
                        item_key
                        for item_key, item in cache.items()
                        if item[0] <= now
                    ]
                    for item_key in expired:
                        cache.pop(item_key, None)
                        cls._load_locks.pop((id(cache), item_key), None)
            return value

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

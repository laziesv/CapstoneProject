from typing import Any, Callable
from uuid import UUID

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
from app.repositories.user_repository import UserRepository


class BlockchainExplorerError(Exception):
    pass


class BlockchainExplorerNotFoundError(BlockchainExplorerError):
    pass


class BlockchainExplorerUnavailableError(BlockchainExplorerError):
    pass


class BlockchainExplorerService:
    """Read EvidenceRegistryV3 and add optional current DB display data."""

    def __init__(
        self,
        blockchain_service: BlockchainIntegrationService | None = None,
    ) -> None:
        self._blockchain = blockchain_service or BlockchainIntegrationService()

    def overview(self) -> dict[str, Any]:
        return self._read(self._blockchain.get_network_overview)

    def block(self, block_number: int) -> dict[str, Any]:
        result = self._read(self._blockchain.get_block, block_number)
        if result is None:
            raise BlockchainExplorerNotFoundError("Block was not found")
        return result

    def transaction(self, tx_hash: str) -> dict[str, Any]:
        result = self._read(self._blockchain.get_transaction, tx_hash)
        if result is None:
            raise BlockchainExplorerNotFoundError("Transaction was not found")
        return result

    def evidence_by_id(self, db: Session, evidence_id: UUID) -> dict[str, Any]:
        evidence = EvidenceRepository.get_by_id(db, evidence_id)
        return self._evidence(
            db,
            derive_evidence_ref(evidence_id),
            evidence=evidence,
            evidence_id=evidence_id,
        )

    def evidence_by_ref(self, db: Session, evidence_ref: str) -> dict[str, Any]:
        canonical_ref = normalize_bytes32(evidence_ref, "evidence_ref")
        evidence = next(
            (
                item
                for item in EvidenceRepository.get_all(db)
                if derive_evidence_ref(item.evidence_id) == canonical_ref
            ),
            None,
        )
        return self._evidence(
            db,
            canonical_ref,
            evidence=evidence,
            evidence_id=evidence.evidence_id if evidence else None,
        )

    def access_session(
        self,
        db: Session,
        access_session_ref: str,
    ) -> dict[str, Any]:
        canonical_ref = normalize_bytes32(
            access_session_ref,
            "access_session_ref",
        )
        record = self._read(self._blockchain.get_access_by_session, canonical_ref)
        if record is None:
            raise BlockchainExplorerNotFoundError(
                "Access Session was not found"
            )
        event = self._read(
            self._blockchain.get_access_event_by_session,
            canonical_ref,
        )
        evidence_ref = normalize_bytes32(record["evidence_ref"], "evidence_ref")
        officer_ref = normalize_bytes32(record["officer_ref"], "officer_ref")
        evidence = self._find_evidence_by_ref(db, evidence_ref)
        access_logs, _ = AccessLogRepository.list(db, exclude_query=True)
        matching_logs = [
            access_log
            for access_log in access_logs
            if derive_access_session_ref(access_log.log_id) == canonical_ref
        ]
        access_log = matching_logs[0] if len(matching_logs) == 1 else None
        return {
            "access_session_ref": canonical_ref,
            "evidence_ref": evidence_ref,
            "officer_ref": officer_ref,
            "action": self._action(record["action"]),
            "occurred_at": int(record["occurred_at"]),
            "recorded_at": int(record["recorded_at"]),
            "writer": str(record["writer"]),
            "tx_hash": event.get("tx_hash") if event else None,
            "block_number": event.get("block_number") if event else None,
            "transaction_index": event.get("transaction_index") if event else None,
            "log_index": event.get("log_index") if event else None,
            "evidence_id": evidence.evidence_id if evidence else None,
            "evidence_number": evidence.evidence_number if evidence else None,
            "actor": self._user_payload(self._find_user_by_ref(db, officer_ref)),
            "database_access_log_found": access_log is not None,
            "database_access_log_id": access_log.log_id if access_log else None,
        }

    def _evidence(
        self,
        db: Session,
        evidence_ref: str,
        *,
        evidence: Any,
        evidence_id: UUID | None,
    ) -> dict[str, Any]:
        record = self._read(self._blockchain.get_evidence, evidence_ref)
        if not record.get("exists"):
            raise BlockchainExplorerNotFoundError("Evidence was not found")
        custody = self._read(
            self._blockchain.get_evidence_history_by_ref,
            evidence_ref,
        )
        registration_event = custody.get("registration")
        registration = {
            "evidence_hash": record["evidence_hash"],
            "uploader_ref": record["uploader_ref"],
            "recorded_at": int(record["recorded_at"]),
            "writer": str(record["writer"]),
            "tx_hash": registration_event.get("tx_hash") if registration_event else None,
            "block_number": registration_event.get("block_number") if registration_event else None,
            "transaction_index": (
                registration_event.get("transaction_index")
                if registration_event
                else None
            ),
            "log_index": registration_event.get("log_index") if registration_event else None,
        }
        users_by_ref = {
            derive_actor_ref(user.user_id): user for user in UserRepository.list(db)
        }
        access_history = []
        for event in custody.get("access_history", []):
            officer_ref = normalize_bytes32(event["officer_ref"], "officer_ref")
            access_history.append(
                {
                    **event,
                    "action": self._action(event["action"]),
                    "actor": self._user_payload(users_by_ref.get(officer_ref)),
                }
            )
        return {
            "evidence_id": evidence_id,
            "evidence_number": evidence.evidence_number if evidence else None,
            "evidence_ref": evidence_ref,
            "registration": registration,
            "access_history": access_history,
            "scan_from_block": int(custody["scan"]["from_block"]),
            "scan_to_block": int(custody["scan"]["to_block"]),
        }

    def _find_evidence_by_ref(self, db: Session, evidence_ref: str) -> Any:
        return next(
            (
                evidence
                for evidence in EvidenceRepository.get_all(db)
                if derive_evidence_ref(evidence.evidence_id) == evidence_ref
            ),
            None,
        )

    def _find_user_by_ref(self, db: Session, officer_ref: str) -> Any:
        users = [
            user
            for user in UserRepository.list(db)
            if derive_actor_ref(user.user_id) == officer_ref
        ]
        return users[0] if len(users) == 1 else None

    @staticmethod
    def _user_payload(user: Any) -> dict[str, Any] | None:
        if user is None:
            return None
        return {
            "user_id": user.user_id,
            "badge_number": getattr(user, "badge_number", None),
            "username": getattr(user, "username", None),
            "email": getattr(user, "email", None),
            "full_name": getattr(user, "full_name", None),
            "rank": getattr(user, "rank", None),
        }

    @staticmethod
    def _action(value: Any) -> str:
        if isinstance(value, AccessAction):
            return value.name
        if isinstance(value, int):
            return AccessAction(value).name
        normalized = str(value).upper()
        return normalized.split(".")[-1]

    @staticmethod
    def _read(function: Callable[..., Any], *args: Any) -> Any:
        try:
            return function(*args)
        except (ValueError, ReferenceValidationError):
            raise
        except Exception as exc:
            raise BlockchainExplorerUnavailableError(
                "Blockchain read is unavailable"
            ) from exc

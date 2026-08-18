from typing import Any
from uuid import UUID

from blockchain_client import (
    derive_access_session_ref,
    derive_actor_ref,
    derive_evidence_ref,
)
from blockchain_client.exceptions import ReferenceValidationError
from blockchain_client.references import normalize_bytes32
from sqlalchemy.orm import Session

from app.integrations.blockchain import BlockchainIntegrationService
from app.integrations.blockchain.transaction_repository import (
    BlockchainTransactionRepository,
)
from app.models.enums import AuditAction, AuditResult, BlockchainAction
from app.repositories.access_log_repository import AccessLogRepository
from app.repositories.evidence_items_repository import EvidenceRepository
from app.repositories.user_repository import UserRepository
from app.schemas.chain_of_custody import (
    ChainAccessHistoryItem,
    ChainAccessMetadata,
    ChainAccessVerification,
    ChainEvidenceMetadata,
    ChainOfCustodyResponse,
    ChainOfCustodyVerification,
    ChainTransactionMetadata,
    ChainUserIdentity,
)


class ChainOfCustodyError(Exception):
    pass


class ChainOfCustodyEvidenceNotFoundError(ChainOfCustodyError):
    pass


class ChainOfCustodyBlockchainReadError(ChainOfCustodyError):
    pass


class ChainOfCustodyMalformedChainDataError(ChainOfCustodyError):
    pass


class ChainOfCustodyService:
    def __init__(
        self,
        blockchain_service: BlockchainIntegrationService | None = None,
    ) -> None:
        self._blockchain = blockchain_service or BlockchainIntegrationService()

    def get_chain_of_custody(
        self,
        db: Session,
        evidence_id: UUID,
    ) -> ChainOfCustodyResponse:
        evidence = EvidenceRepository.get_by_id(db, evidence_id)
        if evidence is None:
            raise ChainOfCustodyEvidenceNotFoundError("Evidence not found")

        evidence_ref = derive_evidence_ref(evidence.evidence_id)
        chain_evidence = self._read_evidence(evidence_ref)
        evidence_exists = bool(chain_evidence.get("exists"))
        original_hash = self._original_hash(evidence)
        chain_hash = None
        uploader_ref = None
        chain_recorded_at = None
        chain_writer = None
        if evidence_exists:
            chain_hash = self._chain_bytes32(chain_evidence, "evidence_hash")
            uploader_ref = self._chain_bytes32(chain_evidence, "uploader_ref")
            chain_recorded_at = self._chain_recorded_at(chain_evidence)
            chain_writer = self._chain_writer(chain_evidence)

        expected_hash = self._normalize_original_hash(original_hash)
        evidence_hash_matches = (
            evidence_exists
            and expected_hash is not None
            and chain_hash == expected_hash
        )
        expected_uploader_ref = derive_actor_ref(evidence.uploaded_by)
        uploader_ref_matches = (
            evidence_exists and uploader_ref == expected_uploader_ref
        )

        access_logs = [
            access_log
            for access_log in AccessLogRepository.list_successful_downloads_by_evidence(
                db,
                evidence_id=evidence.evidence_id,
            )
            if self._enum_value(access_log.action) == AuditAction.DOWNLOAD.value
            and self._enum_value(access_log.result) == AuditResult.SUCCESS.value
        ]
        user_ids = {evidence.uploaded_by} | {
            access_log.user_id for access_log in access_logs
        }
        users = {
            user.user_id: user
            for user in UserRepository.get_by_ids(db, user_ids)
        }
        uploader = self._user_identity(users.get(evidence.uploaded_by))

        registration_rows = (
            BlockchainTransactionRepository.get_by_evidence_and_action(
                db,
                evidence_id=evidence.evidence_id,
                action_type=BlockchainAction.REGISTER,
            )
        )
        registration_row = (
            registration_rows[0] if len(registration_rows) == 1 else None
        )
        registration_matches = self._transaction_matches(
            registration_row,
            evidence_id=evidence.evidence_id,
            initiated_by=evidence.uploaded_by,
            action_type=BlockchainAction.REGISTER,
        )
        registration_transaction = self._transaction_metadata(
            registration_row,
            registration_matches,
        )

        linked_tx_ids = {
            access_log.tx_internal_id
            for access_log in access_logs
            if access_log.tx_internal_id is not None
        }
        access_transactions = {
            transaction.tx_internal_id: transaction
            for transaction in BlockchainTransactionRepository.get_by_ids(
                db,
                linked_tx_ids,
            )
        }
        access_history = [
            self._access_item(
                evidence_ref=evidence_ref,
                access_log=access_log,
                user=users.get(access_log.user_id),
                transaction=access_transactions.get(access_log.tx_internal_id),
            )
            for access_log in access_logs
        ]
        access_records_verified = sum(item.verified for item in access_history)
        access_records_total = len(access_history)
        verified = bool(
            evidence_exists
            and evidence_hash_matches
            and uploader_ref_matches
            and uploader is not None
            and registration_matches
            and access_records_verified == access_records_total
        )

        return ChainOfCustodyResponse(
            verified=verified,
            evidence=ChainEvidenceMetadata(
                evidence_id=evidence.evidence_id,
                evidence_number=evidence.evidence_number,
                evidence_ref=evidence_ref,
                evidence_hash=chain_hash,
                original_sha256=original_hash,
                uploaded_at=evidence.uploaded_at,
                blockchain_recorded_at=chain_recorded_at,
                writer=chain_writer,
            ),
            uploader=uploader,
            registration_transaction=registration_transaction,
            access_history=access_history,
            verification=ChainOfCustodyVerification(
                evidence_exists=evidence_exists,
                evidence_hash_matches=evidence_hash_matches,
                uploader_ref_matches=uploader_ref_matches,
                registration_transaction_matches=registration_matches,
                access_records_verified=access_records_verified,
                access_records_total=access_records_total,
            ),
        )

    def _access_item(
        self,
        *,
        evidence_ref: str,
        access_log: Any,
        user: Any,
        transaction: Any,
    ) -> ChainAccessHistoryItem:
        access_session_ref = derive_access_session_ref(access_log.log_id)
        chain_access = self._read_access(access_session_ref)
        session_exists = chain_access is not None
        chain_evidence_ref = None
        chain_officer_ref = None
        blockchain_metadata = None
        if session_exists:
            chain_evidence_ref = self._chain_bytes32(
                chain_access,
                "evidence_ref",
            )
            chain_officer_ref = self._chain_bytes32(
                chain_access,
                "officer_ref",
            )
            blockchain_metadata = ChainAccessMetadata(
                officer_ref=chain_officer_ref,
                recorded_at=self._chain_recorded_at(chain_access),
                writer=self._chain_writer(chain_access),
            )

        evidence_ref_matches = session_exists and chain_evidence_ref == evidence_ref
        officer_ref_matches = (
            session_exists
            and chain_officer_ref == derive_actor_ref(access_log.user_id)
        )
        transaction_matches = self._transaction_matches(
            transaction,
            evidence_id=access_log.evidence_id,
            initiated_by=access_log.user_id,
            action_type=BlockchainAction.ACCESS,
            tx_internal_id=access_log.tx_internal_id,
        )
        verified = bool(
            session_exists
            and evidence_ref_matches
            and officer_ref_matches
            and transaction_matches
            and user is not None
        )
        return ChainAccessHistoryItem(
            access_log_id=access_log.log_id,
            access_session_ref=access_session_ref,
            user=self._user_identity(user),
            action=self._enum_value(access_log.action),
            accessed_at=access_log.accessed_at,
            blockchain=blockchain_metadata,
            transaction=self._transaction_metadata(transaction, transaction_matches),
            verified=verified,
            verification=ChainAccessVerification(
                session_exists=session_exists,
                evidence_ref_matches=evidence_ref_matches,
                officer_ref_matches=officer_ref_matches,
                transaction_matches=transaction_matches,
            ),
        )

    def _read_evidence(self, evidence_ref: str) -> dict[str, Any]:
        try:
            record = self._blockchain.get_evidence(evidence_ref)
        except Exception as exc:
            raise ChainOfCustodyBlockchainReadError(
                "Unable to read evidence registration from Blockchain"
            ) from exc
        if (
            not isinstance(record, dict)
            or not isinstance(record.get("exists"), bool)
        ):
            raise ChainOfCustodyMalformedChainDataError(
                "Blockchain evidence response is malformed"
            )
        return record

    def _read_access(self, access_session_ref: str) -> dict[str, Any] | None:
        try:
            record = self._blockchain.get_access_by_session(access_session_ref)
        except Exception as exc:
            raise ChainOfCustodyBlockchainReadError(
                "Unable to read access session from Blockchain"
            ) from exc
        if record is not None and not isinstance(record, dict):
            raise ChainOfCustodyMalformedChainDataError(
                "Blockchain access response is malformed"
            )
        return record

    @staticmethod
    def _chain_bytes32(record: dict[str, Any], field_name: str) -> str:
        try:
            return normalize_bytes32(record[field_name], field_name)
        except (KeyError, AttributeError, ReferenceValidationError) as exc:
            raise ChainOfCustodyMalformedChainDataError(
                f"Blockchain {field_name} is malformed"
            ) from exc

    @staticmethod
    def _chain_recorded_at(record: dict[str, Any]) -> int:
        recorded_at = record.get("recorded_at")
        if isinstance(recorded_at, bool) or not isinstance(recorded_at, int):
            raise ChainOfCustodyMalformedChainDataError(
                "Blockchain recorded_at is malformed"
            )
        return recorded_at

    @staticmethod
    def _chain_writer(record: dict[str, Any]) -> str:
        writer = record.get("writer")
        if not isinstance(writer, str) or not writer:
            raise ChainOfCustodyMalformedChainDataError(
                "Blockchain writer is malformed"
            )
        return writer

    @staticmethod
    def _original_hash(evidence: Any) -> str | None:
        original_file = evidence.original_file
        return original_file.file_hash if original_file is not None else None

    @staticmethod
    def _normalize_original_hash(file_hash: str | None) -> str | None:
        if not file_hash:
            return None
        try:
            return normalize_bytes32(file_hash, "original_sha256")
        except ReferenceValidationError:
            return None

    def _transaction_matches(
        self,
        transaction: Any,
        *,
        evidence_id: UUID,
        initiated_by: UUID,
        action_type: BlockchainAction,
        tx_internal_id: UUID | None = None,
    ) -> bool:
        if transaction is None:
            return False
        configured_contract = self._blockchain.contract_address
        return bool(
            (tx_internal_id is None or transaction.tx_internal_id == tx_internal_id)
            and transaction.evidence_id == evidence_id
            and transaction.initiated_by == initiated_by
            and self._enum_value(transaction.action_type) == action_type.value
            and transaction.tx_hash
            and transaction.block_number is not None
            and str(transaction.status).lower() == "confirmed"
            and configured_contract
            and transaction.contract_address
            and str(transaction.contract_address).lower()
            == str(configured_contract).lower()
        )

    @staticmethod
    def _transaction_metadata(
        transaction: Any,
        verified: bool,
    ) -> ChainTransactionMetadata | None:
        if transaction is None or not transaction.tx_hash or transaction.block_number is None:
            return None
        return ChainTransactionMetadata(
            tx_hash=transaction.tx_hash,
            block_number=transaction.block_number,
            status=str(transaction.status),
            verified=verified,
        )

    @staticmethod
    def _user_identity(user: Any) -> ChainUserIdentity | None:
        if user is None:
            return None
        return ChainUserIdentity(
            user_id=user.user_id,
            display_name=user.full_name or user.username,
            role=user.role,
        )

    @staticmethod
    def _enum_value(value: Any) -> str:
        return value.value if hasattr(value, "value") else str(value)

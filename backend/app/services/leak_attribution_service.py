from dataclasses import dataclass
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
from app.models.access_logs import AccessLog
from app.models.enums import AuditAction, BlockchainAction
from app.repositories.evidence_items_repository import EvidenceRepository
from app.repositories.user_repository import UserRepository
from app.services.personalized_watermark_service import PersonalizedWatermarkService


class LeakAttributionError(Exception):
    pass


class InvalidAccessSessionRefError(LeakAttributionError):
    pass


class BlockchainAccessSessionNotFoundError(LeakAttributionError):
    pass


class LocalAttributionNotFoundError(LeakAttributionError):
    pass


class AttributionIntegrityError(LeakAttributionError):
    pass


class BlockchainAttributionReadError(LeakAttributionError):
    pass


@dataclass(frozen=True)
class BlockchainAccessAttribution:
    evidence_ref: str
    officer_ref: str
    recorded_at: int
    writer: str


@dataclass(frozen=True)
class EvidenceAttribution:
    evidence_id: UUID
    evidence_number: str


@dataclass(frozen=True)
class UserAttribution:
    user_id: UUID


@dataclass(frozen=True)
class AccessAttribution:
    access_log_id: UUID
    action: str
    accessed_at: Any


@dataclass(frozen=True)
class TransactionAttribution:
    tx_hash: str
    block_number: int
    status: str


@dataclass(frozen=True)
class AttributionVerification:
    evidence_ref_matches: bool
    officer_ref_matches: bool
    access_session_ref_matches: bool
    transaction_link_matches: bool


@dataclass(frozen=True)
class LeakAttributionResult:
    matched: bool
    access_session_ref: str
    blockchain: BlockchainAccessAttribution
    evidence: EvidenceAttribution
    matched_user: UserAttribution
    matched_access: AccessAttribution
    transaction: TransactionAttribution
    verification: AttributionVerification


class LeakAttributionService:
    """Resolve the download session matching a personalized evidence copy."""

    def __init__(
        self,
        blockchain_service: BlockchainIntegrationService | None = None,
        watermark_service: PersonalizedWatermarkService | None = None,
    ) -> None:
        self._blockchain = blockchain_service or BlockchainIntegrationService()
        self._watermark = watermark_service or PersonalizedWatermarkService()

    def resolve_by_access_session_ref(
        self,
        db: Session,
        access_session_ref: str,
    ) -> LeakAttributionResult:
        canonical_ref = self._normalize_access_session_ref(access_session_ref)
        try:
            chain_record = self._blockchain.get_access_by_session(canonical_ref)
        except Exception as exc:
            raise BlockchainAttributionReadError(
                "Unable to read access session from Blockchain"
            ) from exc
        if chain_record is None:
            raise BlockchainAccessSessionNotFoundError(
                "Access session was not found on Blockchain"
            )

        evidence_ref = self._normalize_chain_ref(
            chain_record.get("evidence_ref"),
            "evidence_ref",
        )
        officer_ref = self._normalize_chain_ref(
            chain_record.get("officer_ref"),
            "officer_ref",
        )
        matches = self._find_access_log_matches(db, canonical_ref)
        if not matches:
            raise LocalAttributionNotFoundError(
                "No local access log matches the Blockchain session"
            )
        if len(matches) != 1:
            raise AttributionIntegrityError(
                "Multiple local access logs match the Blockchain session"
            )
        access_log = matches[0]

        if derive_access_session_ref(access_log.log_id) != canonical_ref:
            raise AttributionIntegrityError("Access log session reference mismatch")
        if derive_actor_ref(access_log.user_id) != officer_ref:
            raise AttributionIntegrityError("Access log officer reference mismatch")
        if derive_evidence_ref(access_log.evidence_id) != evidence_ref:
            raise AttributionIntegrityError("Access log evidence reference mismatch")
        if self._enum_value(access_log.action) != AuditAction.DOWNLOAD.value:
            raise AttributionIntegrityError("Access log action is not DOWNLOAD")

        evidence = EvidenceRepository.get_by_id(db, access_log.evidence_id)
        if evidence is None:
            raise LocalAttributionNotFoundError("Matching evidence was not found")
        user = UserRepository.get_by_id(db, access_log.user_id)
        if user is None:
            raise LocalAttributionNotFoundError("Matching user was not found")
        if access_log.tx_internal_id is None:
            raise AttributionIntegrityError(
                "Access log is not linked to Blockchain transaction metadata"
            )
        transaction = BlockchainTransactionRepository.get_by_id(
            db,
            access_log.tx_internal_id,
        )
        if transaction is None:
            raise AttributionIntegrityError(
                "Blockchain transaction metadata was not found"
            )
        self._validate_transaction(
            transaction,
            access_log=access_log,
        )

        return LeakAttributionResult(
            matched=True,
            access_session_ref=canonical_ref,
            blockchain=BlockchainAccessAttribution(
                evidence_ref=evidence_ref,
                officer_ref=officer_ref,
                recorded_at=chain_record["recorded_at"],
                writer=chain_record["writer"],
            ),
            evidence=EvidenceAttribution(
                evidence_id=evidence.evidence_id,
                evidence_number=evidence.evidence_number,
            ),
            matched_user=UserAttribution(user_id=user.user_id),
            matched_access=AccessAttribution(
                access_log_id=access_log.log_id,
                action=self._enum_value(access_log.action),
                accessed_at=access_log.accessed_at,
            ),
            transaction=TransactionAttribution(
                tx_hash=transaction.tx_hash,
                block_number=transaction.block_number,
                status=transaction.status,
            ),
            verification=AttributionVerification(
                evidence_ref_matches=True,
                officer_ref_matches=True,
                access_session_ref_matches=True,
                transaction_link_matches=True,
            ),
        )

    def analyze_personalized_copy(
        self,
        db: Session,
        *,
        suspected_path: str,
        original_path: str,
    ) -> LeakAttributionResult:
        access_session_ref = self._watermark.extract_access_session_ref(
            personalized_path=suspected_path,
            original_path=original_path,
        )
        return self.resolve_by_access_session_ref(db, access_session_ref)

    @staticmethod
    def _normalize_access_session_ref(value: str) -> str:
        if (
            not isinstance(value, str)
            or len(value) != 66
            or not value.startswith("0x")
        ):
            raise InvalidAccessSessionRefError(
                "access_session_ref must be 0x followed by 64 hexadecimal characters"
            )
        try:
            return normalize_bytes32(value, "access_session_ref")
        except ReferenceValidationError as exc:
            raise InvalidAccessSessionRefError(
                "access_session_ref must be 0x followed by 64 hexadecimal characters"
            ) from exc

    @staticmethod
    def _normalize_chain_ref(value: Any, field_name: str) -> str:
        try:
            return normalize_bytes32(value, field_name)
        except (AttributeError, ReferenceValidationError) as exc:
            raise AttributionIntegrityError(
                f"Blockchain {field_name} is malformed"
            ) from exc

    @staticmethod
    def _find_access_log_matches(
        db: Session,
        access_session_ref: str,
    ) -> list[AccessLog]:
        # schema ปัจจุบันยังไม่เก็บ session ref จึงต้อง derive จาก AccessLog ที่มีอยู่
        return [
            access_log
            for access_log in db.query(AccessLog).all()
            if derive_access_session_ref(access_log.log_id) == access_session_ref
        ]

    def _validate_transaction(self, transaction: Any, *, access_log: AccessLog) -> None:
        configured_contract = self._blockchain.contract_address
        checks = (
            transaction.tx_internal_id == access_log.tx_internal_id,
            transaction.evidence_id == access_log.evidence_id,
            transaction.initiated_by == access_log.user_id,
            self._enum_value(transaction.action_type) == BlockchainAction.ACCESS.value,
            bool(transaction.tx_hash),
            transaction.block_number is not None,
            str(transaction.status).lower() == "confirmed",
            bool(configured_contract),
            bool(transaction.contract_address),
            str(transaction.contract_address).lower()
            == str(configured_contract).lower(),
        )
        if not all(checks):
            raise AttributionIntegrityError(
                "Blockchain transaction metadata is inconsistent"
            )

    @staticmethod
    def _enum_value(value: Any) -> str:
        return value.value if hasattr(value, "value") else str(value)

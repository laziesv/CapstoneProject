from dataclasses import dataclass
from typing import Any
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
from app.integrations.blockchain.transaction_repository import (
    BlockchainTransactionRepository,
)
from app.models.access_logs import AccessLog
from app.models.enums import AuditAction, BlockchainAction
from app.repositories.evidence_items_repository import EvidenceRepository
from app.repositories.user_repository import UserRepository
from app.schemas.integrity import IntegrityMismatch
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


class AttributionEvidenceMismatchError(AttributionIntegrityError):
    pass


class BlockchainAttributionReadError(LeakAttributionError):
    pass


@dataclass(frozen=True)
class BlockchainAccessAttribution:
    evidence_ref: str
    officer_ref: str
    action: str
    occurred_at: int
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
    action_matches: bool
    occurred_at_matches: bool
    transaction_link_matches: bool


@dataclass(frozen=True)
class LeakAttributionResult:
    matched: bool
    access_session_ref: str
    blockchain: BlockchainAccessAttribution
    evidence: EvidenceAttribution
    matched_user: UserAttribution | None
    database_user: UserAttribution | None
    matched_access: AccessAttribution | None
    transaction: TransactionAttribution | None
    verification: AttributionVerification
    database_integrity_state: str
    mismatches: tuple[IntegrityMismatch, ...]


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
        expected_evidence_id: UUID | None = None,
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
        chain_action = self._normalize_chain_action(chain_record.get("action"))
        occurred_at = self._normalize_chain_timestamp(
            chain_record.get("occurred_at"),
            "occurred_at",
        )
        if chain_action != AuditAction.DOWNLOAD.value:
            raise AttributionIntegrityError(
                "Blockchain access session is not DOWNLOAD"
            )
        if (
            expected_evidence_id is not None
            and derive_evidence_ref(expected_evidence_id) != evidence_ref
        ):
            # การตรวจสอบลายน้ำ: หยุดก่อนอ่านข้อมูลผู้ใช้/AccessLog เมื่อ
            # session บนเชนอ้างถึงหลักฐานคนละชิ้นกับ Static Watermark
            raise AttributionEvidenceMismatchError(
                "Blockchain session belongs to different evidence"
            )

        matches = self._find_access_log_matches(db, canonical_ref)
        if expected_evidence_id is None:
            if not matches:
                raise LocalAttributionNotFoundError(
                    "No local access log matches the Blockchain session"
                )
            if len(matches) != 1:
                raise AttributionIntegrityError(
                    "Multiple local access logs match the Blockchain session"
                )
        # การตรวจสอบเชิงนิติพิสูจน์: session บน Blockchain ยังคงเป็นหลักฐาน
        # ทางประวัติศาสตร์ แม้ AccessLog ที่แก้ไขได้ใน DB จะหายหรือไม่เป็นเอกฐาน
        access_log = matches[0] if len(matches) == 1 else None
        evidence_id = (
            expected_evidence_id
            if expected_evidence_id is not None
            else access_log.evidence_id
        )
        if derive_evidence_ref(evidence_id) != evidence_ref:
            raise AttributionEvidenceMismatchError(
                "Blockchain session belongs to different evidence"
            )
        evidence = EvidenceRepository.get_by_id(db, evidence_id)
        if evidence is None:
            raise LocalAttributionNotFoundError("Matching evidence was not found")
        database_user = (
            UserRepository.get_by_id(db, access_log.user_id)
            if access_log is not None
            else None
        )
        chain_users = [
            user
            for user in UserRepository.list(db)
            if derive_actor_ref(user.user_id) == officer_ref
        ]
        chain_user = chain_users[0] if len(chain_users) == 1 else None
        transaction = (
            BlockchainTransactionRepository.get_by_id(
                db,
                access_log.tx_internal_id,
            )
            if access_log is not None and access_log.tx_internal_id is not None
            else None
        )

        verification = AttributionVerification(
            evidence_ref_matches=(
                access_log is not None
                and derive_evidence_ref(access_log.evidence_id) == evidence_ref
            ),
            officer_ref_matches=(
                access_log is not None
                and derive_actor_ref(access_log.user_id) == officer_ref
            ),
            access_session_ref_matches=(
                access_log is not None
                and derive_access_session_ref(access_log.log_id) == canonical_ref
            ),
            action_matches=(
                access_log is not None
                and self._enum_value(access_log.action) == chain_action
            ),
            occurred_at_matches=(
                access_log is not None
                and self._datetime_to_unix(access_log.accessed_at) == occurred_at
            ),
            transaction_link_matches=self._transaction_matches(
                transaction,
                access_log=access_log,
            ),
        )
        mismatches = self._database_mismatches(
            canonical_ref=canonical_ref,
            evidence_ref=evidence_ref,
            officer_ref=officer_ref,
            chain_action=chain_action,
            occurred_at=occurred_at,
            access_log=access_log,
            transaction=transaction,
            verification=verification,
        )
        database_verified = bool(
            all(
                (
                    verification.evidence_ref_matches,
                    verification.officer_ref_matches,
                    verification.access_session_ref_matches,
                    verification.action_matches,
                    verification.occurred_at_matches,
                    verification.transaction_link_matches,
                )
            )
            and chain_user is not None
            and database_user is not None
        )

        return LeakAttributionResult(
            matched=True,
            access_session_ref=canonical_ref,
            blockchain=BlockchainAccessAttribution(
                evidence_ref=evidence_ref,
                officer_ref=officer_ref,
                action=chain_action,
                occurred_at=occurred_at,
                recorded_at=self._normalize_chain_timestamp(
                    chain_record.get("recorded_at"),
                    "recorded_at",
                ),
                writer=chain_record["writer"],
            ),
            evidence=EvidenceAttribution(
                evidence_id=evidence.evidence_id,
                evidence_number=evidence.evidence_number,
            ),
            matched_user=(
                UserAttribution(user_id=chain_user.user_id)
                if chain_user is not None
                else None
            ),
            database_user=(
                UserAttribution(user_id=database_user.user_id)
                if database_user is not None
                else None
            ),
            matched_access=(
                AccessAttribution(
                    access_log_id=access_log.log_id,
                    action=self._enum_value(access_log.action),
                    accessed_at=access_log.accessed_at,
                )
                if access_log is not None
                else None
            ),
            transaction=(
                TransactionAttribution(
                    tx_hash=transaction.tx_hash,
                    block_number=transaction.block_number,
                    status=transaction.status,
                )
                if transaction is not None
                and transaction.tx_hash
                and transaction.block_number is not None
                else None
            ),
            verification=verification,
            database_integrity_state=(
                "VERIFIED" if database_verified else "INTEGRITY_MISMATCH"
            ),
            mismatches=tuple(mismatches),
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
    def _normalize_chain_action(value: Any) -> str:
        try:
            if isinstance(value, AccessAction):
                return value.name
            if isinstance(value, str):
                return AccessAction[value.upper()].name
            return AccessAction(value).name
        except (KeyError, TypeError, ValueError) as exc:
            raise AttributionIntegrityError(
                "Blockchain action is malformed"
            ) from exc

    @staticmethod
    def _normalize_chain_timestamp(value: Any, field_name: str) -> int:
        if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            raise AttributionIntegrityError(
                f"Blockchain {field_name} is malformed"
            )
        return value

    @staticmethod
    def _datetime_to_unix(value: Any) -> int | None:
        if value is None or not hasattr(value, "timestamp"):
            return None
        return int(value.timestamp())

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

    def _transaction_matches(
        self,
        transaction: Any,
        *,
        access_log: AccessLog | None,
    ) -> bool:
        if transaction is None or access_log is None:
            return False
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
        return all(checks)

    def _database_mismatches(
        self,
        *,
        canonical_ref: str,
        evidence_ref: str,
        officer_ref: str,
        chain_action: str,
        occurred_at: int,
        access_log: AccessLog | None,
        transaction: Any,
        verification: AttributionVerification,
    ) -> list[IntegrityMismatch]:
        if access_log is None:
            return [
                IntegrityMismatch(
                    field="access_session_ref",
                    database_value=None,
                    blockchain_value=canonical_ref,
                ),
                IntegrityMismatch(
                    field="evidence_ref",
                    database_value=None,
                    blockchain_value=evidence_ref,
                ),
                IntegrityMismatch(
                    field="officer_ref",
                    database_value=None,
                    blockchain_value=officer_ref,
                ),
                IntegrityMismatch(
                    field="action",
                    database_value=None,
                    blockchain_value=chain_action,
                ),
                IntegrityMismatch(
                    field="accessed_at",
                    database_value=None,
                    blockchain_value=occurred_at,
                ),
                IntegrityMismatch(
                    field="transaction_link",
                    database_value=None,
                    blockchain_value="confirmed V3 access transaction",
                ),
            ]
        comparisons = (
            (
                "access_session_ref",
                derive_access_session_ref(access_log.log_id),
                canonical_ref,
                verification.access_session_ref_matches,
            ),
            (
                "evidence_ref",
                derive_evidence_ref(access_log.evidence_id),
                evidence_ref,
                verification.evidence_ref_matches,
            ),
            (
                "officer_ref",
                derive_actor_ref(access_log.user_id),
                officer_ref,
                verification.officer_ref_matches,
            ),
            (
                "action",
                self._enum_value(access_log.action),
                chain_action,
                verification.action_matches,
            ),
            (
                "accessed_at",
                access_log.accessed_at.isoformat()
                if access_log.accessed_at is not None
                else None,
                occurred_at,
                verification.occurred_at_matches,
            ),
            (
                "transaction_link",
                transaction.tx_hash if transaction is not None else None,
                "confirmed V3 access transaction",
                verification.transaction_link_matches,
            ),
        )
        return [
            IntegrityMismatch(
                field=field,
                database_value=database_value,
                blockchain_value=blockchain_value,
            )
            for field, database_value, blockchain_value, matches in comparisons
            if not matches
        ]

    @staticmethod
    def _enum_value(value: Any) -> str:
        return value.value if hasattr(value, "value") else str(value)

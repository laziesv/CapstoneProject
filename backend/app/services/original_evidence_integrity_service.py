from dataclasses import dataclass
from typing import Any
from uuid import UUID

from blockchain_client import derive_evidence_ref
from blockchain_client.exceptions import ReferenceValidationError
from blockchain_client.references import normalize_bytes32

from app.integrations.blockchain import BlockchainIntegrationService
from app.schemas.integrity import IntegrityMismatch
from app.utils.hash import calculate_sha256


class OriginalEvidenceIntegrityError(Exception):
    pass


class OriginalEvidenceBlockchainReadError(OriginalEvidenceIntegrityError):
    pass


class OriginalEvidenceFileReadError(OriginalEvidenceIntegrityError):
    pass


@dataclass(frozen=True)
class OriginalEvidenceIntegrityResult:
    current_file_hash: str
    database_hash: str | None
    blockchain_hash: str | None
    current_matches_blockchain: bool
    database_matches_blockchain: bool
    current_matches_database: bool
    status: str
    mismatches: tuple[IntegrityMismatch, ...]

    @property
    def verified(self) -> bool:
        return self.status == "VERIFIED"

    @property
    def original_file_integrity_status(self) -> str:
        if self.blockchain_hash is None:
            return "MISSING_ON_CHAIN"
        return (
            "VERIFIED"
            if self.current_matches_blockchain
            else "INTEGRITY_MISMATCH"
        )

    @property
    def database_hash_integrity_status(self) -> str:
        if self.blockchain_hash is None:
            return "MISSING_ON_CHAIN"
        return (
            "VERIFIED"
            if self.database_matches_blockchain
            else "INTEGRITY_MISMATCH"
        )


class OriginalEvidenceIntegrityService:
    """Compare live original bytes and mutable DB metadata with Blockchain."""

    def __init__(
        self,
        blockchain_service: BlockchainIntegrationService | None = None,
    ) -> None:
        self._blockchain = blockchain_service or BlockchainIntegrationService()

    def verify(
        self,
        *,
        evidence_id: UUID,
        original_file_path: str,
        database_hash: str | None,
    ) -> OriginalEvidenceIntegrityResult:
        # การตรวจสอบความถูกต้องของหลักฐาน: อ่านไฟล์เป็นช่วงผ่าน utility เดิม
        # เพื่อไม่โหลดไฟล์หลักฐานขนาดใหญ่ทั้งหมดไว้ในหน่วยความจำ
        try:
            current_hash = calculate_sha256(original_file_path).lower()
        except OSError as exc:
            raise OriginalEvidenceFileReadError(
                "Unable to hash current original evidence file"
            ) from exc

        evidence_ref = derive_evidence_ref(evidence_id)
        try:
            chain_record = self._blockchain.get_evidence(evidence_ref)
        except Exception as exc:
            raise OriginalEvidenceBlockchainReadError(
                "Unable to read original evidence hash from Blockchain"
            ) from exc

        if not isinstance(chain_record, dict):
            raise OriginalEvidenceBlockchainReadError(
                "Blockchain evidence record is malformed"
            )
        evidence_exists = chain_record.get("exists") is True
        blockchain_hash = (
            self._normalize_hash(chain_record.get("evidence_hash"))
            if evidence_exists
            else None
        )
        if evidence_exists and blockchain_hash is None:
            raise OriginalEvidenceBlockchainReadError(
                "Blockchain evidence hash is malformed"
            )
        normalized_database_hash = self._normalize_hash(database_hash)
        current_matches_blockchain = (
            blockchain_hash is not None and current_hash == blockchain_hash
        )
        database_matches_blockchain = (
            blockchain_hash is not None
            and normalized_database_hash == blockchain_hash
        )
        current_matches_database = (
            normalized_database_hash is not None
            and current_hash == normalized_database_hash
        )

        mismatches = []
        if not current_matches_blockchain:
            mismatches.append(
                IntegrityMismatch(
                    field="original_file_bytes_hash",
                    database_value=current_hash,
                    blockchain_value=blockchain_hash,
                )
            )
        if not database_matches_blockchain:
            mismatches.append(
                IntegrityMismatch(
                    field="database_original_hash",
                    database_value=normalized_database_hash,
                    blockchain_value=blockchain_hash,
                )
            )

        return OriginalEvidenceIntegrityResult(
            current_file_hash=current_hash,
            database_hash=normalized_database_hash,
            blockchain_hash=blockchain_hash,
            current_matches_blockchain=current_matches_blockchain,
            database_matches_blockchain=database_matches_blockchain,
            current_matches_database=current_matches_database,
            status=self._status(
                blockchain_hash=blockchain_hash,
                current_matches_blockchain=current_matches_blockchain,
                database_matches_blockchain=database_matches_blockchain,
            ),
            mismatches=tuple(mismatches),
        )

    @staticmethod
    def _normalize_hash(value: Any) -> str | None:
        if not value:
            return None
        try:
            return normalize_bytes32(value, "evidence_hash")[2:].lower()
        except (AttributeError, ReferenceValidationError):
            return None

    @staticmethod
    def _status(
        *,
        blockchain_hash: str | None,
        current_matches_blockchain: bool,
        database_matches_blockchain: bool,
    ) -> str:
        if blockchain_hash is None:
            return "MISSING_ON_CHAIN"
        if current_matches_blockchain and database_matches_blockchain:
            return "VERIFIED"
        if not current_matches_blockchain and not database_matches_blockchain:
            return "ORIGINAL_AND_DATABASE_HASH_MISMATCH"
        if not current_matches_blockchain:
            return "ORIGINAL_FILE_MISMATCH"
        return "DATABASE_HASH_MISMATCH"

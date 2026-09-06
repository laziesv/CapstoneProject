from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.integrity import IntegrityMismatch


IntegrityState = Literal[
    "VERIFIED",
    "MISSING_ON_CHAIN",
    "ORPHANED_ON_CHAIN",
    "INTEGRITY_MISMATCH",
    "LEGACY_PARTIAL_VERIFICATION",
    "BLOCKCHAIN_UNAVAILABLE",
]


class ChainUserIdentity(BaseModel):
    user_id: UUID
    display_name: str
    role: str
    badge_number: str | None = None
    username: str
    email: str
    full_name: str | None = None
    rank: str | None = None


class ChainTransactionMetadata(BaseModel):
    tx_hash: str
    block_number: int
    status: str
    verified: bool


class ChainEvidenceMetadata(BaseModel):
    evidence_id: UUID
    evidence_number: str
    evidence_ref: str
    evidence_hash: str | None
    original_sha256: str | None
    uploaded_at: datetime | None
    blockchain_recorded_at: int | None
    writer: str | None


class ChainAccessMetadata(BaseModel):
    officer_ref: str
    action: str
    occurred_at: int
    recorded_at: int
    writer: str


class ChainAccessVerification(BaseModel):
    session_exists: bool
    evidence_ref_matches: bool
    officer_ref_matches: bool
    action_matches: bool
    occurred_at_matches: bool
    transaction_matches: bool


class ChainAccessHistoryItem(BaseModel):
    access_log_id: UUID
    access_session_ref: str
    user: ChainUserIdentity | None
    action: str
    accessed_at: datetime
    blockchain: ChainAccessMetadata | None
    transaction: ChainTransactionMetadata | None
    verified: bool
    integrity_state: IntegrityState
    verification: ChainAccessVerification
    mismatches: list[IntegrityMismatch] = Field(default_factory=list)


class ChainOfCustodyVerification(BaseModel):
    evidence_exists: bool
    evidence_hash_matches: bool
    uploader_ref_matches: bool
    registration_transaction_matches: bool
    access_records_verified: int
    access_records_total: int


class ChainOfCustodyResponse(BaseModel):
    verified: bool
    integrity_state: IntegrityState
    evidence: ChainEvidenceMetadata
    uploader: ChainUserIdentity | None
    registration_transaction: ChainTransactionMetadata | None
    access_history: list[ChainAccessHistoryItem]
    verification: ChainOfCustodyVerification

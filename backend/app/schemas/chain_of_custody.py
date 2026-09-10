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
    tx_hash: str | None
    block_number: int | None
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
    registration_tx_hash: str | None = None
    registration_block_number: int | None = None
    registration_transaction_index: int | None = None
    registration_log_index: int | None = None


class ChainAccessMetadata(BaseModel):
    evidence_ref: str
    officer_ref: str
    access_session_ref: str
    action: str
    occurred_at: int
    recorded_at: int
    writer: str
    transaction_hash: str
    block_number: int
    transaction_index: int
    log_index: int


class ChainAccessDatabaseMetadata(BaseModel):
    access_log_id: UUID
    evidence_id: UUID | None
    user_id: UUID
    action: str
    accessed_at: datetime
    tx_internal_id: UUID | None


class ChainIntegrityMismatch(IntegrityMismatch):
    explanation: str


class ChainAccessVerification(BaseModel):
    session_exists: bool
    access_log_exists: bool
    transaction_exists: bool
    evidence_ref_matches: bool
    officer_ref_matches: bool
    action_matches: bool
    occurred_at_matches: bool
    transaction_matches: bool


class ChainAccessHistoryItem(BaseModel):
    access_log_id: UUID | None
    access_session_ref: str
    user: ChainUserIdentity | None
    database_user: ChainUserIdentity | None
    action: str
    accessed_at: datetime | None
    database: ChainAccessDatabaseMetadata | None
    blockchain: ChainAccessMetadata | None
    transaction: ChainTransactionMetadata | None
    verified: bool
    integrity_state: IntegrityState
    verification: ChainAccessVerification
    mismatches: list[ChainIntegrityMismatch] = Field(default_factory=list)


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
    # หลักฐานที่ถูกเข้าถึงบ่อยมีประวัติได้หลายพันรายการ — access_history เป็นเพียงหน้าเดียว
    # ส่วน verification/verified ยังคำนวณจากประวัติทั้งหมดเสมอ
    access_history_total: int = 0
    access_history_limit: int | None = None
    access_history_offset: int = 0
    verification: ChainOfCustodyVerification

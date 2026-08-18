from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ChainUserIdentity(BaseModel):
    user_id: UUID
    display_name: str
    role: str


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
    recorded_at: int
    writer: str


class ChainAccessVerification(BaseModel):
    session_exists: bool
    evidence_ref_matches: bool
    officer_ref_matches: bool
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
    verification: ChainAccessVerification


class ChainOfCustodyVerification(BaseModel):
    evidence_exists: bool
    evidence_hash_matches: bool
    uploader_ref_matches: bool
    registration_transaction_matches: bool
    access_records_verified: int
    access_records_total: int


class ChainOfCustodyResponse(BaseModel):
    verified: bool
    evidence: ChainEvidenceMetadata
    uploader: ChainUserIdentity | None
    registration_transaction: ChainTransactionMetadata | None
    access_history: list[ChainAccessHistoryItem]
    verification: ChainOfCustodyVerification

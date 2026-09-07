from uuid import UUID

from pydantic import BaseModel, Field


class BlockchainExplorerUser(BaseModel):
    user_id: UUID
    badge_number: str | None = None
    username: str | None = None
    email: str | None = None
    full_name: str | None = None
    rank: str | None = None


class BlockchainOverviewResponse(BaseModel):
    network: str
    consensus: str
    enabled: bool
    connected: bool
    chain_id: int | None
    latest_block: int | None
    contract_address: str | None
    contract_deployed: bool
    deployment_block: int


class BlockchainTransactionSummary(BaseModel):
    tx_hash: str
    from_address: str | None = None
    to_address: str | None = None
    transaction_index: int
    is_registry_transaction: bool


class BlockchainBlockResponse(BaseModel):
    block_number: int
    block_hash: str
    timestamp: int
    parent_hash: str
    transaction_count: int
    transactions: list[BlockchainTransactionSummary] = Field(default_factory=list)


class BlockchainRegistryEvent(BaseModel):
    event_type: str
    evidence_ref: str
    evidence_hash: str | None = None
    uploader_ref: str | None = None
    officer_ref: str | None = None
    access_session_ref: str | None = None
    action: str | None = None
    occurred_at: int | None = None
    recorded_at: int
    writer: str
    tx_hash: str
    block_number: int
    transaction_index: int
    log_index: int


class BlockchainTransactionResponse(BaseModel):
    tx_hash: str
    status: str
    block_number: int
    from_address: str | None = None
    to_address: str | None = None
    transaction_index: int
    gas_used: int
    contract_address: str | None = None
    is_registry_transaction: bool
    registry_events: list[BlockchainRegistryEvent] = Field(default_factory=list)


class BlockchainEvidenceRegistration(BaseModel):
    evidence_hash: str
    uploader_ref: str
    recorded_at: int
    writer: str
    tx_hash: str | None = None
    block_number: int | None = None
    transaction_index: int | None = None
    log_index: int | None = None


class BlockchainAccessEvent(BaseModel):
    evidence_ref: str
    officer_ref: str
    access_session_ref: str
    action: str
    occurred_at: int
    recorded_at: int
    writer: str
    tx_hash: str
    block_number: int
    transaction_index: int | None = None
    log_index: int | None = None
    actor: BlockchainExplorerUser | None = None


class BlockchainEvidenceResponse(BaseModel):
    evidence_id: UUID | None = None
    evidence_number: str | None = None
    evidence_ref: str
    registration: BlockchainEvidenceRegistration
    access_history: list[BlockchainAccessEvent] = Field(default_factory=list)
    scan_from_block: int
    scan_to_block: int


class BlockchainAccessSessionResponse(BaseModel):
    access_session_ref: str
    evidence_ref: str
    officer_ref: str
    action: str
    occurred_at: int
    recorded_at: int
    writer: str
    tx_hash: str | None = None
    block_number: int | None = None
    transaction_index: int | None = None
    log_index: int | None = None
    evidence_id: UUID | None = None
    evidence_number: str | None = None
    actor: BlockchainExplorerUser | None = None
    database_access_log_found: bool = False
    database_access_log_id: UUID | None = None

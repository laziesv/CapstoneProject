export type BlockchainSearchType =
  | "block"
  | "transaction"
  | "evidence"
  | "evidence-ref"
  | "access-session";

export interface BlockchainOverview {
  network: string;
  consensus: string;
  enabled: boolean;
  connected: boolean;
  chain_id: number | null;
  latest_block: number | null;
  contract_address: string | null;
  contract_deployed: boolean;
  deployment_block: number;
}

export interface BlockchainTransactionSummary {
  tx_hash: string;
  from_address: string | null;
  to_address: string | null;
  transaction_index: number | null;
  is_registry_transaction: boolean;
}

export interface BlockchainBlockResult {
  block_number: number;
  block_hash: string;
  timestamp: number;
  parent_hash: string;
  transaction_count: number;
  transactions: BlockchainTransactionSummary[];
}

export interface BlockchainRegistryEvent {
  event_type: string;
  evidence_ref: string;
  evidence_hash: string | null;
  uploader_ref: string | null;
  officer_ref: string | null;
  access_session_ref: string | null;
  action: string | null;
  occurred_at: number | null;
  recorded_at: number;
  writer: string;
  tx_hash: string;
  block_number: number;
  transaction_index: number | null;
  log_index: number | null;
  evidence_id: string | null;
  evidence_number: string | null;
  actor: BlockchainExplorerUser | null;
  uploader: BlockchainExplorerUser | null;
  related_evidence: BlockchainRelatedEvidence | null;
}

export interface BlockchainTransactionResult {
  tx_hash: string;
  status: string;
  block_number: number;
  from_address: string | null;
  to_address: string | null;
  transaction_index: number | null;
  gas_used: number;
  contract_address: string | null;
  is_registry_transaction: boolean;
  registry_events: BlockchainRegistryEvent[];
}

export interface BlockchainExplorerUser {
  user_id: string;
  badge_number: string | null;
  username: string | null;
  email: string | null;
  full_name: string | null;
  rank: string | null;
}

export interface BlockchainRelatedEvidence {
  evidence_hash: string;
  uploader_ref: string;
  recorded_at: number;
  writer: string;
  uploader: BlockchainExplorerUser | null;
}

export interface BlockchainAccessEvent {
  evidence_ref: string;
  officer_ref: string;
  access_session_ref: string;
  action: string;
  occurred_at: number;
  recorded_at: number;
  writer: string;
  tx_hash: string;
  block_number: number;
  transaction_index: number | null;
  log_index: number | null;
  actor: BlockchainExplorerUser | null;
}

export interface BlockchainEvidenceResult {
  evidence_id: string | null;
  evidence_number: string | null;
  evidence_ref: string;
  registration: {
    evidence_hash: string;
    uploader_ref: string;
    recorded_at: number;
    writer: string;
    tx_hash: string | null;
    block_number: number | null;
    transaction_index: number | null;
    log_index: number | null;
    uploader: BlockchainExplorerUser | null;
  };
  access_history: BlockchainAccessEvent[];
  scan_from_block: number;
  scan_to_block: number;
}

export interface BlockchainAccessSessionResult {
  access_session_ref: string;
  evidence_ref: string;
  officer_ref: string;
  action: string;
  occurred_at: number;
  recorded_at: number;
  writer: string;
  tx_hash: string | null;
  block_number: number | null;
  transaction_index: number | null;
  log_index: number | null;
  evidence_id: string | null;
  evidence_number: string | null;
  actor: BlockchainExplorerUser | null;
  related_evidence: BlockchainRelatedEvidence | null;
  database_access_log_found: boolean;
  database_access_log_id: string | null;
}

export type BlockchainSearchResult =
  | { type: "block"; data: BlockchainBlockResult }
  | { type: "transaction"; data: BlockchainTransactionResult }
  | { type: "evidence" | "evidence-ref"; data: BlockchainEvidenceResult }
  | { type: "access-session"; data: BlockchainAccessSessionResult };

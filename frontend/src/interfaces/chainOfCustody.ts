export interface ChainUserIdentity {
  user_id: string;
  display_name: string;
  role: string;
  badge_number: string | null;
  username: string;
  email: string;
  full_name: string | null;
  rank: string | null;
}

export interface ChainTransactionMetadata {
  tx_hash: string | null;
  block_number: number | null;
  status: string;
  verified: boolean;
}

export interface ChainEvidenceMetadata {
  evidence_id: string;
  evidence_number: string;
  evidence_ref: string;
  evidence_hash: string | null;
  original_sha256: string | null;
  uploaded_at: string | null;
  blockchain_recorded_at: number | null;
  writer: string | null;
  registration_tx_hash: string | null;
  registration_block_number: number | null;
  registration_transaction_index: number | null;
  registration_log_index: number | null;
}

export interface ChainAccessMetadata {
  evidence_ref: string;
  officer_ref: string;
  access_session_ref: string;
  action: string;
  occurred_at: number;
  recorded_at: number;
  writer: string;
  transaction_hash: string;
  block_number: number;
  transaction_index: number;
  log_index: number;
}

export interface ChainAccessDatabaseMetadata {
  access_log_id: string;
  evidence_id: string | null;
  user_id: string;
  action: string;
  accessed_at: string;
  tx_internal_id: string | null;
}

export interface ChainAccessVerification {
  session_exists: boolean;
  access_log_exists: boolean;
  transaction_exists: boolean;
  evidence_ref_matches: boolean;
  officer_ref_matches: boolean;
  action_matches: boolean;
  occurred_at_matches: boolean;
  transaction_matches: boolean;
}

export interface IntegrityMismatch {
  field: string;
  database_value: unknown;
  blockchain_value: unknown;
  explanation?: string;
}

export type ChainIntegrityState =
  | "VERIFIED"
  | "MISSING_ON_CHAIN"
  | "ORPHANED_ON_CHAIN"
  | "INTEGRITY_MISMATCH"
  | "LEGACY_PARTIAL_VERIFICATION"
  | "BLOCKCHAIN_UNAVAILABLE";

export interface ChainAccessHistoryItem {
  access_log_id: string | null;
  access_session_ref: string;
  user: ChainUserIdentity | null;
  database_user: ChainUserIdentity | null;
  action: string;
  accessed_at: string | null;
  database: ChainAccessDatabaseMetadata | null;
  blockchain: ChainAccessMetadata | null;
  transaction: ChainTransactionMetadata | null;
  verified: boolean;
  integrity_state: ChainIntegrityState;
  verification: ChainAccessVerification;
  mismatches: IntegrityMismatch[];
}

export interface ChainOfCustodyVerification {
  evidence_exists: boolean;
  evidence_hash_matches: boolean;
  uploader_ref_matches: boolean;
  registration_transaction_matches: boolean;
  access_records_verified: number;
  access_records_total: number;
}

export interface ChainOfCustodyResponse {
  verified: boolean;
  integrity_state: ChainIntegrityState;
  evidence: ChainEvidenceMetadata;
  uploader: ChainUserIdentity | null;
  registration_transaction: ChainTransactionMetadata | null;
  access_history: ChainAccessHistoryItem[];
  /** จำนวนรายการทั้งหมด — access_history เป็นเพียงหน้าเดียว ส่วน verification คิดจากทั้งหมด */
  access_history_total: number;
  access_history_limit: number | null;
  access_history_offset: number;
  verification: ChainOfCustodyVerification;
}

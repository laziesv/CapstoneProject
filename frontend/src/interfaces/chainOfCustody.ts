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
  tx_hash: string;
  block_number: number;
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
}

export interface ChainAccessMetadata {
  officer_ref: string;
  action: string;
  occurred_at: number;
  recorded_at: number;
  writer: string;
}

export interface ChainAccessVerification {
  session_exists: boolean;
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
}

export type ChainIntegrityState =
  | "VERIFIED"
  | "MISSING_ON_CHAIN"
  | "ORPHANED_ON_CHAIN"
  | "INTEGRITY_MISMATCH"
  | "LEGACY_PARTIAL_VERIFICATION"
  | "BLOCKCHAIN_UNAVAILABLE";

export interface ChainAccessHistoryItem {
  access_log_id: string;
  access_session_ref: string;
  user: ChainUserIdentity | null;
  action: string;
  accessed_at: string;
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
  verification: ChainOfCustodyVerification;
}

export interface ChainUserIdentity {
  user_id: string;
  display_name: string;
  role: string;
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
  recorded_at: number;
  writer: string;
}

export interface ChainAccessVerification {
  session_exists: boolean;
  evidence_ref_matches: boolean;
  officer_ref_matches: boolean;
  transaction_matches: boolean;
}

export interface ChainAccessHistoryItem {
  access_log_id: string;
  access_session_ref: string;
  user: ChainUserIdentity | null;
  action: string;
  accessed_at: string;
  blockchain: ChainAccessMetadata | null;
  transaction: ChainTransactionMetadata | null;
  verified: boolean;
  verification: ChainAccessVerification;
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
  evidence: ChainEvidenceMetadata;
  uploader: ChainUserIdentity | null;
  registration_transaction: ChainTransactionMetadata | null;
  access_history: ChainAccessHistoryItem[];
  verification: ChainOfCustodyVerification;
}

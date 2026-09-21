export interface DatabaseIntegrityAlert {
  alert_type: "EVIDENCE_HASH" | "ACCESS_LOG";
  evidence_id: string | null;
  evidence_number: string | null;
  original_filename: string | null;
  access_log_id: string | null;
  access_session_ref: string | null;
  detected_at: string;
  database_hash: string | null;
  blockchain_hash: string | null;
  status:
    | "DATABASE_HASH_MISMATCH"
    | "MISSING_ON_CHAIN"
    | "ACCESS_LOG_MISMATCH"
    | "ACCESS_LOG_MISSING_IN_DATABASE"
    | "ACCESS_LOG_MISSING_ON_CHAIN";
}

export interface DatabaseIntegrityAlertResponse {
  alert_count: number;
  checked_count: number;
  access_log_checked_count: number;
  alerts: DatabaseIntegrityAlert[];
}

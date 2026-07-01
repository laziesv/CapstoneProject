// ── Evidence / case / blockchain domain interfaces ──────

export type CaseStatus = "open" | "investigating" | "closed" | "archived";
export type EvidenceCategory = "crime_scene" | "forensic" | "surveillance" | "document";
export type EvidenceStatus = "pending" | "verified" | "flagged" | "rejected";
export type WatermarkType = "static" | "dynamic";
export type WmAlgorithm = "dct" | "dwt" | "lsb" | "hybrid";
export type TxAction = "upload" | "access" | "verify" | "transfer" | "flag";
export type TxStatus = "pending" | "confirmed" | "failed";
export type AccessAction = "view" | "download" | "print" | "share" | "export";
export type AccessResult = "success" | "denied" | "unauthorized";

export interface Case {
  case_id: string;
  case_number: string;
  title: string;
  description: string;
  status: CaseStatus;
  created_by: string;
  assigned_officer: string;
  incident_date: string;
  location: string;
  created_at: string;
  evidence_count?: number;
}

export interface EvidenceItem {
  evidence_id: string;
  evidence_number: string;
  case_id: string;
  case_number?: string;
  uploaded_by: string;
  officer_name?: string;
  category: EvidenceCategory;
  description: string;
  original_filename: string;
  file_hash_sha256: string;
  file_size_bytes: number;
  status: EvidenceStatus;
  is_watermarked: boolean;
  is_blockchain_verified: boolean;
  thumbnail_url?: string;
  captured_at: string;
  uploaded_at: string;
}

export interface WatermarkRecord {
  watermark_id: string;
  evidence_id: string;
  watermark_type: WatermarkType;
  embedded_data: string;
  watermark_hash: string;
  strength: number;
  algorithm: WmAlgorithm;
  is_verified: boolean;
  verification_score: number;
  embedded_at: string;
}

export interface BlockchainTx {
  tx_internal_id: string;
  tx_hash: string;
  evidence_id: string;
  evidence_number?: string;
  initiated_by: string;
  officer_name?: string;
  action_type: TxAction;
  block_number: number;
  contract_address: string;
  status: TxStatus;
  gas_used: number;
  block_timestamp: string;
}

export interface AccessLog {
  log_id: string;
  user_id: string;
  user_name?: string;
  evidence_id: string;
  evidence_number?: string;
  action: AccessAction;
  ip_address: string;
  user_agent: string;
  tx_hash?: string;
  result: AccessResult;
  accessed_at: string;
}

// ── Evidence / case / blockchain domain interfaces ──────

export type EvidenceCategory = "crime_scene" | "forensic" | "surveillance" | "document";
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
  created_by: string;
  assigned_officers: string[];
  incident_date: string;
  location: string;
  created_at: string;
  evidence_count?: number;
}

/** payload สร้างคดีใหม่ — สเปคสำหรับ POST /api/cases */
export interface NewCaseInput {
  title: string;
  description: string;
  location: string;
  incident_date: string;
  created_by: string;
  assigned_officers: string[];
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
  is_watermarked: boolean;
  is_blockchain_verified: boolean;
  thumbnail_url?: string;
  captured_at: string;
  uploaded_at: string;
}

/** payload สร้างหลักฐานใหม่ — สเปคสำหรับ POST /api/evidence (multipart) */
export interface UploadEvidenceInput {
  case_id: string;
  files: File[];
  category: string; // crime_scene | forensic | surveillance | document
  description: string;
  location: string; // ชื่อสถานที่เกิดเหตุ
  latitude?: string; // พิกัดที่เกิดเหตุ (จาก EXIF หรือกรอกเอง)
  longitude?: string;
  captured_at?: string; // วันเวลาที่ถ่าย (datetime-local)
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

/** ผลการตรวจสอบลายน้ำ — สเปค response ของ POST /api/watermark/verify */
export interface VerifyResult {
  matchPercent: number;
  officerId: string;
  officerName: string;
  timestamp: string;
  gps: string;
  staticWm: boolean;
  dynamicWm: boolean;
  tampered: boolean;
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

/** ตัวกรอง query ของ GET /api/access-logs */
export interface AccessLogFilters {
  evidence_id?: string;
  user_id?: string;
  action?: string;
  result?: string;
}

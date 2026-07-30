// ── Evidence / case / blockchain domain interfaces ──────

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

/** รูปแบบที่ backend คืนมาจริงจาก /api/cases (CaseResponse ฝั่ง FastAPI)
 *  ต่างจาก `Case` ที่ frontend ใช้ — id เป็น UUID, ผู้รับผิดชอบเป็นคนเดียว
 *  แปลงด้วย toCase() ใน case.service.ts */
export interface CaseApiResponse {
  case_id: string;
  case_number: string;
  title: string;
  description: string | null;
  created_by: string;              // UUID ของผู้ใช้
  assigned_officer: string | null; // UUID — backend ยังรองรับคนเดียว
  incident_date: string | null;
  location: string | null;
  created_at: string;
  updated_at: string | null;
  closed_at: string | null;
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
  description: string;
  original_filename: string;
  is_watermarked: boolean;
  is_blockchain_verified: boolean;
  uploaded_at: string;
  // ว่างได้เมื่อหลักฐานยังไม่มีไฟล์แนบ (เช่นข้อมูล seed เก่า)
  file_hash_sha256?: string;
  file_size_bytes?: number;
  thumbnail_url?: string;
  captured_at?: string;
}

/** รูปแบบที่ backend คืนมาจริงจาก /api/evidences (EvidenceResponse ฝั่ง FastAPI) */
export interface EvidenceApiResponse {
  evidence_id: string;
  evidence_number: string;
  case_id: string;
  uploaded_by: string;
  description: string | null;
  original_filename: string | null;
  is_watermarked: boolean;
  is_blockchain_verified: boolean;
  captured_at: string | null;
  uploaded_at: string;
  // ชื่อที่อ่านออก มาจากตาราง cases / users
  case_number: string | null;
  officer_name: string | null;
  // มาจากไฟล์ต้นฉบับในตาราง evidence_files
  file_id: string | null;
  file_hash: string | null;
  file_size_bytes: number | null;
}

/** ไฟล์หนึ่งไฟล์ + metadata ของตัวเอง — 1 รายการนี้ = 1 EvidenceItem ที่ถูกสร้าง */
export interface UploadEvidenceFile {
  file: File;
  description: string;
  captured_at?: string; 
  captured_at_source?: "exif" | "manual";
}

/** payload สร้างหลักฐานใหม่ — สเปคสำหรับ POST /api/evidence (multipart)
 *  metadata แยกรายไฟล์ เพราะแต่ละรูปมีวันเวลาถ่ายของตัวเอง — ห้ามใช้ค่าของรูปแรกแทนทุกรูป */
export interface UploadEvidenceInput {
  case_id: string;
  files: UploadEvidenceFile[];
}

/** ผลลัพธ์ต่อ 1 ไฟล์ที่อัพโหลดสำเร็จ — response ของ POST /api/evidence
 *  ค่าทั้งหมดต้องมาจาก server เท่านั้น (client คำนวณเองแล้วส่งมาเชื่อไม่ได้) */
export interface UploadedEvidenceRef {
  original_filename: string;
  evidence_number: string;
  file_hash_sha256: string;
  tx_hash: string;
  block_number: number;
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

// ── Evidence / case / blockchain domain interfaces ──────

import type { IntegrityMismatch } from "./chainOfCustody";

export type WatermarkType = "static" | "dynamic";
export type WmAlgorithm = "dct" | "dwt" | "lsb" | "hybrid";
export type TxAction = "upload" | "access" | "verify" | "transfer" | "flag";
export type TxStatus = "pending" | "confirmed" | "failed";
export type AccessAction = "create" | "update" | "delete" | "view" | "download" | "query" | "print" | "share" | "export";
export type AccessResult = "success" | "failed" | "denied" | "unauthorized";

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
  display_file_id?: string;
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
  // ไฟล์ที่ให้ผู้ใช้ดู/ดาวน์โหลด — ตัวที่ฝังลายน้ำแล้ว
  display_file_id: string | null;
  file_hash: string | null;
  file_size_bytes: number | null;
}

/** ผลลัพธ์จากการยืนยันเจตนาเปิดดูหลักฐานกับ EvidenceRegistry V3 */
export interface EvidenceViewSessionResponse {
  access_log_id: string;
  evidence_id: string;
  access_session_ref: string;
  action: "VIEW";
  occurred_at: string;
  tx_hash: string;
  block_number: number;
}

/** metadata ที่แนบมากับ binary DOWNLOAD response เดิม จึงไม่สร้าง request ซ้ำ */
export interface EvidenceDownloadMetadata {
  evidenceId: string | null;
  evidenceRef: string | null;
  accessSessionRef: string | null;
  action: "DOWNLOAD" | null;
  transactionHash: string | null;
  blockNumber: number | null;
  integrityStatus: string | null;
}

export interface EvidenceDownloadResult {
  blob: Blob;
  metadata: EvidenceDownloadMetadata;
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
/** รูปแบบที่ backend คืนจาก POST /api/watermark/verify (multipart image) */
export interface WatermarkVerifyApiResponse {
  found: boolean;
  evidence_id: string | null;
  evidence_number: string | null;
  officer_name: string | null;
  uploaded_at: string | null;
  original_filename: string | null;
  original_file_hash: string | null;
  blockchain_verified: boolean;
  uploader: WatermarkVerificationUser | null;
  match_percent: number;
  static_ok: boolean;
  dynamic_ok: boolean;
  dynamic_mode: "canonical" | "personalized" | "unresolved" | null;
  static_qr_png: string | null;
  dynamic_qr_png: string | null;
  static_decoded: string | null;
  dynamic_decoded: string | null;
  evidence_integrity_status: OriginalEvidenceIntegrityState | null;
  original_file_integrity_status: IntegrityCheckState | null;
  database_hash_integrity_status: IntegrityCheckState | null;
  watermark_hash_integrity_status: "VERIFIED" | "INTEGRITY_MISMATCH" | null;
  blockchain_evidence_hash: string | null;
  current_original_hash: string | null;
  database_original_hash: string | null;
  original_integrity_mismatches: IntegrityMismatch[];
  access_session_ref: string | null;
  matched_access_log_id: string | null;
  matched_user_id: string | null;
  access_tx_hash: string | null;
  access_block_number: number | null;
  matched_access_user: WatermarkVerificationUser | null;
  matched_access_action: string | null;
  matched_accessed_at: string | null;
  blockchain_recorded_at: number | null;
  access_tx_status: string | null;
  matched_evidence_id: string | null;
  blockchain_session_verified: boolean;
  database_integrity_state: "VERIFIED" | "INTEGRITY_MISMATCH" | null;
  attribution_mismatches: IntegrityMismatch[];
  database_access_user: WatermarkVerificationUser | null;
  database_access_action: string | null;
  database_accessed_at: string | null;
  blockchain_occurred_at: number | null;
}

export interface WatermarkVerificationUser {
  user_id: string;
  badge_number: string | null;
  username: string | null;
  email: string | null;
  full_name: string | null;
  rank: string | null;
}

export type IntegrityCheckState =
  | "VERIFIED"
  | "INTEGRITY_MISMATCH"
  | "MISSING_ON_CHAIN";

export type OriginalEvidenceIntegrityState =
  | "VERIFIED"
  | "ORIGINAL_FILE_MISMATCH"
  | "DATABASE_HASH_MISMATCH"
  | "ORIGINAL_AND_DATABASE_HASH_MISMATCH"
  | "MISSING_ON_CHAIN";

/** ผลถอดลายน้ำที่ frontend ใช้ — อัปโหลดภาพแล้วระบบเดาว่าเป็นหลักฐานชิ้นไหน
 *  หมายเหตุ: officer/uploaded มาจาก DB (lookup ด้วย evidence_id) ไม่ใช่จากลายน้ำ
 *  — static QR เก็บแค่ sha256(evidence_id) เท่านั้น ไม่มีข้อมูลคน/เวลา/พิกัด */
export interface VerifyResult {
  found: boolean;
  evidenceId: string | null;
  evidenceNumber: string | null;
  officerName: string | null;
  uploadedAt: string | null;
  originalFilename: string | null;
  originalFileHash: string | null;
  blockchainVerified: boolean;
  uploader: WatermarkVerificationUser | null;
  matchPercent: number;
  staticOk: boolean;   // static QR = sha256(evidence_id) ไหม (ยืนยันตัวตน)
  dynamicOk: boolean;
  dynamicMode: "canonical" | "personalized" | "unresolved" | null;
  staticQrPng: string | null;   // QR ที่แกะได้ (data URI) เอาไว้โชว์
  dynamicQrPng: string | null;
  staticDecoded: string | null;
  dynamicDecoded: string | null;
  evidenceIntegrityStatus: OriginalEvidenceIntegrityState | null;
  originalFileIntegrityStatus: IntegrityCheckState | null;
  databaseHashIntegrityStatus: IntegrityCheckState | null;
  watermarkHashIntegrityStatus: "VERIFIED" | "INTEGRITY_MISMATCH" | null;
  blockchainEvidenceHash: string | null;
  currentOriginalHash: string | null;
  databaseOriginalHash: string | null;
  originalIntegrityMismatches: IntegrityMismatch[];
  accessSessionRef: string | null;
  matchedAccessLogId: string | null;
  matchedUserId: string | null;
  accessTxHash: string | null;
  accessBlockNumber: number | null;
  matchedAccessUser: WatermarkVerificationUser | null;
  matchedAccessAction: string | null;
  matchedAccessedAt: string | null;
  blockchainRecordedAt: number | null;
  accessTxStatus: string | null;
  matchedEvidenceId: string | null;
  blockchainSessionVerified: boolean;
  databaseIntegrityState: "VERIFIED" | "INTEGRITY_MISMATCH" | null;
  attributionMismatches: IntegrityMismatch[];
  databaseAccessUser: WatermarkVerificationUser | null;
  databaseAccessAction: string | null;
  databaseAccessedAt: string | null;
  blockchainOccurredAt: number | null;
}

export interface AccessLog {
  log_id: string;
  user_id: string;
  user_name?: string;
  case_id?: string | null;
  evidence_id: string | null;
  evidence_number?: string;
  action: AccessAction;
  ip_address: string | null;
  user_agent: string | null;
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
  limit?: number;
  offset?: number;
  exclude_query?: boolean;
}

export interface AccessLogPage {
  items: AccessLog[];
  total: number;
  limit: number | null;
  offset: number;
}

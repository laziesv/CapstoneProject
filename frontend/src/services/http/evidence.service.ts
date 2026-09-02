// ── Evidence service ────────────────────────────────────
// เชื่อมกับ API จริงแล้ว (ยกเว้น blockchain transactions ที่ยังไม่มี endpoint)
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │ endpoint ที่ backend มีอยู่ตอนนี้                                      │
// ├──────────────────────────────────────────────────────────────────────┤
// │ GET  /api/evidences?case_id={uuid}  → EvidenceApiResponse[]          │
// │      ต้อง auth · ไม่ส่ง case_id = คืนทั้งหมด                          │
// │ POST /api/evidences/upload          → EvidenceApiResponse            │
// │      ต้อง auth · multipart: file (1 ไฟล์ต่อ 1 request)                │
// │              + evidence = JSON string ของ                            │
// │                { case_id, description?, captured_at? }               │
// │      uploaded_by มาจาก token (ไม่ต้องส่ง) · server คำนวณ SHA-256 จริง  │
// │ GET  /api/evidences/{ref}           → EvidenceApiResponse (+log VIEW) │
// │      ref = UUID หรือเลขหลักฐาน (เช่น EV-20260829-A82EC1)              │
// │ GET  /api/evidence-files/{file_id}?action=download → ไฟล์ (+log DL)   │
// └──────────────────────────────────────────────────────────────────────┘
//
// TODO(backend): ยังไม่มี endpoint blockchain — transactionsOf และ verifyOnChain ยัง mock

import type {
  EvidenceItem,
  BlockchainTx,
  BlockchainVerification,
  AccessLog,
  UploadEvidenceInput,
  UploadedEvidenceRef,
  EvidenceApiResponse,
} from "@/interfaces";
import { evidenceFileUrl } from "@/config";
import { mockTx } from "@/utils/mockData";
import { mockVerifyOnChain } from "./_mocks/blockchainVerify";
import { request, ApiError } from "./client";

/** สุ่ม hex — ใช้เฉพาะ tx/block ที่ยังไม่มี endpoint จริง
 *  TODO(backend): ลบทิ้งเมื่อมี blockchain endpoint */
function randomHex(len: number): string {
  const bytes = new Uint8Array(len / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** แปลงรูปแบบของ backend → รูปแบบที่ frontend ใช้ทั้งระบบ */
function toEvidence(dto: EvidenceApiResponse): EvidenceItem {
  // ไฟล์เสิร์ฟผ่าน endpoint แยก — ใช้ไฟล์ที่ฝังลายน้ำแล้ว (display_file_id)
  // เพื่อให้ภาพที่โชว์และดาวน์โหลดมีลายน้ำติดไปด้วย (fallback file_id ถ้าไม่มี)
  const fileId = dto.display_file_id ?? dto.file_id;
  return {
    evidence_id: dto.evidence_id,
    evidence_number: dto.evidence_number,
    case_id: dto.case_id,
    case_number: dto.case_number ?? undefined,
    uploaded_by: dto.uploaded_by,
    officer_name: dto.officer_name ?? undefined,
    description: dto.description ?? "",
    original_filename: dto.original_filename ?? "",
    is_watermarked: dto.is_watermarked,
    is_blockchain_verified: dto.is_blockchain_verified,
    uploaded_at: dto.uploaded_at,
    captured_at: dto.captured_at ?? undefined,
    file_hash_sha256: dto.file_hash ?? undefined,
    file_size_bytes: dto.file_size_bytes ?? undefined,
    thumbnail_url: fileId ? evidenceFileUrl(fileId) : undefined,
  };
}

export const evidenceService = {
  /** รายการหลักฐาน (กรองตามคดีได้ — กรองฝั่ง server) */
  async list(filters: { case_id?: string } = {}): Promise<EvidenceItem[]> {
    const qs = filters.case_id ? `?case_id=${encodeURIComponent(filters.case_id)}` : "";
    const data = await request<EvidenceApiResponse[]>(`/api/evidences${qs}`);
    return data.map(toEvidence);
  },

  /** หลักฐานตาม id (undefined ถ้าไม่พบ)
   *  เปิดหน้านี้ = server บันทึก VIEW log ให้อัตโนมัติ (เลี่ยงไม่ได้) */
  async get(id: string): Promise<EvidenceItem | undefined> {
    try {
      const dto = await request<EvidenceApiResponse>(`/api/evidences/${encodeURIComponent(id)}`);
      return toEvidence(dto);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return undefined;
      throw e;
    }
  },

  /** อัพโหลดหลักฐานใหม่ — ยิงทีละไฟล์เพราะ endpoint รับครั้งละ 1 ไฟล์ */
  async upload(input: UploadEvidenceInput): Promise<UploadedEvidenceRef[]> {
    const refs: UploadedEvidenceRef[] = [];

    for (const item of input.files) {
      const form = new FormData();
      form.append("file", item.file);
      form.append(
        "evidence",
        JSON.stringify({
          case_id: input.case_id,
          description: item.description || null,
          captured_at: item.captured_at || null,
        })
      );

      const dto = await request<EvidenceApiResponse>("/api/evidences/upload", {
        method: "POST",
        body: form,
      });

      refs.push({
        original_filename: dto.original_filename ?? item.file.name,
        evidence_number: dto.evidence_number,
        // SHA-256 จริงที่ server คำนวณจากไฟล์ที่บันทึกไว้
        file_hash_sha256: dto.file_hash ?? "",
        // TODO(backend): ใช้ค่าจริงเมื่อมี blockchain endpoint
        tx_hash: `0x${randomHex(40)}`,
        block_number: 18450 + Math.floor(Math.random() * 500),
      });
    }

    return refs;
  },

  /** ธุรกรรม blockchain ของหลักฐานชิ้นนั้น — ยัง mock (ไม่มี endpoint) */
  async transactionsOf(evidenceId: string): Promise<BlockchainTx[]> {
    return mockTx.filter((t) => t.evidence_id === evidenceId);
  },

  /** ตรวจสอบความสมบูรณ์กับบล็อกเชน — เทียบแฮชไฟล์ + access log ทีละรายการ (audit trail)
   *  TODO(backend): ตอนนี้ยัง mock (ดู ./_mocks/blockchainVerify) — สลับเป็น endpoint จริงที่นี่ */
  verifyOnChain(evidence: EvidenceItem, logs: AccessLog[]): Promise<BlockchainVerification> {
    return mockVerifyOnChain(evidence, logs);
  },
};

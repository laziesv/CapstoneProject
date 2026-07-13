// ── Evidence service ────────────────────────────────────
// สัญญา (contract) สำหรับ endpoint กลุ่ม /api/evidence
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │ endpoint ที่ backend ต้องทำ                                           │
// ├──────────────────────────────────────────────────────────────────────┤
// │ GET  /api/evidence?case_id={id}      → EvidenceItem[]                │
// │      scope ตามสิทธิ์คดี (เห็นเฉพาะหลักฐานของคดีที่ตัวเองเข้าถึงได้)     │
// │ GET  /api/evidence/{id}              → EvidenceItem (403 นอก scope)  │
// │ POST /api/evidence                   → EvidenceItem                  │
// │      body = UploadEvidenceInput (multipart: files + metadata)        │
// │      เฉพาะผู้รับผิดชอบคดี (non-admin) — server ต้อง:                  │
// │        1. คำนวณ SHA-256 ของไฟล์                                      │
// │        2. ฝัง watermark เสมอ (ไม่เป็น option)                         │
// │        3. บันทึกลง blockchain เสมอ                                   │
// │        4. validate lat/long (พิกัดที่เกิดเหตุ อาจมาจาก EXIF ฝั่ง client)│
// │ GET  /api/evidence/{id}/transactions → BlockchainTx[]                │
// └──────────────────────────────────────────────────────────────────────┘
//
// สถานะปัจจุบัน: mock — อ่านจาก mockData; upload จำลอง delay แล้วทิ้งข้อมูล
// TODO(backend): เมื่อ endpoint พร้อม เปลี่ยน implementation เป็น request() เช่น
//   list: (f) => request<EvidenceItem[]>(`/api/evidence${f?.case_id ? `?case_id=${f.case_id}` : ""}`)
//   upload: ใช้ FormData (แนบไฟล์) — client.ts ต้องรองรับ multipart ตอนนั้น

import type { EvidenceItem, BlockchainTx, UploadEvidenceInput } from "@/interfaces";
import { mockEvidence, mockTx } from "@/utils/mockData";

export const evidenceService = {
  /** รายการหลักฐาน (กรองตามคดีได้) */
  async list(filters: { case_id?: string } = {}): Promise<EvidenceItem[]> {
    if (filters.case_id) {
      return mockEvidence.filter((e) => e.case_id === filters.case_id);
    }
    return mockEvidence;
  },

  /** หลักฐานตาม id (undefined ถ้าไม่พบ) */
  async get(id: string): Promise<EvidenceItem | undefined> {
    return mockEvidence.find((e) => e.evidence_id === id);
  },

  /** อัพโหลดหลักฐานใหม่ — ฝัง watermark + บันทึก blockchain ฝั่ง server เสมอ */
  async upload(input: UploadEvidenceInput): Promise<void> {
    // mock: จำลองเวลาประมวลผล (hash → watermark → save → blockchain) — payload ยังไม่ถูกใช้
    void input;
    await new Promise((resolve) => setTimeout(resolve, 4000));
  },

  /** ธุรกรรม blockchain ของหลักฐานชิ้นนั้น */
  async transactionsOf(evidenceId: string): Promise<BlockchainTx[]> {
    return mockTx.filter((t) => t.evidence_id === evidenceId);
  },
};

// ── Evidence service ────────────────────────────────────
// สัญญา (contract) สำหรับ endpoint กลุ่ม /api/evidence
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │ endpoint ที่ backend ต้องทำ                                           │
// ├──────────────────────────────────────────────────────────────────────┤
// │ GET  /api/evidence?case_id={id}      → EvidenceItem[]                │
// │      scope ตามสิทธิ์คดี (เห็นเฉพาะหลักฐานของคดีที่ตัวเองเข้าถึงได้)     │
// │ GET  /api/evidence/{id}              → EvidenceItem (403 นอก scope)  │
// │ POST /api/evidence                   → UploadedEvidenceRef[]         │
// │      (1 รายการต่อ 1 ไฟล์: evidence_number, file_hash_sha256,          │
// │       tx_hash, block_number — หน้าเว็บเอาไปแสดง/ทำ QR)                │
// │      body = UploadEvidenceInput (multipart)                          │
// │        case_id + files[] โดยแต่ละ item = { file, description,         │
// │        captured_at?, captured_at_source? ("exif"|"manual") }         │
// │        1 item = 1 EvidenceItem — metadata แยกรายไฟล์ เพราะแต่ละรูป    │
// │        มีวันเวลาถ่ายของตัวเอง (ห้ามใช้ค่าของรูปแรกแทนทุกรูป)            │
// │        captured_at อ่านจาก EXIF ฝั่ง client — ถ้าไฟล์ไม่มีจึงให้กรอกเอง  │
// │        server ต้องเก็บ source ไว้ด้วย เพื่อแยกค่าที่พิสูจน์ย้อนได้        │
// │        ออกจากค่าที่คนพิมพ์ (ห้ามเชื่อ "exif" จาก client — ตรวจซ้ำเอง)    │
// │        (สถานที่เกิดเหตุใช้ของคดี ไม่เก็บซ้ำระดับหลักฐาน)                │
// │      เฉพาะผู้รับผิดชอบคดี (non-admin) — server ต้อง:                  │
// │        1. คำนวณ SHA-256 ของไฟล์                                      │
// │        2. ฝัง watermark เสมอ (ไม่เป็น option)                         │
// │        3. บันทึกลง blockchain เสมอ                                   │
// │ GET  /api/evidence/{id}/transactions → BlockchainTx[]                │
// └──────────────────────────────────────────────────────────────────────┘
//
// สถานะปัจจุบัน: mock — อ่านจาก mockData; upload จำลอง delay แล้วทิ้งข้อมูล
// TODO(backend): เมื่อ endpoint พร้อม เปลี่ยน implementation เป็น request() เช่น
//   list: (f) => request<EvidenceItem[]>(`/api/evidence${f?.case_id ? `?case_id=${f.case_id}` : ""}`)
//   upload: ใช้ FormData (แนบไฟล์) — client.ts ต้องรองรับ multipart ตอนนั้น

import type { EvidenceItem, BlockchainTx, UploadEvidenceInput, UploadedEvidenceRef } from "@/interfaces";
import { mockEvidence, mockTx } from "@/utils/mockData";

/** สุ่ม hex ความยาวที่กำหนด — ใช้เฉพาะ mock เท่านั้น
 *  TODO(backend): ของจริง hash ต้องคำนวณจากไฟล์ฝั่ง server (SHA-256 ของ bytes ทั้งไฟล์)
 *  ถ้าอยากได้ hash จริงฝั่ง client ก่อน backend พร้อม ใช้ crypto.subtle.digest("SHA-256", buf) */
function randomHex(len: number): string {
  const bytes = new Uint8Array(len / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

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

  /** อัพโหลดหลักฐานใหม่ — ฝัง watermark + บันทึก blockchain ฝั่ง server เสมอ
   *  คืนผลรายไฟล์ (1 ไฟล์ = 1 หลักฐาน) เพื่อให้หน้าเว็บแสดง hash/tx ที่ได้ */
  async upload(input: UploadEvidenceInput): Promise<UploadedEvidenceRef[]> {
    // mock: จำลองผลลัพธ์ที่ server จะคืนกลับมา — ยังไม่ได้ประมวลผลไฟล์จริง
    const year = new Date().getFullYear();
    return input.files.map((f, i) => ({
      original_filename: f.file.name,
      evidence_number: `EV-${year}-${String(mockEvidence.length + i + 1).padStart(5, "0")}`,
      file_hash_sha256: randomHex(64),
      tx_hash: `0x${randomHex(40)}`,
      block_number: 18450 + Math.floor(Math.random() * 500),
    }));
  },

  /** ธุรกรรม blockchain ของหลักฐานชิ้นนั้น */
  async transactionsOf(evidenceId: string): Promise<BlockchainTx[]> {
    return mockTx.filter((t) => t.evidence_id === evidenceId);
  },
};

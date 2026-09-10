// ── Evidence service ────────────────────────────────────
// เชื่อมกับ API จริงแล้ว (ยกเว้น blockchain transactions ที่ยังไม่มี endpoint)
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │ endpoint ที่ backend มีอยู่ตอนนี้                                      │
// ├──────────────────────────────────────────────────────────────────────┤
// │ GET  /api/evidences?case_id={uuid}  → EvidenceApiResponse[]          │
// │      ต้อง auth · ไม่ส่ง case_id = คืนทั้งหมด                          │
// │ POST /api/evidences/upload          → EvidenceUploadApiResponse      │
// │      ต้อง auth · multipart: file (1 ไฟล์ต่อ 1 request)                │
// │              + evidence = JSON string ของ                            │
// │                { case_id, description?, captured_at? }               │
// │      uploaded_by มาจาก token (ไม่ต้องส่ง) · server คำนวณ SHA-256 จริง  │
// │ GET  /api/evidence-files/{file_id}  → ไฟล์รูป (FileResponse)          │
// │ GET  /api/evidences/{id}/chain-of-custody → ChainOfCustodyResponse   │
// └──────────────────────────────────────────────────────────────────────┘
//
// TODO(backend): ยังไม่มี GET /api/evidences/{id} — get() จึงดึงลิสต์มาหาเอง
import type {
  EvidenceItem,
  UploadEvidenceInput,
  UploadedEvidenceRef,
  EvidenceApiResponse,
  EvidenceUploadApiResponse,
  EvidenceViewSessionResponse,
  EvidenceDownloadResult,
  ChainOfCustodyResponse,
} from "@/interfaces";
import { ApiError, request, requestBlob, requestBlobWithMetadata } from "./client";
import {
  requestEvidenceDownloadOnce,
  uploadResultFromResponse,
} from "@/utils/evidenceOperationFeedback";

// React Strict Mode เรียก effect ซ้ำใน development เพื่อช่วยตรวจหา side effect
// ใช้ request ที่กำลังทำงานร่วมกัน เพื่อไม่ให้ GET ที่ backend นำไปบันทึก access log
// สร้าง QUERY ซ้ำสำหรับการเปิดหน้าครั้งเดียว
const pendingReads = new Map<string, Promise<EvidenceApiResponse[]>>();

function sharedRead(
  key: string,
  load: () => Promise<EvidenceApiResponse[]>,
): Promise<EvidenceApiResponse[]> {
  const pending = pendingReads.get(key);
  if (pending) return pending;

  const next = load().finally(() => {
    if (pendingReads.get(key) === next) pendingReads.delete(key);
  });
  pendingReads.set(key, next);
  return next;
}

/** แปลงรูปแบบของ backend → รูปแบบที่ frontend ใช้ทั้งระบบ */
function toEvidence(dto: EvidenceApiResponse): EvidenceItem {
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
    display_file_id: dto.display_file_id ?? undefined,
  };
}

export const evidenceService = {
  /** บันทึก VIEW จากการกดเปิดหลักฐานโดยเจตนา ก่อนอนุญาตให้ UI แสดง preview */
  createViewSession(
    evidenceId: string,
    requestId?: string,
  ): Promise<EvidenceViewSessionResponse> {
    return request<EvidenceViewSessionResponse>(
      `/api/evidences/${encodeURIComponent(evidenceId)}/view-session`,
      {
        method: "POST",
        body: JSON.stringify({ request_id: requestId ?? null }),
      }
    );
  },

  /** โหลด Chain of Custody ที่ backend ตรวจสอบกับ private Blockchain แล้ว */
  /** limit/offset ตัดเฉพาะ access_history โดยนับจากรายการล่าสุดย้อนขึ้นไป
   *  (offset=0 = หน้าที่ใหม่ที่สุด) ส่วนผลตรวจสอบยังคิดจากประวัติทั้งหมดเสมอ */
  getChainOfCustody(
    evidenceId: string,
    page: { limit?: number; offset?: number } = {},
  ): Promise<ChainOfCustodyResponse> {
    const params = new URLSearchParams();
    if (page.limit !== undefined) params.set("limit", String(page.limit));
    if (page.offset) params.set("offset", String(page.offset));
    const qs = params.toString();
    return request<ChainOfCustodyResponse>(
      `/api/evidences/${encodeURIComponent(evidenceId)}/chain-of-custody${qs ? `?${qs}` : ""}`
    );
  },

  /** โหลดภาพตัวอย่างที่ฝังลายน้ำแล้วผ่าน Bearer token */
  preview(fileId: string): Promise<Blob> {
    return requestBlob(`/api/evidence-files/${encodeURIComponent(fileId)}`);
  },

  /** ดาวน์โหลดไฟล์ผ่าน POST เพื่อให้ backend บันทึกเหตุการณ์การเข้าถึงเพียงครั้งเดียว */
  async download(evidenceId: string): Promise<EvidenceDownloadResult> {
    const response = await requestEvidenceDownloadOnce(
      evidenceId,
      requestBlobWithMetadata,
    );
    const blockHeader = response.headers.get("X-Blockchain-Block-Number");
    const parsedBlock = blockHeader === null ? null : Number(blockHeader);
    const action = response.headers.get("X-Blockchain-Action");
    return {
      blob: response.blob,
      metadata: {
        evidenceId: response.headers.get("X-Evidence-Id"),
        evidenceRef: response.headers.get("X-Evidence-Ref"),
        accessSessionRef: response.headers.get("X-Access-Session-Ref"),
        action: action === "DOWNLOAD" ? action : null,
        transactionHash: response.headers.get("X-Blockchain-Tx-Hash"),
        blockNumber: parsedBlock !== null
          && Number.isSafeInteger(parsedBlock)
          && parsedBlock >= 0
          ? parsedBlock
          : null,
        integrityStatus: response.headers.get("X-Original-Evidence-Integrity"),
      },
    };
  },

  /** รายการหลักฐาน (กรองตามคดีได้ — กรองฝั่ง server) */
  async list(filters: { case_id?: string } = {}): Promise<EvidenceItem[]> {
    const qs = filters.case_id ? `?case_id=${encodeURIComponent(filters.case_id)}` : "";
    const path = `/api/evidences${qs}`;
    const data = await sharedRead(path, () => request<EvidenceApiResponse[]>(path));
    return data.map(toEvidence);
  },

  /** หลักฐานตาม id (undefined ถ้าไม่พบ)
   *  TODO(backend): ยังไม่มี GET /api/evidences/{id} — ต้องดึงลิสต์มาหาเอง */
  /** หลักฐานชิ้นเดียว — รับได้ทั้ง UUID และเลขหลักฐาน (เช่น EV-20260910-B7E872)
   *  ดึงเฉพาะชิ้นที่ขอ ไม่โหลดทั้งคลังมากรองเอง จึงไม่โตตามจำนวนหลักฐานในระบบ
   *  (endpoint นี้อ่านอย่างเดียว ไม่บันทึก VIEW — view-session เป็นเจ้าของ) */
  async get(ref: string): Promise<EvidenceItem | undefined> {
    try {
      return toEvidence(
        await request<EvidenceApiResponse>(`/api/evidences/${encodeURIComponent(ref)}`),
      );
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) return undefined;
      throw cause;
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

      const dto = await request<EvidenceUploadApiResponse>("/api/evidences/upload", {
        method: "POST",
        body: form,
      });

      refs.push(uploadResultFromResponse(dto, item.file.name));
    }

    return refs;
  },

};

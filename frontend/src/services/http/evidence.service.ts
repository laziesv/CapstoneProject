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
import { request, requestBlob, requestBlobWithMetadata } from "./client";
import {
  requestEvidenceDownloadOnce,
  uploadResultFromResponse,
} from "@/utils/evidenceOperationFeedback";

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
  getChainOfCustody(evidenceId: string): Promise<ChainOfCustodyResponse> {
    return request<ChainOfCustodyResponse>(
      `/api/evidences/${encodeURIComponent(evidenceId)}/chain-of-custody`
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
    const data = await request<EvidenceApiResponse[]>(`/api/evidences${qs}`);
    return data.map(toEvidence);
  },

  /** หลักฐานตาม id (undefined ถ้าไม่พบ)
   *  TODO(backend): ยังไม่มี GET /api/evidences/{id} — ต้องดึงลิสต์มาหาเอง */
  async get(id: string): Promise<EvidenceItem | undefined> {
    const all = await this.list();
    return all.find((e) => e.evidence_id === id);
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

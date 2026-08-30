// ── Watermark service ───────────────────────────────────
// เชื่อมกับ API จริงแล้ว (admin เท่านั้น)
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │ POST /api/watermark/verify → WatermarkVerifyApiResponse             │
// │      body = multipart (image file)                                   │
// │      admin only — อัปโหลดภาพแล้วระบบถอดลายน้ำ เดาว่าเป็นหลักฐานชิ้นไหน │
// │      (blind: ลองเทียบทุกหลักฐานจนเจอตัวที่ QR decode ตรง)             │
// └──────────────────────────────────────────────────────────────────────┘

import type { VerifyResult, WatermarkVerifyApiResponse } from "@/interfaces";
import { request } from "./client";

function toVerifyResult(dto: WatermarkVerifyApiResponse): VerifyResult {
  return {
    found: dto.found,
    evidenceId: dto.evidence_id,
    evidenceNumber: dto.evidence_number,
    officerName: dto.officer_name,
    uploadedAt: dto.uploaded_at,
    originalFilename: dto.original_filename,
    originalFileHash: dto.original_file_hash,
    blockchainVerified: dto.blockchain_verified,
    uploader: dto.uploader,
    matchPercent: dto.match_percent,
    staticOk: dto.static_ok,
    dynamicOk: dto.dynamic_ok,
    dynamicMode: dto.dynamic_mode,
    staticQrPng: dto.static_qr_png,
    dynamicQrPng: dto.dynamic_qr_png,
    staticDecoded: dto.static_decoded,
    dynamicDecoded: dto.dynamic_decoded,
    accessSessionRef: dto.access_session_ref,
    matchedAccessLogId: dto.matched_access_log_id,
    matchedUserId: dto.matched_user_id,
    accessTxHash: dto.access_tx_hash,
    accessBlockNumber: dto.access_block_number,
    matchedAccessUser: dto.matched_access_user,
    matchedAccessAction: dto.matched_access_action,
    matchedAccessedAt: dto.matched_accessed_at,
    blockchainRecordedAt: dto.blockchain_recorded_at,
    accessTxStatus: dto.access_tx_status,
    matchedEvidenceId: dto.matched_evidence_id,
  };
}

export const watermarkService = {
  /** อัปโหลดภาพเพื่อถอดลายน้ำ — ระบบเดาว่าเป็นหลักฐานชิ้นไหน แล้วคืน QR ที่แกะได้ */
  async verify(file: File): Promise<VerifyResult> {
    const form = new FormData();
    form.append("file", file);
    const dto = await request<WatermarkVerifyApiResponse>("/api/watermark/verify", {
      method: "POST",
      body: form,
    });
    return toVerifyResult(dto);
  },
};

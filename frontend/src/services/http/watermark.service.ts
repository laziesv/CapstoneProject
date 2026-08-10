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
    matchPercent: dto.match_percent,
    staticOk: dto.static_ok,
    dynamicOk: dto.dynamic_ok,
    staticQrPng: dto.static_qr_png,
    dynamicQrPng: dto.dynamic_qr_png,
    staticDecoded: dto.static_decoded,
    dynamicDecoded: dto.dynamic_decoded,
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

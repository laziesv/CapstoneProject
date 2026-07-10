// ── Access log service ──────────────────────────────────
// interface สำหรับ endpoint กลุ่ม /api/access-logs (admin เท่านั้น)
// ดูว่าใครเข้าถึงหลักฐานชิ้นไหน เวลาใด
//
// หมายเหตุ: ฝั่ง backend ยังไม่ได้ทำ endpoint นี้ — ไฟล์นี้เป็น "สัญญา" (contract)
// ที่กำหนดรูปแบบ request/response ไว้ล่วงหน้า เมื่อ backend พร้อม หน้า /logs
// สลับจาก mock มาเรียก accessLogService.list() ได้ทันที (ดู logs/page.tsx)

import { request } from "./client";
import type { AccessLog } from "@/interfaces";

export interface AccessLogFilters {
  evidence_id?: string;
  user_id?: string;
  action?: string;
  result?: string;
}

export const accessLogService = {
  /** รายการบันทึกการเข้าถึง (กรองตามหลักฐาน/ผู้ใช้/action/ผลได้) */
  list(filters: AccessLogFilters = {}): Promise<AccessLog[]> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    return request<AccessLog[]>(`/api/access-logs${qs ? `?${qs}` : ""}`);
  },
};

// ── Access log service ──────────────────────────────────
// เชื่อมกับ API จริงแล้ว (admin เท่านั้น)
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │ GET /api/access-logs?evidence_id=&user_id=&action=&result=           │
// │     → AccessLog[] (admin only, กรองตาม query ได้ทุกตัว)               │
// └──────────────────────────────────────────────────────────────────────┘
//
// log ถูกสร้างที่ server เอง: เปิดหน้าหลักฐาน = VIEW, กดดาวน์โหลด = DOWNLOAD
// (ดู evidence.service.ts) — ที่นี่แค่ "อ่าน" ประวัติมาแสดง

import type { AccessLog, AccessLogFilters } from "@/interfaces";
import { request } from "./client";

export const accessLogService = {
  /** รายการบันทึกการเข้าถึง (กรองตามหลักฐาน/ผู้ใช้/action/ผลได้) — admin เท่านั้น */
  async list(filters: AccessLogFilters = {}): Promise<AccessLog[]> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    return request<AccessLog[]>(`/api/access-logs${qs ? `?${qs}` : ""}`);
  },
};

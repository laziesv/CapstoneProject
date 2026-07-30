// ── Access log service ──────────────────────────────────
// สัญญา (contract) สำหรับ endpoint กลุ่ม /api/access-logs (admin เท่านั้น)
// ดูว่าใครเข้าถึงหลักฐานชิ้นไหน เวลาใด
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │ endpoint ที่ backend ต้องทำ                                           │
// ├──────────────────────────────────────────────────────────────────────┤
// │ GET /api/access-logs?evidence_id=&user_id=&action=&result=           │
// │     → AccessLog[] (admin only, กรองตาม query ได้ทุกตัว)               │
// └──────────────────────────────────────────────────────────────────────┘
//
// สถานะปัจจุบัน: mock — กรอง mockLogs ฝั่ง client ระหว่างที่ backend ยังไม่มี
// TODO(backend): เมื่อ endpoint พร้อม เปลี่ยน implementation เป็น:
//   const params = new URLSearchParams();
//   for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
//   const qs = params.toString();
//   return request<AccessLog[]>(`/api/access-logs${qs ? `?${qs}` : ""}`);

import type { AccessLog, AccessLogFilters } from "@/interfaces";
import { mockLogs } from "@/utils/mockData";

export const accessLogService = {
  /** รายการบันทึกการเข้าถึง (กรองตามหลักฐาน/ผู้ใช้/action/ผลได้) */
  async list(filters: AccessLogFilters = {}): Promise<AccessLog[]> {
    return mockLogs.filter((l) => {
      if (filters.evidence_id && l.evidence_id !== filters.evidence_id) return false;
      if (filters.user_id && l.user_id !== filters.user_id) return false;
      if (filters.action && l.action !== filters.action) return false;
      if (filters.result && l.result !== filters.result) return false;
      return true;
    });
  },
};

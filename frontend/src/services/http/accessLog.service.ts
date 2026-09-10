// ── Access log service ──────────────────────────────────
// สัญญา (contract) สำหรับ endpoint กลุ่ม /api/access-logs (admin เท่านั้น)
// ดูว่าใครเข้าถึงหลักฐานชิ้นไหน เวลาใด
//
// ใช้ข้อมูลจริงจาก GET /api/access-logs และคืนรายการตาม pagination ของ backend

import type { AccessLog, AccessLogFilters, AccessLogPage } from "@/interfaces";
import { request } from "./client";

export const accessLogService = {
  /** รายการบันทึกการเข้าถึง (กรองตามหลักฐาน/ผู้ใช้/action/ผลได้) */
  async list(filters: AccessLogFilters = {}): Promise<AccessLog[]> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    const query = params.toString();
    const page = await request<AccessLogPage>(
      `/api/access-logs${query ? `?${query}` : ""}`
    );
    return page.items;
  },
};

// ── Access log service ──────────────────────────────────
// เชื่อมกับ API จริงแล้ว (admin เท่านั้น)
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │ GET /api/access-logs?evidence_id=&user_id=&action=&result=           │
// │       &q=&date_from=&date_to=&only_anomaly=&limit=&offset=            │
// │     → AccessLogPage { items, total, limit, offset } (admin only)      │
// │       limit ว่าง = คืนทุกรายการ; ใส่ limit/offset = แบ่งหน้าที่ server │
// └──────────────────────────────────────────────────────────────────────┘
//
// log ถูกสร้างที่ server เอง: เปิดหน้าหลักฐาน = VIEW, กดดาวน์โหลด = DOWNLOAD
// (ดู evidence.service.ts) — ที่นี่แค่ "อ่าน" ประวัติมาแสดง

import type { AccessLog, AccessLogFilters, AccessLogPage } from "@/interfaces";
import { request } from "./client";

function buildQuery(filters: AccessLogFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    // ข้ามค่าว่าง/false — ส่งเฉพาะตัวกรองที่ถูกตั้งจริง
    if (value === undefined || value === null || value === "" || value === false) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const accessLogService = {
  /** รายการแบ่งหน้า (server-side) — ใช้กับหน้า /logs และตารางที่ต้องแบ่งหน้า */
  async listPage(filters: AccessLogFilters = {}): Promise<AccessLogPage> {
    return request<AccessLogPage>(`/api/access-logs${buildQuery(filters)}`);
  },

  /** รายการทั้งหมดที่ตรงตัวกรอง (unwrap envelope) — ใช้เมื่อต้องการทุกรายการ
   *  เช่น dashboard (กราฟ/อันดับ) และตรวจ chain-of-custody รายชิ้น */
  async list(filters: AccessLogFilters = {}): Promise<AccessLog[]> {
    const page = await accessLogService.listPage(filters);
    return page.items;
  },
};

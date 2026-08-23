// ── Dashboard service ───────────────────────────────────
// เชื่อมกับ API จริง: GET /api/dashboard → stats + recent evidence/activity (ต้อง auth)

import { request } from "./client";
import { API_BASE } from "@/config";
import type { DashboardData, DashboardApiResponse } from "@/interfaces";

export const dashboardService = {
  /** ดึงข้อมูลสรุปหน้า dashboard (stats + recent evidence/activity) */
  async get(): Promise<DashboardData> {
    const dto = await request<DashboardApiResponse>("/api/dashboard");
    return {
      stats: dto.stats,
      recent_activity: dto.recent_activity,
      // ต่อ display_file_id เป็น URL ไฟล์จริง (แนวเดียวกับ evidence.service) — ตัวฝังลายน้ำก่อน
      recent_evidence: dto.recent_evidence.map((e) => ({
        evidence_id: e.evidence_id,
        evidence_number: e.evidence_number,
        description: e.description,
        is_watermarked: e.is_watermarked,
        is_blockchain_verified: e.is_blockchain_verified,
        thumbnail_url: e.display_file_id
          ? `${API_BASE}/api/evidence-files/${e.display_file_id}`
          : null,
      })),
    };
  },
};

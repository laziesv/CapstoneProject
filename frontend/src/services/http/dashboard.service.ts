// ── Dashboard service ───────────────────────────────────

import { request } from "./client";
import type { DashboardData } from "@/interfaces";

export const dashboardService = {
  /** ดึงข้อมูลสรุปหน้า dashboard (stats + recent evidence/activity) */
  get(): Promise<DashboardData> {
    return request<DashboardData>("/api/dashboard");
  },
};

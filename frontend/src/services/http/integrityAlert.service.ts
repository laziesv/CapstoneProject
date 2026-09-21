import type { DatabaseIntegrityAlertResponse } from "@/interfaces";
import { request } from "./client";

export const integrityAlertService = {
  list(): Promise<DatabaseIntegrityAlertResponse> {
    return request<DatabaseIntegrityAlertResponse>("/api/integrity-alerts");
  },
};

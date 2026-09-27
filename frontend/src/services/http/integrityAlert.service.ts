import type { DatabaseIntegrityAlertResponse } from "@/interfaces";
import { request } from "./client";

const CACHE_TTL_MS = 5_000;
let cached: { expiresAt: number; value: DatabaseIntegrityAlertResponse } | null = null;
let inFlight: Promise<DatabaseIntegrityAlertResponse> | null = null;

export const integrityAlertService = {
  list({ force = false }: { force?: boolean } = {}): Promise<DatabaseIntegrityAlertResponse> {
    const now = Date.now();
    if (!force && cached && cached.expiresAt > now) {
      return Promise.resolve(cached.value);
    }
    if (inFlight) return inFlight;

    inFlight = request<DatabaseIntegrityAlertResponse>("/api/integrity-alerts")
      .then((value) => {
        cached = { expiresAt: Date.now() + CACHE_TTL_MS, value };
        return value;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  },
};

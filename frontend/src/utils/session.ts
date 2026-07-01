// ── Session/token helpers (client-side) ─────────────────
// เก็บ/อ่าน token + user ใน localStorage — ไม่ยุ่งกับ network
// ส่วนการเรียก API อยู่ที่ src/services/

import { TOKEN_KEY, USER_KEY } from "@/config";
import type { AuthUser } from "@/interfaces";

export function setSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function logout() {
  clearSession();
  window.location.href = "/login";
}

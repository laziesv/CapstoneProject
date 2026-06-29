// ── Auth utilities ──────────────────────────────────────
// จัดการ token/session ฝั่ง client + helper สำหรับเรียก API ที่ต้อง auth

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

const TOKEN_KEY = "deva_token";
const USER_KEY = "deva_user";

// user ที่ backend ส่งกลับมา (ตาม UserResponse)
export interface AuthUser {
  user_id: string;
  username: string;
  email: string;
  full_name?: string | null;
  rank?: string | null;
  department?: string | null;
  badge_number?: string | null;
  profile_image_url?: string | null;
  role?: string;
  is_active: boolean;
}

// ── Session storage ─────────────────────────────────────
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

// ── Logout ──────────────────────────────────────────────
export function logout() {
  clearSession();
  window.location.href = "/login";
}

// ── Authenticated fetch ─────────────────────────────────
// แนบ Authorization header อัตโนมัติ และ logout เมื่อ token หมดอายุ (401)
export async function authFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken();
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }

  return res;
}

// ── Validate token against backend ──────────────────────
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as AuthUser;
  } catch {
    return null;
  }
}

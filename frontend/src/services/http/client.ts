// ── HTTP layer ──────────────────────────────────────────
// ตัวกลางเรียก API — แนบ token, parse JSON, จัดการ error สม่ำเสมอ (โยน ApiError)
// service ทุกตัวเรียกผ่านที่นี่ ไม่เรียก fetch ตรงๆ

import { API_BASE } from "@/config";
import { getToken, clearSession } from "@/utils/session";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** fetch ที่แนบ Authorization header อัตโนมัติ + logout เมื่อ token หมดอายุ (401) */
async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  // multipart (FormData) ต้องปล่อยให้เบราว์เซอร์ตั้ง Content-Type เอง
  // เพราะต้องแนบ boundary ที่สุ่มมาด้วย — ถ้าเราตั้งเองไฟล์จะแตกฝั่ง server
  const isFormData = options.body instanceof FormData;

  const res = await fetch(url, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login";
  }

  return res;
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(
      data?.detail?.toString?.() ?? "เกิดข้อผิดพลาด",
      res.status
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** เรียก endpoint ที่ต้อง auth — แนบ token + logout อัตโนมัติเมื่อ token หมดอายุ */
export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  return parse<T>(await authFetch(path, options));
}

/** เรียก endpoint สาธารณะ (เช่น login) — ไม่แนบ token และไม่ redirect เมื่อ 401 */
export async function publicRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  return parse<T>(res);
}

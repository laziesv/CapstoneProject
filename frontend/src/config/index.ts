// ── App config / constants ──────────────────────────────

/** base URL ของ backend API (override ได้ด้วย env NEXT_PUBLIC_API_BASE) */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

/** URL ไฟล์หลักฐาน (รูป/ไฟล์) จาก file_id — จุดเดียวที่ประกอบ path นี้ */
export const evidenceFileUrl = (fileId: string) =>
  `${API_BASE}/api/evidence-files/${fileId}`;

/** key สำหรับเก็บ session ใน localStorage */
export const TOKEN_KEY = "deva_token";
export const USER_KEY = "deva_user";

// ── Role-based access control (สิทธิ์ตาม role) ──────────
// จุดเดียวที่นิยามว่า role ไหนเข้า path ไหนได้ — ใช้ทั้ง RouteGuard และซ่อนปุ่ม
// ต้องตรงกับสิทธิ์ฝั่ง backend (deps.require_roles) เสมอ

export type Role = "admin" | "investigator" | "officer" | "viewer";

// path prefix → role ที่เข้าได้
// ไม่ตรง rule ไหน = ทุก role ที่ล็อกอินเข้าได้ (dashboard, cases ดู, evidence ดู, profile)
const RULES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/verify", roles: ["admin"] },
  { prefix: "/logs", roles: ["admin"] },
  { prefix: "/users", roles: ["admin"] },
  // งานคดี/หลักฐาน — admin (ผู้ดูแลระบบ) ทำไม่ได้
  { prefix: "/cases/new", roles: ["investigator"] },
  { prefix: "/evidence/upload", roles: ["investigator", "officer"] },
];

/** role นี้เข้าถึง path นี้ได้ไหม — เจอ rule แรกที่ prefix ตรงเป็นตัวตัดสิน */
export function canAccess(role: string | undefined, path: string): boolean {
  const rule = RULES.find((r) => path.startsWith(r.prefix));
  if (!rule) return true; // ไม่มีข้อจำกัด = เข้าได้ทุก role ที่ล็อกอิน
  return !!role && rule.roles.includes(role as Role);
}

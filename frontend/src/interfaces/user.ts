// ── User interfaces ─────────────────────────────────────

export type Role = "admin" | "investigator" | "officer" | "viewer";

export interface User {
  user_id: string;
  username: string;
  email: string;
  full_name: string;
  badge_number: string;
  rank: string;
  department: string;
  role: Role;
  profile_image_url?: string;
  is_active: boolean;
}

/** payload สำหรับสร้างผู้ใช้ใหม่ (POST /api/users) */
export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  full_name?: string;
  rank?: string;
  department?: string;
  badge_number?: string;
  role: string;
  supervisor_id?: string | null;
}

/** payload แก้ไขผู้ใช้ (PUT /api/users/{user_id}) — ส่งเฉพาะ field ที่จะแก้
 *  ไม่ส่ง = ไม่แก้ · ส่ง null = ล้างค่า (backend ใช้ exclude_unset แยกสองกรณีนี้) */
export interface UpdateUserInput {
  full_name?: string;
  rank?: string;
  department?: string;
  badge_number?: string;
  profile_image_url?: string;
  role?: string;
  is_active?: boolean;
  supervisor_id?: string | null;
}

/** ผู้ใช้แบบย่อสำหรับ dropdown เลือกผู้รับผิดชอบ (GET /api/users/selectable)
 *  ทุก role เรียกได้ — จึงมีเฉพาะ field ที่ไม่อ่อนไหว (ไม่มี email/role/is_active) */
export interface SelectableUser {
  user_id: string;
  username: string;
  full_name?: string | null;
  rank?: string | null;
  supervisor_id?: string | null;
}

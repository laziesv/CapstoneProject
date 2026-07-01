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
}

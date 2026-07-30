// ── Auth / session interfaces ───────────────────────────

/** user ที่ backend ส่งกลับ (ตาม UserResponse) */
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
  // สายบังคับบัญชา — supervisor_username backend คำนวณให้ ไม่ต้อง join เอง
  supervisor_id?: string | null;
  supervisor_username?: string | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface ChangePasswordInput {
  current_password: string;
  new_password: string;
}

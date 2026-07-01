// ── User service ────────────────────────────────────────
// interface สำหรับ endpoint กลุ่ม /api/users (admin เท่านั้น)

import { request } from "./client";
import type { AuthUser, CreateUserInput } from "@/interfaces";

export const userService = {
  /** รายชื่อผู้ใช้ทั้งหมด */
  list(): Promise<AuthUser[]> {
    return request<AuthUser[]>("/api/users");
  },

  /** สร้างผู้ใช้ใหม่ (โยน ApiError เมื่อ username/email ซ้ำ หรือรหัสไม่ผ่าน) */
  create(input: CreateUserInput): Promise<AuthUser> {
    return request<AuthUser>("/api/users", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};

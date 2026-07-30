// ── Auth service ────────────────────────────────────────
// interface สำหรับ endpoint กลุ่ม /api/auth/*

import { setSession } from "@/utils/session";
import type { AuthUser, LoginResponse } from "@/interfaces";
import { request, publicRequest } from "./client";

export const authService = {
  /** login → เก็บ session แล้วคืน user (โยน ApiError เมื่อ credentials ผิด) */
  async login(username: string, password: string): Promise<AuthUser> {
    const data = await publicRequest<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setSession(data.access_token, data.user);
    return data.user;
  },

  /** ดึง user ปัจจุบันจาก token (ใช้ตรวจว่า token ยังใช้ได้) */
  me(): Promise<AuthUser> {
    return request<AuthUser>("/api/auth/me");
  },

  /** เปลี่ยนรหัสผ่าน (โยน ApiError เมื่อรหัสเดิมผิด/รหัสใหม่ไม่ผ่านเงื่อนไข) */
  changePassword(current_password: string, new_password: string): Promise<void> {
    return request<void>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    });
  },
};

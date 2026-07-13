// ── User service ────────────────────────────────────────
// interface สำหรับ endpoint กลุ่ม /api/users (admin เท่านั้น)
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │ endpoint เพิ่มเติมที่ backend ต้องทำ (สายบังคับบัญชา)                   │
// ├──────────────────────────────────────────────────────────────────────┤
// │ GET   /api/users/supervisors → Record<username, supervisor|null>     │
// │ PATCH /api/users/{username}/supervisor  body = { supervisor }        │
// │       แนะนำ: เก็บเป็นคอลัมน์ users.supervisor_id (FK → users)         │
// └──────────────────────────────────────────────────────────────────────┘

import { request } from "./client";
import type { AuthUser, CreateUserInput } from "@/interfaces";
import { getSupervisorMap, setSupervisor } from "@/utils/hierarchyStore";

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

  // ── สายบังคับบัญชา (mock — hierarchyStore/localStorage) ──
  // TODO(backend): เปลี่ยนเป็น request() เมื่อมีคอลัมน์ users.supervisor_id

  /** mapping username → หัวหน้า (supervisor username) */
  async getSupervisorMap(): Promise<Record<string, string | null>> {
    return getSupervisorMap();
  },

  /** ตั้ง/แก้หัวหน้าของ username (ค่าว่าง/null = ไม่มีหัวหน้า) */
  async setSupervisor(username: string, supervisor: string | null): Promise<void> {
    setSupervisor(username, supervisor);
  },
};

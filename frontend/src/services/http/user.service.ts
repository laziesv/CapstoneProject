// ── User service ────────────────────────────────────────
// เชื่อมกับ API จริงทั้งหมดแล้ว (สายบังคับบัญชาเลิกใช้ localStorage แล้ว)
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │ GET  /api/users              → AuthUser[]        (admin เท่านั้น)     │
// │ POST /api/users              → AuthUser          (admin เท่านั้น)     │
// │ PUT  /api/users/{user_id}    → AuthUser          (admin เท่านั้น)     │
// │      partial update — ส่งเฉพาะ field ที่จะแก้                          │
// │ GET  /api/users/selectable   → SelectableUser[]  (ทุก role)          │
// └──────────────────────────────────────────────────────────────────────┘

import { request } from "./client";
import type {
  AuthUser,
  CreateUserInput,
  SelectableUser,
  UpdateUserInput,
} from "@/interfaces";

export const userService = {
  /** รายชื่อผู้ใช้ทั้งหมด (admin) */
  list(): Promise<AuthUser[]> {
    return request<AuthUser[]>("/api/users");
  },

  /** รายชื่อย่อสำหรับ dropdown — เรียกได้ทุก role */
  listSelectable(): Promise<SelectableUser[]> {
    return request<SelectableUser[]>("/api/users/selectable");
  },

  /** สร้างผู้ใช้ใหม่ (โยน ApiError เมื่อ username/email ซ้ำ หรือรหัสไม่ผ่าน) */
  create(input: CreateUserInput): Promise<AuthUser> {
    return request<AuthUser>("/api/users", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  /** แก้ไขผู้ใช้ (โยน ApiError เมื่อสายบังคับบัญชาวนซ้ำ หรือ admin แก้บัญชีตัวเองจนล็อกออก) */
  update(userId: string, input: UpdateUserInput): Promise<AuthUser> {
    return request<AuthUser>(`/api/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  /** ตั้ง/แก้หัวหน้า (null = ไม่มีหัวหน้า) */
  setSupervisor(userId: string, supervisorId: string | null): Promise<AuthUser> {
    return this.update(userId, { supervisor_id: supervisorId });
  },

  /** mapping user_id → user_id ของหัวหน้า สำหรับคำนวณสิทธิ์เห็นคดี
   *  ใช้ /selectable เพราะทุก role ต้องเรียกได้ (ไม่ใช่แค่ admin) */
  async getSupervisorMap(): Promise<Record<string, string | null>> {
    const users = await this.listSelectable();
    const map: Record<string, string | null> = {};
    for (const u of users) map[u.user_id] = u.supervisor_id ?? null;
    return map;
  },
};

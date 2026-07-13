// ── Case service ────────────────────────────────────────
// สัญญา (contract) สำหรับ endpoint กลุ่ม /api/cases
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ endpoint ที่ backend ต้องทำ                                          │
// ├─────────────────────────────────────────────────────────────────────┤
// │ GET  /api/cases           → Case[]                                  │
// │      scope ตามสายบังคับบัญชา: admin = ทั้งหมด, อื่นๆ = คดีที่ตัวเอง   │
// │      เป็น created_by/assigned_officer + ของลูกน้อง (ดู caseAccess.ts)│
// │ GET  /api/cases/{id}      → Case (403 ถ้านอก scope, 404 ถ้าไม่มี)    │
// │ POST /api/cases           → Case  body = NewCaseInput               │
// │      เฉพาะยศชั้นสัญญาบัตร (canCreateCase) — admin สร้างไม่ได้        │
// │      server สร้าง case_id, case_number (CASE-{year}-{seq}),         │
// │      created_at ให้เอง                                              │
// └─────────────────────────────────────────────────────────────────────┘
//
// สถานะปัจจุบัน: mock — ใช้ caseStore (localStorage) ระหว่างที่ backend ยังไม่มี
// TODO(backend): เมื่อ endpoint พร้อม เปลี่ยน implementation เป็น request() เช่น
//   list:   () => request<Case[]>("/api/cases")
//   get:    (id) => request<Case>(`/api/cases/${id}`)
//   create: (input) => request<Case>("/api/cases", { method: "POST", body: JSON.stringify(input) })

import type { Case, NewCaseInput } from "@/interfaces";
import { getCases, addCase } from "@/utils/caseStore";

export const caseService = {
  /** คดีทั้งหมดใน scope ของผู้ใช้ (ใหม่สุดอยู่บน) */
  async list(): Promise<Case[]> {
    return getCases();
  },

  /** คดีตาม id (undefined ถ้าไม่พบ) */
  async get(id: string): Promise<Case | undefined> {
    return getCases().find((c) => c.case_id === id);
  },

  /** สร้างคดีใหม่ แล้วคืนคดีที่สร้าง (พร้อม case_id/case_number ที่ระบบออกให้) */
  async create(input: NewCaseInput): Promise<Case> {
    return addCase(input);
  },
};

// ── Case service ────────────────────────────────────────
// เชื่อมกับ API จริงแล้ว (ไม่ใช่ mock)
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ endpoint ที่ backend มีอยู่ตอนนี้                                     │
// ├─────────────────────────────────────────────────────────────────────┤
// │ GET  /api/cases           → CaseApiResponse[]                       │
// │ GET  /api/cases/{id}      → CaseApiResponse (404 ถ้าไม่มี)           │
// │ POST /api/cases           → CaseApiResponse                         │
// │      body = { title, description?, location?, incident_date?,       │
// │               assigned_officer? (UUID) }                            │
// │      server ออก case_id / case_number / created_at ให้เอง            │
// │      created_by มาจาก token (ไม่ต้องส่ง)                             │
// └─────────────────────────────────────────────────────────────────────┘
//
// ── ช่องว่างที่ยังเหลือ (ต้องคุยกับทีม backend) ─────────────────────────
// 1. TODO(backend): GET /api/cases ยัง "ไม่มี" การกรองตามสิทธิ์เลย —
//    คืนคดีทั้งหมดให้ทุกคน และไม่ต้อง auth ด้วยซ้ำ ตอนนี้ frontend กรองเองใน
//    caseAccess.ts ซึ่งเป็นแค่การซ่อน UI ไม่ใช่ security จริง
//    ที่ถูกคือ server ต้อง scope ตามผู้ใช้ใน token
// 2. TODO(backend): assigned_officer เป็น UUID คนเดียว แต่ frontend รองรับหลายคน
//    ตอนนี้จึงส่งได้แค่คนเดียว และรับมาแปลงเป็น array 1 สมาชิก
//    ต้องแก้เป็น many-to-many (ตาราง case_assignees) ถึงจะครบตามที่ออกแบบไว้
// 3. TODO(backend): ไม่มี evidence_count ใน response — หน้าคดีจึงนับจากฝั่ง
//    evidence service (ยัง mock) แทน

import type { Case, NewCaseInput, CaseApiResponse } from "@/interfaces";
import { ApiError, request } from "./client";

const pendingCaseReads = new Map<string, Promise<CaseApiResponse>>();

function sharedCaseRead(path: string): Promise<CaseApiResponse> {
  const pending = pendingCaseReads.get(path);
  if (pending) return pending;

  const next = request<CaseApiResponse>(path).finally(() => {
    if (pendingCaseReads.get(path) === next) pendingCaseReads.delete(path);
  });
  pendingCaseReads.set(path, next);
  return next;
}

/** ตรวจว่าเป็น UUID จริงไหม — ใช้คัดว่าค่าที่ส่งมาใช้กับ backend ได้หรือไม่ */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** แปลงรูปแบบของ backend → รูปแบบที่ frontend ใช้ทั้งระบบ
 *  จุดเดียวที่รู้เรื่องความต่างของสอง schema — หน้าอื่นไม่ต้องรับรู้ */
function toCase(dto: CaseApiResponse): Case {
  return {
    case_id: dto.case_id,
    case_number: dto.case_number,
    title: dto.title,
    description: dto.description ?? "",
    created_by: dto.created_by,
    // backend มีผู้รับผิดชอบได้คนเดียว → ห่อเป็น array ให้เข้ากับ frontend
    assigned_officers: dto.assigned_officer ? [dto.assigned_officer] : [],
    incident_date: dto.incident_date ?? "",
    location: dto.location ?? "",
    created_at: dto.created_at,
  };
}

export const caseService = {
  /** คดีทั้งหมด (ใหม่สุดอยู่บน) */
  async list(): Promise<Case[]> {
    const data = await request<CaseApiResponse[]>("/api/cases");
    return data
      .map(toCase)
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  },

  /** คดีตาม id (undefined ถ้าไม่พบ)
   *  404 = ไม่มีคดีนี้ · 422 = id ไม่ใช่รูปแบบ UUID (เช่นข้อมูล mock เก่าอย่าง "c-001")
   *  ทั้งสองกรณีแปลว่า "หาไม่เจอ" — คืน undefined ให้หน้าเว็บจัดการ ไม่ปล่อยให้ throw จนหน้าพัง */
  async get(id: string): Promise<Case | undefined> {
    try {
      const path = `/api/cases/${encodeURIComponent(id)}`;
      return toCase(await sharedCaseRead(path));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 422)) return undefined;
      throw e;
    }
  },

  /** สร้างคดีใหม่ แล้วคืนคดีที่สร้าง (พร้อม case_id/case_number ที่ระบบออกให้) */
  async create(input: NewCaseInput): Promise<Case> {
    // backend รับ assigned_officer เป็น UUID ได้คนเดียว — ส่งคนแรกไป
    // TODO(backend): รองรับผู้รับผิดชอบหลายคน (ตาราง case_officers) แล้วเลิกตัดทิ้ง
    const assigned = input.assigned_officers.find((o) => UUID_RE.test(o)) ?? null;

    const dto = await request<CaseApiResponse>("/api/cases", {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        description: input.description || null,
        location: input.location || null,
        incident_date: input.incident_date || null,
        assigned_officer: assigned,
      }),
    });
    return toCase(dto);
  },
};

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
// │               assigned_officers?: UUID[] }                          │
// │      server ออก case_id / case_number / created_at ให้เอง            │
// │      created_by มาจาก token (ไม่ต้องส่ง)                             │
// │ PUT  /api/cases/{case_id} → CaseApiResponse (investigator)          │
// │      assigned_officers ต้องมีคนเดิมครบ — เพิ่มได้ ถอดออกไม่ได้ (400)   │
// └─────────────────────────────────────────────────────────────────────┘
//
// ── ช่องว่างที่ยังเหลือ (ต้องคุยกับทีม backend) ─────────────────────────
// TODO(backend): ไม่มี evidence_count ใน response — หน้าคดีจึงนับจากฝั่ง
//   evidence service แทน
//
// (ปิดไปแล้ว) GET /api/cases กรองตามสิทธิ์ฝั่งเซิร์ฟเวอร์แล้ว
// (ปิดไปแล้ว) ผู้รับผิดชอบหลายคนใช้ตาราง case_assignees แล้ว
//   ซึ่งให้สิทธิ์ถาวร ไม่หลุดเมื่อย้ายหัวหน้า

import type { Case, NewCaseInput, CaseApiResponse, UpdateCaseInput } from "@/interfaces";
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
    creator: dto.creator ?? null,
    // ผู้รับผิดชอบหลายคน มาจากตาราง case_assignees
    // dto.assigned_officer คือ "ผู้รับผิดชอบหลัก" ซึ่งอยู่ในรายชื่อนี้อยู่แล้ว
    // (?? สำหรับข้อมูลจาก backend รุ่นเก่าที่ยังไม่มี field นี้)
    assigned_officers: dto.assigned_officers
      ?? (dto.assigned_officer ? [dto.assigned_officer] : []),
    assignees: dto.assignees ?? [],
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
    // ส่งผู้รับผิดชอบครบทุกคน — backend เก็บลงตาราง case_assignees
    // และให้สิทธิ์ถาวรกับทุกคนในรายชื่อ ไม่ขึ้นกับสายบังคับบัญชาภายหลัง
    const assigned = input.assigned_officers.filter((o) => UUID_RE.test(o));

    const dto = await request<CaseApiResponse>("/api/cases", {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        description: input.description || null,
        location: input.location || null,
        incident_date: input.incident_date || null,
        assigned_officers: assigned,
      }),
    });
    return toCase(dto);
  },

  /** แก้รายละเอียดคดีและเพิ่มผู้รับผิดชอบ แล้วคืนคดีที่อัปเดตแล้ว */
  async update(caseId: string, input: UpdateCaseInput): Promise<Case> {
    const dto = await request<CaseApiResponse>(`/api/cases/${encodeURIComponent(caseId)}`, {
      method: "PUT",
      body: JSON.stringify({
        title: input.title,
        description: input.description || null,
        location: input.location || null,
        incident_date: input.incident_date || null,
        assigned_officers: input.assigned_officers.filter((o) => UUID_RE.test(o)),
      }),
    });
    return toCase(dto);
  },
};

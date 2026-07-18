// ── Case store (mock, localStorage) ─────────────────────
// เก็บคดีฝั่ง client เพื่อให้ "สร้างคดี" แล้วเห็นผลจริงในลิสต์ (persist ข้าม refresh)
// seed จาก mockCases ครั้งแรก
// TODO(backend): เมื่อมี GET/POST /api/cases ให้เปลี่ยนไปเรียก caseService แทน store นี้

import type { Case, NewCaseInput } from "@/interfaces";
import { mockCases } from "@/utils/mockData";

const STORAGE_KEY = "deva_cases";

/** รูปแบบข้อมูลเก่าที่อาจค้างใน localStorage (ก่อน schema ปัจจุบัน) */
type LegacyCase = Partial<Case> & {
  assigned_officer?: string; // เดิมเป็นผู้รับผิดชอบคนเดียว
  status?: string;           // เดิมมีสถานะคดี (ถอดออกแล้ว)
};

/**
 * ปรับข้อมูลที่ค้างใน localStorage ให้เข้ากับ schema ปัจจุบัน
 * จำเป็นเพราะ localStorage ไม่ถูก type-check ตอนรัน — ข้อมูลที่ seed ไว้ก่อนหน้า
 * จะไม่มี field ใหม่ ทำให้โค้ดที่คาดว่ามี field นั้นพังได้
 */
function migrate(items: LegacyCase[]): Case[] {
  return items.map((item) => {
    const { assigned_officer, status, ...rest } = item;
    void status; // สถานะคดีถูกถอดออกจาก schema แล้ว — ทิ้งไป
    return {
      ...rest,
      // เดิมเป็นคนเดียว → แปลงเป็น array; ไม่มีเลย → array ว่าง
      assigned_officers: rest.assigned_officers ?? (assigned_officer ? [assigned_officer] : []),
    } as Case;
  });
}

function read(): Case[] {
  if (typeof window === "undefined") return mockCases;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mockCases));
      return mockCases;
    }

    const migrated = migrate(JSON.parse(raw) as LegacyCase[]);

    // เขียนกลับเมื่อรูปแบบเปลี่ยนจริง เพื่อให้ migrate ทำงานครั้งเดียวพอ
    const next = JSON.stringify(migrated);
    if (next !== raw) window.localStorage.setItem(STORAGE_KEY, next);

    return migrated;
  } catch {
    return mockCases;
  }
}

function write(cases: Case[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
  } catch {
    // localStorage เต็ม/ถูกปิด — ข้าม (mock เท่านั้น)
  }
}

/** คดีทั้งหมด (ใหม่สุดอยู่บน) */
export function getCases(): Case[] {
  return [...read()].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}

/** สร้างคดีใหม่ต่อท้าย store แล้วคืนคดีที่สร้าง */
export function addCase(input: NewCaseInput): Case {
  const cases = read();
  const year = new Date().getFullYear();
  const seq = String(cases.length + 1).padStart(4, "0");
  const newCase: Case = {
    case_id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `c-${Date.now()}`,
    case_number: `CASE-${year}-${seq}`,
    title: input.title,
    description: input.description,
    created_by: input.created_by,
    assigned_officers: input.assigned_officers,
    incident_date: input.incident_date,
    location: input.location,
    created_at: new Date().toISOString(),
    evidence_count: 0,
  };
  write([...cases, newCase]);
  return newCase;
}

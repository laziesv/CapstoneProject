// ── Case store (mock, localStorage) ─────────────────────
// เก็บคดีฝั่ง client เพื่อให้ "สร้างคดี" แล้วเห็นผลจริงในลิสต์ (persist ข้าม refresh)
// seed จาก mockCases ครั้งแรก
// TODO(backend): เมื่อมี GET/POST /api/cases ให้เปลี่ยนไปเรียก caseService แทน store นี้

import type { Case, CaseStatus } from "@/interfaces";
import { mockCases } from "@/utils/mockData";

const STORAGE_KEY = "deva_cases";

function read(): Case[] {
  if (typeof window === "undefined") return mockCases;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mockCases));
      return mockCases;
    }
    return JSON.parse(raw) as Case[];
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

export interface NewCaseInput {
  title: string;
  description: string;
  status: CaseStatus;
  location: string;
  incident_date: string;
  created_by: string;
  assigned_officer: string;
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
    status: input.status,
    created_by: input.created_by,
    assigned_officer: input.assigned_officer,
    incident_date: input.incident_date,
    location: input.location,
    created_at: new Date().toISOString(),
    evidence_count: 0,
  };
  write([...cases, newCase]);
  return newCase;
}

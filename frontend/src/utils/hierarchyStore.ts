// ── สายบังคับบัญชา (mock, localStorage) ─────────────────
// เก็บ mapping username → หัวหน้า (supervisor username) ฝั่ง client
// seed จาก mockUsers ครั้งแรก แล้วให้หน้า Manage Users ตั้ง/แก้ได้
// TODO(backend): ย้ายไปคอลัมน์ users.supervisor_id เมื่อ backend รองรับ

import { mockUsers } from "@/utils/mockData";

const STORAGE_KEY = "deva_supervisors";

function seed(): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  for (const u of mockUsers) map[u.username] = u.supervisor;
  return map;
}

export function getSupervisorMap(): Record<string, string | null> {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const s = seed();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      return s;
    }
    return JSON.parse(raw) as Record<string, string | null>;
  } catch {
    return seed();
  }
}

export function getSupervisor(username: string): string | null {
  return getSupervisorMap()[username] ?? null;
}

/** ตั้ง/แก้หัวหน้าของ username (ค่าว่าง = ไม่มีหัวหน้า) */
export function setSupervisor(username: string, supervisor: string | null) {
  if (typeof window === "undefined") return;
  const map = getSupervisorMap();
  map[username] = supervisor || null;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage เต็ม/ถูกปิด — ข้าม (mock เท่านั้น)
  }
}

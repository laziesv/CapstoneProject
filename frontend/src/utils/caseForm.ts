// ── ตัวช่วยฟอร์มแก้คดี ─────────────────────────────────
// แยกออกจากหน้าเพื่อให้เทสต์ได้โดยไม่ต้อง render React
// (ไม่ import ไฟล์อื่นแบบ runtime เพราะ node:test ไม่รู้จัก alias "@/")

import type { SelectableUser } from "@/interfaces";

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO → "YYYY-MM-DDTHH:mm" ตามเวลาท้องถิ่น สำหรับ <input type="datetime-local">
 *  ค่าว่างหรือแปลงไม่ได้คืน "" */
export function toDateTimeLocal(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** คนที่เพิ่มเป็นผู้รับผิดชอบได้ — อยู่ในขอบเขตที่มอบหมายได้ และยังไม่ได้ถูกมอบหมาย
 *
 *  `allowedIds` = ตัวเอง + ผู้ใต้บังคับบัญชาทุกชั้น (ได้จาก subordinatesOf)
 *  ตรงกับเงื่อนไข _validate_assignees ฝั่ง backend */
export function assignableOptions(
  allowedIds: string[],
  allUsers: SelectableUser[],
  alreadyAssigned: string[],
): SelectableUser[] {
  return allUsers.filter((u) => allowedIds.includes(u.user_id) && !alreadyAssigned.includes(u.user_id));
}

// ── สิทธิ์คดี ตามยศ + ลำดับบังคับบัญชา ──────────────────
// ตรรกะสิทธิ์ฝั่ง client รวมที่ไฟล์นี้ที่เดียว — แก้เกณฑ์ได้ที่นี่
// TODO(backend): ให้ /api/cases กรองตามสิทธิ์เอง แล้วลบตรรกะนี้ทิ้ง
//                การกรองฝั่ง client คือ "ซ่อน UI" ไม่ใช่การรักษาความปลอดภัย

import type { Case } from "@/interfaces";

// ยศตำรวจไทย เรียงจากสูง → ต่ำ (index น้อย = ยศสูง)
export const POLICE_RANKS = [
  // ชั้นสัญญาบัตร
  "พลตำรวจเอก",
  "พลตำรวจโท",
  "พลตำรวจตรี",
  "พันตำรวจเอก",
  "พันตำรวจโท",
  "พันตำรวจตรี",
  "ร้อยตำรวจเอก",
  "ร้อยตำรวจโท",
  "ร้อยตำรวจตรี",
  // ชั้นประทวน
  "ดาบตำรวจ",
  "จ่าสิบตำรวจ",
  "สิบตำรวจเอก",
  "สิบตำรวจโท",
  "สิบตำรวจตรี",
  "พลตำรวจ",
] as const;

// เกณฑ์ "ยศสูงพอจะสร้างคดีได้" = ชั้นสัญญาบัตร (ตั้งแต่ ร้อยตำรวจตรี ขึ้นไป)
const COMMISSIONED_MAX_INDEX = POLICE_RANKS.indexOf("ร้อยตำรวจตรี");

/** ระดับยศเป็น index ใน POLICE_RANKS (ไม่พบ = -1) — index น้อย = ยศสูงกว่า */
export function rankLevel(rank?: string | null): number {
  if (!rank) return -1;
  return POLICE_RANKS.indexOf(rank as (typeof POLICE_RANKS)[number]);
}

/** ยศอยู่ในชั้นสัญญาบัตรหรือไม่ (สร้างคดีได้) */
export function canCreateByRank(rank?: string | null): boolean {
  const idx = rankLevel(rank);
  return idx >= 0 && idx <= COMMISSIONED_MAX_INDEX;
}

interface AccessUser {
  username?: string;
  user_id?: string;
  role?: string;
  rank?: string | null;
}

/** สร้างคดีได้เมื่อ: ไม่ใช่ admin และยศถึงชั้นสัญญาบัตร */
export function canCreateCase(user?: AccessUser | null): boolean {
  if (!user || user.role === "admin") return false;
  return canCreateByRank(user.rank);
}

/** mapping user_id → user_id ของหัวหน้า (null = ไม่มีหัวหน้า)
 *  โหลดผ่าน `userService.getSupervisorMap()` ซึ่งดึงจาก /api/users/selectable */
export type SupervisorMap = Record<string, string | null>;

/** user_id ผู้ใต้บังคับบัญชาทั้งหมด (รวมลูกน้องของลูกน้อง) ของ user_id ที่ให้
 *
 *  ใช้ user_id ไม่ใช่ username เพราะคดีจาก API อ้างผู้ใช้ด้วย UUID —
 *  ถ้าใช้ username จะเทียบกับ created_by ไม่ติด */
export function subordinatesOf(userId?: string, map: SupervisorMap = {}): string[] {
  if (!userId) return [];
  const result: string[] = [];
  const walk = (boss: string) => {
    for (const [id, supervisor] of Object.entries(map)) {
      // เช็ค !includes กันลูปค้างถ้าข้อมูลมีวงจร (backend กันไว้แล้วอีกชั้น)
      if (supervisor === boss && !result.includes(id)) {
        result.push(id);
        walk(id);
      }
    }
  };
  walk(userId);
  return result;
}

/** เห็นคดีนี้ได้หรือไม่: admin เห็นทุกคดี; ไม่งั้นต้องเป็นคดีของตัวเองหรือของลูกน้อง
 *  ไม่ส่ง map มา = เห็นเฉพาะคดีของตัวเอง (ปลอดภัยกว่าเมื่อยังโหลดไม่เสร็จ) */
export function canSeeCase(
  user: AccessUser | null | undefined,
  c: Case,
  map: SupervisorMap = {}
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const scope = [user.user_id, ...subordinatesOf(user.user_id, map)].filter(Boolean);
  return scope.includes(c.created_by) || (c.assigned_officers ?? []).some((o) => scope.includes(o));
}

/** กรองเฉพาะคดีที่ผู้ใช้เห็นได้ */
export function visibleCases(
  user: AccessUser | null | undefined,
  cases: Case[],
  map: SupervisorMap = {}
): Case[] {
  return cases.filter((c) => canSeeCase(user, c, map));
}

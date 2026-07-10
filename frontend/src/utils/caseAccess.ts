// ── สิทธิ์คดี ตามยศ + ลำดับบังคับบัญชา ──────────────────
// ตรรกะสิทธิ์ทั้งหมด (frontend/mock) รวมที่ไฟล์นี้ที่เดียว — แก้เกณฑ์ได้ที่นี่
// TODO(backend): เมื่อมี /api/cases + authz ฝั่ง server ให้ย้ายการบังคับสิทธิ์ไป backend

import type { Case } from "@/interfaces";
import { getSupervisorMap } from "@/utils/hierarchyStore";

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
  role?: string;
  rank?: string | null;
}

/** สร้างคดีได้เมื่อ: ไม่ใช่ admin และยศถึงชั้นสัญญาบัตร */
export function canCreateCase(user?: AccessUser | null): boolean {
  if (!user || user.role === "admin") return false;
  return canCreateByRank(user.rank);
}

/** รายชื่อ username ผู้ใต้บังคับบัญชาทั้งหมด (transitive) ของ username ที่ให้
 *  อ่านสายบังคับบัญชาจาก hierarchyStore (ตั้งค่าได้ในหน้า Manage Users) */
export function subordinatesOf(username?: string): string[] {
  if (!username) return [];
  const map = getSupervisorMap();
  const result: string[] = [];
  const walk = (boss: string) => {
    for (const [u, supervisor] of Object.entries(map)) {
      if (supervisor === boss && !result.includes(u)) {
        result.push(u);
        walk(u);
      }
    }
  };
  walk(username);
  return result;
}

/** เห็นคดีนี้ได้หรือไม่: admin เห็นทุกคดี; ไม่งั้นต้องเป็นคดีของตัวเองหรือของลูกน้อง */
export function canSeeCase(user: AccessUser | null | undefined, c: Case): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const scope = [user.username, ...subordinatesOf(user.username)].filter(Boolean);
  return scope.includes(c.created_by) || scope.includes(c.assigned_officer);
}

/** กรองเฉพาะคดีที่ผู้ใช้เห็นได้ */
export function visibleCases(user: AccessUser | null | undefined, cases: Case[]): Case[] {
  return cases.filter((c) => canSeeCase(user, c));
}

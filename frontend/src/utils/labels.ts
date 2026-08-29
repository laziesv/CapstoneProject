/** ป้ายภาษาไทยที่ใช้ร่วมกันหลายหน้า — รวมไว้ที่เดียวกันเพื่อไม่ให้ map ซ้ำ/เพี้ยนกัน
 *  (ก่อนหน้านี้ actionLabel ซ้ำใน logs/evidence และ roleLabel ซ้ำใน users/profile) */

/** ประเภทการเข้าถึง (AccessLog.action) */
export const actionLabel: Record<string, string> = {
  view: "เปิดดู",
  download: "ดาวน์โหลด",
  upload: "อัปโหลด",
  query: "ค้นหา",
  verify: "ตรวจลายน้ำ",
  print: "พิมพ์",
  export: "ส่งออก",
  share: "แชร์",
};
export const labelForAction = (a: string) => actionLabel[a] ?? a;

/** ผลลัพธ์การเข้าถึง (AccessLog.result) — คงความต่างของแต่ละสถานะ */
export const resultLabel: Record<string, string> = {
  success: "สำเร็จ",
  denied: "ถูกปฏิเสธ",
  unauthorized: "ไม่มีสิทธิ์",
  failed: "ล้มเหลว",
};
export const labelForResult = (r: string) => resultLabel[r] ?? r;

/** สิทธิ์ผู้ใช้ (AuthUser.role) */
export const roleLabel: Record<string, string> = {
  admin: "ผู้ดูแลระบบ",
  investigator: "พนักงานสืบสวน",
  officer: "เจ้าหน้าที่",
  viewer: "ผู้ชม",
};
export const labelForRole = (r?: string | null) => (r ? roleLabel[r] ?? r : "—");

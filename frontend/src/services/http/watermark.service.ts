// ── Watermark service ───────────────────────────────────
// สัญญา (contract) สำหรับ endpoint ตรวจสอบ/แกะลายน้ำ (admin เท่านั้น)
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │ endpoint ที่ backend ต้องทำ (ทีม watermark ทำ logic)                   │
// ├──────────────────────────────────────────────────────────────────────┤
// │ POST /api/watermark/verify  → VerifyResult                           │
// │      body = multipart (image file)                                   │
// │      admin only — การแกะลายน้ำเปิดเผยข้อมูลฝังในหลักฐาน               │
// │      (officer/เวลา/พิกัด) จึงจำกัดเฉพาะผู้ดูแลระบบ                     │
// └──────────────────────────────────────────────────────────────────────┘
//
// สถานะปัจจุบัน: mock — คืนผลจำลองหลัง delay (logic แกะลายน้ำจริงรอทีมที่รับผิดชอบ)
// TODO(backend): เปลี่ยนเป็น request() + FormData เมื่อ endpoint พร้อม

import type { VerifyResult } from "@/interfaces";

export const watermarkService = {
  /** แกะลายน้ำจากภาพ แล้วคืนข้อมูลที่ฝังไว้ + ผลตรวจ tampering */
  async verify(file: File): Promise<VerifyResult> {
    // mock: จำลองเวลาวิเคราะห์ — ไฟล์ยังไม่ถูกใช้จริง
    void file;
    await new Promise((resolve) => setTimeout(resolve, 2500));
    return {
      matchPercent: 98.7,
      officerId: "OFF-2847",
      officerName: "ร.ต.อ.สมชาย แก้วมณี",
      timestamp: "2026-04-15 14:32:07",
      gps: "13.7563°N, 100.5018°E",
      staticWm: true,
      dynamicWm: true,
      tampered: false,
    };
  },
};

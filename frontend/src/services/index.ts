// ── Services barrel ─────────────────────────────────────
// import รวมที่เดียว: import { authService, caseService, ... } from "@/services"
// ส่วน type/DTO ทั้งหมด import จาก "@/interfaces"
//
// ทุกไฟล์ใน http/ คือ "สัญญา endpoint" สำหรับ backend — เปิดอ่าน header comment
// ของแต่ละไฟล์จะเห็น METHOD/path/payload/response ที่ต้อง implement

export { authService } from "./http/auth.service";
export { dashboardService } from "./http/dashboard.service";
export { userService } from "./http/user.service";
export { caseService } from "./http/case.service";
export { evidenceService } from "./http/evidence.service";
export { accessLogService } from "./http/accessLog.service";
export { watermarkService } from "./http/watermark.service";
export { ApiError } from "./http/client";

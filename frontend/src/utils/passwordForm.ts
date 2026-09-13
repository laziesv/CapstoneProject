// ── ตรวจฟอร์มตั้งรหัสผ่านใหม่ ─────────────────────────────
// ใช้ร่วมกันระหว่างหน้าโปรไฟล์ (เปลี่ยนเอง) กับหน้าบังคับตั้งรหัสหลัง admin รีเซ็ต
// เงื่อนไขต้องตรงกับ ChangePasswordRequest ฝั่ง backend (min_length=8)

export const MIN_PASSWORD_LENGTH = 8;

/** คืนข้อความ error ภาษาไทย หรือ null เมื่อผ่าน */
export function validateNewPassword(next: string, confirm: string): string | null {
  if (next.length < MIN_PASSWORD_LENGTH) {
    return `รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`;
  }
  if (next !== confirm) {
    return "รหัสผ่านใหม่และยืนยันไม่ตรงกัน";
  }
  return null;
}

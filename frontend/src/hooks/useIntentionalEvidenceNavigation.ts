"use client";

import { useRouter } from "next/navigation";

import { useEvidenceViewSession } from "@/hooks/useEvidenceViewSession";

/** เปิดหลักฐานจากการกดโดยเจตนา — บันทึก VIEW ให้เสร็จก่อนค่อยเปลี่ยนหน้า
 *
 *  ตรรกะการบันทึกอยู่ใน useEvidenceViewSession ที่เดียว หน้า /evidence/[id]
 *  ใช้ตัวเดียวกันเป็นด่านสุดท้าย จึงไม่มีทางเข้าไหนที่เปิดหลักฐานได้โดยไม่บันทึก
 */
export function useIntentionalEvidenceNavigation() {
  const router = useRouter();
  const {
    recordView,
    rememberViewSuccess,
    pendingEvidenceId,
    status,
    delayed,
    error,
    dismissError,
  } = useEvidenceViewSession();

  /** evidenceId ใช้เรียก API (ต้องเป็น UUID) ส่วน displayRef ใช้ทำ URL ให้อ่านออก
   *  เช่น EV-20260910-B7E872 — ถ้าไม่ส่งมาจะกลับไปใช้ UUID */
  const openEvidence = async (evidenceId: string, displayRef?: string | null) => {
    // คง overlay ไว้ระหว่าง Next.js เปลี่ยนหน้า ไม่ให้กระพริบกลับมาที่รายการเดิม
    const session = await recordView(evidenceId, { keepBusyAfterSuccess: true });
    if (!session) return;
    // ฝากผลไว้ให้หน้าปลายทางรู้ว่าบันทึกแล้ว จะได้ไม่บันทึกซ้ำอีกรอบ
    rememberViewSuccess(session);
    router.push(`/evidence/${encodeURIComponent(displayRef || evidenceId)}`);
  };

  return {
    openEvidence,
    openingEvidenceId: pendingEvidenceId,
    openStatus: status,
    openDelayed: delayed,
    openError: error,
    dismissOpenError: dismissError,
  };
}

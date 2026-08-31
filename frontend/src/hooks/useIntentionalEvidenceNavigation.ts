"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError, evidenceService } from "@/services";


export function useIntentionalEvidenceNavigation() {
  const router = useRouter();
  const inProgress = useRef(false);
  const [openingEvidenceId, setOpeningEvidenceId] = useState<string>();
  const [openError, setOpenError] = useState<string>();

  const openEvidence = async (evidenceId: string) => {
    if (inProgress.current) return;
    inProgress.current = true;
    setOpeningEvidenceId(evidenceId);
    setOpenError(undefined);
    try {
      // การเปิดหลักฐานโดยเจตนา: บันทึก VIEW ให้สำเร็จก่อนเปลี่ยนหน้า
      // เพื่อไม่ให้ page mount, refresh หรือ image GET สร้างรายการซ้ำ
      await evidenceService.createViewSession(evidenceId);
      router.push(`/evidence/${evidenceId}`);
    } catch (cause) {
      setOpenError(viewSessionErrorMessage(cause));
    } finally {
      inProgress.current = false;
      setOpeningEvidenceId(undefined);
    }
  };

  return { openEvidence, openingEvidenceId, openError };
}


function viewSessionErrorMessage(cause: unknown): string {
  if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
    return "ไม่สามารถเปิดหลักฐานได้ กรุณาตรวจสอบสิทธิ์หรือเข้าสู่ระบบอีกครั้ง";
  }
  if (cause instanceof ApiError && cause.status === 503) {
    return "ไม่สามารถบันทึกการเปิดดูหลักฐานได้ในขณะนี้";
  }
  return "ไม่สามารถเปิดหลักฐานได้";
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { evidenceService } from "@/services";
import { userFacingApiError } from "@/utils/evidenceDownloadError";
import { createViewSessionAndRemember } from "@/utils/evidenceOperationFeedback";


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
      // การเชื่อมต่อ Blockchain: เก็บผล VIEW ที่ยืนยันแล้วไว้เพียงครั้งเดียว
      // เพื่อให้หน้าปลายทางแจ้งสำเร็จโดย refresh หรือ direct URL ไม่สร้างข้อความซ้ำ
      await createViewSessionAndRemember(
        evidenceId,
        evidenceService.createViewSession,
      );
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
  const feedback = userFacingApiError(cause);
  return `${feedback.title} ${feedback.message}`;
}

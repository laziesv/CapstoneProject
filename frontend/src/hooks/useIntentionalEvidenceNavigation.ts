"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError, evidenceService } from "@/services";
import { userFacingApiError } from "@/utils/evidenceDownloadError";
import {
  rememberViewSuccess,
  waitForConfirmedViewSession,
} from "@/utils/evidenceOperationFeedback";


export function useIntentionalEvidenceNavigation() {
  const router = useRouter();
  const inProgress = useRef(false);
  const [openingEvidenceId, setOpeningEvidenceId] = useState<string>();
  const [openError, setOpenError] = useState<string>();
  const [openStatus, setOpenStatus] = useState<
    "SUBMITTING" | "WAITING_FOR_BLOCKCHAIN" | "PENDING_BLOCKCHAIN_CONFIRMATION"
  >("SUBMITTING");

  const openEvidence = async (evidenceId: string) => {
    if (inProgress.current) return;
    inProgress.current = true;
    setOpeningEvidenceId(evidenceId);
    setOpenStatus("SUBMITTING");
    setOpenError(undefined);
    let navigationStarted = false;
    const requestKey = `deva_pending_view_${evidenceId}`;
    try {
      let requestId = window.sessionStorage.getItem(requestKey) ?? crypto.randomUUID();
      window.sessionStorage.setItem(requestKey, requestId);
      // การเชื่อมต่อ Blockchain: poll ด้วย session เดิมเพื่อไม่ broadcast VIEW ซ้ำ
      // และเปิดหน้าหลักฐานเฉพาะหลัง receipt ได้รับการยืนยันแล้ว
      const session = await waitForConfirmedViewSession(
        evidenceId,
        requestId,
        evidenceService.createViewSession,
        (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds)),
        (pendingSession) => {
          requestId = pendingSession.access_log_id;
          window.sessionStorage.setItem(requestKey, requestId);
          if (pendingSession.status !== "CONFIRMED") {
            setOpenStatus(pendingSession.status);
          }
        },
      );
      rememberViewSuccess(session);
      window.sessionStorage.removeItem(requestKey);
      navigationStarted = true;
      router.push(`/evidence/${evidenceId}`);
    } catch (cause) {
      if (cause instanceof ApiError) {
        window.sessionStorage.removeItem(requestKey);
      }
      setOpenError(viewSessionErrorMessage(cause));
    } finally {
      // คง progress ไว้ระหว่าง Next.js เปลี่ยนหน้า และปลดล็อกทันทีเฉพาะเมื่อคำขอล้มเหลว
      if (!navigationStarted) {
        inProgress.current = false;
        setOpeningEvidenceId(undefined);
      }
    }
  };

  return {
    openEvidence,
    openingEvidenceId,
    openStatus,
    openError,
    dismissOpenError: () => setOpenError(undefined),
  };
}


function viewSessionErrorMessage(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.code === "BLOCKCHAIN_NOT_SUBMITTED") {
      return "รายการเข้าดูยังไม่ถูกส่งไปยัง Blockchain กรุณาตรวจสอบการตั้งค่าหรือลองใหม่ภายหลัง";
    }
    if (cause.code === "BLOCKCHAIN_VIEW_REVERTED") {
      return "ธุรกรรมเข้าดูถูก Blockchain ปฏิเสธ และหลักฐานยังไม่ถูกเปิด";
    }
    if (cause.code === "BLOCKCHAIN_VIEW_FAILED") {
      return "ธุรกรรมเข้าดูไม่ผ่านการตรวจสอบยืนยัน และหลักฐานยังไม่ถูกเปิด";
    }
  }
  const feedback = userFacingApiError(cause);
  return `${feedback.title} ${feedback.message}`;
}

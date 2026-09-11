"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError, evidenceService } from "@/services";
import { useAuth } from "@/hooks/useAuth";
import { userFacingApiError } from "@/utils/evidenceDownloadError";
import {
  rememberViewSuccess,
  waitForConfirmedViewSession,
} from "@/utils/evidenceOperationFeedback";
import {
  synchronizeViewRequestUser,
  viewRequestStorageKey,
} from "@/utils/viewRequestIdentity";


export function useIntentionalEvidenceNavigation() {
  const router = useRouter();
  const { user } = useAuth();
  const inProgress = useRef(false);
  const unlockTimer = useRef<number | undefined>(undefined);
  const [openingEvidenceId, setOpeningEvidenceId] = useState<string>();
  const [openError, setOpenError] = useState<string>();
  const [openDelayed, setOpenDelayed] = useState(false);
  const [openStatus, setOpenStatus] = useState<
    "SUBMITTING" | "WAITING_FOR_BLOCKCHAIN" | "PENDING_BLOCKCHAIN_CONFIRMATION"
  >("SUBMITTING");

  /** evidenceId ใช้เรียก API (ต้องเป็น UUID) ส่วน displayRef ใช้ทำ URL ให้อ่านออก
   *  เช่น EV-20260910-B7E872 — ถ้าไม่ส่งมาจะกลับไปใช้ UUID */
  const openEvidence = async (evidenceId: string, displayRef?: string | null) => {
    if (inProgress.current) return;
    if (!user?.user_id) {
      setOpenError("ไม่พบผู้ใช้ที่เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่");
      return;
    }
    inProgress.current = true;
    setOpeningEvidenceId(evidenceId);
    setOpenStatus("SUBMITTING");
    setOpenDelayed(false);
    setOpenError(undefined);
    let navigationStarted = false;
    if (unlockTimer.current) {
      window.clearTimeout(unlockTimer.current);
    }
    unlockTimer.current = window.setTimeout(() => {
      inProgress.current = false;
      setOpeningEvidenceId(undefined);
      setOpenDelayed(false);
      setOpenError("การเปิดหลักฐานใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง");
    }, 150_000);
    synchronizeViewRequestUser(user.user_id);
    const requestKey = viewRequestStorageKey(user.user_id, evidenceId);
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
        () => setOpenDelayed(true),
      );
      rememberViewSuccess(session);
      window.sessionStorage.removeItem(requestKey);
      navigationStarted = true;
      if (unlockTimer.current) {
        window.clearTimeout(unlockTimer.current);
        unlockTimer.current = undefined;
      }
      router.push(`/evidence/${encodeURIComponent(displayRef || evidenceId)}`);
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
        if (unlockTimer.current) {
          window.clearTimeout(unlockTimer.current);
          unlockTimer.current = undefined;
        }
      }
    }
  };

  return {
    openEvidence,
    openingEvidenceId,
    openStatus,
    openDelayed,
    openError,
    dismissOpenError: () => setOpenError(undefined),
  };
}


function viewSessionErrorMessage(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.code === "BLOCKCHAIN_STALLED" || cause.code === "BLOCKCHAIN_UNAVAILABLE") {
      return "ไม่สามารถเปิดหลักฐานได้ในขณะนี้ เครือข่าย Blockchain ยังไม่พร้อมยืนยันรายการใหม่ กรุณาลองใหม่หลังเครือข่ายกลับมาทำงาน";
    }
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

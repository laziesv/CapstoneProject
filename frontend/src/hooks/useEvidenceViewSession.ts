"use client";

import { useCallback, useRef, useState } from "react";

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
import type { EvidenceViewSessionResponse } from "@/interfaces";

export type ViewSessionStatus =
  | "SUBMITTING"
  | "WAITING_FOR_BLOCKCHAIN"
  | "PENDING_BLOCKCHAIN_CONFIRMATION";

/** บันทึก VIEW ลง access log + Blockchain แล้วรอจนยืนยันสำเร็จ
 *
 *  แกนกลางที่ใช้ร่วมกันทุกทางเข้า เพื่อไม่ให้มีที่ใดเปิดหลักฐานได้โดยไม่บันทึก
 *  - กดจากรายการหลักฐาน → useIntentionalEvidenceNavigation (บันทึกก่อนเปลี่ยนหน้า)
 *  - เปิด URL ตรง / กดจากหน้าบันทึกการเข้าถึง / refresh → หน้ารายละเอียดเรียกเอง
 *
 *  requestId ถูกเก็บใน sessionStorage ระหว่างรอ เพื่อให้การเรียกซ้ำ (React Strict
 *  Mode, refresh ระหว่าง PENDING) ไปต่อกับรายการเดิม ไม่ broadcast VIEW ซ้ำ
 */
export function useEvidenceViewSession() {
  const { user } = useAuth();
  const inProgress = useRef(false);
  const unlockTimer = useRef<number | undefined>(undefined);
  const [pendingEvidenceId, setPendingEvidenceId] = useState<string>();
  const [status, setStatus] = useState<ViewSessionStatus>("SUBMITTING");
  const [delayed, setDelayed] = useState(false);
  const [error, setError] = useState<string>();

  const clearUnlockTimer = () => {
    if (unlockTimer.current) {
      window.clearTimeout(unlockTimer.current);
      unlockTimer.current = undefined;
    }
  };

  /** คืน session ที่ยืนยันแล้ว หรือ null เมื่อบันทึกไม่สำเร็จ (อ่านสาเหตุจาก error) */
  const recordView = useCallback(
    async (
      evidenceId: string,
      options: { keepBusyAfterSuccess?: boolean } = {},
    ): Promise<EvidenceViewSessionResponse | null> => {
      if (inProgress.current) return null;
      if (!user?.user_id) {
        setError("ไม่พบผู้ใช้ที่เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่");
        return null;
      }

      inProgress.current = true;
      setPendingEvidenceId(evidenceId);
      setStatus("SUBMITTING");
      setDelayed(false);
      setError(undefined);

      clearUnlockTimer();
      unlockTimer.current = window.setTimeout(() => {
        inProgress.current = false;
        setPendingEvidenceId(undefined);
        setDelayed(false);
        setError("การเปิดหลักฐานใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง");
      }, 150_000);

      synchronizeViewRequestUser(user.user_id);
      const requestKey = viewRequestStorageKey(user.user_id, evidenceId);
      let succeeded = false;
      try {
        let requestId =
          window.sessionStorage.getItem(requestKey) ?? createClientRequestId();
        window.sessionStorage.setItem(requestKey, requestId);
        const session = await waitForConfirmedViewSession(
          evidenceId,
          requestId,
          evidenceService.createViewSession,
          (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
          (pendingSession) => {
            requestId = pendingSession.access_log_id;
            window.sessionStorage.setItem(requestKey, requestId);
            if (pendingSession.status !== "CONFIRMED") {
              setStatus(pendingSession.status);
            }
          },
          () => setDelayed(true),
        );
        window.sessionStorage.removeItem(requestKey);
        succeeded = true;
        clearUnlockTimer();
        return session;
      } catch (cause) {
        if (cause instanceof ApiError) {
          window.sessionStorage.removeItem(requestKey);
        }
        setError(viewSessionErrorMessage(cause));
        return null;
      } finally {
        // ผู้เรียกที่กำลังจะเปลี่ยนหน้าขอให้คง overlay ไว้จนกว่าหน้าใหม่จะขึ้น
        if (!(succeeded && options.keepBusyAfterSuccess)) {
          inProgress.current = false;
          setPendingEvidenceId(undefined);
          clearUnlockTimer();
        }
      }
    },
    [user?.user_id],
  );

  return {
    recordView,
    rememberViewSuccess,
    pendingEvidenceId,
    status,
    delayed,
    error,
    dismissError: useCallback(() => setError(undefined), []),
  };
}

export function createClientRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const randomValues = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(randomValues);
  } else {
    for (let index = 0; index < randomValues.length; index += 1) {
      randomValues[index] = Math.floor(Math.random() * 256);
    }
  }

  randomValues[6] = (randomValues[6] & 0x0f) | 0x40;
  randomValues[8] = (randomValues[8] & 0x3f) | 0x80;

  const hex = Array.from(randomValues, (value) => value.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export function viewSessionErrorMessage(cause: unknown): string {
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

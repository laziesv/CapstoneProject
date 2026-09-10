"use client";

import { OperationProgress } from "@/components/feedback/OperationProgress";
import { OperationToast } from "@/components/feedback/OperationToast";

interface IntentionalEvidenceProgressProps {
  opening: boolean;
  status: "SUBMITTING" | "WAITING_FOR_BLOCKCHAIN" | "PENDING_BLOCKCHAIN_CONFIRMATION";
  delayed: boolean;
  error?: string;
  onDismissError: () => void;
}

export function IntentionalEvidenceProgress({
  opening,
  status,
  delayed,
  error,
  onDismissError,
}: IntentionalEvidenceProgressProps) {
  return (
    <>
      {opening && (
        <OperationProgress
          overlay
          title={status === "WAITING_FOR_BLOCKCHAIN"
            ? "กำลังรอเครือข่าย Blockchain"
            : "กำลังเปิดหลักฐาน"}
          description={delayed
            ? "Blockchain ใช้เวลายืนยันนานกว่าปกติ รายการเดิมยังอยู่ในสถานะ PENDING และระบบกำลังตรวจสอบต่อโดยไม่สร้างรายการใหม่"
            : status === "WAITING_FOR_BLOCKCHAIN"
            ? "เครือข่ายยังไม่สามารถสร้าง Block ใหม่ได้ ระบบจะตรวจสอบรายการเดิมให้อัตโนมัติ"
            : status === "PENDING_BLOCKCHAIN_CONFIRMATION"
              ? "รายการเข้าดูถูกส่งแล้วและกำลังรอ Blockchain ยืนยัน"
              : "กรุณารอสักครู่"}
          steps={[
            { label: "ส่งคำขอเข้าถึงแล้ว", state: "completed" },
            { label: "กำลังบันทึกการเข้าถึงและรอ Blockchain ยืนยัน", state: "active" },
            { label: "กำลังเปิดหลักฐาน", state: "pending" },
          ]}
        />
      )}
      {error && (
        <OperationToast
          title="ไม่สามารถเปิดหลักฐานได้"
          message={error}
          tone="error"
          onClose={onDismissError}
        />
      )}
    </>
  );
}

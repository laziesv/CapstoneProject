"use client";

import { OperationProgress } from "@/components/feedback/OperationProgress";
import { OperationToast } from "@/components/feedback/OperationToast";

interface IntentionalEvidenceProgressProps {
  opening: boolean;
  error?: string;
  onDismissError: () => void;
}

export function IntentionalEvidenceProgress({
  opening,
  error,
  onDismissError,
}: IntentionalEvidenceProgressProps) {
  return (
    <>
      {opening && (
        <OperationProgress
          overlay
          title="กำลังเปิดหลักฐาน"
          description="กรุณารอสักครู่"
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

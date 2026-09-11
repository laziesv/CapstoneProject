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
  const isWaitingForBlockchain =
    status === "WAITING_FOR_BLOCKCHAIN" || status === "PENDING_BLOCKCHAIN_CONFIRMATION";

  return (
    <>
      {opening && (
        <OperationProgress
          overlay
          title={isWaitingForBlockchain
            ? "กำลังรอ Blockchain ยืนยัน"
            : "กำลังเปิดหลักฐาน"}
          description={delayed
            ? "ใช้เวลานานกว่าปกติ แต่ระบบยังตรวจสอบรายการเดิมต่ออยู่ ไม่สร้างรายการซ้ำ"
            : isWaitingForBlockchain
              ? "บันทึกรายการเข้าดูแล้ว กำลังรอให้เครือข่ายสร้างบล็อกและยืนยันธุรกรรมก่อนเปิดหลักฐาน"
              : "กำลังส่งคำขอเข้าดูและเตรียมบันทึกธุรกรรม"}
          steps={[
            {
              label: "ส่งคำขอเข้าดูหลักฐาน",
              state: status === "SUBMITTING" ? "active" : "completed",
            },
            {
              label: "บันทึก View transaction ลง Blockchain",
              state: isWaitingForBlockchain ? "active" : "pending",
            },
            { label: "เปิดหน้าหลักฐานหลังยืนยันสำเร็จ", state: "pending" },
          ]}
          details={[
            "โดยปกติอาจใช้เวลาประมาณ 5-15 วินาทีตามรอบการสร้างบล็อก",
            "ระบบยังคงโหมดเข้มงวด: ต้องยืนยันบน Blockchain ก่อนเปิด",
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

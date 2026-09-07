"use client";

import { useCallback, useEffect, useState } from "react";

import { OperationToast } from "@/components/feedback/OperationToast";

const COPY_SUCCESS_EVENT = "deva:copy-success";

export async function copyTextWithFeedback(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    window.dispatchEvent(new Event(COPY_SUCCESS_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function CopySuccessFeedbackHost() {
  const [notificationId, setNotificationId] = useState(0);
  const dismiss = useCallback(() => setNotificationId(0), []);

  useEffect(() => {
    const showFeedback = () => setNotificationId((current) => current + 1);
    window.addEventListener(COPY_SUCCESS_EVENT, showFeedback);
    return () => window.removeEventListener(COPY_SUCCESS_EVENT, showFeedback);
  }, []);

  if (notificationId === 0) return null;

  return (
    <OperationToast
      key={notificationId}
      title="คัดลอกสำเร็จ"
      message="คัดลอกข้อมูลไปยังคลิปบอร์ดแล้ว"
      onClose={dismiss}
    />
  );
}

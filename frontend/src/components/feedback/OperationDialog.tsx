"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";

interface OperationDialogProps {
  title: string;
  message: string;
  tone?: "success" | "error";
  onClose: () => void;
}

/** กล่องแจ้งผลกลางหน้าจอ ที่ผู้ใช้ต้องกดปิดเอง
 *
 *  ต่างจาก OperationToast ตรงที่ไม่หายไปเอง ใช้กับเรื่องที่ผู้ใช้ต้องอ่านจนจบ
 *  แล้วลงมือแก้ เช่น อัปโหลดไม่สำเร็จเพราะภาพเล็กเกินไป ถ้าใช้ toast ที่หาย
 *  ใน 6 วินาที ผู้ใช้อาจพลาดตัวเลขขนาดขั้นต่ำที่ต้องทำตาม
 */
export function OperationDialog({
  title,
  message,
  tone = "error",
  onClose,
}: OperationDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // โฟกัสปุ่มปิดทันทีที่เปิด เพื่อให้ผู้ใช้คีย์บอร์ดกด Enter ปิดได้เลย
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const Icon = tone === "success" ? CheckCircle2 : CircleAlert;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="presentation"
    >
      <section
        aria-labelledby="operation-dialog-title"
        aria-modal="true"
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Icon
              aria-hidden="true"
              className={`mt-0.5 h-5 w-5 flex-shrink-0 ${tone === "success" ? "text-success" : "text-danger"}`}
            />
            <div className="min-w-0">
              <h2 id="operation-dialog-title" className="font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{message}</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="ปิด"
            title="ปิด"
            className="flex-shrink-0 rounded text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            onClick={onClose}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
            onClick={onClose}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> รับทราบ
          </button>
        </div>
      </section>
    </div>
  );
}

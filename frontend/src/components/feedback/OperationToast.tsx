"use client";

import { useEffect } from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";

interface OperationToastProps {
  title: string;
  message: string;
  tone?: "success" | "error";
  onClose: () => void;
}

export function OperationToast({
  title,
  message,
  tone = "success",
  onClose,
}: OperationToastProps) {
  useEffect(() => {
    const timeout = window.setTimeout(onClose, 6000);
    return () => window.clearTimeout(timeout);
  }, [onClose]);

  const Icon = tone === "success" ? CheckCircle2 : CircleAlert;
  return (
    <aside
      className="fixed bottom-5 right-5 z-50 flex w-[min(24rem,calc(100vw-2rem))] items-start gap-3 rounded-lg border border-border bg-surface p-4 shadow-xl"
      role={tone === "success" ? "status" : "alert"}
    >
      <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${tone === "success" ? "text-success" : "text-danger"}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted">{message}</p>
      </div>
      <button type="button" onClick={onClose} aria-label="ปิดการแจ้งเตือน" title="ปิด" className="text-muted hover:text-foreground">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </aside>
  );
}

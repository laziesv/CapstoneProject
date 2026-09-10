"use client";

import { CheckCircle2, Circle, CircleAlert, Loader2 } from "lucide-react";

export type OperationProgressState = "completed" | "active" | "pending" | "error";

export interface OperationProgressStep {
  label: string;
  state: OperationProgressState;
}

interface OperationProgressProps {
  title: string;
  description?: string;
  steps: OperationProgressStep[];
  details?: string[];
  overlay?: boolean;
}

export function OperationProgress({
  title,
  description,
  steps,
  details = [],
  overlay = false,
}: OperationProgressProps) {
  const content = (
    <section
      className={overlay ? "w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl" : "py-2"}
      aria-busy={steps.some((step) => step.state === "active")}
      aria-live="polite"
      role="status"
    >
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}

      <ol className="mt-5 space-y-3">
        {steps.map((step) => {
          const Icon = step.state === "completed"
            ? CheckCircle2
            : step.state === "active"
              ? Loader2
              : step.state === "error"
                ? CircleAlert
                : Circle;
          const tone = step.state === "completed"
            ? "text-success"
            : step.state === "active"
              ? "text-primary"
              : step.state === "error"
                ? "text-danger"
                : "text-muted";

          return (
            <li key={step.label} className={`flex items-start gap-3 text-sm ${tone}`}>
              <Icon
                className={`mt-0.5 h-4 w-4 flex-shrink-0 ${step.state === "active" ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span className={step.state === "active" ? "font-medium" : ""}>{step.label}</span>
            </li>
          );
        })}
      </ol>

      {details.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs font-medium text-muted">ระบบกำลังดำเนินการ</p>
          <ul className="mt-2 grid gap-1.5 text-xs text-muted sm:grid-cols-2">
            {details.map((detail) => <li key={detail}>• {detail}</li>)}
          </ul>
        </div>
      )}
    </section>
  );

  if (!overlay) return content;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4" role="presentation">
      {content}
    </div>
  );
}

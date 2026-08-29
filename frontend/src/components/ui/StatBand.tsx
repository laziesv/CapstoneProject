import type { ReactNode } from "react";

type Tone = "muted" | "success" | "warning" | "danger";

const toneCls: Record<Tone, string> = {
  muted: "text-ink-muted",
  success: "text-success",
  warning: "text-warning-dot",
  danger: "text-danger",
};

export type StatItem = {
  label: string;
  value: ReactNode;
  /** บรรทัดล่าง เช่น "+38 ในสัปดาห์นี้" */
  hint?: string;
  /** สีของ hint */
  tone?: Tone;
  /** สีของตัวเลขหลัก (ค่าปกติ = ขาว) */
  valueTone?: Tone;
};

/** แถบ KPI พื้นดำ — ตัวเลขสำคัญที่สุดของหน้า อ่านได้ในหนึ่งวินาที */
export default function StatBand({ items }: { items: StatItem[] }) {
  return (
    <div className="grid gap-6 rounded-[20px] bg-ink px-9 py-8 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it, i) => (
        <div
          key={it.label}
          className={`flex flex-col gap-2 ${
            i < items.length - 1 ? "lg:border-r lg:border-ink-border lg:pr-6" : ""
          }`}
        >
          <span className="text-[13px] text-ink-muted">{it.label}</span>
          <span
            className={`font-mono text-[44px] leading-none tracking-tight ${
              it.valueTone ? toneCls[it.valueTone] : "text-white"
            }`}
          >
            {it.value}
          </span>
          {it.hint && (
            <span className={`text-[13px] ${toneCls[it.tone ?? "muted"]}`}>{it.hint}</span>
          )}
        </div>
      ))}
    </div>
  );
}

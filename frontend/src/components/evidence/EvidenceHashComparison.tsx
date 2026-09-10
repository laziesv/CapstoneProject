"use client";

import { CheckCircle2, Copy, ShieldAlert } from "lucide-react";

import { copyTextWithFeedback } from "@/components/feedback/CopySuccessFeedback";
import type { EvidenceHashComparison as EvidenceHashComparisonData } from "@/utils/evidenceDownloadError";

interface EvidenceHashComparisonProps {
  comparison: EvidenceHashComparisonData;
}

export function EvidenceHashComparison({ comparison }: EvidenceHashComparisonProps) {
  return (
    <section className="mt-4 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">SHA-256 Hash Comparison</h3>
      <div className="mt-3 space-y-3">
        <HashRow
          label="ค่าแฮชไฟล์ต้นฉบับปัจจุบัน"
          value={comparison.currentOriginalHash}
          matches={comparison.currentMatchesBlockchain}
        />
        <HashRow
          label="ค่าแฮชในฐานข้อมูล"
          value={comparison.databaseHash}
          matches={comparison.databaseMatchesBlockchain}
        />
        <HashRow
          label="ค่าแฮชอ้างอิงบน Blockchain"
          value={comparison.blockchainEvidenceHash}
          matches={null}
          reference
        />
      </div>
    </section>
  );
}

function HashRow({
  label,
  value,
  matches,
  reference = false,
}: {
  label: string;
  value: string | null;
  matches: boolean | null;
  reference?: boolean;
}) {
  const referenceAvailable = reference && Boolean(value);
  const Icon = matches === true || referenceAvailable ? CheckCircle2 : ShieldAlert;
  const status = reference
    ? referenceAvailable ? "ค่าอ้างอิง" : "ไม่พบค่าอ้างอิง"
    : matches === true
      ? "ตรงกับ Blockchain"
      : matches === false
        ? "ไม่ตรงกับ Blockchain"
        : "ไม่สามารถเปรียบเทียบได้";
  const tone = referenceAvailable || matches === true ? "text-success" : "text-warning";

  return (
    <div className="min-w-0 bg-slate-50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium">{label}</p>
        <span className={`inline-flex flex-shrink-0 items-center gap-1 text-xs ${tone}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {status}
        </span>
      </div>
      <div className="mt-1 flex min-w-0 items-start gap-2">
        <code className="min-w-0 flex-1 break-all text-[10px] leading-5" title={value ?? undefined}>{value || "—"}</code>
        {value && (
          <button type="button" title={`คัดลอก ${label}`} aria-label={`คัดลอก ${label}`} onClick={() => void copyTextWithFeedback(value)} className="flex-shrink-0 text-muted hover:text-primary">
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

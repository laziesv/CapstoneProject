"use client";

import Image from "next/image";
import { Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { copyTextWithFeedback } from "@/components/feedback/CopySuccessFeedback";
import { dynamicWatermarkDescription } from "@/utils/watermarkPresentation";

interface WatermarkQrPresentationProps {
  title: string;
  qrTitle: string;
  staticValue: string | null;
  dynamicValue: string | null;
  dynamicMode: "canonical" | "personalized" | "unresolved" | null;
  staticQrPng?: string | null;
  dynamicQrPng?: string | null;
  generateQr?: boolean;
}

export function WatermarkQrPresentation({
  title,
  qrTitle,
  staticValue,
  dynamicValue,
  dynamicMode,
  staticQrPng,
  dynamicQrPng,
  generateQr = false,
}: WatermarkQrPresentationProps) {
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 space-y-4">
        <WatermarkValue label="Static" value={staticValue} description="ใช้ระบุหลักฐาน (Evidence Reference)" />
        <WatermarkValue
          label="Dynamic"
          value={dynamicValue}
          description={dynamicWatermarkDescription(dynamicMode)}
        />
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <h4 className="text-xs font-semibold text-muted">{qrTitle}</h4>
        <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <WatermarkQr label="Static QR" value={staticValue} png={staticQrPng} generate={generateQr} />
          <WatermarkQr label="Dynamic QR" value={dynamicValue} png={dynamicQrPng} generate={generateQr} />
        </div>
      </div>
    </section>
  );
}

function WatermarkValue({
  label,
  value,
  description,
}: {
  label: "Static" | "Dynamic";
  value: string | null;
  description: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold">{label}</p>
        {value && (
          <button
            type="button"
            title={`คัดลอก ${label}`}
            aria-label={`คัดลอก ${label}`}
            onClick={() => void copyTextWithFeedback(value)}
            className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-primary"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="truncate font-mono text-xs text-text-secondary" title={value ?? undefined}>{value || "—"}</p>
      <p className="mt-1 text-xs text-muted">{description}</p>
    </div>
  );
}

function WatermarkQr({
  label,
  value,
  png,
  generate,
}: {
  label: "Static QR" | "Dynamic QR";
  value: string | null;
  png?: string | null;
  generate: boolean;
}) {
  return (
    <figure className="min-w-0 text-center">
      <div className="mx-auto flex h-36 w-36 max-w-full items-center justify-center bg-white p-2">
        {png ? (
          <Image
            src={png}
            alt={label}
            width={128}
            height={128}
            unoptimized
            className="h-32 w-32 max-w-full [image-rendering:pixelated]"
          />
        ) : generate && value ? (
          <QRCodeSVG value={value} size={128} level="H" marginSize={4} className="h-32 w-32 max-w-full" />
        ) : (
          <div className="h-32 w-32 max-w-full bg-slate-100" aria-label={`ไม่พบ ${label}`} />
        )}
      </div>
      <figcaption className="mt-2 text-xs font-semibold">{label}</figcaption>
    </figure>
  );
}

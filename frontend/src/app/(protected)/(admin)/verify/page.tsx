"use client";
import { useState } from "react";
import { UploadCloud, ShieldCheck, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { watermarkService } from "@/services";
import type { VerifyResult } from "@/interfaces";

export default function VerifyPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const handleFile = async (f: File) => {
    setPreview(URL.createObjectURL(f));
    setIsVerifying(true);
    setResult(null);
    try {
      setResult(await watermarkService.verify(f));
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Watermark Verification</h1>
        <p className="text-sm text-muted mt-1">อัปโหลดภาพเพื่อตรวจสอบลายน้ำและความถูกต้องของหลักฐาน</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Upload Panel */}
        <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
          <h2 className="font-semibold">Upload Image</h2>
          <div
            className="rounded-xl border-2 border-dashed border-border p-8 text-center cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => document.getElementById("v-input")?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) handleFile(f); }}
          >
            <input type="file" id="v-input" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} className="hidden" />
            {preview ? (
              <div className="relative">
                <img src={preview} alt="uploaded" className="mx-auto max-h-64 rounded-lg" />
                {isVerifying && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                    <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" /> Analyzing...
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <UploadCloud className="mx-auto h-10 w-10 text-muted" />
                <p className="mt-2 text-sm">อัปโหลดภาพที่ต้องการตรวจสอบ</p>
                <p className="text-xs text-muted mt-1">ลากไฟล์มาวาง หรือ คลิก</p>
              </>
            )}
          </div>
        </div>

        {/* Results Panel */}
        <div className="rounded-xl border border-border bg-surface p-6 space-y-5">
          <h2 className="font-semibold">Verification Results</h2>
          {!result && !isVerifying && (
            <div className="flex flex-col items-center py-12 text-muted">
              <ShieldCheck className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">อัปโหลดภาพเพื่อเริ่มตรวจสอบ</p>
            </div>
          )}
          {isVerifying && (
            <div className="flex flex-col items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-3 text-sm text-muted">กำลังวิเคราะห์ลายน้ำ...</p>
            </div>
          )}
          {result && (
            <div className="space-y-5">
              {/* Match Score */}
              <div className="flex items-center gap-4">
                <div className="relative flex h-20 w-20 items-center justify-center">
                  <svg viewBox="0 0 120 120" className="h-20 w-20 -rotate-90">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#059669" strokeWidth="8" strokeDasharray="314" strokeDashoffset={314 * (1 - result.matchPercent / 100)} strokeLinecap="round" />
                  </svg>
                  <span className="absolute text-lg font-bold">{result.matchPercent}%</span>
                </div>
                <div>
                  <p className="font-semibold text-success">Watermark Verified</p>
                  <p className="text-xs text-muted">ลายน้ำตรงกับข้อมูลในระบบ</p>
                </div>
              </div>

              {/* Extracted Data */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1.5 border-b border-border"><span className="text-muted">Officer ID</span><span className="font-mono text-xs">{result.officerId}</span></div>
                <div className="flex justify-between py-1.5 border-b border-border"><span className="text-muted">Officer</span><span>{result.officerName}</span></div>
                <div className="flex justify-between py-1.5 border-b border-border"><span className="text-muted">Timestamp</span><span className="font-mono text-xs">{result.timestamp}</span></div>
                <div className="flex justify-between py-1.5 border-b border-border"><span className="text-muted">GPS</span><span className="font-mono text-xs">{result.gps}</span></div>
              </div>

              {/* Status Checks */}
              <div className="space-y-2">
                <StatusRow label="Static Watermark" ok={result.staticWm} />
                <StatusRow label="Dynamic Watermark" ok={result.dynamicWm} />
                <StatusRow label="Tampering Detection" ok={!result.tampered} okText="No tampering" failText="Tampering detected!" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, ok, okText, failText }: { label: string; ok: boolean; okText?: string; failText?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
      <span className="text-sm">{label}</span>
      <span className={`flex items-center gap-1.5 text-xs font-medium ${ok ? "text-success" : "text-danger"}`}>
        {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
        {ok ? okText || "Intact" : failText || "Tampered"}
      </span>
    </div>
  );
}

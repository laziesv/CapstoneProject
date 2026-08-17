"use client";
import { useState } from "react";
import { UploadCloud, ShieldCheck, CheckCircle2, XCircle, Loader2, QrCode, ShieldAlert } from "lucide-react";
import { watermarkService, ApiError } from "@/services";
import type { VerifyResult } from "@/interfaces";
import ProtectedImage from "@/components/ProtectedImage";

export default function VerifyPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (f: File) => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setIsVerifying(true);
    setResult(null);
    setError(null);
    try {
      setResult(await watermarkService.verify(f));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "ตรวจสอบไม่สำเร็จ");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Watermark Verification</h1>
        <p className="mt-1 text-sm text-muted">อัปโหลดภาพเพื่อถอดลายน้ำ — ระบบจะเดาว่าเป็นหลักฐานชิ้นไหนและแสดง QR ที่ฝังไว้</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Upload Panel */}
        <div className="space-y-4 rounded-xl border border-border bg-surface p-6">
          <h2 className="font-semibold">อัปโหลดภาพ</h2>
          <div
            className="cursor-pointer rounded-xl border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary/40"
            onClick={() => document.getElementById("v-input")?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) handleFile(f); }}
          >
            <input type="file" id="v-input" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} className="hidden" />
            {preview ? (
              <div className="relative">
                <ProtectedImage src={preview} alt="uploaded" className="mx-auto max-h-72 rounded-lg" />
                {isVerifying && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/30">
                    <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" /> กำลังถอดลายน้ำ...
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <UploadCloud className="mx-auto h-10 w-10 text-muted" />
                <p className="mt-2 text-sm">อัปโหลดภาพที่ต้องการตรวจสอบ</p>
                <p className="mt-1 text-xs text-muted">ลากไฟล์มาวาง หรือ คลิก</p>
              </>
            )}
          </div>
        </div>

        {/* Results Panel */}
        <div className="space-y-5 rounded-xl border border-border bg-surface p-6">
          <h2 className="font-semibold">ผลการตรวจสอบ</h2>

          {!result && !isVerifying && !error && (
            <div className="flex flex-col items-center py-12 text-muted">
              <ShieldCheck className="mb-3 h-12 w-12 opacity-30" />
              <p className="text-sm">อัปโหลดภาพเพื่อเริ่มตรวจสอบ</p>
            </div>
          )}

          {isVerifying && (
            <div className="flex flex-col items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-3 text-sm text-muted">กำลังเทียบกับหลักฐานในระบบ...</p>
            </div>
          )}

          {error && !isVerifying && (
            <div className="flex items-center gap-2 rounded-lg bg-danger-light px-4 py-3 text-sm text-danger">
              <XCircle className="h-4 w-4 flex-shrink-0" /> {error}
            </div>
          )}

          {/* ไม่พบลายน้ำ */}
          {result && !result.found && !isVerifying && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <ShieldAlert className="h-12 w-12 text-danger" />
              <p className="font-semibold text-danger">ไม่พบลายน้ำที่ตรงกับหลักฐานใด</p>
              <p className="max-w-xs text-xs text-muted">ภาพนี้อาจไม่ได้มาจากระบบ ถูกแก้ไขจนลายน้ำเสียหาย หรือไม่เคยฝังลายน้ำ</p>
            </div>
          )}

          {/* พบลายน้ำ */}
          {result && result.found && !isVerifying && (
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="relative flex h-20 w-20 items-center justify-center">
                  <svg viewBox="0 0 120 120" className="h-20 w-20 -rotate-90">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#059669" strokeWidth="8" strokeDasharray="314" strokeDashoffset={314 * (1 - result.matchPercent / 100)} strokeLinecap="round" />
                  </svg>
                  <span className="absolute text-lg font-bold">{result.matchPercent}%</span>
                </div>
                <div>
                  <p className="font-semibold text-success">พบลายน้ำในภาพ</p>
                  <p className="text-xs text-muted">ระบุได้ว่าเป็นหลักฐาน {result.evidenceNumber}</p>
                </div>
              </div>

              {/* QR ที่แกะได้ — มี 2 อัน (ตัวตน + ผูกไฟล์) */}
              <div className="rounded-xl border border-border bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">QR ที่ฝังอยู่ในภาพ (2 ชั้น)</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <QrCard
                    png={result.staticQrPng}
                    title="Static — ตัวตน"
                    caption="SHA-256 ของ evidence_id"
                    value={result.staticDecoded}
                  />
                  <QrCard
                    png={result.dynamicQrPng}
                    title="Dynamic — ผูกไฟล์"
                    caption="SHA-256 ของไฟล์ (file_hash)"
                    value={result.dynamicDecoded}
                  />
                </div>
              </div>

              {/* ข้อมูลหลักฐาน (จาก DB) */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b border-border py-1.5"><span className="text-muted">หลักฐาน</span><span className="font-mono text-xs">{result.evidenceNumber}</span></div>
                <div className="flex justify-between border-b border-border py-1.5"><span className="text-muted">เจ้าหน้าที่</span><span>{result.officerName ?? "—"}</span></div>
                <div className="flex justify-between border-b border-border py-1.5"><span className="text-muted">อัปโหลดเมื่อ</span><span className="font-mono text-xs">{result.uploadedAt ? new Date(result.uploadedAt).toLocaleString("th-TH") : "—"}</span></div>
              </div>

              {/* ผลจากลายน้ำ */}
              <div className="space-y-2">
                <StatusRow label="Static Watermark (ตัวตน)" ok={result.staticOk} />
                <StatusRow label="Dynamic Watermark (ผูกไฟล์)" ok={result.dynamicOk} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QrCard({ png, title, caption, value }: { png: string | null; title: string; caption: string; value: string | null }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-white p-3 text-center">
      {png ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={png} alt={title} width={96} height={96} className="rounded border border-border [image-rendering:pixelated]" />
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded border border-border text-xs text-muted">—</div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-semibold">{title}</p>
        <p className="text-[10px] text-muted">{caption}</p>
        {value && <p className="mt-1 break-all font-mono text-[9px] leading-tight text-text-secondary">{value.slice(0, 24)}…</p>}
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
        {ok ? okText || "ผ่าน" : failText || "ไม่ผ่าน"}
      </span>
    </div>
  );
}

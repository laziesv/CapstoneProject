"use client";

import { useState } from "react";
import Link from "next/link";
import { UploadCloud, ShieldCheck, ShieldAlert, CheckCircle2, XCircle, Loader2, QrCode, RefreshCw } from "lucide-react";
import { watermarkService, ApiError } from "@/services";
import type { VerifyResult } from "@/interfaces";
import ProtectedImage from "@/components/ProtectedImage";

type HistoryItem = { name: string; found: boolean; time: string };

export default function VerifyPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]); // ประวัติเฉพาะเซสชันนี้

  const runVerify = async (f: File) => {
    setIsVerifying(true);
    setResult(null);
    setError(null);
    try {
      const r = await watermarkService.verify(f);
      setResult(r);
      setHistory((h) => [{ name: f.name, found: r.found, time: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) }, ...h].slice(0, 6));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "ตรวจสอบไม่สำเร็จ");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleFile = (f: File) => {
    setFile(f);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    runVerify(f);
  };

  const pick = () => document.getElementById("v-input")?.click();

  return (
    <div className="space-y-5">
      {/* หัวเรื่อง */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold">ตรวจสอบลายน้ำ</h1>
        <span className="text-sm text-muted">อัปโหลดภาพเพื่อตรวจว่ามาจากระบบ DEVA จริงหรือไม่ — ระบบจะถอดลายน้ำและ QR ที่ฝังไว้</span>
      </div>

      <input type="file" id="v-input" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} className="hidden" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── ซ้าย: ภาพที่ต้องการตรวจ ── */}
        <div className="flex flex-col gap-[18px] rounded-[20px] border border-border bg-surface p-6">
          <span className="text-base font-semibold">ภาพที่ต้องการตรวจ</span>

          {preview ? (
            <>
              <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[14px] bg-slate-900">
                <ProtectedImage src={preview} alt="ภาพที่อัปโหลดเพื่อตรวจสอบ" className="max-h-full w-full object-contain" />
                {isVerifying && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" /> กำลังถอดลายน้ำ...
                    </div>
                  </div>
                )}
              </div>
              {file && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-muted">
                  <span className="truncate">{file.name}</span>
                  <span>{(file.size / 1e6).toFixed(1)} MB</span>
                </div>
              )}
              <div className="flex gap-2.5">
                <button onClick={pick} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-border bg-surface text-[15px] font-semibold transition-colors hover:bg-surface-hover">
                  เปลี่ยนภาพ
                </button>
                <button onClick={() => file && runVerify(file)} disabled={!file || isVerifying} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60">
                  <RefreshCw className="h-4 w-4" /> ตรวจสอบอีกครั้ง
                </button>
              </div>
            </>
          ) : (
            <div
              className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-border text-center transition-colors hover:border-primary/40"
              onClick={pick}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) handleFile(f); }}
            >
              <UploadCloud className="h-10 w-10 text-muted" />
              <p className="text-sm">อัปโหลดภาพที่ต้องการตรวจสอบ</p>
              <p className="text-xs text-muted">ลากไฟล์มาวาง หรือ คลิก</p>
            </div>
          )}
        </div>

        {/* ── ขวา: ผล + QR + ประวัติ ── */}
        <div className="space-y-4">
          {/* การ์ดผลสีดำ */}
          <div className="rounded-[20px] bg-ink p-7 text-white">
            {!result && !isVerifying && !error && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <span className="flex items-center justify-center rounded-full bg-ink-raised" style={{ width: 52, height: 52 }}>
                  <ShieldCheck className="h-6 w-6 text-ink-muted" />
                </span>
                <p className="text-[15px] font-semibold">อัปโหลดภาพเพื่อเริ่มตรวจสอบ</p>
                <p className="max-w-xs text-xs text-ink-muted">ระบบจะเดาว่าเป็นหลักฐานชิ้นไหนและแสดง QR ที่ฝังไว้</p>
              </div>
            )}

            {isVerifying && (
              <div className="flex flex-col items-center gap-3 py-10 text-ink-muted">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
                <p className="text-sm">กำลังเทียบกับหลักฐานในระบบ...</p>
              </div>
            )}

            {error && !isVerifying && (
              <div className="flex items-center gap-2 rounded-xl bg-danger/20 px-4 py-3 text-sm text-danger">
                <XCircle className="h-4 w-4 flex-shrink-0" /> {error}
              </div>
            )}

            {result && !result.found && !isVerifying && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <span className="flex items-center justify-center rounded-full bg-danger/20" style={{ width: 52, height: 52 }}>
                  <ShieldAlert className="h-6 w-6 text-danger" />
                </span>
                <p className="text-[17px] font-semibold text-danger">ไม่พบลายน้ำของระบบ</p>
                <p className="max-w-xs text-xs text-ink-muted">ภาพนี้อาจไม่ได้มาจากระบบ ถูกแก้ไขจนลายน้ำเสียหาย หรือไม่เคยฝังลายน้ำ</p>
              </div>
            )}

            {result && result.found && !isVerifying && (
              <div className="flex flex-col gap-5">
                <div className="flex items-center gap-3.5">
                  <span className="flex flex-shrink-0 items-center justify-center rounded-full bg-success/15" style={{ width: 52, height: 52 }}>
                    <CheckCircle2 className="h-6 w-6 text-success" />
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[22px] leading-tight">พบลายน้ำของระบบ</span>
                    <span className="text-[13px] text-ink-muted">ความมั่นใจ {result.matchPercent}% · ภาพนี้มาจากระบบ DEVA</span>
                  </div>
                </div>

                <div className="h-px bg-ink-border" />

                <div className="flex flex-col gap-3.5">
                  <DarkRow label="หมายเลขหลักฐาน">
                    {result.evidenceNumber ? (
                      <Link href={`/evidence/${result.evidenceNumber}`} className="font-mono font-semibold text-white underline decoration-ink-border underline-offset-2 hover:decoration-white">
                        {result.evidenceNumber}
                      </Link>
                    ) : (
                      <span className="font-mono font-semibold">{result.evidenceNumber ?? "—"}</span>
                    )}
                  </DarkRow>
                  <DarkRow label="ผู้อัปโหลดต้นฉบับ"><span className="text-white">{result.officerName ?? "—"}</span></DarkRow>
                  <DarkRow label="เวลาบันทึกต้นฉบับ">
                    <span className="text-white">{result.uploadedAt ? new Date(result.uploadedAt).toLocaleString("th-TH") : "—"}</span>
                  </DarkRow>
                  <DarkRow label="Static Watermark (ตัวตน)"><WmFlag ok={result.staticOk} /></DarkRow>
                  <DarkRow label="Dynamic Watermark (ผูกไฟล์)"><WmFlag ok={result.dynamicOk} /></DarkRow>
                </div>
              </div>
            )}
          </div>

          {/* QR 2 ชั้น (เมื่อพบ) */}
          {result && result.found && !isVerifying && (
            <div className="rounded-2xl border border-border bg-surface p-5">
              <div className="mb-3 flex items-center gap-2">
                <QrCode className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">QR ที่ฝังอยู่ในภาพ (2 ชั้น)</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <QrCard png={result.staticQrPng} title="Static — ตัวตน" caption="SHA-256 ของ evidence_id" value={result.staticDecoded} />
                <QrCard png={result.dynamicQrPng} title="Dynamic — ผูกไฟล์" caption="SHA-256 ของไฟล์ (file_hash)" value={result.dynamicDecoded} />
              </div>
            </div>
          )}

          {/* ผลตรวจล่าสุด (เฉพาะเซสชันนี้) */}
          {history.length > 0 && (
            <div className="flex flex-col gap-3.5 rounded-2xl border border-border bg-surface p-5">
              <span className="text-[15px] font-semibold">ผลตรวจล่าสุด (เซสชันนี้)</span>
              <ul className="flex flex-col">
                {history.map((h, i) => (
                  <li key={i} className={`flex items-center gap-3 py-2.5 ${i < history.length - 1 ? "border-b border-border" : ""}`}>
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${h.found ? "bg-success" : "bg-danger"}`} />
                    <span className="flex-1 truncate text-[13px]">{h.name}</span>
                    <span className="text-xs text-muted">{h.time}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DarkRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-ink-muted">{label}</span>
      <span className="min-w-0 truncate text-right text-sm">{children}</span>
    </div>
  );
}

function WmFlag({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${ok ? "text-success" : "text-danger"}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {ok ? "ตรงกัน" : "ไม่ตรง"}
    </span>
  );
}

function QrCard({ png, title, caption, value }: { png: string | null; title: string; caption: string; value: string | null }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-3 text-center">
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

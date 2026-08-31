"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import { CheckCircle2, Copy, FileCheck2, Fingerprint, Loader2, ShieldAlert, ShieldCheck, UploadCloud, UserRound, XCircle } from "lucide-react";
import type { IntegrityMismatch, VerifyResult, WatermarkVerificationUser } from "@/interfaces";
import { ApiError, watermarkService } from "@/services";

export default function VerifyPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setIsVerifying(true);
    setResult(null);
    setError(null);
    try {
      setResult(await watermarkService.verify(file));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "ตรวจสอบไม่สำเร็จ");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Watermark Verification</h1>
        <p className="mt-1 text-sm text-muted">ตรวจสอบตัวตนหลักฐานและแหล่งที่มาของสำเนาจากลายน้ำดิจิทัล</p>
      </header>

      <section className="grid gap-5 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]">
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="font-semibold">ภาพที่ต้องการตรวจสอบ</h2>
          <div
            className="mt-4 cursor-pointer border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary/50"
            onClick={() => document.getElementById("verify-file")?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file?.type.startsWith("image/")) void handleFile(file);
            }}
          >
            <input id="verify-file" className="hidden" type="file" accept="image/*" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }} />
            {preview ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="ภาพสำหรับตรวจสอบ" className="mx-auto max-h-72 max-w-full object-contain" />
                {isVerifying && <div className="absolute inset-0 flex items-center justify-center bg-black/35"><Loader2 className="h-7 w-7 animate-spin text-white" /></div>}
              </div>
            ) : (
              <div className="py-8 text-muted">
                <UploadCloud className="mx-auto h-10 w-10" />
                <p className="mt-3 text-sm text-text">เลือกหรือลากภาพมาวาง</p>
                <p className="mt-1 text-xs">รองรับไฟล์ภาพที่ระบบสามารถถอดลายน้ำได้</p>
              </div>
            )}
          </div>
        </div>
        <VerificationSummary result={result} loading={isVerifying} error={error} />
      </section>

      {result?.found && !isVerifying && <VerificationReport result={result} />}
    </div>
  );
}

function VerificationSummary({ result, loading, error }: { result: VerifyResult | null; loading: boolean; error: string | null }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-semibold">Verification Summary</h2></div>
      {loading && <EmptyState icon={<Loader2 className="h-9 w-9 animate-spin" />} text="กำลังตรวจสอบลายน้ำ..." />}
      {error && !loading && <EmptyState danger icon={<XCircle className="h-9 w-9" />} text={error} />}
      {!result && !loading && !error && <EmptyState icon={<ShieldCheck className="h-10 w-10 opacity-35" />} text="ยังไม่มีผลการตรวจสอบ" />}
      {result && !result.found && !loading && <EmptyState danger icon={<ShieldAlert className="h-10 w-10" />} text="ไม่พบลายน้ำที่ตรงกับหลักฐานในระบบ" />}
      {result?.found && !loading && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-lg font-semibold text-success">Watermark Detected</p><p className="text-sm text-muted">{verificationType(result.dynamicMode)}</p></div>
            <span className="border border-success/30 bg-success/10 px-3 py-1 text-sm font-semibold text-success">{result.matchPercent}% match</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <StatusItem label="Static Verification" ok={result.staticOk} />
            <StatusItem label="Dynamic Verification" ok={result.dynamicOk} />
            <StatusItem label="Blockchain Verification" ok={blockchainStatus(result)} />
          </div>
        </div>
      )}
    </section>
  );
}

function VerificationReport({ result }: { result: VerifyResult }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ReportCard icon={<FileCheck2 className="h-5 w-5" />} title="Evidence Identity">
        <DataRow label="Evidence Number" value={result.evidenceNumber} />
        <DataRow label="Evidence ID" value={result.evidenceId} copy />
        <DataRow label="Original Filename" value={result.originalFilename} />
        <DataRow label="Original SHA-256" value={result.originalFileHash} copy />
        <DataRow label="Upload Time" value={formatDate(result.uploadedAt)} />
        <DataRow label="Blockchain Status" value={result.blockchainVerified ? "Verified" : "Not verified"} />
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4">
          <QrValue title="Static QR" png={result.staticQrPng} value={result.staticDecoded} />
          <QrValue title="Dynamic QR" png={result.dynamicQrPng} value={result.dynamicDecoded} />
        </div>
      </ReportCard>

      <ReportCard icon={<UserRound className="h-5 w-5" />} title="ผู้อัปโหลดหลักฐาน"><UserProfile profile={result.uploader} /></ReportCard>

      {result.dynamicMode === "personalized" && result.dynamicOk && result.blockchainSessionVerified && (
        <section className="rounded-lg border border-border bg-surface p-5 lg:col-span-2">
          <div className="flex items-center gap-2"><Fingerprint className="h-5 w-5 text-primary" /><div><h2 className="font-semibold">Matched Download Session</h2><p className="text-xs text-muted">สำเนาที่ตรวจสอบตรงกับ personalized download session นี้</p></div></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <StatusItem label="Blockchain Session" ok={result.blockchainSessionVerified} />
            <StatusItem label={`Database Integrity: ${result.databaseIntegrityState ?? "UNAVAILABLE"}`} ok={result.databaseIntegrityState === "VERIFIED"} />
          </div>
          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase text-muted">Blockchain-associated user</p>
              <UserProfile profile={result.matchedAccessUser} />
              {result.databaseIntegrityState === "INTEGRITY_MISMATCH" && result.databaseAccessUser && (
                <div className="mt-5 border-t border-border pt-4">
                  <p className="mb-3 text-xs font-semibold uppercase text-warning">Current DB-linked user</p>
                  <UserProfile profile={result.databaseAccessUser} />
                </div>
              )}
            </div>
            <div>
              <DataRow label="Access Session Ref" value={result.accessSessionRef} copy />
              <DataRow label="Access Log ID" value={result.matchedAccessLogId} copy />
              <DataRow label="Blockchain Action" value={result.matchedAccessAction} />
              <DataRow label="Blockchain Occurred" value={formatUnixTime(result.blockchainOccurredAt)} />
              <DataRow label="Blockchain Recorded" value={formatUnixTime(result.blockchainRecordedAt)} />
              <DataRow label="Database Action" value={result.databaseAccessAction} />
              <DataRow label="Database Access Time" value={formatDate(result.databaseAccessedAt)} />
              <DataRow label="Transaction Hash" value={result.accessTxHash} copy />
              <DataRow label="Block Number" value={result.accessBlockNumber?.toString() ?? null} />
              <DataRow label="DB Transaction Status" value={result.accessTxStatus} />
              <DataRow label="Referenced Evidence" value={result.matchedEvidenceId} copy />
            </div>
          </div>
          {result.attributionMismatches.length > 0 && (
            <IntegrityMismatchTable mismatches={result.attributionMismatches} />
          )}
        </section>
      )}
    </div>
  );
}

function IntegrityMismatchTable({ mismatches }: { mismatches: IntegrityMismatch[] }) {
  return (
    <div className="mt-5 overflow-hidden border border-warning/30 bg-warning-light/30">
      <div className="flex items-center gap-2 border-b border-warning/20 px-3 py-2 text-sm font-semibold text-warning">
        <ShieldAlert className="h-4 w-4" /> Database integrity mismatch detected
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-xs">
          <thead className="text-muted"><tr><th className="px-3 py-2">Field</th><th className="px-3 py-2">Database</th><th className="px-3 py-2">Blockchain</th></tr></thead>
          <tbody className="divide-y divide-warning/15">
            {mismatches.map((item) => (
              <tr key={item.field}>
                <td className="px-3 py-2 font-medium">{item.field}</td>
                <td className="break-all px-3 py-2 font-mono">{formatMismatch(item.database_value, item.field, false)}</td>
                <td className="break-all px-3 py-2 font-mono">{formatMismatch(item.blockchain_value, item.field, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportCard({ icon, title, wide, children }: { icon: ReactNode; title: string; wide?: boolean; children: ReactNode }) {
  return <section className={`rounded-lg border border-border bg-surface p-5 ${wide ? "lg:col-span-2" : ""}`}><div className="mb-4 flex items-center gap-2 text-primary">{icon}<h2 className="font-semibold text-text">{title}</h2></div>{children}</section>;
}

function UserProfile({ profile }: { profile: WatermarkVerificationUser | null }) {
  if (!profile) return <p className="text-sm text-muted">-</p>;
  return <div><div className="mb-4 border-b border-border pb-4"><p className="text-lg font-semibold">{profile.full_name || "-"}</p><p className="text-sm text-muted">{profile.rank || "-"}</p></div><DataRow label="Badge Number" value={profile.badge_number} /><DataRow label="Username" value={profile.username} /><DataRow label="Email" value={profile.email} /><DataRow label="User ID" value={profile.user_id} copy /></div>;
}

function DataRow({ label, value, copy = false }: { label: string; value: string | null; copy?: boolean }) {
  return <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 border-b border-border py-2.5 last:border-0"><span className="text-sm text-muted">{label}</span><span className="flex min-w-0 items-start justify-end gap-2 text-right text-sm"><span className="break-all font-mono text-xs">{value || "-"}</span>{copy && value && <CopyButton value={value} />}</span></div>;
}

function CopyButton({ value }: { value: string }) {
  return <button type="button" title="คัดลอก" aria-label="คัดลอก" className="shrink-0 text-muted hover:text-primary" onClick={() => void navigator.clipboard.writeText(value)}><Copy className="h-3.5 w-3.5" /></button>;
}

function QrValue({ title, png, value }: { title: string; png: string | null; value: string | null }) {
  return <div className="min-w-0 text-center">{png ? <Image src={png} alt={title} width={88} height={88} unoptimized className="mx-auto [image-rendering:pixelated]" /> : <div className="mx-auto h-[88px] w-[88px] bg-slate-100" />}<p className="mt-2 text-xs font-semibold">{title}</p><p className="mt-1 truncate font-mono text-[10px] text-muted" title={value || undefined}>{value || "-"}</p></div>;
}

function StatusItem({ label, ok }: { label: string; ok: boolean }) {
  return <div className="flex items-center justify-between bg-slate-50 px-3 py-2 text-xs"><span>{label}</span>{ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-danger" />}</div>;
}

function EmptyState({ icon, text, danger = false }: { icon: ReactNode; text: string; danger?: boolean }) {
  return <div className={`flex min-h-44 flex-col items-center justify-center gap-3 text-center ${danger ? "text-danger" : "text-muted"}`}>{icon}<p className="text-sm">{text}</p></div>;
}

function verificationType(mode: VerifyResult["dynamicMode"]) {
  if (mode === "personalized") return "Personalized Download Copy";
  if (mode === "canonical") return "Canonical Evidence Copy";
  return "Unresolved Dynamic Watermark";
}

function blockchainStatus(result: VerifyResult) {
  return result.dynamicMode === "personalized" ? result.blockchainSessionVerified : result.blockchainVerified;
}

function formatDate(value: string | null) { return value ? new Date(value).toLocaleString("th-TH") : "-"; }
function formatUnixTime(value: number | null) { return value ? new Date(value * 1000).toLocaleString("th-TH") : "-"; }
function formatMismatch(value: unknown, field: string, fromBlockchain: boolean) {
  if (value === null || value === undefined || value === "") return "-";
  if (field === "accessed_at" && fromBlockchain && typeof value === "number") return `${formatUnixTime(value)} (occurredAt)`;
  return String(value);
}

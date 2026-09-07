"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  Copy,
  Clock3,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
  UserRound,
  XCircle,
} from "lucide-react";

import type { IntegrityMismatch, VerifyResult, WatermarkVerificationUser } from "@/interfaces";
import { watermarkService } from "@/services";
import {
  forensicMismatchLabel,
  formatForensicAction,
  formatForensicDateTime,
  formatForensicMismatchValue,
  formatForensicUnixTime,
  formatInclusionDelay,
  formatIntegrityState,
  shouldShowMatchedDownloadSession,
} from "@/utils/forensics";
import { userFacingApiError } from "@/utils/evidenceDownloadError";
import { blockchainExplorerHref } from "@/utils/blockchainExplorer";
import {
  buildVerificationPresentation,
  type VerificationCheckPresentation,
} from "@/utils/verificationPresentation";

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
      const feedback = userFacingApiError(caught);
      setError(`${feedback.title} ${feedback.message}`);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">ตรวจสอบลายน้ำดิจิทัล</h1>
        <p className="mt-1 text-sm text-muted">ตรวจสอบข้อมูลหลักฐานและรายการดาวน์โหลดจากลายน้ำดิจิทัล</p>
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
            <input
              id="verify-file"
              className="hidden"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            {preview ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="ภาพสำหรับตรวจสอบ" className="mx-auto max-h-72 max-w-full object-contain" />
                {isVerifying && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                    <Loader2 className="h-7 w-7 animate-spin text-white" />
                  </div>
                )}
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
      <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-semibold">สรุปผลการตรวจสอบ</h2></div>
      {loading && <EmptyState icon={<Loader2 className="h-9 w-9 animate-spin" />} text="กำลังตรวจสอบลายน้ำ..." />}
      {error && !loading && <EmptyState danger icon={<XCircle className="h-9 w-9" />} text={error} />}
      {!result && !loading && !error && <EmptyState icon={<ShieldCheck className="h-10 w-10 opacity-35" />} text="ยังไม่มีผลการตรวจสอบ" />}
      {result && !result.found && !loading && <EmptyState danger icon={<ShieldAlert className="h-10 w-10" />} text="ไม่พบลายน้ำที่ตรงกับหลักฐานในระบบ" />}
      {result?.found && !loading && <VerifiedSummary result={result} />}
    </section>
  );
}

function VerifiedSummary({ result }: { result: VerifyResult }) {
  const presentation = buildVerificationPresentation(result);
  const titleColor = presentation.tone === "success"
    ? "text-success"
    : presentation.tone === "warning"
      ? "text-warning"
      : "text-danger";
  return (
    <div className="mt-5 space-y-4">
      <div>
        <p className={`text-lg font-semibold ${titleColor}`}>{presentation.title}</p>
        <p className="mt-1 text-sm text-muted">{presentation.description}</p>
        <p className="mt-1 text-xs text-muted">{verificationType(result.dynamicMode)}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {presentation.checks.map((check) => (
          <VerificationCheckCard key={check.id} check={check} />
        ))}
      </div>
    </div>
  );
}

function VerificationCheckCard({ check }: { check: VerificationCheckPresentation }) {
  const Icon = check.tone === "success"
    ? CheckCircle2
    : check.tone === "warning"
      ? ShieldAlert
      : XCircle;
  const color = check.tone === "success"
    ? "text-success"
    : check.tone === "warning"
      ? "text-warning"
      : "text-danger";
  return (
    <div className="flex items-start gap-3 border border-border bg-slate-50 px-3 py-3">
      <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${color}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-semibold">{check.title}</p>
        <p className={`mt-1 text-xs font-medium ${color}`}>{check.result}</p>
        <p className="mt-1 text-xs leading-5 text-muted">{check.explanation}</p>
      </div>
    </div>
  );
}

function VerificationReport({ result }: { result: VerifyResult }) {
  const hasOriginalHashMismatch = result.evidenceIntegrityStatus !== "VERIFIED"
    || result.originalFileIntegrityStatus === "INTEGRITY_MISMATCH"
    || result.databaseHashIntegrityStatus === "INTEGRITY_MISMATCH"
    || result.watermarkHashIntegrityStatus === "INTEGRITY_MISMATCH";
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ReportCard icon={<FileCheck2 className="h-5 w-5" />} title="ข้อมูลหลักฐาน">
        <DataRow label="หมายเลขหลักฐาน" value={result.evidenceNumber} />
        <DataRow label="ชื่อไฟล์ต้นฉบับ" value={result.originalFilename} />
        <DataRow label="เวลาอัปโหลด" value={formatForensicDateTime(result.uploadedAt)} />
        <DataRow label="สถานะ Blockchain" value={result.blockchainVerified ? "พบ EvidenceRecord บน Blockchain" : "ไม่พบรายการบน Blockchain"} />
        <div className="mt-4 grid gap-2">
          {result.dynamicMode === "canonical" && (
            <StatusText
              label="ความถูกต้องของค่าแฮชจาก Watermark"
              value={formatIntegrityState(result.watermarkHashIntegrityStatus)}
              ok={result.watermarkHashIntegrityStatus === "VERIFIED"}
            />
          )}
          <StatusText
            label="ความถูกต้องของไฟล์ต้นฉบับ"
            value={formatIntegrityState(result.originalFileIntegrityStatus)}
            ok={result.originalFileIntegrityStatus === "VERIFIED"}
          />
          <StatusText
            label="ความถูกต้องของค่าแฮชในฐานข้อมูล"
            value={formatIntegrityState(result.databaseHashIntegrityStatus)}
            ok={result.databaseHashIntegrityStatus === "VERIFIED"}
          />
        </div>
        {result.evidenceIntegrityStatus !== "VERIFIED" && (
          <p className="mt-4 flex items-start gap-2 text-sm text-warning">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
            {formatIntegrityState(result.evidenceIntegrityStatus)}
          </p>
        )}
        {hasOriginalHashMismatch && (
          <div className="mt-4 border-y border-warning/30 bg-warning-light/30 py-3">
            <p className="px-3 text-sm font-semibold text-warning">ค่า SHA-256 ที่ใช้เปรียบเทียบ</p>
            {result.dynamicMode === "canonical" && (
              <DataRow label="ค่าแฮชที่อ่านจาก Dynamic Watermark" value={result.dynamicDecoded} copy />
            )}
            <DataRow label="ค่าแฮชไฟล์ต้นฉบับปัจจุบัน" value={result.currentOriginalHash} copy />
            <DataRow label="ค่าแฮชในฐานข้อมูล" value={result.databaseOriginalHash} copy />
            <DataRow label="ค่าแฮชอ้างอิงบน Blockchain" value={result.blockchainEvidenceHash} copy />
          </div>
        )}
        <TechnicalDetails>
          <DataRow label="Evidence ID" value={result.evidenceId} copy />
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4">
            <QrValue title="รหัสอ้างอิงหลักฐาน" png={result.staticQrPng} value={result.staticDecoded} />
            <QrValue title={dynamicWatermarkLabel(result.dynamicMode)} png={result.dynamicQrPng} value={result.dynamicDecoded} />
          </div>
        </TechnicalDetails>
        {result.originalIntegrityMismatches.length > 0 && (
          <IntegrityMismatchTable mismatches={result.originalIntegrityMismatches} />
        )}
      </ReportCard>

      <ReportCard icon={<UserRound className="h-5 w-5" />} title="ผู้อัปโหลดหลักฐาน">
        <UserProfile profile={result.uploader} />
      </ReportCard>

      {shouldShowMatchedDownloadSession(result) && (
        <section className="rounded-lg border border-border bg-surface p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-semibold">พบรายการดาวน์โหลดที่ตรงกับไฟล์นี้</h2>
              <p className="text-xs text-muted">รหัสติดตามในภาพตรงกับรายการดาวน์โหลดบน Blockchain</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <StatusText label="สถานะรายการบน Blockchain" value="ข้อมูลตรงกัน" ok />
            <StatusText
              label="ความถูกต้องของไฟล์ต้นฉบับ"
              value={formatIntegrityState(result.originalFileIntegrityStatus)}
              ok={result.originalFileIntegrityStatus === "VERIFIED"}
            />
            <StatusText
              label="ความถูกต้องของค่าแฮชต้นฉบับในฐานข้อมูล"
              value={formatIntegrityState(result.databaseHashIntegrityStatus)}
              ok={result.databaseHashIntegrityStatus === "VERIFIED"}
            />
            <StatusText
              label="ความถูกต้องของข้อมูล Download Session ในฐานข้อมูล"
              value={formatIntegrityState(result.databaseIntegrityState)}
              ok={result.databaseIntegrityState === "VERIFIED"}
            />
          </div>

          {result.databaseIntegrityState === "INTEGRITY_MISMATCH" && (
            <p className="mt-4 flex items-start gap-2 text-sm text-warning">
              <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
              พบรายการบน Blockchain แต่ข้อมูลปัจจุบันในระบบไม่ตรงกับข้อมูลอ้างอิง
            </p>
          )}

          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-3 text-xs font-semibold text-muted">ผู้ใช้ที่อ้างอิงจาก Blockchain</p>
              <UserProfile profile={result.matchedAccessUser} />
              {!result.matchedAccessUser && (
                <p className="mt-3 break-all font-mono text-xs text-muted">Blockchain User Reference: {result.blockchainOfficerRef || "—"}</p>
              )}
              <p className="mt-3 text-xs text-muted">
                User Reference ยืนยันกับ Blockchain ส่วนชื่อ Badge Number Username และ Email แสดงจากข้อมูลผู้ใช้ปัจจุบันในระบบ
              </p>
            </div>
            <div className="space-y-2">
              <DataRow label="การกระทำ" value={formatForensicAction(result.matchedAccessAction)} />
              <DataRow label="เวลาที่ดาวน์โหลด" value={formatForensicUnixTime(result.blockchainOccurredAt)} />
              <DataRow label="เวลาที่ธุรกรรมถูกบันทึกลง Blockchain" value={formatForensicUnixTime(result.blockchainRecordedAt)} />
              {formatInclusionDelay(result.blockchainOccurredAt, result.blockchainRecordedAt) && (
                <DataRow label="หน่วงเวลา" value={formatInclusionDelay(result.blockchainOccurredAt, result.blockchainRecordedAt)} />
              )}
              <TechnicalDetails>
                <DataRow label="รหัสอ้างอิงรอบการเข้าถึง" value={result.accessSessionRef} copy />
                <DataRow label="Access Log ID" value={result.matchedAccessLogId} copy />
                <DataRow label="Transaction Hash" value={result.accessTxHash} copy />
                <DataRow label="Block Number" value={numberValue(result.accessBlockNumber)} />
                <DataRow label="สถานะธุรกรรมในระบบ" value={result.accessTxStatus} />
                <DataRow label="Evidence ID" value={result.matchedEvidenceId} copy />
                <DataRow label="เวลาที่เกิดการเข้าถึงในระบบ" value={formatForensicDateTime(result.databaseAccessedAt)} />
              </TechnicalDetails>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                {result.accessTxHash && (
                  <Link href={blockchainExplorerHref("transaction", result.accessTxHash)} className="inline-flex items-center gap-1 text-primary hover:underline">
                    ดู Transaction บน Blockchain <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
                {result.accessBlockNumber !== null && (
                  <Link href={blockchainExplorerHref("block", String(result.accessBlockNumber))} className="inline-flex items-center gap-1 text-primary hover:underline">
                    ดู Block <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          </div>

          <BlockchainAccessHistory result={result} />

          {result.attributionMismatches.length > 0 && <IntegrityMismatchTable mismatches={result.attributionMismatches} />}
        </section>
      )}
    </div>
  );
}

function BlockchainAccessHistory({ result }: { result: VerifyResult }) {
  return (
    <section className="mt-6 border-t border-border pt-5">
      <div className="flex items-start gap-2">
        <Clock3 className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h3 className="font-semibold">ประวัติการเข้าถึงก่อนการดาวน์โหลดนี้</h3>
          <p className="mt-1 text-xs text-muted">เฉพาะเหตุการณ์ของผู้ใช้ที่อ้างอิงจาก Blockchain และเรียงตามตำแหน่งบนเชน</p>
        </div>
      </div>
      {result.blockchainAccessHistory.length === 0 ? (
        <p className="mt-4 border-y border-border py-4 text-sm text-muted">ไม่พบประวัติการเข้าถึงก่อนหน้า</p>
      ) : (
        <div className="mt-4 divide-y divide-border border-y border-border">
          {result.blockchainAccessHistory.map((event, index) => (
            <div key={`${event.tx_hash}-${event.log_index}`} className={`grid gap-3 py-4 text-sm lg:grid-cols-[3rem_10rem_minmax(0,1fr)_8rem] ${event.matched ? "border-l-2 border-primary bg-blue-50/50 px-3" : "px-1"}`}>
              <span className="text-muted">#{index + 1}</span>
              <div>
                <p className="font-semibold">{formatForensicAction(event.action)}</p>
                {event.matched && <p className="mt-1 text-xs font-medium text-primary">รายการดาวน์โหลดที่ตรงกับ Watermark</p>}
              </div>
              <div>
                <p>{formatForensicUnixTime(event.occurred_at)}</p>
                <details className="mt-2 text-xs text-muted">
                  <summary className="cursor-pointer">รายละเอียดทางเทคนิค</summary>
                  <p className="mt-2 break-all font-mono">Transaction: {event.tx_hash}</p>
                  <p className="mt-1 font-mono">Transaction Index: {event.transaction_index ?? "—"} · Log Index: {event.log_index ?? "—"}</p>
                </details>
              </div>
              <Link href={blockchainExplorerHref("transaction", event.tx_hash)} className="inline-flex items-start gap-1 text-primary hover:underline">
                Block {event.block_number} <ExternalLink className="mt-0.5 h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function IntegrityMismatchTable({ mismatches }: { mismatches: IntegrityMismatch[] }) {
  return (
    <div className="mt-5 overflow-hidden border border-warning/30 bg-warning-light/30">
      <div className="flex items-center gap-2 border-b border-warning/20 px-3 py-2 text-sm font-semibold text-warning">
        <ShieldAlert className="h-4 w-4" /> ข้อมูลที่ไม่ตรงกัน
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] text-left text-xs">
          <thead className="text-muted"><tr><th className="px-3 py-2">รายการ</th><th className="px-3 py-2">ข้อมูลปัจจุบันในระบบ</th><th className="px-3 py-2">ข้อมูลอ้างอิงบน Blockchain</th></tr></thead>
          <tbody className="divide-y divide-warning/15">
            {mismatches.map((item) => (
              <tr key={item.field}>
                <td className="px-3 py-2 font-medium">{forensicMismatchLabel(item.field)}</td>
                <td className="break-all px-3 py-2">{formatForensicMismatchValue(item.database_value, item.field)}</td>
                <td className="break-all px-3 py-2">{formatForensicMismatchValue(item.blockchain_value, item.field)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <section className="rounded-lg border border-border bg-surface p-5"><div className="mb-4 flex items-center gap-2 text-primary">{icon}<h2 className="font-semibold text-text">{title}</h2></div>{children}</section>;
}

function UserProfile({ profile }: { profile: WatermarkVerificationUser | null }) {
  if (!profile) return <p className="text-sm text-muted">ไม่สามารถระบุโปรไฟล์ผู้ใช้ปัจจุบันได้</p>;
  return (
    <div>
      <div className="mb-4 border-b border-border pb-4"><p className="text-lg font-semibold">{profile.full_name || profile.username || "—"}</p><p className="text-sm text-muted">{profile.rank || "—"}</p></div>
      <DataRow label="Badge Number" value={profile.badge_number} />
      <DataRow label="Username" value={profile.username} />
      <DataRow label="Email" value={profile.email} />
    </div>
  );
}

function DataRow({ label, value, copy = false }: { label: string; value: string | null; copy?: boolean }) {
  return <div className="grid grid-cols-[minmax(7rem,9rem)_minmax(0,1fr)] gap-3 border-b border-border py-2.5 last:border-0"><span className="text-sm text-muted">{label}</span><span className="flex min-w-0 items-start justify-end gap-2 text-right text-sm"><span className="break-all">{value || "—"}</span>{copy && value && <CopyButton value={value} />}</span></div>;
}

function TechnicalDetails({ children }: { children: ReactNode }) {
  return (
    <details className="mt-4 border-t border-border pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted"><ChevronDown className="h-3.5 w-3.5" />รายละเอียดทางเทคนิค</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function CopyButton({ value }: { value: string }) {
  return <button type="button" title="คัดลอก" aria-label="คัดลอก" className="shrink-0 text-muted hover:text-primary" onClick={() => void navigator.clipboard.writeText(value)}><Copy className="h-3.5 w-3.5" /></button>;
}

function QrValue({ title, png, value }: { title: string; png: string | null; value: string | null }) {
  return <div className="min-w-0 text-center">{png ? <Image src={png} alt={title} width={88} height={88} unoptimized className="mx-auto [image-rendering:pixelated]" /> : <div className="mx-auto h-[88px] w-[88px] bg-slate-100" />}<p className="mt-2 text-xs font-semibold">{title}</p><p className="mt-1 truncate font-mono text-[10px] text-muted" title={value || undefined}>{value || "—"}</p></div>;
}

function StatusText({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className="flex items-center justify-between gap-3 bg-slate-50 px-3 py-2 text-xs"><span>{label}</span><span className={`font-medium ${ok ? "text-success" : "text-warning"}`}>{value}</span></div>;
}

function EmptyState({ icon, text, danger = false }: { icon: ReactNode; text: string; danger?: boolean }) {
  return <div className={`flex min-h-44 flex-col items-center justify-center gap-3 text-center ${danger ? "text-danger" : "text-muted"}`}>{icon}<p className="text-sm">{text}</p></div>;
}

function verificationType(mode: VerifyResult["dynamicMode"]) {
  if (mode === "personalized") return "รหัสติดตามรอบการดาวน์โหลด";
  if (mode === "canonical") return "ค่าแฮชไฟล์ต้นฉบับ";
  return "ไม่สามารถระบุข้อมูล Dynamic Watermark";
}

function dynamicWatermarkLabel(mode: VerifyResult["dynamicMode"]) {
  return mode === "canonical" ? "ค่าแฮชไฟล์ต้นฉบับ" : "รหัสติดตามรอบการดาวน์โหลด";
}

function numberValue(value: number | null): string | null {
  return value === null ? null : String(value);
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
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

import type { ChainOfCustodyResponse, IntegrityMismatch, VerifyResult, WatermarkVerificationUser } from "@/interfaces";
import { evidenceService, watermarkService } from "@/services";
import {
  compareBlockchainOrder,
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
import { OperationProgress } from "@/components/feedback/OperationProgress";
import { copyTextWithFeedback } from "@/components/feedback/CopySuccessFeedback";
import { WatermarkQrPresentation } from "@/components/evidence/WatermarkQrPresentation";
import ProtectedImage from "@/components/ProtectedImage";

export default function VerifyPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const verificationInProgress = useRef(false);

  const handleFile = async (file: File) => {
    if (verificationInProgress.current) return;
    verificationInProgress.current = true;
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
      verificationInProgress.current = false;
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
            className={`mt-4 border-2 border-dashed border-border p-6 text-center transition-colors ${isVerifying ? "cursor-wait opacity-70" : "cursor-pointer hover:border-primary/50"}`}
            aria-disabled={isVerifying}
            onClick={() => !isVerifying && document.getElementById("verify-file")?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (!isVerifying && file?.type.startsWith("image/")) void handleFile(file);
            }}
          >
            <input
              id="verify-file"
              className="hidden"
              type="file"
              accept="image/*"
              disabled={isVerifying}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            {preview ? (
              <div className="relative">
                <ProtectedImage src={preview} alt="ภาพสำหรับตรวจสอบ" className="mx-auto max-h-72 max-w-full object-contain" />
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
  if (loading) {
    return (
      <section className="rounded-lg border border-border bg-surface p-5">
        <OperationProgress
          title="กำลังตรวจสอบลายน้ำดิจิทัล"
          description="กรุณารอสักครู่"
          steps={[{ label: "กำลังตรวจสอบข้อมูลทั้งหมด", state: "active" }]}
          details={[
            "อ่านข้อมูล Watermark",
            "ระบุหลักฐาน",
            "ตรวจสอบ Download Session",
            "อ่านข้อมูล Blockchain",
            "เปรียบเทียบ SHA-256",
          ]}
        />
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-semibold">สรุปผลการตรวจสอบ</h2></div>
      {error && <EmptyState danger icon={<XCircle className="h-9 w-9" />} text={error} />}
      {!result && !error && <EmptyState icon={<ShieldCheck className="h-10 w-10 opacity-35" />} text="ยังไม่มีผลการตรวจสอบ" />}
      {result && !result.found && <EmptyState danger icon={<ShieldAlert className="h-10 w-10" />} text="ไม่พบลายน้ำที่ตรงกับหลักฐานในระบบ" />}
      {result?.found && <VerifiedSummary result={result} />}
    </section>
  );
}

/** สีประจำผลการตรวจ — ใช้ร่วมกันทั้งแบนเนอร์สรุปและการ์ดรายข้อ */
const TONE_STYLE = {
  success: { text: "text-success", bg: "bg-success-light", border: "border-success/30", Icon: ShieldCheck },
  warning: { text: "text-warning", bg: "bg-warning-light", border: "border-warning/30", Icon: ShieldAlert },
  danger: { text: "text-danger", bg: "bg-danger-light", border: "border-danger/30", Icon: XCircle },
} as const;

function VerifiedSummary({ result }: { result: VerifyResult }) {
  const presentation = buildVerificationPresentation(result);
  const tone = TONE_STYLE[presentation.tone];
  const passed = presentation.checks.filter((c) => c.tone === "success").length;
  const total = presentation.checks.length;

  return (
    <div className="mt-5 space-y-4">
      {/* สรุปผลให้เห็นตั้งแต่แวบแรก ก่อนลงรายละเอียดรายข้อ */}
      <div className={`flex items-start gap-4 rounded-xl border ${tone.border} ${tone.bg} px-5 py-4`}>
        <tone.Icon className={`mt-0.5 h-9 w-9 flex-shrink-0 ${tone.text}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className={`text-xl font-semibold ${tone.text}`}>{presentation.title}</p>
            <span className={`rounded-full border ${tone.border} bg-surface px-2.5 py-0.5 text-xs font-semibold ${tone.text}`}>
              ผ่าน {passed}/{total} ข้อ
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-6 text-foreground/80">{presentation.description}</p>
          <p className="mt-2 text-xs text-muted">
            Dynamic Watermark อ้างอิงจาก
            <span className="ml-1.5 font-medium text-foreground/70">{verificationType(result.dynamicMode)}</span>
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {presentation.checks.map((check) => (
          <VerificationCheckCard key={check.id} check={check} />
        ))}
      </div>
    </div>
  );
}

function VerificationCheckCard({ check }: { check: VerificationCheckPresentation }) {
  const tone = TONE_STYLE[check.tone];
  const Icon = check.tone === "success" ? CheckCircle2 : tone.Icon;
  return (
    <div className={`min-w-0 rounded-lg border border-border border-l-2 ${tone.border} bg-surface px-4 py-3.5`}>
      <p className="text-sm font-semibold leading-5">{check.title}</p>
      {/* ผ่าน/ไม่ผ่าน เป็นชิปเพื่อให้กวาดสายตาทีเดียวเห็นครบทุกข้อ */}
      <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full ${tone.bg} px-2.5 py-1 text-xs font-medium ${tone.text}`}>
        <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        {check.result}
      </span>
      <p className="mt-2 text-xs leading-5 text-muted">{check.explanation}</p>
    </div>
  );
}

function VerificationReport({ result }: { result: VerifyResult }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ReportCard icon={<FileCheck2 className="h-5 w-5" />} title="ข้อมูลหลักฐาน">
        <DataRow label="หมายเลขหลักฐาน" value={result.evidenceNumber} />
        <DataRow label="Evidence ID" value={result.evidenceId} copy />
        <DataRow label="ชื่อไฟล์ต้นฉบับ" value={result.originalFilename} />
        <DataRow label="เวลาอัปโหลด" value={formatForensicDateTime(result.uploadedAt)} />
        <DataRow label="สถานะ Blockchain" value={result.blockchainVerified ? "พบ EvidenceRecord บน Blockchain" : "ไม่พบรายการบน Blockchain"} />
        <div className="mt-5 border-t border-border pt-4">
          <WatermarkQrPresentation
            title="ข้อมูล Watermark"
            qrTitle="QR ที่ตรวจพบ"
            staticValue={result.staticDecoded}
            dynamicValue={result.dynamicDecoded}
            dynamicMode={result.dynamicMode}
            staticQrPng={result.staticQrPng}
            dynamicQrPng={result.dynamicQrPng}
          />
        </div>
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

function AccessHistoryRow({ entry, position, note }: { entry: AccessHistoryEntry; position: number; note?: string }) {
  return (
    <div className={`grid gap-3 py-4 text-sm lg:grid-cols-[3rem_10rem_minmax(0,1fr)_8rem] ${entry.matched ? "border-l-2 border-primary bg-blue-50/50 px-3" : "px-1"}`}>
      <span className="text-muted">#{position}</span>
      <div>
        <p className="font-semibold">{formatForensicAction(entry.action)}</p>
        {entry.actorName && <p className="mt-0.5 text-xs text-muted">{entry.actorName}</p>}
        {entry.matched && <p className="mt-1 text-xs font-medium text-primary">รายการดาวน์โหลดที่ตรงกับ Watermark</p>}
        {note && <p className="mt-1 text-xs text-muted">{note}</p>}
      </div>
      <div>
        <p>{formatForensicUnixTime(entry.occurred_at)}</p>
        <details className="mt-2 text-xs text-muted">
          <summary className="cursor-pointer">รายละเอียดทางเทคนิค</summary>
          <p className="mt-2 break-all font-mono">Transaction: {entry.tx_hash}</p>
          <p className="mt-1 font-mono">Transaction Index: {entry.transaction_index ?? "—"} · Log Index: {entry.log_index ?? "—"}</p>
        </details>
      </div>
      <Link href={blockchainExplorerHref("transaction", entry.tx_hash)} className="inline-flex items-start gap-1 text-primary hover:underline">
        Block {entry.block_number} <ExternalLink className="mt-0.5 h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

/** จำนวนรายการที่แสดงก่อนกด "แสดงทั้งหมด" — หลักฐานที่เข้าถึงบ่อยมีประวัติได้หลายร้อยรายการ */
const ACCESS_HISTORY_WINDOW = 10;
/** จำนวนที่ดึงจาก backend ต่อครั้ง — คุมขนาด response ไม่ให้บานตามจำนวนการเข้าถึง */
const VERIFY_HISTORY_FETCH = 50;

/** เหตุการณ์ 1 รายการในรายการประวัติ — รวมรูปแบบจาก watermark verify กับ chain-of-custody */
interface AccessHistoryEntry {
  key: string;
  action: string;
  occurred_at: number | null;
  tx_hash: string;
  block_number: number | null;
  transaction_index: number | null;
  log_index: number | null;
  matched: boolean;
  actorName: string | null;
}

function BlockchainAccessHistory({ result }: { result: VerifyResult }) {
  // ประวัติจาก /watermark/verify ถูกกรองไว้เฉพาะผู้ใช้ที่ตรงกับลายน้ำ (กรองที่ backend)
  // จึงดึงประวัติเต็มของหลักฐานชิ้นนี้จาก chain-of-custody มาแสดงแทน
  const [full, setFull] = useState<ChainOfCustodyResponse | null>(null);
  const [fullError, setFullError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!result.evidenceId) return;
    let cancelled = false;
    evidenceService
      .getChainOfCustody(result.evidenceId, { limit: VERIFY_HISTORY_FETCH })
      .then((data) => { if (!cancelled) setFull(data); })
      .catch(() => { if (!cancelled) setFullError(true); });
    return () => { cancelled = true; };
  }, [result.evidenceId]);

  const fallback: AccessHistoryEntry[] = result.blockchainAccessHistory.map((e) => ({
    key: `${e.tx_hash}-${e.log_index}`,
    action: e.action,
    occurred_at: e.occurred_at,
    tx_hash: e.tx_hash,
    block_number: e.block_number,
    transaction_index: e.transaction_index,
    log_index: e.log_index,
    matched: e.matched,
    actorName: null,
  }));

  const complete: AccessHistoryEntry[] = (full?.access_history ?? [])
    .map((item) => ({
      key: item.access_session_ref,
      action: item.action,
      occurred_at: item.blockchain?.occurred_at ?? null,
      tx_hash: item.blockchain?.transaction_hash ?? item.transaction?.tx_hash ?? "",
      block_number: item.blockchain?.block_number ?? item.transaction?.block_number ?? null,
      transaction_index: item.blockchain?.transaction_index ?? null,
      log_index: item.blockchain?.log_index ?? null,
      // รายการที่ Dynamic Watermark ในไฟล์นี้ชี้ถึง
      matched: Boolean(result.dynamicDecoded)
        && item.access_session_ref.toLowerCase() === result.dynamicDecoded!.toLowerCase(),
      actorName: item.user?.full_name || item.user?.display_name || null,
    }))
    .sort((a, b) => compareBlockchainOrder(
      { blockNumber: a.block_number, transactionIndex: a.transaction_index, logIndex: a.log_index, recordedAt: a.occurred_at, stableKey: a.key },
      { blockNumber: b.block_number, transactionIndex: b.transaction_index, logIndex: b.log_index, recordedAt: b.occurred_at, stableKey: b.key },
    ));

  const showingComplete = complete.length > 0;
  const events = showingComplete ? complete : fallback;

  // หลักฐานที่ถูกเปิดดูบ่อยอาจมีประวัติหลายร้อยรายการ — ย่อเหลือช่วงท้ายไว้ก่อน
  // แต่รายการที่ตรงกับลายน้ำต้องเห็นเสมอ เพราะเป็นหัวใจของการตรวจสอบ
  const matchedIndex = events.findIndex((e) => e.matched);
  const windowStart = Math.max(0, events.length - ACCESS_HISTORY_WINDOW);
  const hidden = expanded ? 0 : windowStart;
  const visible = expanded ? events : events.slice(windowStart);
  const matchedPinned = !expanded && matchedIndex >= 0 && matchedIndex < windowStart
    ? { entry: events[matchedIndex], position: matchedIndex + 1 }
    : null;

  return (
    <section className="mt-6 border-t border-border pt-5">
      <div className="flex items-start gap-2">
        <Clock3 className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h3 className="font-semibold">
            {showingComplete ? "ประวัติการเข้าถึงทั้งหมดของหลักฐานชิ้นนี้" : "ประวัติการเข้าถึงก่อนการดาวน์โหลดนี้"}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {showingComplete
              ? "ทุกเหตุการณ์ของทุกผู้ใช้ที่บันทึกไว้บน Blockchain เรียงตามตำแหน่งบนเชน"
              : "เฉพาะเหตุการณ์ของผู้ใช้ที่อ้างอิงจาก Blockchain และเรียงตามตำแหน่งบนเชน"}
          </p>
          {showingComplete && full && full.access_history_total > events.length && (
            <p className="mt-1 text-xs text-muted">
              แสดง {events.length.toLocaleString("th-TH")} รายการล่าสุด จากทั้งหมด {full.access_history_total.toLocaleString("th-TH")} รายการ
            </p>
          )}
          {fullError && (
            <p className="mt-1 text-xs text-warning">อ่านประวัติเต็มจาก Blockchain ไม่สำเร็จ — แสดงเฉพาะเหตุการณ์ของผู้ใช้ที่ตรงกับลายน้ำ</p>
          )}
        </div>
      </div>
      {events.length === 0 ? (
        <p className="mt-4 border-y border-border py-4 text-sm text-muted">ไม่พบประวัติการเข้าถึงก่อนหน้า</p>
      ) : (
        <>
          <div className="mt-4 divide-y divide-border border-y border-border">
            {matchedPinned && (
              <AccessHistoryRow entry={matchedPinned.entry} position={matchedPinned.position} note="อยู่นอกช่วงที่แสดง — ปักหมุดไว้ให้เห็นเสมอ" />
            )}
            {hidden > 0 && (
              <p className="px-1 py-3 text-xs text-muted">ซ่อนอยู่อีก {hidden.toLocaleString("th-TH")} รายการก่อนหน้านี้</p>
            )}
            {visible.map((event, index) => (
              <AccessHistoryRow key={event.key} entry={event} position={(expanded ? 0 : windowStart) + index + 1} />
            ))}
          </div>
          {events.length > ACCESS_HISTORY_WINDOW && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-hover"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
              {expanded ? "ย่อรายการ" : `แสดงที่โหลดมาทั้งหมด ${events.length.toLocaleString("th-TH")} รายการ`}
            </button>
          )}
        </>
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
  return <button type="button" title="คัดลอก" aria-label="คัดลอก" className="shrink-0 text-muted hover:text-primary" onClick={() => void copyTextWithFeedback(value)}><Copy className="h-3.5 w-3.5" /></button>;
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

function numberValue(value: number | null): string | null {
  return value === null ? null : String(value);
}

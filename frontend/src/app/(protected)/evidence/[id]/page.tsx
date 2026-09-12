"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ShieldCheck, Link2, Fingerprint, ShieldAlert, Loader2, ImageOff, Image as ImageIcon, Calendar, HardDrive, FolderOpen, FileText, UploadCloud, Download, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSupervisorMap } from "@/hooks/useSupervisorMap";
import { ApiError, caseService, evidenceService } from "@/services";
import { canSeeCase } from "@/utils/caseAccess";
import type { Case, EvidenceDownloadMetadata, EvidenceItem } from "@/interfaces";
import { EvidencePreviewImage } from "@/components/EvidencePreviewImage";
import { useEvidenceViewSession } from "@/hooks/useEvidenceViewSession";
import { IntentionalEvidenceProgress } from "@/components/feedback/IntentionalEvidenceProgress";
import { ChainOfCustodyPanel } from "@/components/evidence/ChainOfCustodyPanel";
import { OperationToast } from "@/components/feedback/OperationToast";
import { WatermarkQrPresentation } from "@/components/evidence/WatermarkQrPresentation";
import { EvidenceHashComparison } from "@/components/evidence/EvidenceHashComparison";
import {
  downloadErrorDialog,
  type DownloadErrorDialogContent,
} from "@/utils/evidenceDownloadError";
import {
  consumeViewSuccess,
  downloadSuccessSummary,
  VIEW_SUCCESS_FEEDBACK,
} from "@/utils/evidenceOperationFeedback";
import { personalizedWatermarkPayloads } from "@/utils/watermarkPresentation";


export default function EvidenceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const supervisorMap = useSupervisorMap();
  const [evidence, setEvidence] = useState<EvidenceItem | null | undefined>(undefined);
  const [caseData, setCaseData] = useState<Case | undefined>(undefined);
  const [downloading, setDownloading] = useState(false);
  const [downloadDialog, setDownloadDialog] = useState<DownloadErrorDialogContent | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<EvidenceDownloadMetadata | null>(null);
  const [showViewSuccess, setShowViewSuccess] = useState(false);
  const downloadInProgress = useRef(false);
  // ด่านสุดท้ายก่อนแสดงหลักฐาน — ทุกทางเข้าต้องผ่านตรงนี้
  const {
    recordView,
    pendingEvidenceId,
    status: viewStatus,
    delayed: viewDelayed,
    error: viewError,
    dismissError: dismissViewError,
  } = useEvidenceViewSession();
  const [viewRecorded, setViewRecorded] = useState(false);
  const viewGateStarted = useRef<string | undefined>(undefined);

  const dismissViewSuccess = useCallback(() => setShowViewSuccess(false), []);


  useEffect(() => {
    (async () => {
      const ev = await evidenceService.get(id);
      if (!ev) {
        setEvidence(null);
        return;
      }
      const c = await caseService.get(ev.case_id);
      setCaseData(c);
      setEvidence(ev);
    })();
  }, [id]);

  // บันทึก VIEW ทุกครั้งที่หน้านี้ถูกเปิด ไม่ว่ามาจากทางไหน — กดจากรายการหลักฐาน,
  // กดจากหน้าบันทึกการเข้าถึง, พิมพ์ URL เอง, bookmark หรือ refresh
  //
  // ถ้าเพิ่งบันทึกไปแล้วก่อนเปลี่ยนหน้า (openEvidence) จะข้าม เพื่อไม่ให้การกดครั้งเดียว
  // เกิดสองรายการ — เทียบด้วย evidence_id จริง ไม่ใช่ค่าใน URL ซึ่งอาจเป็นเลขหลักฐาน
  useEffect(() => {
    if (!evidence) return;
    if (viewGateStarted.current === evidence.evidence_id) return;
    viewGateStarted.current = evidence.evidence_id;

    const remembered = consumeViewSuccess(evidence.evidence_id);
    if (remembered) {
      // เลื่อนออกจากรอบ effect เพื่อไม่ตั้ง state ระหว่าง render (react-hooks)
      const timeout = window.setTimeout(() => {
        setShowViewSuccess(true);
        setViewRecorded(true);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    void recordView(evidence.evidence_id).then((session) => {
      if (session) setViewRecorded(true);
    });
  }, [evidence, recordView]);

  if (!user || evidence === undefined || supervisorMap === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (evidence === null) return <p className="p-6">Evidence not found</p>;

  // ยังบันทึก VIEW ไม่สำเร็จ = ยังไม่แสดงหลักฐาน
  // ถ้าปล่อยให้เห็นก่อน จะมีการเข้าถึงที่ไม่มีร่องรอยใน access log และบนเชน
  // ซึ่งทำให้ตามหาต้นตอตอนหลักฐานรั่วไม่ได้
  if (!viewRecorded) {
    return (
      <div className="flex h-64 items-center justify-center">
        {!viewError && <Loader2 className="h-6 w-6 animate-spin text-primary" />}
        <IntentionalEvidenceProgress
          opening={pendingEvidenceId !== undefined}
          status={viewStatus}
          delayed={viewDelayed}
          error={viewError}
          onDismissError={dismissViewError}
        />
      </div>
    );
  }

  const isAdmin = user.role === "admin";
  // ข้อมูลเชิงลึก (hash/blockchain/logs/watermark) เปิดเผยกลไกภายใน — เฉพาะ admin
  const allowed = isAdmin ? true : caseData ? canSeeCase(user, caseData, supervisorMap) : false;

  const handleDownload = async () => {
    if (downloadInProgress.current) return;
    downloadInProgress.current = true;
    setDownloading(true);
    setDownloadDialog(null);
    setDownloadSuccess(null);
    try {
      const download = await evidenceService.download(evidence.evidence_id);
      const url = URL.createObjectURL(download.blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = evidence.original_filename || `${evidence.evidence_number}.bin`;
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      setDownloadSuccess(download.metadata);
    } catch (cause) {
      setDownloadDialog(downloadErrorDialog(
        cause instanceof ApiError || cause instanceof TypeError
          ? cause
          : { message: "เกิดข้อผิดพลาดระหว่างดาวน์โหลด กรุณาลองใหม่อีกครั้ง" },
      ));
    } finally {
      downloadInProgress.current = false;
      setDownloading(false);
    }
  };

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <ShieldAlert className="h-10 w-10 text-danger" />
        <p className="text-lg font-semibold">ไม่มีสิทธิ์เข้าถึงหลักฐานนี้</p>
        <p className="text-sm text-muted">หลักฐานนี้อยู่ในคดีนอกความรับผิดชอบของคุณ</p>
        <Link href="/cases" className="mt-2 text-sm text-primary hover:underline">← กลับไปหน้าคดี</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href={`/cases/${evidence.case_number ?? evidence.case_id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary transition-colors">
        <ArrowLeft className="h-4 w-4" /> กลับไปหน้าคดี {evidence.case_number ?? ""}
      </Link>

      {/* Header — ชื่อหลักฐาน + สถานะ (badge สถานะเปิดเผยกลไก จึงเฉพาะ admin) */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">หลักฐานดิจิทัล</p>
          <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight">{evidence.evidence_number}</h1>
          {evidence.description && <p className="mt-1 max-w-xl text-sm text-text-secondary">{evidence.description}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            ดาวน์โหลดภาพ
          </button>
          {isAdmin && (
            <div className="flex flex-wrap justify-end gap-2">
              <StatusPill ok={evidence.is_watermarked} icon={ShieldCheck} okText="ฝังลายน้ำแล้ว" noText="ยังไม่ฝังลายน้ำ" />
              <StatusPill ok={evidence.is_blockchain_verified} icon={Link2} okText="บันทึกบล็อกเชนแล้ว" noText="รอบันทึกบล็อกเชน" />
            </div>
          )}
        </div>
      </div>

      {/* Phase 2 Banner — เปิดเผยกลไกภายใน จึงแสดงเฉพาะ admin */}
      {isAdmin && (
      <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <Fingerprint className="h-5 w-5 text-primary" />
        <p className="text-sm text-blue-800">เมื่อดาวน์โหลด ระบบจะบันทึกการเข้าถึงลง Blockchain และฝัง Dynamic Watermark อัตโนมัติ</p>
      </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Image */}
        <div className="space-y-6 lg:col-span-2">
          <figure className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
            <div className="relative flex items-center justify-center bg-slate-900" style={{ minHeight: 320 }}>
              <EvidencePreviewImage
                fileId={evidence.display_file_id}
                alt={evidence.description || evidence.original_filename}
                className="max-h-[540px] w-full object-contain"
                fallback={
                  <div className="flex w-full flex-col items-center justify-center gap-2 bg-slate-50 py-24 text-center">
                    <ImageOff className="h-8 w-8 text-muted" />
                    <p className="text-sm text-muted">ไม่พบไฟล์หลักฐานเดิม</p>
                  </div>
                }
                loadingFallback={
                  <div className="flex flex-col items-center justify-center gap-2 bg-slate-50 py-24 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted" />
                    <p className="text-sm text-muted">กำลังโหลดภาพตัวอย่าง</p>
                  </div>
                }
              />
            </div>
            <figcaption className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5 truncate">
                <ImageIcon className="h-3.5 w-3.5 flex-shrink-0" /> {evidence.original_filename}
              </span>
              {evidence.captured_at && (
                <span className="inline-flex items-center gap-1.5 flex-shrink-0">
                  <Calendar className="h-3.5 w-3.5" /> ถ่ายเมื่อ {new Date(evidence.captured_at).toLocaleDateString("th-TH")}
                </span>
              )}
            </figcaption>
          </figure>

        </div>

        {/* Right: Info */}
        <div className="space-y-6">
          {/* Evidence Info */}
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
            {/* เจ้าหน้าที่ผู้ดูแล — เด่นด้านบนพร้อม avatar */}
            <div className="flex items-center gap-3 border-b border-border bg-surface-hover/60 px-5 py-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {(evidence.officer_name || "?").trim().charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{evidence.officer_name || "—"}</p>
                <p className="text-xs text-muted">เจ้าหน้าที่ผู้ดูแลหลักฐาน</p>
              </div>
            </div>
            <dl className="divide-y divide-border text-sm">
              <InfoRow icon={FolderOpen} label="คดี">
                <Link href={`/cases/${evidence.case_number ?? evidence.case_id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                  {evidence.case_number || "—"}
                </Link>
              </InfoRow>
              <InfoRow icon={FileText} label="ชื่อไฟล์">
                <span title={evidence.original_filename}>{evidence.original_filename}</span>
              </InfoRow>
              <InfoRow icon={HardDrive} label="ขนาดไฟล์">
                {evidence.file_size_bytes ? `${(evidence.file_size_bytes / 1e6).toFixed(1)} MB` : "—"}
              </InfoRow>
              <InfoRow icon={Calendar} label="วันที่ถ่าย">
                {evidence.captured_at ? new Date(evidence.captured_at).toLocaleString("th-TH") : "—"}
              </InfoRow>
              <InfoRow icon={UploadCloud} label="วันที่อัปโหลด">
                {new Date(evidence.uploaded_at).toLocaleString("th-TH")}
              </InfoRow>
            </dl>
          </div>

          {/* ค่าแฮชไฟล์ต้นฉบับไม่แสดงตรงนี้แล้ว — มีอยู่ในลำดับการครอบครองหลักฐานด้านล่าง
              ซึ่งแสดงคู่กับค่าบน Blockchain ให้เทียบกันได้จริง */}

          {/* Watermark Status — admin เท่านั้น */}
          {isAdmin && (
          <div className="space-y-3 rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">สถานะการคุ้มครองหลักฐาน</h3>
            </div>
            <div className="space-y-2.5">
              <ProtectionRow
                label="ลายน้ำดิจิทัล"
                hint="ฝังไว้ในไฟล์ตั้งแต่อัปโหลด"
                ok={evidence.is_watermarked}
                okText="ฝังแล้ว"
                pendingText="ยังไม่ฝัง"
              />
              <ProtectionRow
                label="บันทึกบน Blockchain"
                hint="ลงทะเบียนค่าแฮชไว้บนเชนแล้ว"
                ok={evidence.is_blockchain_verified}
                okText="บันทึกแล้ว"
                pendingText="รอบันทึก"
              />
            </div>
          </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <div id="chain-of-custody">
          <ChainOfCustodyPanel evidenceId={evidence.evidence_id} />
        </div>
      )}

      {downloadDialog && (
        <DownloadErrorModal
          content={downloadDialog}
          onClose={() => setDownloadDialog(null)}
          onViewChainOfCustody={isAdmin ? () => {
            setDownloadDialog(null);
            document.getElementById("chain-of-custody")?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          } : undefined}
        />
      )}

      {downloadSuccess && (
        <DownloadSuccessModal
          metadata={downloadSuccess}
          onClose={() => setDownloadSuccess(null)}
        />
      )}

      {showViewSuccess && (
        <OperationToast
          title={VIEW_SUCCESS_FEEDBACK.title}
          message={VIEW_SUCCESS_FEEDBACK.message}
          onClose={dismissViewSuccess}
        />
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <dt className="inline-flex flex-shrink-0 items-center gap-2 text-muted">
        <Icon className="h-4 w-4 flex-shrink-0 text-slate-400" />
        {label}
      </dt>
      <dd className="min-w-0 flex-1 truncate text-right font-medium">{children}</dd>
    </div>
  );
}

/** หนึ่งบรรทัดของการ์ด "สถานะการคุ้มครองหลักฐาน" — ชื่อ + คำอธิบายสั้น + ชิปผลลัพธ์ */
function ProtectionRow({
  label,
  hint,
  ok,
  okText,
  pendingText,
}: { label: string; hint: string; ok: boolean; okText: string; pendingText: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted">{hint}</p>
      </div>
      <span
        className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
          ok ? "bg-success-light text-success" : "bg-surface-hover text-muted"
        }`}
      >
        {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
        {ok ? okText : pendingText}
      </span>
    </div>
  );
}

function StatusPill({ ok, icon: Icon, okText, noText }: { ok: boolean; icon: LucideIcon; okText: string; noText: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
        ok ? "border-success/20 bg-success-light text-success" : "border-border bg-surface-hover text-muted"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {ok ? okText : noText}
    </span>
  );
}

function DownloadErrorModal({
  content,
  onClose,
  onViewChainOfCustody,
}: {
  content: DownloadErrorDialogContent;
  onClose: () => void;
  onViewChainOfCustody?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="presentation">
      <section
        aria-labelledby="download-error-title"
        aria-modal="true"
        className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning" />
            <div>
              <h2 id="download-error-title" className="font-semibold">{content.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{content.message}</p>
            </div>
          </div>
          <button type="button" aria-label="ปิด" title="ปิด" className="text-muted hover:text-text" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {content.kind === "integrity" && content.hashComparison && (
          <EvidenceHashComparison comparison={content.hashComparison} />
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {onViewChainOfCustody && content.kind === "integrity" && (
            <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-hover" onClick={onViewChainOfCustody}>
              <Link2 className="h-4 w-4" /> ดู Chain of Custody
            </button>
          )}
          <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90" onClick={onClose}>
            <CheckCircle2 className="h-4 w-4" /> รับทราบ
          </button>
        </div>
      </section>
    </div>
  );
}

function DownloadSuccessModal({
  metadata,
  onClose,
}: {
  metadata: EvidenceDownloadMetadata;
  onClose: () => void;
}) {
  const summary = downloadSuccessSummary(metadata);
  const watermarkPayloads = personalizedWatermarkPayloads(metadata);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="presentation">
      <section
        aria-labelledby="download-success-title"
        aria-modal="true"
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-success" aria-hidden="true" />
            <div>
              <h2 id="download-success-title" className="font-semibold">{summary.title}</h2>
              <p className="mt-1 text-sm text-muted">{summary.message}</p>
            </div>
          </div>
          <button type="button" aria-label="ปิด" title="ปิด" className="text-muted hover:text-text" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4 text-sm">
          <WatermarkQrPresentation
            title="Personalized Watermark"
            qrTitle="QR ที่ใช้กับสำเนานี้"
            staticValue={watermarkPayloads.staticPayload}
            dynamicValue={watermarkPayloads.dynamicPayload}
            dynamicMode="personalized"
            generateQr
          />
          <section className="border-t border-border pt-4">
            <h3 className="text-xs font-semibold text-muted">Blockchain Access Record</h3>
            <dl className="mt-2 space-y-2">
              <DownloadSummaryRow label="การกระทำ" value={summary.action} />
              <DownloadSummaryRow label="Block" value={summary.blockNumber === null ? null : String(summary.blockNumber)} />
              <DownloadSummaryRow label="Transaction" value={summary.transactionHash} />
            </dl>
          </section>
          <p className={`flex items-start gap-2 border-t border-border pt-4 text-xs ${summary.integrityVerified ? "text-success" : "text-warning"}`}>
            {summary.integrityVerified
              ? <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              : <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />}
            <span><strong>ความถูกต้องของไฟล์ต้นฉบับ:</strong> {summary.integrityMessage}</span>
          </p>
        </div>

        <div className="mt-5 flex justify-end">
          <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90" onClick={onClose}>
            <CheckCircle2 className="h-4 w-4" /> รับทราบ
          </button>
        </div>
      </section>
    </div>
  );
}

function DownloadSummaryRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)] gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="break-all text-right font-mono text-xs">{value || "—"}</dd>
    </div>
  );
}

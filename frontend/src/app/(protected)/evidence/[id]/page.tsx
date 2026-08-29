"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, ShieldAlert, Link2, Fingerprint, Loader2, ImageOff, Download, ChevronDown, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Copy, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import ProtectedImage from "@/components/ProtectedImage";
import { useSupervisorMap } from "@/hooks/useSupervisorMap";
import { caseService, evidenceService, accessLogService } from "@/services";
import { canSeeCase } from "@/utils/caseAccess";
import { getToken } from "@/utils/session";
import type { Case, EvidenceItem, BlockchainTx, AccessLog, BlockchainVerification } from "@/interfaces";
import { labelForAction } from "@/utils/labels";

// จำนวนรายการประวัติการเข้าถึงต่อหน้า
const LOG_PAGE_SIZE = 8;

export default function EvidenceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const supervisorMap = useSupervisorMap();
  const [evidence, setEvidence] = useState<EvidenceItem | null | undefined>(undefined);
  const [caseData, setCaseData] = useState<Case | undefined>(undefined);
  const [relatedTx, setRelatedTx] = useState<BlockchainTx[]>([]);
  const [relatedLogs, setRelatedLogs] = useState<AccessLog[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [chainCheck, setChainCheck] = useState<BlockchainVerification | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [showChainDetail, setShowChainDetail] = useState(false);
  const [logPage, setLogPage] = useState(1);

  useEffect(() => {
    (async () => {
      // เปลี่ยนหลักฐาน — ล้างผลตรวจ/สถานะของชิ้นก่อนหน้า กันแสดงผลผิดชิ้น
      setChainCheck(null);
      setCheckedAt(null);
      setShowChainDetail(false);
      setLogPage(1);
      setRelatedLogs([]);
      const ev = await evidenceService.get(id);
      if (!ev) {
        setEvidence(null);
        return;
      }
      const [c, tx] = await Promise.all([
        caseService.get(ev.case_id),
        evidenceService.transactionsOf(id),
      ]);
      setCaseData(c);
      setRelatedTx(tx);
      setEvidence(ev);
    })();
  }, [id]);

  // ประวัติการเข้าถึงเป็นข้อมูลเฉพาะ admin (endpoint ก็ admin-only) — ดึงแยกและเฉพาะ admin
  useEffect(() => {
    if (user?.role !== "admin") return;
    accessLogService.list({ evidence_id: id }).then(setRelatedLogs).catch(() => {});
  }, [id, user]);

  if (!user || evidence === undefined || supervisorMap === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (evidence === null) return <p className="p-6">Evidence not found</p>;

  const isAdmin = user.role === "admin";
  // ข้อมูลเชิงลึก (hash/blockchain/logs/watermark) เปิดเผยกลไกภายใน — เฉพาะ admin
  const allowed = isAdmin ? true : caseData ? canSeeCase(user, caseData, supervisorMap) : false;

  // ดาวน์โหลดไฟล์ที่ฝังลายน้ำแล้ว (thumbnail_url ชี้ display_file_id = ตัวลายน้ำ)
  // endpoint ข้ามโดเมน (8000↔3000) ทำให้ attribute download ถูกเมิน — ต้องดึงเป็น blob เอง
  const handleDownload = async () => {
    if (!evidence?.thumbnail_url) return;
    setDownloading(true);
    try {
      // ?action=download + แนบ token เพื่อให้ server บันทึก DOWNLOAD log ว่าใครโหลด
      const sep = evidence.thumbnail_url.includes("?") ? "&" : "?";
      const token = getToken();
      // no-store: บังคับยิง server ทุกครั้ง ไม่ให้เบราว์เซอร์ serve จาก cache
      const res = await fetch(`${evidence.thumbnail_url}${sep}action=download`, {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = evidence.original_filename || `${evidence.evidence_number}.png`;
      a.click();
      URL.revokeObjectURL(url);

      // รีเฟรชตารางประวัติให้เห็น DOWNLOAD ที่เพิ่งบันทึกทันที (เฉพาะ admin ที่เห็นประวัติ)
      if (isAdmin) {
        accessLogService.list({ evidence_id: id }).then(setRelatedLogs).catch(() => {});
      }
    } finally {
      setDownloading(false);
    }
  };

  // ตรวจสอบความสมบูรณ์กับบล็อกเชน (mock) — เทียบแฮชไฟล์ + จำนวน access log กับที่บันทึกบนเชน
  const handleChainCheck = async () => {
    if (!evidence) return;
    setChecking(true);
    setShowChainDetail(false); // ตรวจใหม่ = พับรายละเอียดกลับ
    try {
      // ดึง log สดตอนตรวจ (แทนที่จะพึ่ง state ที่อาจยังโหลดไม่เสร็จ) — กันตรวจกับชุดว่าง/ไม่ครบ
      const logs = isAdmin ? await accessLogService.list({ evidence_id: id }) : relatedLogs;
      if (isAdmin) setRelatedLogs(logs);
      setChainCheck(await evidenceService.verifyOnChain(evidence, logs));
      setCheckedAt(new Date());
    } finally {
      setChecking(false);
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

  const anomalies = chainCheck?.logEntries.filter((e) => e.status !== "match").length ?? 0;
  // จำนวนชั้นที่ผ่าน (ไฟล์ + audit trail) + สรุปผลเป็นภาษาคน
  const passCount = chainCheck ? (chainCheck.fileMatch ? 1 : 0) + (chainCheck.logMatch ? 1 : 0) : 0;
  const chainConclusion = !chainCheck
    ? ""
    : chainCheck.verified
      ? "ไฟล์ไม่ถูกแก้ไขตั้งแต่บันทึก และประวัติการเข้าถึงตรงกับบล็อกเชนทั้งหมด"
      : [
          !chainCheck.fileMatch ? "ไฟล์อาจถูกแก้ไขหลังบันทึก" : null,
          !chainCheck.logMatch ? `ประวัติการเข้าถึงมี ${anomalies} รายการผิดปกติ` : null,
        ]
          .filter(Boolean)
          .join(" และ ");

  // ประวัติการเข้าถึง (เรียงใหม่→เก่า) — แบ่งหน้า LOG_PAGE_SIZE รายการ/หน้า
  const sortedLogs = [...relatedLogs].sort((a, b) => b.accessed_at.localeCompare(a.accessed_at));
  const totalLogPages = Math.max(1, Math.ceil(sortedLogs.length / LOG_PAGE_SIZE));
  const curLogPage = Math.min(logPage, totalLogPages);
  const visibleLogs = sortedLogs.slice((curLogPage - 1) * LOG_PAGE_SIZE, curLogPage * LOG_PAGE_SIZE);

  return (
    <div className="space-y-5">
      {/* Breadcrumb + การกระทำ */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/cases/${evidence.case_id}`} className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> คดี
        </Link>
        <span className="text-muted/60">/</span>
        <span className="font-mono text-sm text-muted">{evidence.case_number ?? "—"}</span>
        <span className="text-muted/60">/</span>
        <span className="font-mono text-base font-semibold">{evidence.evidence_number}</span>

        <div className="ml-auto flex gap-2.5">
          <button
            onClick={handleDownload}
            disabled={!evidence.thumbnail_url || downloading}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-[18px] text-sm font-semibold transition-colors hover:bg-surface-hover disabled:opacity-50"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            ดาวน์โหลด
          </button>
          {isAdmin && (
            <button
              onClick={handleChainCheck}
              disabled={checking}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-[18px] text-sm font-semibold text-white transition-colors hover:bg-ink-raised disabled:opacity-50"
            >
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {chainCheck ? "ตรวจสอบอีกครั้ง" : "ตรวจสอบกับบล็อกเชน"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
        {/* ── ซ้าย: ภาพ + ประวัติ ── */}
        <div className="space-y-4">
          {/* ภาพหลักฐาน */}
          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="mb-3.5 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">ภาพหลักฐาน</h2>
              {evidence.description && <span className="max-w-xs truncate text-xs text-muted">{evidence.description}</span>}
            </div>
            {evidence.thumbnail_url ? (
              <div className="flex items-center justify-center overflow-hidden rounded-xl bg-slate-900" style={{ minHeight: 320 }}>
                <ProtectedImage src={evidence.thumbnail_url} alt={evidence.original_filename} className="max-h-[540px] w-full object-contain" />
              </div>
            ) : (
              // TODO(backend): แสดงรูปได้เมื่อ EvidenceResponse ส่ง file_id มา (endpoint /api/evidence-files/{id} มีแล้ว)
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-surface-hover py-24 text-center">
                <ImageOff className="h-8 w-8 text-muted" />
                <p className="text-sm text-muted">ยังแสดงรูปไม่ได้</p>
                <p className="text-xs text-muted">ไฟล์ถูกเก็บไว้แล้ว แต่ API ยังไม่ส่ง file_id กลับมา</p>
              </div>
            )}
            <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs text-muted">
              <span className="truncate">{evidence.original_filename}</span>
              {evidence.file_size_bytes ? <span>{(evidence.file_size_bytes / 1e6).toFixed(1)} MB</span> : null}
              {evidence.captured_at && <span>ถ่าย {new Date(evidence.captured_at).toLocaleDateString("th-TH")}</span>}
            </div>
          </div>

          {/* ประวัติการเข้าถึง (timeline ล่าสุด→เก่า) — admin เท่านั้น */}
          {isAdmin && (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h3 className="text-[15px] font-semibold">ประวัติการเข้าถึงหลักฐานนี้</h3>
                {sortedLogs.length > 0 && (
                  <span className="text-xs text-muted">{sortedLogs.length} รายการ</span>
                )}
              </div>
              {sortedLogs.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted">ยังไม่มีการเข้าถึง</p>
              ) : (
                <div className="px-5 py-5">
                  <ol className="relative space-y-4 border-l border-border pl-5">
                    {visibleLogs.map((l) => {
                      const fail = l.result !== "success";
                      return (
                        <li key={l.log_id} className="relative">
                          <span
                            className={`absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-surface ${fail ? "bg-danger" : "bg-primary"}`}
                          />
                          <div className="flex items-baseline justify-between gap-3">
                            <span className={`text-sm font-medium ${fail ? "text-danger" : ""}`}>{labelForAction(l.action)}</span>
                            <time className="flex-shrink-0 text-xs text-muted">
                              {new Date(l.accessed_at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </time>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                            <span>{l.user_name ?? "—"}</span>
                            {l.ip_address && (
                              <>
                                <span>·</span>
                                <span className="font-mono">{l.ip_address}</span>
                              </>
                            )}
                            {fail && (
                              <span className="rounded-full bg-danger-light px-1.5 py-0.5 font-medium text-danger">ผิดปกติ</span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  {totalLogPages > 1 && (
                    <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
                      <span>หน้า {curLogPage} / {totalLogPages}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                          disabled={curLogPage <= 1}
                          aria-label="ก่อนหน้า"
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setLogPage((p) => Math.min(totalLogPages, p + 1))}
                          disabled={curLogPage >= totalLogPages}
                          aria-label="ถัดไป"
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Blockchain Transactions — admin เท่านั้น */}
          {isAdmin && (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              <div className="flex items-center gap-2 border-b border-border px-5 py-4">
                <Link2 className="h-4 w-4 text-muted" />
                <h3 className="text-[15px] font-semibold">ธุรกรรมบนบล็อกเชน</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-hover text-left text-[11px] uppercase tracking-wide text-muted">
                      <th className="px-5 py-3 font-semibold">Tx Hash</th>
                      <th className="px-5 py-3 font-semibold">Action</th>
                      <th className="px-5 py-3 font-semibold">Block</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold">เวลา</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {relatedTx.map((tx) => (
                      <tr key={tx.tx_internal_id}>
                        <td className="px-5 py-3 font-mono text-primary">{tx.tx_hash.slice(0, 18)}...</td>
                        <td className="px-5 py-3"><span className="rounded bg-surface-hover px-1.5 py-0.5">{tx.action_type}</span></td>
                        <td className="px-5 py-3 font-mono">{tx.block_number}</td>
                        <td className="px-5 py-3">
                          <span className={`rounded-full px-2 py-0.5 ${tx.status === "confirmed" ? "bg-success-light text-success" : "bg-warning-light text-warning"}`}>{tx.status}</span>
                        </td>
                        <td className="px-5 py-3 text-muted">{new Date(tx.block_timestamp).toLocaleString("th-TH")}</td>
                      </tr>
                    ))}
                    {relatedTx.length === 0 && <tr><td colSpan={5} className="px-5 py-4 text-center text-muted">ยังไม่มีธุรกรรม</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── ขวา: การตรวจสอบ + เทคนิค + รายละเอียด ── */}
        <div className="space-y-4">
          {/* การ์ดตรวจสอบสีดำ (admin) — สรุปผลตรวจกับบล็อกเชน */}
          {isAdmin && (
            <div className="rounded-[20px] bg-ink p-6 text-white">
              {!chainCheck && !checking && (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-raised">
                    <ShieldCheck className="h-5 w-5 text-ink-muted" />
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold">ยังไม่ได้ตรวจสอบ</p>
                    <p className="mt-1 text-xs text-ink-muted">กดปุ่ม “ตรวจสอบกับบล็อกเชน” ด้านบนเพื่อเทียบแฮชไฟล์และบันทึกการเข้าถึงกับที่บันทึกบนเชน</p>
                  </div>
                </div>
              )}

              {checking && (
                <div className="flex flex-col items-center gap-3 py-6 text-ink-muted">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                  <p className="text-sm">กำลังเทียบกับบล็อกเชน...</p>
                </div>
              )}

              {chainCheck && !checking && (
                <div className="flex flex-col gap-[18px]">
                  {/* Verdict banner — เห็นแวบเดียวรู้ผล */}
                  <div className={`flex flex-col gap-2.5 rounded-2xl border p-4 ${chainCheck.verified ? "border-success/30 bg-success/10" : "border-danger/30 bg-danger/10"}`}>
                    <div className="flex items-center gap-3">
                      <span className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${chainCheck.verified ? "bg-success/20" : "bg-danger/20"}`}>
                        {chainCheck.verified ? <ShieldCheck className="h-6 w-6 text-success" /> : <ShieldAlert className="h-6 w-6 text-danger" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-lg font-bold ${chainCheck.verified ? "text-success" : "text-danger"}`}>
                          {chainCheck.verified ? "ผ่านการตรวจสอบ" : "ตรวจไม่ผ่าน"}
                        </p>
                        <p className="text-xs text-ink-muted">ตรวจ 2 ชั้น · ผ่าน {passCount}/2</p>
                      </div>
                    </div>
                    <p className="text-[13px] leading-relaxed text-white">{chainConclusion}</p>
                    {checkedAt && (
                      <p className="text-[11px] text-ink-muted">
                        ตรวจเมื่อ {checkedAt.toLocaleString("th-TH")}
                        {user.full_name || user.username ? ` · โดย ${user.full_name || user.username}` : ""}
                      </p>
                    )}
                  </div>

                  {/* 2 ชั้น — checklist */}
                  <div className="flex flex-col gap-3.5">
                    <LayerRow
                      n={1}
                      label="ความสมบูรณ์ของไฟล์"
                      tech="SHA-256"
                      desc="เทียบแฮชไฟล์ปัจจุบันกับที่บันทึกบนเชนตอนอัปโหลด"
                      ok={chainCheck.fileMatch}
                    />
                    <LayerRow
                      n={2}
                      label="บันทึกการเข้าถึง"
                      tech="Audit Trail"
                      desc="เทียบแฮชของ log ทุกครั้งกับที่ขึ้นเชนไว้"
                      ok={chainCheck.logMatch}
                      extra={chainCheck.logMatch ? `ตรงทั้งหมด ${chainCheck.logEntries.length}` : `ผิดปกติ ${anomalies}/${chainCheck.logEntries.length}`}
                    />
                  </div>

                  <BlackRow label="บล็อกที่บันทึก">
                    <span className="font-mono text-white">#{chainCheck.blockNumber.toLocaleString()}</span>
                  </BlackRow>

                  {/* ปุ่มกาง/พับรายละเอียด */}
                  <button
                    onClick={() => setShowChainDetail((v) => !v)}
                    className="flex items-center justify-center gap-1.5 rounded-full bg-ink-raised px-4 py-2 text-xs font-semibold transition-colors hover:bg-ink-border"
                  >
                    {showChainDetail ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showChainDetail ? "rotate-180" : ""}`} />
                  </button>

                  {showChainDetail && (
                    <div className="flex flex-col gap-4 border-t border-ink-border pt-4">
                      {/* เทียบแฮชไฟล์ */}
                      <div className="space-y-1.5">
                        <p className="text-xs text-ink-muted">แฮชไฟล์ (SHA-256)</p>
                        <div className="space-y-2 rounded-xl bg-ink-raised p-3 text-[10px] leading-relaxed">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-mono">
                              <span className="text-ink-muted">บนเชน&nbsp;&nbsp;&nbsp;: </span>
                              <span className="break-all text-success">{chainCheck.recordedHash}</span>
                            </p>
                            <CopyButton value={chainCheck.recordedHash} />
                          </div>
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-mono">
                              <span className="text-ink-muted">ปัจจุบัน&nbsp;: </span>
                              <span className={`break-all ${chainCheck.fileMatch ? "text-success" : "text-danger"}`}>{chainCheck.currentHash}</span>
                            </p>
                            <CopyButton value={chainCheck.currentHash} />
                          </div>
                        </div>
                      </div>

                      {/* Audit trail ครบทุกรายการ */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-ink-muted">Audit Trail</p>
                          <p className="text-[11px] text-ink-muted">
                            เทียบ {chainCheck.logEntries.length} · ตรง {chainCheck.logEntries.length - anomalies} · ผิดปกติ {anomalies}
                          </p>
                        </div>

                        {/* ตรวจจับการลบ: บนเชน "มากกว่า" ในระบบ = มีบันทึกหายไปจากระบบ
                            (กรณี altered จะทำให้ onChain < local ซึ่งไม่ใช่การลบ — จับด้วย > เท่านั้น) */}
                        {chainCheck.onChainLogCount > chainCheck.localLogCount && (
                          <div className="flex items-center gap-2 rounded-lg bg-warning/15 px-3 py-2 text-[11px] font-medium text-warning-dot">
                            <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" />
                            บนเชน {chainCheck.onChainLogCount} · ในระบบ {chainCheck.localLogCount} — มีบันทึกบนเชนที่หายจากระบบ {chainCheck.onChainLogCount - chainCheck.localLogCount} รายการ
                          </div>
                        )}

                        {chainCheck.logEntries.length === 0 ? (
                          <p className="text-xs text-ink-muted">ยังไม่มีบันทึกการเข้าถึงให้ตรวจสอบ</p>
                        ) : (
                          <ul className="max-h-48 space-y-1 overflow-y-auto">
                            {/* ผิดปกติขึ้นก่อน แล้วตามด้วยที่ตรง */}
                            {[...chainCheck.logEntries]
                              .sort((a, b) => (a.status === "match" ? 1 : 0) - (b.status === "match" ? 1 : 0))
                              .map((e, i) => (
                                <li key={i} className="flex flex-col gap-1 rounded-lg bg-ink-raised px-3 py-2 text-xs">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="flex min-w-0 items-center gap-2">
                                      <LogStatusBadge status={e.status} />
                                      <span className="truncate text-white">{e.label}</span>
                                    </span>
                                    <CopyButton value={e.hash} />
                                  </div>
                                  <span className="break-all font-mono text-[10px] leading-relaxed text-ink-muted">{e.hash}</span>
                                </li>
                              ))}
                          </ul>
                        )}

                        {/* legend */}
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-muted">
                          <span>ตรง = แฮชตรงกับบนเชน</span>
                          <span>ถูกแก้ = แฮชไม่ตรง (แก้ทีหลัง)</span>
                          <span>หาย = มีบนเชนแต่หายจากระบบ</span>
                        </div>
                      </div>

                      {/* ธุรกรรมบนเชน */}
                      <div className="space-y-2.5">
                        <p className="text-xs text-ink-muted">ธุรกรรมบนเชน</p>
                        {/* แฮชแบบยาว — โชว์เต็มพร้อมปุ่มคัดลอก (ตรวจสอบต้องเห็นครบ) */}
                        <FullHashField label="Tx Hash" value={chainCheck.txHash} />
                        <FullHashField label="Contract" value={chainCheck.contractAddress} />
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-0.5">
                          <DarkMeta label="Block" mono>#{chainCheck.blockNumber.toLocaleString()}</DarkMeta>
                          <DarkMeta label="Confirmations">{chainCheck.confirmations.toLocaleString()} ครั้ง</DarkMeta>
                          <DarkMeta label="เครือข่าย">{chainCheck.network}</DarkMeta>
                          <DarkMeta label="เวลา">{new Date(chainCheck.blockTimestamp).toLocaleString("th-TH")}</DarkMeta>
                        </dl>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ข้อมูลทางเทคนิค — admin เท่านั้น */}
          {isAdmin && (
            <div className="space-y-3.5 rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-center gap-2">
                <Fingerprint className="h-4 w-4 text-primary" />
                <h3 className="text-[15px] font-semibold">ข้อมูลทางเทคนิค</h3>
              </div>
              <TechField label="แฮชไฟล์ (SHA-256)">
                {/* TODO(backend): server คำนวณไว้ใน evidence_files.file_hash แล้ว แค่ยังไม่ส่งกลับมา */}
                <span className="break-all font-mono text-xs leading-relaxed">{evidence.file_hash_sha256 ?? "— API ยังไม่ส่ง hash กลับมา"}</span>
              </TechField>
              <TechField label="ลายน้ำฝัง">
                <span className={`text-sm font-medium ${evidence.is_watermarked ? "text-success" : "text-muted"}`}>
                  {evidence.is_watermarked ? "✓ ฝังลายน้ำแล้ว" : "— ยังไม่ฝังลายน้ำ"}
                </span>
              </TechField>
              <TechField label="สถานะบล็อกเชน">
                <span className={`text-sm font-medium ${evidence.is_blockchain_verified ? "text-success" : "text-muted"}`}>
                  {evidence.is_blockchain_verified ? "✓ บันทึกบนเชนแล้ว" : "— รอบันทึก"}
                </span>
              </TechField>
            </div>
          )}

          {/* รายละเอียด (ทุก role ที่เข้าถึงได้) */}
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
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
              <InfoRow label="คดี">
                <Link href={`/cases/${evidence.case_id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                  {evidence.case_number || "—"}
                </Link>
              </InfoRow>
              <InfoRow label="ชื่อไฟล์"><span title={evidence.original_filename}>{evidence.original_filename}</span></InfoRow>
              <InfoRow label="ขนาดไฟล์">{evidence.file_size_bytes ? `${(evidence.file_size_bytes / 1e6).toFixed(1)} MB` : "—"}</InfoRow>
              <InfoRow label="วันที่ถ่าย">{evidence.captured_at ? new Date(evidence.captured_at).toLocaleString("th-TH") : "—"}</InfoRow>
              <InfoRow label="วันที่อัปโหลด">{new Date(evidence.uploaded_at).toLocaleString("th-TH")}</InfoRow>
            </dl>
          </div>

          {/* บันทึกของเจ้าหน้าที่ */}
          {evidence.description && (
            <div className="space-y-2 rounded-2xl border border-border bg-surface p-5">
              <h3 className="text-[15px] font-semibold">บันทึกของเจ้าหน้าที่</h3>
              <p className="text-[13px] leading-relaxed text-text-secondary">{evidence.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BlackRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

// แถวชั้นการตรวจ (การ์ดดำ) — เลขชั้น + label ภาษาคน (ชื่อเทคนิคเป็นรอง) + คำอธิบาย + chip สถานะ
function LayerRow({ n, label, tech, desc, ok, extra }: { n: number; label: string; tech: string; desc: string; ok: boolean; extra?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex gap-2.5">
        <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-ink-raised text-[11px] font-semibold text-ink-muted">{n}</span>
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold">
            {label} <span className="font-normal text-ink-muted">· {tech}</span>
          </span>
          <span className="text-[11px] leading-snug text-ink-muted">{desc}</span>
        </div>
      </div>
      <div className="flex flex-shrink-0 flex-col items-end gap-1">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${ok ? "bg-success/15 text-success" : "bg-danger/20 text-danger"}`}>
          {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {ok ? "ผ่าน" : "ไม่ผ่าน"}
        </span>
        {extra && <span className="text-[10px] text-ink-muted">{extra}</span>}
      </div>
    </div>
  );
}

// รายการ meta ธุรกรรม (การ์ดดำ) — label เล็ก + ค่าสั้น
function DarkMeta({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-ink-muted">{label}</dt>
      <dd className={`truncate text-xs text-white ${mono ? "font-mono" : ""}`}>{children}</dd>
    </div>
  );
}

// ฟิลด์แฮชแบบยาว (การ์ดดำ) — โชว์เต็ม break-all + ปุ่มคัดลอก
function FullHashField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-ink-muted">{label}</span>
        <CopyButton value={value} />
      </div>
      <span className="break-all font-mono text-[10px] leading-relaxed text-white">{value}</span>
    </div>
  );
}

// ปุ่มคัดลอกแฮช — คัดลอกค่าเต็มลงคลิปบอร์ด (แสดง ✓ ชั่วครู่)
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // เบราว์เซอร์ไม่รองรับ/ไม่มีสิทธิ์คลิปบอร์ด — เงียบไว้
    }
  };
  return (
    <button
      onClick={copy}
      aria-label="คัดลอกแฮช"
      className="flex flex-shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-ink-muted transition-colors hover:bg-ink-border hover:text-white"
    >
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      {copied ? "คัดลอกแล้ว" : "คัดลอก"}
    </button>
  );
}

function LogStatusBadge({ status }: { status: "match" | "altered" | "missing" }) {
  const map = {
    match: { text: "ตรง", cls: "bg-success/15 text-success" },
    altered: { text: "ถูกแก้", cls: "bg-danger/20 text-danger" },
    missing: { text: "หาย", cls: "bg-warning/20 text-warning-dot" },
  } as const;
  const s = map[status];
  return <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${s.cls}`}>{s.text}</span>;
}

function TechField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <dt className="flex-shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-right font-medium">{children}</dd>
    </div>
  );
}

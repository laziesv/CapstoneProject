"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Link2, Clock, Fingerprint, ShieldAlert, Loader2, ImageOff, Image as ImageIcon, Calendar, HardDrive, FolderOpen, FileText, UploadCloud, Download, X, CheckCircle2, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import ProtectedImage from "@/components/ProtectedImage";
import { useSupervisorMap } from "@/hooks/useSupervisorMap";
import { caseService, evidenceService, accessLogService } from "@/services";
import { canSeeCase } from "@/utils/caseAccess";
import { getToken } from "@/utils/session";
import type { Case, EvidenceItem, BlockchainTx, AccessLog, BlockchainVerification } from "@/interfaces";


export default function EvidenceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const supervisorMap = useSupervisorMap();
  const [evidence, setEvidence] = useState<EvidenceItem | null | undefined>(undefined);
  const [caseData, setCaseData] = useState<Case | undefined>(undefined);
  const [relatedTx, setRelatedTx] = useState<BlockchainTx[]>([]);
  const [relatedLogs, setRelatedLogs] = useState<AccessLog[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  const [chainCheck, setChainCheck] = useState<BlockchainVerification | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    (async () => {
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
      // (การโชว์รูปผ่าน <img> ไม่มี param/token จึงไม่ถูกนับเป็นดาวน์โหลด)
      const sep = evidence.thumbnail_url.includes("?") ? "&" : "?";
      const token = getToken();
      // no-store: บังคับยิง server ทุกครั้ง ไม่ให้เบราว์เซอร์ serve จาก cache
      // (ถ้า cache ครั้งที่ 2 จะไม่ถึง server → ไม่บันทึก DOWNLOAD log)
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

      // รีเฟรช timeline ให้เห็น DOWNLOAD ที่เพิ่งบันทึกทันที (เฉพาะ admin ที่เห็นประวัติ)
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
    try {
      setChainCheck(await evidenceService.verifyOnChain(evidence, relatedLogs));
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

  return (
    <div className="space-y-6">
      <Link href={`/cases/${evidence.case_id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary transition-colors">
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
            disabled={!evidence.thumbnail_url || downloading}
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
        <p className="text-sm text-blue-800">การเข้าถึงหน้านี้ถูกบันทึกลง Blockchain และฝัง Dynamic Watermark อัตโนมัติ</p>
      </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Image */}
        <div className="space-y-6 lg:col-span-2">
          <figure className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
            {evidence.thumbnail_url ? (
              // พื้นเข้ม + object-contain เพื่อให้เห็นภาพหลักฐานเต็มเฟรม ไม่โดนครอบ
              <div className="flex items-center justify-center bg-slate-900" style={{ minHeight: 320 }}>
                <ProtectedImage src={evidence.thumbnail_url} alt={evidence.description || evidence.original_filename} className="max-h-[540px] w-full object-contain" />
              </div>
            ) : (
              // TODO(backend): แสดงรูปได้เมื่อ EvidenceResponse ส่ง file_id มาด้วย
              // (endpoint ดูรูปมีแล้วที่ /api/evidence-files/{file_id})
              <div className="flex flex-col items-center justify-center gap-2 bg-slate-50 py-24 text-center">
                <ImageOff className="h-8 w-8 text-muted" />
                <p className="text-sm text-muted">ยังแสดงรูปไม่ได้</p>
                <p className="text-xs text-muted">ไฟล์ถูกเก็บไว้แล้ว แต่ API ยังไม่ส่ง file_id กลับมา</p>
              </div>
            )}
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

          {/* Blockchain Transactions — admin เท่านั้น */}
          {isAdmin && (
          <div className="rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-5 py-3 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-muted" />
              <h3 className="font-semibold text-sm">Blockchain Transactions</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border text-left text-muted"><th className="px-5 py-2">Tx Hash</th><th className="px-5 py-2">Action</th><th className="px-5 py-2">Block</th><th className="px-5 py-2">Status</th><th className="px-5 py-2">Time</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {relatedTx.map((tx) => (
                    <tr key={tx.tx_internal_id} className="hover:bg-surface-hover">
                      <td className="px-5 py-2 font-mono text-primary">{tx.tx_hash.slice(0, 18)}...</td>
                      <td className="px-5 py-2"><span className="rounded bg-slate-100 px-1.5 py-0.5">{tx.action_type}</span></td>
                      <td className="px-5 py-2 font-mono">{tx.block_number}</td>
                      <td className="px-5 py-2"><span className={`rounded-full px-2 py-0.5 ${tx.status === "confirmed" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{tx.status}</span></td>
                      <td className="px-5 py-2 text-muted">{new Date(tx.block_timestamp).toLocaleString("th-TH")}</td>
                    </tr>
                  ))}
                  {relatedTx.length === 0 && <tr><td colSpan={5} className="px-5 py-4 text-center text-muted">No transactions found</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {/* ตรวจสอบความสมบูรณ์กับบล็อกเชน — admin เท่านั้น */}
          {isAdmin && (
          <div className="rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted" />
                <h3 className="text-sm font-semibold">ตรวจสอบความสมบูรณ์กับบล็อกเชน</h3>
              </div>
              <button
                onClick={handleChainCheck}
                disabled={checking}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-surface-hover disabled:opacity-50"
              >
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {chainCheck ? "ตรวจสอบอีกครั้ง" : "ตรวจสอบกับบล็อกเชน"}
              </button>
            </div>

            <div className="px-5 py-4">
              {!chainCheck && !checking && (
                <p className="py-4 text-center text-sm text-muted">
                  กดปุ่มเพื่อเทียบแฮชไฟล์และบันทึกการเข้าถึงกับที่บันทึกไว้บนบล็อกเชน
                </p>
              )}

              {checking && (
                <div className="flex flex-col items-center gap-2 py-6 text-muted">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm">กำลังเทียบกับบล็อกเชน...</p>
                </div>
              )}

              {chainCheck && !checking && (
                <div className="space-y-4">
                  {/* สรุปรวม */}
                  <div
                    className={`flex items-center gap-3 rounded-lg px-4 py-3 ${
                      chainCheck.verified ? "bg-success-light text-success" : "bg-danger-light text-danger"
                    }`}
                  >
                    {chainCheck.verified ? <ShieldCheck className="h-5 w-5 flex-shrink-0" /> : <ShieldAlert className="h-5 w-5 flex-shrink-0" />}
                    <div>
                      <p className="text-sm font-semibold">
                        {chainCheck.verified ? "ข้อมูลตรงกัน หลักฐานไม่ถูกดัดแปลง" : "พบความไม่ตรงกัน — หลักฐานอาจถูกแก้ไข"}
                      </p>
                      <p className="text-xs opacity-80">
                        {chainCheck.verified ? "แฮชไฟล์และบันทึกการเข้าถึงตรงกับบล็อกเชนทั้งหมด" : "มีบางส่วนไม่ตรงกับที่บันทึกบนบล็อกเชน โปรดตรวจสอบ"}
                      </p>
                    </div>
                  </div>

                  {/* (1) ความสมบูรณ์ของไฟล์ */}
                  <div className="space-y-2">
                    <ChainCheckRow label="ความสมบูรณ์ของไฟล์ (SHA-256)" ok={chainCheck.fileMatch} />
                    <div className="space-y-1.5 rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed">
                      <div>
                        <span className="text-slate-400">บนเชน&nbsp;&nbsp;&nbsp;: </span>
                        <span className="break-all text-emerald-300">{chainCheck.recordedHash}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">ปัจจุบัน&nbsp;: </span>
                        <span className={`break-all ${chainCheck.fileMatch ? "text-emerald-300" : "text-red-400"}`}>{chainCheck.currentHash}</span>
                      </div>
                    </div>
                  </div>

                  {/* (2) audit trail — access log (เทียบทีละรายการ) */}
                  <div className="space-y-2">
                    <ChainCheckRow label="บันทึกการเข้าถึง (Audit Trail)" ok={chainCheck.logMatch} />
                    <p className="px-1 text-xs text-muted">
                      เทียบ <span className="font-medium text-text">{chainCheck.logEntries.length}</span> รายการ
                      <span className="mx-1.5">·</span>
                      ตรง <span className="font-medium text-success">{chainCheck.logEntries.filter((e) => e.status === "match").length}</span>
                      {chainCheck.logEntries.some((e) => e.status !== "match") && (
                        <>
                          <span className="mx-1.5">·</span>
                          ผิดปกติ <span className="font-medium text-danger">{chainCheck.logEntries.filter((e) => e.status !== "match").length}</span>
                        </>
                      )}
                    </p>
                    {chainCheck.logEntries.length === 0 ? (
                      <p className="px-1 text-xs text-muted">ยังไม่มีบันทึกการเข้าถึงให้ตรวจสอบ</p>
                    ) : (
                      <ul className="max-h-44 space-y-1 overflow-y-auto">
                        {/* โชว์รายการผิดปกติก่อน แล้วตามด้วยที่ตรง */}
                        {[...chainCheck.logEntries]
                          .sort((a, b) => (a.status === "match" ? 1 : 0) - (b.status === "match" ? 1 : 0))
                          .map((e, i) => (
                            <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                              <span className="flex min-w-0 items-center gap-2">
                                <LogStatusBadge status={e.status} />
                                <span className="truncate">{e.label}</span>
                              </span>
                              <span className="flex-shrink-0 font-mono text-[10px] text-muted">{e.hash.slice(0, 12)}…</span>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>

                  {/* รายละเอียดธุรกรรมบนเชน */}
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-xs">
                    <ChainMeta label="Tx Hash" mono>{chainCheck.txHash.slice(0, 22)}...</ChainMeta>
                    <ChainMeta label="Block" mono>{chainCheck.blockNumber.toLocaleString()}</ChainMeta>
                    <ChainMeta label="Network">{chainCheck.network}</ChainMeta>
                    <ChainMeta label="Confirmations">{chainCheck.confirmations.toLocaleString()}</ChainMeta>
                    <ChainMeta label="Contract" mono>{chainCheck.contractAddress.slice(0, 22)}...</ChainMeta>
                    <ChainMeta label="เวลา">{new Date(chainCheck.blockTimestamp).toLocaleString("th-TH")}</ChainMeta>
                  </dl>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Access History — admin เท่านั้น (กดปุ่มเปิด timeline ใน modal) */}
          {isAdmin && (
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">ประวัติการเข้าถึง</h3>
                <p className="text-xs text-muted">
                  {relatedLogs.length > 0 ? `มีการเข้าถึง ${relatedLogs.length} ครั้ง` : "ยังไม่มีการเข้าถึง"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowAccess(true)}
              disabled={relatedLogs.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-medium transition-colors hover:bg-surface-hover disabled:opacity-50"
            >
              <Clock className="h-4 w-4" />
              ดูไทม์ไลน์
            </button>
          </div>
          )}
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
                <Link href={`/cases/${evidence.case_id}`} className="font-mono text-xs font-medium text-primary hover:underline">
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

          {/* File Hash — admin เท่านั้น */}
          {isAdmin && (
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <Fingerprint className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">SHA-256 Hash</h3>
            </div>
            <p className="break-all rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-emerald-300">
              {/* TODO(backend): server คำนวณไว้แล้วใน evidence_files.file_hash แค่ยังไม่ส่งกลับมา */}
              {evidence.file_hash_sha256 ?? "— API ยังไม่ส่ง hash กลับมา"}
            </p>
          </div>
          )}

          {/* Watermark Status — admin เท่านั้น */}
          {isAdmin && (
          <div className="space-y-3 rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Watermark</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">Static Watermark</span>
                <span className={`text-xs font-medium ${evidence.is_watermarked ? "text-success" : "text-muted"}`}>{evidence.is_watermarked ? "✓ Embedded" : "— Not embedded"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Blockchain</span>
                <span className={`text-xs font-medium ${evidence.is_blockchain_verified ? "text-success" : "text-muted"}`}>{evidence.is_blockchain_verified ? "✓ On-chain" : "— Pending"}</span>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

      {isAdmin && showAccess && (
        <AccessTimelineModal
          logs={relatedLogs}
          evidenceNumber={evidence.evidence_number}
          onClose={() => setShowAccess(false)}
        />
      )}
    </div>
  );
}

// สีของ badge — ชุดเดียวกับหน้า /logs (แผนที่สั้น เก็บ local ไม่คุ้มแยกไฟล์ share)
const actionStyle: Record<string, string> = {
  view: "bg-blue-50 text-blue-700",
  download: "bg-purple-50 text-purple-700",
  print: "bg-amber-50 text-amber-700",
  share: "bg-cyan-50 text-cyan-700",
  export: "bg-slate-100 text-slate-600",
};
const resultStyle: Record<string, string> = {
  success: "bg-green-50 text-green-700",
  denied: "bg-red-50 text-red-700",
  unauthorized: "bg-red-100 text-red-800",
  failed: "bg-red-50 text-red-700",
};

function AccessTimelineModal({ logs, evidenceNumber, onClose }: { logs: AccessLog[]; evidenceNumber: string; onClose: () => void }) {
  // ปิดด้วย ESC + ล็อกสกรอลล์พื้นหลังตอน modal เปิด
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // เรียงใหม่→เก่า (ล่าสุดอยู่บน)
  const ordered = [...logs].sort((a, b) => b.accessed_at.localeCompare(a.accessed_at));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* หัว modal */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">ประวัติการเข้าถึง — <span className="font-mono">{evidenceNumber}</span></h3>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="rounded-lg p-1 text-muted transition-colors hover:bg-surface-hover hover:text-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Timeline */}
        <div className="overflow-y-auto px-5 py-5">
          {ordered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">ยังไม่มีการเข้าถึง</p>
          ) : (
            <ol className="relative ml-2 border-l border-border">
              {ordered.map((l) => (
                <li key={l.log_id} className="relative mb-5 pl-6 last:mb-0">
                  {/* จุดบนเส้นเวลา */}
                  <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-primary" />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{l.user_name ?? "—"}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${actionStyle[l.action] ?? "bg-slate-100 text-slate-600"}`}>{l.action}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${resultStyle[l.result] ?? "bg-slate-100 text-slate-600"}`}>{l.result}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {new Date(l.accessed_at).toLocaleString("th-TH")}
                    <span className="mx-1.5">·</span>
                    <span className="font-mono">{l.ip_address}</span>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function ChainCheckRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
      <span className="text-sm">{label}</span>
      <span className={`flex items-center gap-1.5 text-xs font-medium ${ok ? "text-success" : "text-danger"}`}>
        {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
        {ok ? "ตรงกัน" : "ไม่ตรงกัน"}
      </span>
    </div>
  );
}

function LogStatusBadge({ status }: { status: "match" | "altered" | "missing" }) {
  const map = {
    match: { text: "ตรง", cls: "bg-green-50 text-green-700" },
    altered: { text: "ถูกแก้", cls: "bg-red-50 text-red-700" },
    missing: { text: "หาย", cls: "bg-amber-50 text-amber-700" },
  } as const;
  const s = map[status];
  return <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${s.cls}`}>{s.text}</span>;
}

function ChainMeta({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted">{label}</dt>
      <dd className={`truncate ${mono ? "font-mono text-primary" : "font-medium"}`}>{children}</dd>
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

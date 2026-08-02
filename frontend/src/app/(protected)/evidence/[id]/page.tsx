"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Link2, Clock, Fingerprint, ShieldAlert, Loader2, ImageOff, Image as ImageIcon, Calendar, HardDrive, FolderOpen, FileText, UploadCloud, Download } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSupervisorMap } from "@/hooks/useSupervisorMap";
import { caseService, evidenceService, accessLogService } from "@/services";
import { canSeeCase } from "@/utils/caseAccess";
import type { Case, EvidenceItem, BlockchainTx, AccessLog } from "@/interfaces";


export default function EvidenceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const supervisorMap = useSupervisorMap();
  const [evidence, setEvidence] = useState<EvidenceItem | null | undefined>(undefined);
  const [caseData, setCaseData] = useState<Case | undefined>(undefined);
  const [relatedTx, setRelatedTx] = useState<BlockchainTx[]>([]);
  const [relatedLogs, setRelatedLogs] = useState<AccessLog[]>([]);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      const ev = await evidenceService.get(id);
      if (!ev) {
        setEvidence(null);
        return;
      }
      const [c, tx, logs] = await Promise.all([
        caseService.get(ev.case_id),
        evidenceService.transactionsOf(id),
        accessLogService.list({ evidence_id: id }),
      ]);
      setCaseData(c);
      setRelatedTx(tx);
      setRelatedLogs(logs);
      setEvidence(ev);
    })();
  }, [id]);

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
      const res = await fetch(evidence.thumbnail_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = evidence.original_filename || `${evidence.evidence_number}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
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
                <img src={evidence.thumbnail_url} alt={evidence.description || evidence.original_filename} className="max-h-[540px] w-full object-contain" />
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

          {/* Access History — admin เท่านั้น */}
          {isAdmin && (
          <div className="rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-5 py-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted" />
              <h3 className="font-semibold text-sm">Access History</h3>
            </div>
            <div className="divide-y divide-border">
              {relatedLogs.map((l) => (
                <div key={l.log_id} className="flex items-center gap-4 px-5 py-3 text-xs">
                  <span className="font-medium">{l.user_name}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5">{l.action}</span>
                  <span className="text-muted">{l.ip_address}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 ${l.result === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{l.result}</span>
                  <span className="text-muted">{new Date(l.accessed_at).toLocaleString("th-TH")}</span>
                </div>
              ))}
              {relatedLogs.length === 0 && <p className="px-5 py-4 text-center text-xs text-muted">No access logs</p>}
            </div>
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

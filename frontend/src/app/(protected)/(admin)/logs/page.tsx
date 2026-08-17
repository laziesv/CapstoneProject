"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Loader2, ArrowLeft, FileClock, Users, Files, ShieldX, ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import type { AccessLog } from "@/interfaces";
import { accessLogService } from "@/services";

const actionStyle: Record<string, string> = {
  view: "bg-blue-50 text-blue-700",
  download: "bg-purple-50 text-purple-700",
  query: "bg-slate-100 text-slate-600",
};
const resultStyle: Record<string, string> = {
  success: "bg-green-50 text-green-700",
  failed: "bg-red-50 text-red-700",
};

const PAGE_SIZE = 25;

export default function LogsPage() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLogs(await accessLogService.list());
      } catch {
        setError("โหลดบันทึกการเข้าถึงไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── ตัวกรอง ──────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [evidenceId, setEvidenceId] = useState("");   // dropdown + drill-down รายชิ้น
  const [action, setAction] = useState("");
  const [result, setResult] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showQuery, setShowQuery] = useState(false);  // ซ่อน QUERY (ดูรายการ) เป็นค่าเริ่มต้น
  const [page, setPage] = useState(1);

  // เปลี่ยนตัวกรองใดๆ → เด้งกลับหน้า 1 (reset ตอน render ตามแพทเทิร์นที่ React แนะนำ)
  const filterKey = [query, evidenceId, action, result, dateFrom, dateTo, showQuery].join("|");
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  // ── รายการหลักฐานสำหรับ dropdown (distinct จาก log ที่โหลดมา) ──
  const evidenceOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of logs) {
      if (l.evidence_id) map.set(l.evidence_id, l.evidence_number ?? l.evidence_id);
    }
    return [...map.entries()].map(([id, number]) => ({ id, number }));
  }, [logs]);

  // ── กรอง in-memory ──────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo + "T23:59:59") : null;
    return logs.filter((l) => {
      if (!showQuery && l.action === "query") return false;
      if (evidenceId && l.evidence_id !== evidenceId) return false;
      if (action && l.action !== action) return false;
      if (result && l.result !== result) return false;
      if (from || to) {
        const t = new Date(l.accessed_at);
        if (from && t < from) return false;
        if (to && t > to) return false;
      }
      if (q) {
        const haystack = [l.user_name, l.evidence_number, l.ip_address, l.action]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [logs, showQuery, evidenceId, action, result, dateFrom, dateTo, query]);

  // ── สรุปสถิติจากผลที่กรอง ───────────────────────────
  const stats = useMemo(() => {
    const users = new Set(filtered.map((l) => l.user_id));
    const evidence = new Set(filtered.filter((l) => l.evidence_id).map((l) => l.evidence_id));
    const failed = filtered.filter((l) => l.result !== "success").length;
    return { total: filtered.length, users: users.size, evidence: evidence.size, failed };
  }, [filtered]);

  // ── แบ่งหน้า ─────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const paged = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (current - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(current * PAGE_SIZE, filtered.length);

  const selectedEvidenceNumber = evidenceId
    ? evidenceOptions.find((e) => e.id === evidenceId)?.number ?? evidenceId
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Access Logs</h1>
      </div>

      {/* Drill-down banner (มุมมองรายชิ้น) */}
      {selectedEvidenceNumber && (
        <div className="flex items-center justify-between rounded-xl border border-primary-light bg-primary-light/40 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <FileClock className="h-4 w-4 text-primary" />
            <span className="text-muted">ประวัติการเข้าถึงหลักฐาน:</span>
            <span className="font-mono font-semibold text-primary">{selectedEvidenceNumber}</span>
          </div>
          <button
            onClick={() => setEvidenceId("")}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary-light transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            ดูทั้งหมด
          </button>
        </div>
      )}

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={FileClock} label="รายการทั้งหมด" value={stats.total} />
        <StatCard icon={Users} label="ผู้เข้าถึง (คน)" value={stats.users} />
        <StatCard icon={Files} label="หลักฐาน (ชิ้น)" value={stats.evidence} />
        <StatCard icon={ShieldX} label="ล้มเหลว" value={stats.failed} danger={stats.failed > 0} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาผู้ใช้ / หลักฐาน / IP..."
            className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-4 text-sm outline-none focus:border-primary"
          />
        </div>
        <select
          value={evidenceId}
          onChange={(e) => setEvidenceId(e.target.value)}
          className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-muted outline-none focus:border-primary"
        >
          <option value="">หลักฐานทั้งหมด</option>
          {evidenceOptions.map((e) => (
            <option key={e.id} value={e.id}>{e.number}</option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-muted outline-none focus:border-primary"
        >
          <option value="">ทุก Action</option>
          <option value="view">View</option>
          <option value="download">Download</option>
          <option value="query">Query</option>
        </select>
        <select
          value={result}
          onChange={(e) => setResult(e.target.value)}
          className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-muted outline-none focus:border-primary"
        >
          <option value="">ทุกผลลัพธ์</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-muted outline-none focus:border-primary"
          aria-label="ตั้งแต่วันที่"
        />
        <span className="text-sm text-muted">–</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-muted outline-none focus:border-primary"
          aria-label="ถึงวันที่"
        />
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showQuery}
            onChange={(e) => setShowQuery(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          แสดงการดูรายการ (Query)
        </label>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50/50 text-left text-xs font-medium text-muted uppercase tracking-wide">
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Evidence</th>
              <th className="px-5 py-3">Action</th>
              <th className="px-5 py-3">IP Address</th>
              <th className="px-5 py-3">Result</th>
              <th className="px-5 py-3">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-sm text-danger">{error}</td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-sm text-muted">ไม่พบบันทึกการเข้าถึง</td>
              </tr>
            ) : (
              paged.map((l) => (
                <tr key={l.log_id} className="hover:bg-surface-hover transition-colors">
                  <td className="px-5 py-3 font-medium text-xs">{l.user_name ?? "—"}</td>
                  <td className="px-5 py-3">
                    {l.evidence_id ? (
                      <Link
                        href={`/evidence/${l.evidence_id}`}
                        className="inline-flex items-center gap-1.5 font-mono text-xs text-primary hover:underline"
                        title="เปิดดูหลักฐาน (รูป)"
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        {l.evidence_number ?? l.evidence_id}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${actionStyle[l.action] ?? "bg-slate-100 text-slate-600"}`}>{l.action}</span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-muted">{l.ip_address}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${resultStyle[l.result] ?? "bg-slate-100 text-slate-600"}`}>{l.result}</span>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted">{new Date(l.accessed_at).toLocaleString("th-TH")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {!loading && !error && filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted">
            <span>แสดง {startIdx}–{endIdx} จาก {filtered.length}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={current <= 1}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 font-medium transition-colors hover:bg-surface-hover disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> ก่อนหน้า
              </button>
              <span className="px-2">หน้า {current} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={current >= totalPages}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 font-medium transition-colors hover:bg-surface-hover disabled:opacity-40"
              >
                ถัดไป <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted">
        <Icon className={`h-4 w-4 ${danger ? "text-danger" : "text-primary"}`} />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`mt-2 text-2xl font-bold ${danger ? "text-danger" : ""}`}>{value}</p>
    </div>
  );
}

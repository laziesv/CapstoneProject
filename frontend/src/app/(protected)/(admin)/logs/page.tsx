"use client";

import { useMemo, useState } from "react";
import { Search, Loader2, ArrowLeft, FileClock, Users, Files, ShieldX } from "lucide-react";
import type { AccessLog } from "@/interfaces";
import { mockLogs } from "@/utils/mockData";
// เมื่อ backend endpoint /api/access-logs พร้อม ให้เปลี่ยนมาใช้:
// import { accessLogService } from "@/services";

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

export default function LogsPage() {
  // ตอนนี้ดึงจาก mock (ข้อมูลพร้อมทันที ไม่ต้องรอ network)
  // TODO(backend): เมื่อ /api/access-logs พร้อม เปลี่ยนเป็นโหลดใน useEffect:
  //   const [logs, setLogs] = useState<AccessLog[]>([]);
  //   useEffect(() => { accessLogService.list().then(setLogs)... }, []);
  // โครงสร้าง AccessLog เหมือนกัน — ตัวกรอง/drill-down ด้านล่างทำงานต่อได้เลย
  const [logs] = useState<AccessLog[]>(mockLogs);
  const loading = false;
  const error: string | null = null;

  // ── ตัวกรอง ──────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [evidenceId, setEvidenceId] = useState("");   // ใช้ทั้ง dropdown และ drill-down รายชิ้น
  const [action, setAction] = useState("");
  const [result, setResult] = useState("");

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
    return logs.filter((l) => {
      if (evidenceId && l.evidence_id !== evidenceId) return false;
      if (action && l.action !== action) return false;
      if (result && l.result !== result) return false;
      if (q) {
        const haystack = [l.user_name, l.evidence_number, l.ip_address, l.action]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [logs, evidenceId, action, result, query]);

  // ── สรุปสถิติจากผลที่กรอง ───────────────────────────
  const stats = useMemo(() => {
    const users = new Set(filtered.map((l) => l.user_id));
    const evidence = new Set(filtered.map((l) => l.evidence_id));
    const denied = filtered.filter((l) => l.result !== "success").length;
    return { total: filtered.length, users: users.size, evidence: evidence.size, denied };
  }, [filtered]);

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
        <StatCard icon={ShieldX} label="ถูกปฏิเสธ/ล้มเหลว" value={stats.denied} danger={stats.denied > 0} />
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
          <option value="">All Actions</option>
          <option value="view">View</option>
          <option value="download">Download</option>
          <option value="print">Print</option>
          <option value="share">Share</option>
          <option value="export">Export</option>
        </select>
        <select
          value={result}
          onChange={(e) => setResult(e.target.value)}
          className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-muted outline-none focus:border-primary"
        >
          <option value="">All Results</option>
          <option value="success">Success</option>
          <option value="denied">Denied</option>
          <option value="failed">Failed</option>
          <option value="unauthorized">Unauthorized</option>
        </select>
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
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-sm text-muted">ไม่พบบันทึกการเข้าถึง</td>
              </tr>
            ) : (
              filtered.map((l) => (
                <tr key={l.log_id} className="hover:bg-surface-hover transition-colors">
                  <td className="px-5 py-3 font-medium text-xs">{l.user_name ?? "—"}</td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => setEvidenceId(l.evidence_id)}
                      className="font-mono text-xs text-primary hover:underline"
                      title="ดูประวัติการเข้าถึงเฉพาะหลักฐานชิ้นนี้"
                    >
                      {l.evidence_number ?? l.evidence_id}
                    </button>
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

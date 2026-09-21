"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Loader2, ArrowLeft, FileClock, Calendar, Download, ChevronLeft, ChevronRight, Eye, EyeOff, ShieldAlert } from "lucide-react";
import type { AccessLog, AccessLogFilters, DatabaseIntegrityAlert } from "@/interfaces";
import { accessLogService, evidenceService, integrityAlertService } from "@/services";
import { labelForAction, labelForResult } from "@/utils/labels";

// ชิปกรองด่วน — map เป็นตัวกรองที่ backend เข้าใจ (action=view/download หรือ only_anomaly)
type Quick = "all" | "view" | "download" | "anomaly";
const QUICK_CHIPS: { key: Exclude<Quick, "anomaly">; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "view", label: "เปิดดู" },
  { key: "download", label: "ดาวน์โหลด" },
];

const PAGE_SIZE = 25;

// รวมตัวกรอง UI → AccessLogFilters (ไม่รวม limit/offset — ใส่ตอนเรียก)
function toFilters(opts: {
  q: string;
  evidenceId: string;
  quick: Quick;
  dateFrom: string;
  dateTo: string;
  showQuery: boolean;
}): AccessLogFilters {
  const f: AccessLogFilters = {};
  if (opts.q.trim()) f.q = opts.q.trim();
  if (opts.evidenceId) f.evidence_id = opts.evidenceId;
  if (opts.quick === "anomaly") f.only_anomaly = true;
  else if (opts.quick !== "all") f.action = opts.quick;
  if (opts.dateFrom) f.date_from = opts.dateFrom;
  if (opts.dateTo) f.date_to = opts.dateTo;
  // ซ่อนรายการประเภท "ค้นหา" (QUERY) เว้นแต่ผู้ใช้เลือกให้แสดง
  // ยกเว้นโหมด "ผิดปกติ" — ต้องเห็นทุกรายการผิดปกติ (รวม QUERY) ให้ตรงกับตัวเลขบนชิป
  if (!opts.showQuery && opts.quick !== "anomaly") f.exclude_query = true;
  return f;
}

export default function LogsPage() {
  // ── ตัวกรอง ──────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [evidenceId, setEvidenceId] = useState("");   // drill-down รายชิ้น
  const [quick, setQuick] = useState<Quick>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  // ซ่อนแถวประเภท "ค้นหา" (QUERY = เปิดดูรายการรวม ไม่ผูกหลักฐาน) ไว้ก่อน — กดปุ่มเพื่อแสดง
  const [showQuery, setShowQuery] = useState(false);

  // ── ข้อมูลหน้าปัจจุบัน (แบ่งหน้าที่ server) ──────────
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [integrityAlerts, setIntegrityAlerts] = useState<DatabaseIntegrityAlert[]>([]);

  // debounce ช่องค้นหา — กันยิง API ทุกตัวอักษร
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const filters = useMemo(
    () => toFilters({ q: debouncedQuery, evidenceId, quick, dateFrom, dateTo, showQuery }),
    [debouncedQuery, evidenceId, quick, dateFrom, dateTo, showQuery],
  );

  // เปลี่ยนตัวกรองใดๆ → เด้งกลับหน้า 1
  const filterKey = JSON.stringify(filters);
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  // ── ดึงหน้าปัจจุบันจาก server ─────────────────────────
  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await accessLogService.listPage({ ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
        if (ignore) return;
        setLogs(res.items);
        setTotal(res.total);
        setError(null);
      } catch {
        if (!ignore) setError("โหลดบันทึกการเข้าถึงไม่สำเร็จ");
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [filters, page]);

  // จำนวนรายการผิดปกติทั้งระบบ (ไม่ขึ้นกับตัวกรอง) — โชว์บนชิป (query เบา: นับอย่างเดียว)
  const [anomalyTotal, setAnomalyTotal] = useState(0);
  useEffect(() => {
    accessLogService.listPage({ only_anomaly: true, limit: 1 }).then((r) => setAnomalyTotal(r.total)).catch(() => {});
  }, []);

  // ความผิดปกติที่ตรวจเทียบกับ Blockchain แยกจาก result FAILED/PENDING ของ AccessLog
  useEffect(() => {
    let ignore = false;
    integrityAlertService
      .list()
      .then((result) => {
        if (!ignore) {
          setIntegrityAlerts(result.alerts.filter((alert) => alert.alert_type === "ACCESS_LOG"));
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  const integrityByLogId = useMemo(
    () => new Map(
      integrityAlerts
        .filter((alert) => alert.access_log_id)
        .map((alert) => [alert.access_log_id as string, alert]),
    ),
    [integrityAlerts],
  );

  // รายการหลักฐานสำหรับ dropdown — จากคลังหลักฐาน (จำนวนน้อยกว่า log มาก ไม่กระทบโหลด)
  const [evidenceOptions, setEvidenceOptions] = useState<{ id: string; number: string }[]>([]);
  useEffect(() => {
    evidenceService
      .list()
      .then((items) => setEvidenceOptions(items.map((e) => ({ id: e.evidence_id, number: e.evidence_number }))))
      .catch(() => {});
  }, []);

  // ── แบ่งหน้า (จาก total ของ server) ──────────────────
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const startIdx = total === 0 ? 0 : (current - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(current * PAGE_SIZE, total);

  const selectedEvidenceNumber = evidenceId
    ? evidenceOptions.find((e) => e.id === evidenceId)?.number ?? evidenceId
    : null;

  // ── ส่งออก CSV (ทุกรายการที่ตรงตัวกรอง — ดึงแบบไม่จำกัดจำนวน) — BOM ให้ Excel อ่านไทยได้ ──
  const exportCsv = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const all = await accessLogService.list(filters); // ไม่ใส่ limit = ทุกรายการที่ตรงตัวกรอง
      const cell = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const header = ["เวลา", "เจ้าหน้าที่", "การกระทำ", "หลักฐาน", "IP", "ผล"];
      const rows = all.map((l) => [
        new Date(l.accessed_at).toLocaleString("th-TH"),
        l.user_name ?? "",
        labelForAction(l.action),
        l.evidence_number ?? "",
        l.ip_address ?? "",
        labelForResult(l.result),
      ]);
      const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `access-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      // ต้องอยู่ใน DOM ตอนคลิก และคืน object URL หลังเบราว์เซอร์เริ่มโหลดแล้ว
      // ไม่งั้น Firefox ยกเลิกการดาวน์โหลดเงียบ ๆ
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      // แยกจาก error ของตาราง — ส่งออกพลาดไม่ควรทำให้รายการที่โหลดมาแล้วหายทั้งหน้า
      setExportError("ส่งออกไม่สำเร็จ");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* หัวเรื่อง + ค้นหา + ส่งออก */}
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-semibold">บันทึกการเข้าถึง</h1>
        <div className="relative min-w-[260px] flex-1 md:max-w-md">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาเจ้าหน้าที่ / หลักฐาน / IP…"
            className="h-11 w-full rounded-full border border-primary/20 bg-white pl-11 pr-4 text-sm font-medium text-foreground shadow-sm outline-none transition placeholder:text-slate-400 hover:border-primary/40 hover:shadow-md focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/15"
          />
        </div>
        <button
          onClick={exportCsv}
          disabled={total === 0 || exporting}
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-[18px] text-sm font-semibold transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} ส่งออก CSV
        </button>
      </div>

      {exportError && (
        <p className="rounded-2xl border border-danger/20 bg-danger-light px-4 py-2.5 text-sm text-danger" role="alert">
          {exportError}
        </p>
      )}

      {integrityAlerts.length > 0 && (
        <section id="integrity-alerts" className="overflow-hidden rounded-2xl border border-danger/30 bg-danger-light/50" aria-labelledby="integrity-alerts-heading">
          <div className="flex items-center gap-2 border-b border-danger/20 px-4 py-3 text-danger">
            <ShieldAlert className="h-5 w-5" />
            <h2 id="integrity-alerts-heading" className="text-sm font-semibold">
              พบ Access Log ไม่ตรงกับ Blockchain {integrityAlerts.length} รายการ
            </h2>
          </div>
          <div className="divide-y divide-danger/15">
            {integrityAlerts.map((alert) => (
              <div key={alert.access_session_ref || alert.access_log_id} className="grid gap-1 px-4 py-3 text-xs md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-4">
                <div>
                  <span className="font-semibold text-danger">{integrityStatusLabel(alert.status)}</span>
                  <p className="mt-0.5 font-mono text-[11px] text-text-secondary">
                    Log ID: {alert.access_log_id || "ไม่พบแถวในฐานข้อมูล"}
                  </p>
                </div>
                <div className="font-mono text-[11px] text-text-secondary">
                  <p>หลักฐาน: {alert.evidence_number || alert.evidence_id || "ไม่ทราบ"}</p>
                  <p className="truncate" title={alert.access_session_ref || undefined}>Session: {alert.access_session_ref || "—"}</p>
                </div>
                {alert.access_log_id && (
                  <button
                    type="button"
                    onClick={() => document.getElementById(`access-log-${alert.access_log_id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                    className="justify-self-start rounded-full border border-danger/30 bg-white px-3 py-1.5 font-semibold text-danger hover:bg-danger-light md:justify-self-end"
                  >
                    แสดงในตาราง
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Drill-down banner (มุมมองรายชิ้น) */}
      {selectedEvidenceNumber && (
        <div className="flex items-center justify-between rounded-2xl border border-primary/20 bg-primary-light/50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <FileClock className="h-4 w-4 text-primary" />
            <span className="text-muted">ประวัติการเข้าถึงหลักฐาน:</span>
            <span className="font-mono font-semibold text-primary">{selectedEvidenceNumber}</span>
          </div>
          <button
            onClick={() => setEvidenceId("")}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary-light"
          >
            <ArrowLeft className="h-4 w-4" /> ดูทั้งหมด
          </button>
        </div>
      )}

      {/* ชิปกรองด่วน + ช่วงวันที่ */}
      <div className="flex flex-wrap items-center gap-2">
        {QUICK_CHIPS.map((c) => (
          <button
            key={c.key}
            onClick={() => setQuick(c.key)}
            className={`h-9 rounded-full px-4 text-sm font-medium transition-colors ${
              quick === c.key ? "bg-ink font-semibold text-white" : "border border-border bg-surface text-text-secondary hover:bg-surface-hover"
            }`}
          >
            {c.label}
          </button>
        ))}
        <button
          onClick={() => setQuick("anomaly")}
          className={`h-9 rounded-full px-4 text-sm font-semibold transition-colors ${
            quick === "anomaly"
              ? "bg-danger text-white"
              : "border border-danger/25 bg-danger-light text-danger hover:bg-danger-light/70"
          }`}
        >
          ผิดปกติ {anomalyTotal}
        </button>
        {integrityAlerts.length > 0 && (
          <a href="#integrity-alerts" className="inline-flex h-9 items-center rounded-full border border-danger/30 bg-danger-light px-4 text-sm font-semibold text-danger">
            Integrity {integrityAlerts.length}
          </a>
        )}

        {/* สลับแสดง/ซ่อนรายการประเภท "ค้นหา" (QUERY) — ซ่อนเป็นค่าเริ่มต้น */}
        <button
          onClick={() => setShowQuery((v) => !v)}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors ${
            showQuery
              ? "bg-ink font-semibold text-white"
              : "border border-border bg-surface text-text-secondary hover:bg-surface-hover"
          }`}
        >
          {showQuery ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          {showQuery ? "ซ่อนรายการค้นหา" : "แสดงรายการค้นหา"}
        </button>

        {/* ช่วงวันที่ */}
        <div className="ml-auto flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5">
          <Calendar className="h-4 w-4 text-muted" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-transparent text-sm text-text-secondary outline-none"
            aria-label="ตั้งแต่วันที่"
          />
          <span className="text-sm text-muted">–</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-transparent text-sm text-text-secondary outline-none"
            aria-label="ถึงวันที่"
          />
        </div>

        {/* dropdown หลักฐาน (drill-down) */}
        <select
          value={evidenceId}
          onChange={(e) => setEvidenceId(e.target.value)}
          className="h-9 rounded-full border border-border bg-surface px-4 text-sm text-text-secondary outline-none focus:border-primary"
        >
          <option value="">หลักฐานทั้งหมด</option>
          {evidenceOptions.map((e) => (
            <option key={e.id} value={e.id}>{e.number}</option>
          ))}
        </select>

      </div>

      {/* ตาราง */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-hover text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-semibold">เวลา</th>
                <th className="px-5 py-3 font-semibold">เจ้าหน้าที่</th>
                <th className="px-5 py-3 font-semibold">การกระทำ</th>
                <th className="px-5 py-3 font-semibold">หลักฐาน / คดี</th>
                <th className="px-5 py-3 font-semibold">IP</th>
                <th className="px-5 py-3 text-right font-semibold">ผล</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /></td></tr>
              ) : error ? (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-sm text-danger">{error}</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-sm text-muted">ไม่พบบันทึกการเข้าถึง</td></tr>
              ) : (
                logs.map((l) => {
                  // pending = รอ Blockchain ยืนยัน ยังไม่ใช่ความล้มเหลว จึงไม่ทำเป็นแถวแดง
                  const pending = l.result === "pending";
                  const fail = !pending && l.result !== "success";
                  const integrityAlert = integrityByLogId.get(l.log_id);
                  return (
                    <tr id={`access-log-${l.log_id}`} key={l.log_id} className={`transition-colors ${integrityAlert ? "bg-danger-light ring-1 ring-inset ring-danger/30" : fail ? "bg-danger-light/40 hover:bg-danger-light/70" : "hover:bg-surface-hover"}`}>
                      <td className="px-5 py-3.5 font-mono text-xs text-text-secondary">
                        {new Date(l.accessed_at).toLocaleString("th-TH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-5 py-3.5">{l.user_name ?? "—"}</td>
                      <td className={`px-5 py-3.5 ${fail ? "font-semibold text-danger" : "text-text-secondary"}`}>
                        {labelForAction(l.action)}
                      </td>
                      <td className="px-5 py-3.5">
                        {l.evidence_id ? (
                          <Link href={`/evidence/${l.evidence_number ?? l.evidence_id}`} className="font-mono text-xs text-primary hover:underline" title="เปิดดูหลักฐาน">
                            {l.evidence_number ?? l.evidence_id}
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-muted">{l.ip_address ?? "—"}</td>
                      <td className="px-5 py-3.5 text-right">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          fail ? "bg-danger-light text-danger" : pending ? "bg-warning-light text-warning" : "bg-success-light text-success"
                        }`}>
                          {labelForResult(l.result)}
                        </span>
                        {integrityAlert && (
                          <span className="mt-1 block text-[11px] font-semibold text-danger">ข้อมูลไม่ตรงกับ Blockchain</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && !error && total > 0 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-4 text-sm text-muted">
            <span>แสดง {startIdx}–{endIdx} จาก {total} รายการ</span>
            <div className="flex items-center gap-1.5">
              <PageDot disabled={current <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria="ก่อนหน้า">
                <ChevronLeft className="h-4 w-4" />
              </PageDot>
              {pageWindow(current, totalPages).map((p, i) =>
                p === "…" ? (
                  <span key={`e${i}`} className="px-1 text-muted">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`h-[34px] w-[34px] rounded-full text-sm transition-colors ${
                      p === current ? "bg-ink font-semibold text-white" : "border border-border hover:bg-surface-hover"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <PageDot disabled={current >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria="ถัดไป">
                <ChevronRight className="h-4 w-4" />
              </PageDot>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// สร้างชุดเลขหน้าแบบมีหน้าต่าง (…) รอบหน้าปัจจุบัน
function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const lo = Math.max(2, current - 1);
  const hi = Math.min(total - 1, current + 1);
  if (lo > 2) out.push("…");
  for (let p = lo; p <= hi; p++) out.push(p);
  if (hi < total - 1) out.push("…");
  out.push(total);
  return out;
}

function integrityStatusLabel(status: DatabaseIntegrityAlert["status"]): string {
  if (status === "ACCESS_LOG_MISSING_IN_DATABASE") return "ไม่พบแถว Access Log ในฐานข้อมูล";
  if (status === "ACCESS_LOG_MISSING_ON_CHAIN") return "ไม่พบ Access Session บน Blockchain";
  return "ข้อมูล Access Log ถูกแก้ไข";
}

function PageDot({ disabled, onClick, aria, children }: { disabled: boolean; onClick: () => void; aria: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
    >
      {children}
    </button>
  );
}

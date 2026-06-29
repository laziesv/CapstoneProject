"use client";

import { useEffect, useState } from "react";
import { Images, FolderOpen, Link2, ShieldCheck, ArrowUpRight, UploadCloud, Clock, Loader2 } from "lucide-react";
import Link from "next/link";
import { authFetch } from "@/lib/auth";

interface DashboardData {
  stats: {
    total_evidence: number;
    active_cases: number;
    blockchain_tx: number;
    verified: number;
  };
  recent_evidence: {
    evidence_id: string;
    evidence_number: string | null;
    description: string | null;
    thumbnail_url: string | null;
    is_watermarked: boolean;
    is_blockchain_verified: boolean;
  }[];
  recent_activity: {
    log_id: string;
    user_name: string | null;
    action: string | null;
    evidence_number: string | null;
    result: string;
    accessed_at: string | null;
  }[];
}

const statConfig = [
  { key: "total_evidence", label: "Total Evidence", icon: Images, color: "text-primary", bg: "bg-primary-light", accent: "before:bg-primary" },
  { key: "active_cases", label: "Active Cases", icon: FolderOpen, color: "text-warning", bg: "bg-warning-light", accent: "before:bg-warning" },
  { key: "blockchain_tx", label: "Blockchain Tx", icon: Link2, color: "text-success", bg: "bg-success-light", accent: "before:bg-success" },
  { key: "verified", label: "Verified", icon: ShieldCheck, color: "text-emerald-600", bg: "bg-success-light", accent: "before:bg-emerald-500" },
] as const;

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/dashboard");
        if (!res.ok) {
          setError("โหลดข้อมูลไม่สำเร็จ");
          return;
        }
        setData(await res.json());
      } catch {
        setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-danger-light bg-danger-light/40 p-6 text-center text-danger">
        {error || "ไม่พบข้อมูล"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted mt-1">ภาพรวมระบบคลังหลักฐานดิจิทัล</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4">
        {statConfig.map((s) => (
          <div
            key={s.key}
            className={`relative overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md before:absolute before:left-0 before:top-0 before:h-full before:w-1 ${s.accent}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">{s.label}</p>
                <p className="mt-1 text-3xl font-bold">{data.stats[s.key]}</p>
              </div>
              <div className={`rounded-xl p-3 ${s.bg}`}>
                <s.icon className={`h-6 w-6 ${s.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4">
        <Link href="/evidence/upload" className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 hover:border-primary hover:shadow-sm transition-all group">
          <div className="rounded-lg bg-primary/10 p-2.5"><UploadCloud className="h-5 w-5 text-primary" /></div>
          <div className="flex-1">
            <p className="font-medium text-sm">Upload Evidence</p>
            <p className="text-xs text-muted">อัปโหลดหลักฐานใหม่</p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-muted group-hover:text-primary transition-colors" />
        </Link>
        <Link href="/verify" className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 hover:border-primary hover:shadow-sm transition-all group">
          <div className="rounded-lg bg-success-light p-2.5"><ShieldCheck className="h-5 w-5 text-success" /></div>
          <div className="flex-1">
            <p className="font-medium text-sm">Verify Watermark</p>
            <p className="text-xs text-muted">ตรวจสอบลายน้ำ</p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-muted group-hover:text-primary transition-colors" />
        </Link>
        <Link href="/cases" className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 hover:border-primary hover:shadow-sm transition-all group">
          <div className="rounded-lg bg-warning-light p-2.5"><FolderOpen className="h-5 w-5 text-warning" /></div>
          <div className="flex-1">
            <p className="font-medium text-sm">View Cases</p>
            <p className="text-xs text-muted">ดูคดีทั้งหมด</p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-muted group-hover:text-primary transition-colors" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Recent Evidence */}
        <div className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-semibold">Recent Uploads</h2>
            <Link href="/evidence" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-border">
            {data.recent_evidence.length === 0 && (
              <p className="px-5 py-6 text-center text-sm text-muted">ยังไม่มีหลักฐาน</p>
            )}
            {data.recent_evidence.map((e) => (
              <Link key={e.evidence_id} href={`/evidence/${e.evidence_id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-hover transition-colors">
                <div className="h-10 w-10 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0">
                  {e.thumbnail_url && <img src={e.thumbnail_url} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{e.evidence_number}</p>
                  <p className="text-xs text-muted truncate">{e.description}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {e.is_watermarked && <span className="rounded-full bg-primary-light px-2 py-0.5 text-[10px] font-medium text-primary">WM</span>}
                  {e.is_blockchain_verified && <span className="rounded-full bg-success-light px-2 py-0.5 text-[10px] font-medium text-success">BC</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-semibold">Recent Activity</h2>
            <Link href="/logs" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-border">
            {data.recent_activity.length === 0 && (
              <p className="px-5 py-6 text-center text-sm text-muted">ยังไม่มีกิจกรรม</p>
            )}
            {data.recent_activity.map((l) => (
              <div key={l.log_id} className="flex items-center gap-4 px-5 py-3">
                <div className="rounded-full bg-slate-100 p-2"><Clock className="h-3.5 w-3.5 text-muted" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{l.user_name}</span>
                    <span className="text-muted"> {l.action} </span>
                    <span className="font-mono text-xs text-primary">{l.evidence_number}</span>
                  </p>
                  <p className="text-xs text-muted">{l.accessed_at ? new Date(l.accessed_at).toLocaleString("th-TH") : ""}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${l.result === "success" ? "bg-success-light text-success" : "bg-danger-light text-danger"}`}>
                  {l.result}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

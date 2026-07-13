"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Loader2, FileClock, Users, Files, TrendingUp } from "lucide-react";
import Link from "next/link";
import { dashboardService, accessLogService } from "@/services";
import { useAuth } from "@/hooks/useAuth";
import type { DashboardData, AccessLog } from "@/interfaces";

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setData(await dashboardService.get());
      } catch {
        setError("โหลดข้อมูลไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── ภาพรวมการเข้าถึงหลักฐาน (เฉพาะ admin) ─────────────
  const [logs, setLogs] = useState<AccessLog[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    accessLogService.list().then(setLogs).catch(() => {});
  }, [isAdmin]);

  const access = useMemo(() => {
    const total = logs.length;
    const users = new Set(logs.map((l) => l.user_id)).size;
    const evidence = new Set(logs.map((l) => l.evidence_id)).size;

    // นับจำนวนครั้งต่อหลักฐาน (เก็บ label เป็น evidence_number)
    const byEvidence = new Map<string, { label: string; count: number }>();
    for (const l of logs) {
      const cur = byEvidence.get(l.evidence_id) ?? { label: l.evidence_number ?? l.evidence_id, count: 0 };
      cur.count += 1;
      byEvidence.set(l.evidence_id, cur);
    }
    const topEvidence = [...byEvidence.values()].sort((a, b) => b.count - a.count).slice(0, 5);

    // นับจำนวนครั้งต่อผู้ใช้ (เก็บ label เป็น user_name)
    const byUser = new Map<string, { label: string; count: number }>();
    for (const l of logs) {
      const cur = byUser.get(l.user_id) ?? { label: l.user_name ?? l.user_id, count: 0 };
      cur.count += 1;
      byUser.set(l.user_id, cur);
    }
    const topUsers = [...byUser.values()].sort((a, b) => b.count - a.count).slice(0, 5);

    return { total, users, evidence, topEvidence, topUsers };
  }, [logs]);

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

      {/* Admin — ภาพรวมการเข้าถึงหลักฐาน */}
      {isAdmin && (
        <div className="space-y-4 rounded-xl border border-primary-light bg-primary-light/20 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileClock className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">ภาพรวมการเข้าถึงหลักฐาน</h2>
              <span className="rounded-full bg-primary-light px-2 py-0.5 text-[10px] font-medium text-primary">ผู้ดูแลระบบ</span>
            </div>
            <Link href="/logs" className="text-xs text-primary hover:underline">ดูทั้งหมด</Link>
          </div>

          {/* สถิติการเข้าถึง */}
          <div className="grid grid-cols-3 gap-4">
            <AccessStat icon={FileClock} label="การเข้าถึงทั้งหมด" value={access.total} />
            <AccessStat icon={Users} label="ผู้เข้าถึง (คน)" value={access.users} />
            <AccessStat icon={Files} label="หลักฐานที่ถูกเข้าถึง (ชิ้น)" value={access.evidence} />
          </div>

          {/* อันดับ Top */}
          <div className="grid grid-cols-2 gap-4">
            <RankCard title="หลักฐานที่ถูกเข้าถึงบ่อยสุด" rows={access.topEvidence} href="/logs" mono />
            <RankCard title="ผู้ใช้ที่เข้าถึงมากสุด" rows={access.topUsers} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Recent Evidence */}
        <div className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-semibold">Recent Uploads</h2>
            <Link href="/cases" className="text-xs text-primary hover:underline">View all</Link>
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

function AccessStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function RankCard({
  title,
  rows,
  href,
  mono,
}: {
  title: string;
  rows: { label: string; count: number }[];
  href?: string;
  mono?: boolean;
}) {
  const max = rows.length ? rows[0].count : 0;
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">ยังไม่มีข้อมูล</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r, i) => {
            const label = (
              <span className={`truncate ${mono ? "font-mono text-primary" : "font-medium"}`}>{r.label}</span>
            );
            return (
              <div key={r.label} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-muted">{i + 1}.</span>
                    {href ? (
                      <Link href={href} className="truncate hover:underline">{label}</Link>
                    ) : (
                      label
                    )}
                  </div>
                  <span className="flex-shrink-0 text-muted">{r.count} ครั้ง</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${max ? (r.count / max) * 100 : 0}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

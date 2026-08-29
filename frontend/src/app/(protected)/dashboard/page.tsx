"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, FileClock, Users, Files, TrendingUp, BarChart3, PieChart } from "lucide-react";
import Link from "next/link";
import { dashboardService, accessLogService, evidenceService } from "@/services";
import { useAuth } from "@/hooks/useAuth";
import type { DashboardData, AccessLog, EvidenceItem } from "@/interfaces";
import { TimeBarChart, ActionDonut, type BarPoint } from "@/components/DashboardCharts";
import StatBand from "@/components/ui/StatBand";

// น้ำเงินหลักของธีม (ดีไซน์ 1b) — ใช้เป็น accent กราฟ
const PRIMARY = "#0052ff";

// สีประเภทการเข้าถึง — ผ่าน validate ด้วย skill dataviz (CVD/คอนทราสต์ ok)
const ACTION_COLORS: Record<string, string> = {
  view: "#0052ff",     // น้ำเงิน (primary)
  download: "#ea580c", // ส้ม
  query: "#0d9488",    // เขียวอมฟ้า
};

/** นับจำนวนต่อวัน ย้อนหลัง N วัน (เติมวันที่ไม่มีข้อมูล = 0) — คีย์ตามวันเวลาท้องถิ่น */
function bucketByDay(isoDates: (string | null | undefined)[], days = 14): BarPoint[] {
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const counts = new Map<string, number>();
  for (const iso of isoDates) {
    if (!iso) continue;
    const k = key(new Date(iso));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const now = new Date();
  const out: BarPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push({
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      full: d.toLocaleDateString("th-TH", { day: "numeric", month: "short" }),
      value: counts.get(key(d)) ?? 0,
    });
  }
  return out;
}

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

  // หลักฐานทั้งหมด — ใช้ทำกราฟอัปโหลดตามช่วงเวลา (ทุก role)
  const [evidences, setEvidences] = useState<EvidenceItem[]>([]);
  useEffect(() => {
    evidenceService.list().then(setEvidences).catch(() => {});
  }, []);

  // access log — ใช้ทำกราฟ/สัดส่วน/อันดับ (เฉพาะ admin)
  const [logs, setLogs] = useState<AccessLog[]>([]);
  useEffect(() => {
    if (!isAdmin) return;
    accessLogService.list().then(setLogs).catch(() => {});
  }, [isAdmin]);

  const uploadsSeries = useMemo(() => bucketByDay(evidences.map((e) => e.uploaded_at)), [evidences]);
  const accessSeries = useMemo(() => bucketByDay(logs.map((l) => l.accessed_at)), [logs]);

  const actionSegments = useMemo(() => {
    const counts: Record<string, number> = { view: 0, download: 0, query: 0 };
    for (const l of logs) if (l.action in counts) counts[l.action] += 1;
    return (["view", "download", "query"] as const).map((k) => ({
      label: k,
      value: counts[k],
      color: ACTION_COLORS[k],
    }));
  }, [logs]);

  const access = useMemo(() => {
    const total = logs.length;
    const users = new Set(logs.map((l) => l.user_id)).size;
    // QUERY = ดูรายการรวม ไม่ผูกกับหลักฐานชิ้นใด (evidence_id ว่าง) — ไม่นับในสถิติราย "ชิ้น"
    const perEvidence = logs.filter((l) => l.evidence_id);
    const evidence = new Set(perEvidence.map((l) => l.evidence_id)).size;

    const byEvidence = new Map<string, { label: string; count: number }>();
    for (const l of perEvidence) {
      const cur = byEvidence.get(l.evidence_id) ?? { label: l.evidence_number ?? l.evidence_id, count: 0 };
      cur.count += 1;
      byEvidence.set(l.evidence_id, cur);
    }
    const topEvidence = [...byEvidence.values()].sort((a, b) => b.count - a.count).slice(0, 5);

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

      {/* สรุปภาพรวมระบบ (แถบ KPI ดำ) — เห็นได้ทุก role
          hint ใช้ค่าจริงเท่านั้น: "ยังไม่ยืนยัน" = total − verified */}
      <StatBand
        items={[
          { label: "หลักฐานทั้งหมด", value: data.stats.total_evidence.toLocaleString() },
          { label: "คดีที่ดำเนินอยู่", value: data.stats.active_cases.toLocaleString() },
          {
            label: "ยืนยันบนบล็อกเชนแล้ว",
            value: data.stats.verified.toLocaleString(),
            valueTone: "success",
            hint: `ยังไม่ยืนยัน ${(data.stats.total_evidence - data.stats.verified).toLocaleString()} ชิ้น`,
            tone: "warning",
          },
          { label: "ธุรกรรมบล็อกเชน", value: data.stats.blockchain_tx.toLocaleString() },
        ]}
      />

      {/* กราฟการอัปโหลดหลักฐาน — ทุก role */}
      <ChartCard icon={BarChart3} title="การอัปโหลดหลักฐาน" subtitle="14 วันล่าสุด">
        <TimeBarChart data={uploadsSeries} accent={PRIMARY} />
      </ChartCard>

      {/* Admin — ภาพรวมการเข้าถึงหลักฐาน */}
      {isAdmin && (
        <div className="space-y-4 rounded-2xl border border-primary-light bg-primary-light/20 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileClock className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">ภาพรวมการเข้าถึงหลักฐาน</h2>
              <span className="rounded-full bg-primary-light px-2 py-0.5 text-[10px] font-medium text-primary">ผู้ดูแลระบบ</span>
            </div>
            <Link href="/logs" className="text-xs text-primary hover:underline">ดูทั้งหมด</Link>
          </div>

          {/* กราฟการเข้าถึง + สัดส่วนประเภท */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard icon={BarChart3} title="กิจกรรมการเข้าถึง" subtitle="14 วันล่าสุด">
              <TimeBarChart data={accessSeries} accent={PRIMARY} />
            </ChartCard>
            <ChartCard icon={PieChart} title="สัดส่วนประเภทการเข้าถึง">
              <div className="py-2">
                <ActionDonut segments={actionSegments} />
              </div>
            </ChartCard>
          </div>

          {/* สถิติการเข้าถึง */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard icon={FileClock} label="การเข้าถึงทั้งหมด" value={access.total} />
            <StatCard icon={Users} label="ผู้เข้าถึง (คน)" value={access.users} />
            <StatCard icon={Files} label="หลักฐานที่ถูกเข้าถึง (ชิ้น)" value={access.evidence} />
          </div>

          {/* อันดับ Top */}
          <div className="grid grid-cols-2 gap-4">
            <RankCard title="หลักฐานที่ถูกเข้าถึงบ่อยสุด" rows={access.topEvidence} href="/logs" mono />
            <RankCard title="ผู้ใช้ที่เข้าถึงมากสุด" rows={access.topUsers} />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="mt-1 truncate text-xs text-muted">{label}</p>
        </div>
      </div>
    </div>
  );
}

function ChartCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <span className="text-xs text-muted">· {subtitle}</span>}
      </div>
      {children}
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
    <div className="rounded-2xl border border-border bg-surface p-4">
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

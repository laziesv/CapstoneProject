"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, ShieldAlert, Plus, ImageOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSupervisorMap } from "@/hooks/useSupervisorMap";
import ProtectedImage from "@/components/ProtectedImage";
import { caseService, evidenceService } from "@/services";
import { canSeeCase } from "@/utils/caseAccess";
import { canAccess } from "@/config/permissions";
import type { Case, EvidenceItem } from "@/interfaces";
import { formatIncident } from "@/utils/format";

type EvFilter = "all" | "verified" | "pending";

const fmtDT = (s?: string | null) =>
  s ? new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const supervisorMap = useSupervisorMap();
  const [caseData, setCaseData] = useState<Case | null | undefined>(undefined);
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [evFilter, setEvFilter] = useState<EvFilter>("all");

  useEffect(() => {
    (async () => {
      const [c, ev] = await Promise.all([
        caseService.get(id),
        evidenceService.list({ case_id: id }),
      ]);
      setCaseData(c ?? null);
      setEvidenceList(ev);
    })();
  }, [id]);

  const verifiedCount = useMemo(() => evidenceList.filter((e) => e.is_blockchain_verified).length, [evidenceList]);
  const filteredEv = useMemo(() => {
    if (evFilter === "verified") return evidenceList.filter((e) => e.is_blockchain_verified);
    if (evFilter === "pending") return evidenceList.filter((e) => !e.is_blockchain_verified);
    return evidenceList;
  }, [evidenceList, evFilter]);

  // รอ supervisorMap ด้วย ไม่งั้นจะขึ้น "ไม่มีสิทธิ์" แวบหนึ่งก่อนสายบังคับบัญชาโหลดเสร็จ
  if (!user || caseData === undefined || supervisorMap === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (caseData === null) return <p className="p-6">Case not found</p>;

  if (!canSeeCase(user, caseData, supervisorMap)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <ShieldAlert className="h-10 w-10 text-danger" />
        <p className="text-lg font-semibold">ไม่มีสิทธิ์เข้าถึงคดีนี้</p>
        <p className="text-sm text-muted">คดีนี้อยู่นอกความรับผิดชอบของคุณ</p>
        <Link href="/cases" className="mt-2 text-sm text-primary hover:underline">← กลับไปหน้าคดี</Link>
      </div>
    );
  }

  const canUpload = canAccess(user.role, "/evidence/upload");
  const uploadHref = `/evidence/upload?case=${caseData.case_id}`;

  // ไทม์ไลน์การดูแลรักษา — สร้างจากข้อมูลจริง (สร้างคดี + การอัปโหลดหลักฐาน)
  const timeline = [
    { label: "สร้างคดี", who: null as string | null, at: caseData.created_at, color: "bg-primary" },
    ...evidenceList.map((e) => ({
      label: `อัปโหลด ${e.evidence_number}`,
      who: e.officer_name ?? null,
      at: e.uploaded_at,
      color: e.is_blockchain_verified ? "bg-success" : "bg-warning-dot",
    })),
  ]
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    .slice(0, 7);

  const chips: { key: EvFilter; label: string }[] = [
    { key: "all", label: "ทั้งหมด" },
    { key: "verified", label: "ยืนยันแล้ว" },
    { key: "pending", label: "รอยืนยัน" },
  ];

  return (
    <div className="space-y-[18px]">
      {/* Breadcrumb + การกระทำ */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/cases" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> คดี
        </Link>
        <span className="text-muted/60">/</span>
        <span className="font-mono text-base font-semibold">{caseData.case_number}</span>
        {canUpload && (
          <Link
            href={uploadHref}
            className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" /> เพิ่มหลักฐาน
          </Link>
        )}
      </div>

      {/* Hero (สีดำ) */}
      <div className="flex flex-col gap-6 rounded-[20px] bg-ink p-7 text-white sm:flex-row sm:items-start sm:gap-9">
        <div className="flex flex-1 flex-col gap-2.5">
          <span className="font-mono text-xs tracking-wide text-ink-muted">{caseData.case_number}</span>
          <h1 className="text-[30px] font-semibold leading-tight">{caseData.title}</h1>
          {caseData.description && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{caseData.description}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${verifiedCount === evidenceList.length && evidenceList.length > 0 ? "bg-success/15 text-success" : "bg-ink-raised text-white"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${verifiedCount === evidenceList.length && evidenceList.length > 0 ? "bg-success" : "bg-warning-dot"}`} />
              ยืนยันแล้ว {verifiedCount}/{evidenceList.length}
            </span>
            {caseData.location && (
              <span className="rounded-full border border-ink-border bg-ink-raised px-3 py-1 text-xs font-semibold">{caseData.location}</span>
            )}
          </div>
        </div>
        <div className="flex gap-10 sm:pt-1.5">
          <HeroStat label="หลักฐาน" value={String(evidenceList.length)} />
          <HeroStat label="ยืนยันแล้ว" value={String(verifiedCount)} valueClass="text-success" />
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-ink-muted">วันเกิดเหตุ</span>
            <span className="pt-2 text-[15px]">{formatIncident(caseData.incident_date)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* หลักฐานในคดี */}
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
            <h2 className="text-[15px] font-semibold">หลักฐานในคดี</h2>
            <div className="flex gap-1.5">
              {chips.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setEvFilter(c.key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    evFilter === c.key ? "bg-ink font-semibold text-white" : "bg-surface-hover text-text-secondary hover:bg-border/60"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5 p-5 sm:grid-cols-3 xl:grid-cols-4">
            {filteredEv.map((e) => (
              <Link key={e.evidence_id} href={`/evidence/${e.evidence_id}`} className="group flex flex-col gap-2">
                <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-hover">
                  {e.thumbnail_url ? (
                    <ProtectedImage src={e.thumbnail_url} alt={e.description || e.evidence_number} className="h-full w-full object-cover transition-transform group-hover:scale-[1.04]" />
                  ) : (
                    // TODO(backend): แสดงรูปได้เมื่อ EvidenceResponse ส่ง file_id มาด้วย
                    <div className="flex h-full w-full items-center justify-center"><ImageOff className="h-6 w-6 text-muted" /></div>
                  )}
                  {/* จุดสถานะ: เขียว = บันทึกบล็อกเชนแล้ว, เหลือง = รอยืนยัน */}
                  <span
                    className={`absolute bottom-2 left-2 h-2 w-2 rounded-full ring-2 ring-white ${e.is_blockchain_verified ? "bg-success" : "bg-warning-dot"}`}
                    title={e.is_blockchain_verified ? "บันทึกบล็อกเชนแล้ว" : "รอยืนยัน"}
                  />
                </div>
                <span className="truncate font-mono text-[11px] text-primary">{e.evidence_number}</span>
              </Link>
            ))}

            {/* ไทล์อัปโหลด (เฉพาะผู้มีสิทธิ์ + มุมมองทั้งหมด) */}
            {canUpload && evFilter === "all" && (
              <Link href={uploadHref} className="flex flex-col gap-2">
                <div className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border transition-colors hover:border-primary hover:bg-primary-light/30">
                  <Plus className="h-5 w-5 text-primary" />
                  <span className="text-[11px] font-semibold text-primary">อัปโหลด</span>
                </div>
              </Link>
            )}

            {filteredEv.length === 0 && !(canUpload && evFilter === "all") && (
              <p className="col-span-full py-8 text-center text-sm text-muted">ไม่มีหลักฐานในมุมมองนี้</p>
            )}
          </div>
        </div>

        {/* ขวา: ข้อมูลคดี + ไทม์ไลน์ */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="border-b border-border px-5 py-4 text-[15px] font-semibold">ข้อมูลคดี</div>
            <InfoRow label="สถานที่" value={caseData.location} />
            <InfoRow label="วันเกิดเหตุ" value={formatIncident(caseData.incident_date)} />
            <InfoRow label="จำนวนหลักฐาน" value={`${evidenceList.length} ชิ้น`} />
            <InfoRow label="สร้างเมื่อ" value={fmtDate(caseData.created_at)} last />
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
            <span className="text-[15px] font-semibold">ไทม์ไลน์การดูแลรักษา</span>
            {timeline.length === 0 ? (
              <p className="text-sm text-muted">ยังไม่มีกิจกรรม</p>
            ) : (
              <ol className="flex flex-col gap-3.5">
                {timeline.map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${t.color}`} />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[13px] font-semibold">{t.label}</span>
                      <span className="text-xs text-muted">{t.who ? `${t.who} · ` : ""}{fmtDT(t.at)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroStat({ label, value, valueClass = "text-white" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className={`font-mono text-[28px] leading-none ${valueClass}`}>{value}</span>
    </div>
  );
}

function InfoRow({ label, value, last }: { label: string; value?: string | null; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-5 py-3.5 ${last ? "" : "border-b border-border"}`}>
      <span className="flex-shrink-0 text-[13px] text-text-secondary">{label}</span>
      <span className="min-w-0 truncate text-right text-[13px] font-semibold">{value || "—"}</span>
    </div>
  );
}

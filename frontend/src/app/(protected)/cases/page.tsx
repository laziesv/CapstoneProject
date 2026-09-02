"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Loader2, FolderOpen, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSupervisorMap } from "@/hooks/useSupervisorMap";
import { caseService, evidenceService } from "@/services";
import ProtectedImage from "@/components/ProtectedImage";
import { visibleCases, canCreateCase } from "@/utils/caseAccess";
import type { Case, EvidenceItem } from "@/interfaces";
import { formatIncident } from "@/utils/format";

/** รูปหลักฐานที่อัพโหลดล่าสุดของคดี (ใช้เป็นภาพปกการ์ด) */
const coverOf = (evidence: EvidenceItem[], caseId: string) =>
  evidence
    .filter((e) => e.case_id === caseId && e.thumbnail_url)
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))[0]?.thumbnail_url;

/** จำนวนหลักฐานจริงของคดี (คดีสร้างใหม่ยังไม่มีหลักฐาน) */
const evidenceCountOf = (evidence: EvidenceItem[], caseId: string) =>
  evidence.filter((e) => e.case_id === caseId).length;

export default function CasesPage() {
  const { user } = useAuth();
  const supervisorMap = useSupervisorMap();
  const [cases, setCases] = useState<Case[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    // โหลดผ่าน service หลัง mount เพื่อเลี่ยง hydration mismatch
    (async () => {
      const [cs, ev] = await Promise.all([caseService.list(), evidenceService.list()]);
      setCases(cs);
      setEvidence(ev);
    })();
  }, []);

  const canCreate = canCreateCase(user);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // ยังโหลด map ไม่เสร็จ = แสดงเฉพาะคดีของตัวเองไปก่อน แล้วขยายเมื่อโหลดเสร็จ
    return visibleCases(user, cases, supervisorMap ?? {})
      .filter((c) => {
        if (!q) return true;
        return `${c.case_number} ${c.title}`.toLowerCase().includes(q);
      })
      // เรียงล่าสุดก่อน (ตามวันที่สร้างคดี)
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  }, [user, cases, query, supervisorMap]);

  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* แถวควบคุม: ค้นหา (pill) + ปุ่มสร้างคดี */}
      <div className="flex items-center gap-4">
        <div className="group relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted transition-colors group-focus-within:text-primary" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาเลขคดี / ชื่อคดี…"
            className="h-11 w-full rounded-full border border-border bg-surface pl-11 pr-10 text-sm shadow-sm outline-none transition placeholder:text-muted hover:border-muted/50 focus:border-primary focus:ring-4 focus:ring-primary/10"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="ล้างการค้นหา"
              className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {canCreate ? (
          <Link
            href="/cases/new"
            className="ml-auto inline-flex h-11 flex-shrink-0 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" /> สร้างคดีใหม่
          </Link>
        ) : (
          <button
            disabled
            title={user.role === "admin" ? "ผู้ดูแลระบบไม่มีสิทธิ์สร้างคดี" : "เฉพาะระดับหัวหน้า (ชั้นสัญญาบัตร) เท่านั้นที่สร้างคดีได้"}
            className="ml-auto inline-flex h-11 flex-shrink-0 cursor-not-allowed items-center gap-1.5 rounded-full bg-surface-hover px-5 text-sm font-semibold text-muted"
          >
            <Plus className="h-4 w-4" /> สร้างคดีใหม่
          </button>
        )}
      </div>

      {/* ชิปสรุป + การเรียง */}
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white">
          ทั้งหมด {filtered.length}
        </span>
        {/* TODO(backend): เพิ่มชิป "ดำเนินอยู่/ปิดคดี" เมื่อ Case มี field สถานะ (closed_at) ส่งมา */}
        <span className="ml-auto text-sm text-muted">เรียงตาม: ล่าสุด</span>
      </div>

      {/* กริดการ์ดคดี — ปก = รูปหลักฐานแรกของคดี */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 ? (
          // แสดง feedback เสมอเมื่อไม่มีผล — รวมถึงคนที่สร้างคดีได้ (จะเห็นการ์ด dashed คู่กันด้านล่าง)
          <div className="col-span-full rounded-2xl border border-border bg-surface px-5 py-12 text-center text-sm text-muted">
            {query.trim() ? "ไม่พบคดีที่ตรงกับการค้นหา" : "ไม่มีคดีที่คุณเข้าถึงได้"}
          </div>
        ) : (
          filtered.map((c) => {
            const cover = coverOf(evidence, c.case_id);
            const count = evidenceCountOf(evidence, c.case_id);
            return (
              <Link
                key={c.case_id}
                href={`/cases/${c.case_number}`}
                className="group overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-primary"
              >
                {/* ปก */}
                <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-surface-hover">
                  {count === 0 ? (
                    <div className="flex flex-col items-center gap-2 text-muted">
                      <FolderOpen className="h-7 w-7 text-slate-400" />
                      <span className="text-xs">ยังไม่มีหลักฐาน</span>
                    </div>
                  ) : cover ? (
                    <ProtectedImage
                      src={cover}
                      alt={c.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <span className="text-xs text-muted">ภาพปกหลักฐาน</span>
                  )}
                  {count > 0 && (
                    <span className="absolute left-3 top-3 rounded-full bg-black/75 px-2.5 py-1 text-[11px] font-semibold text-white">
                      {count} หลักฐาน
                    </span>
                  )}
                </div>

                {/* เนื้อการ์ด */}
                <div className="flex flex-col gap-1.5 p-4">
                  <p className="font-mono text-xs text-primary">{c.case_number}</p>
                  <p className="font-semibold line-clamp-1">{c.title}</p>
                  <div className="flex items-center gap-3.5 pt-0.5 text-xs text-muted">
                    <span className="truncate">{c.location}</span>
                    <span className="flex-shrink-0">{formatIncident(c.incident_date)}</span>
                  </div>
                </div>
              </Link>
            );
          })
        )}

        {/* การ์ด "สร้างคดีใหม่" ท้ายกริด (เฉพาะผู้มีสิทธิ์) */}
        {canCreate && (
          <Link
            href="/cases/new"
            className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border transition-colors hover:border-primary hover:bg-primary-light/30"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-light">
              <Plus className="h-5 w-5 text-primary" />
            </span>
            <span className="text-sm font-semibold text-primary">สร้างคดีใหม่</span>
          </Link>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Loader2, Images, MapPin, CalendarDays, FolderOpen } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { caseService, evidenceService } from "@/services";
import { visibleCases, canCreateCase } from "@/utils/caseAccess";
import type { Case, EvidenceItem } from "@/interfaces";
import { formatIncident } from "@/utils/format";

/** รูปหลักฐานชิ้นแรกที่อัพโหลดของคดี (ใช้เป็นภาพปกการ์ด) */
const coverOf = (evidence: EvidenceItem[], caseId: string) =>
  evidence
    .filter((e) => e.case_id === caseId && e.thumbnail_url)
    .sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at))[0]?.thumbnail_url;

/** จำนวนหลักฐานจริงของคดี (คดีสร้างใหม่ยังไม่มีหลักฐาน) */
const evidenceCountOf = (evidence: EvidenceItem[], caseId: string) =>
  evidence.filter((e) => e.case_id === caseId).length;

export default function CasesPage() {
  const { user } = useAuth();
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
    return visibleCases(user, cases).filter((c) => {
      if (!q) return true;
      return `${c.case_number} ${c.title}`.toLowerCase().includes(q);
    });
  }, [user, cases, query]);

  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cases</h1>
          <p className="text-sm text-muted mt-1">
            {user.role === "admin" ? "คดีทั้งหมดในระบบ" : "คดีที่คุณรับผิดชอบ"}
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/cases/new"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> New Case
          </Link>
        ) : (
          <button
            disabled
            title={user.role === "admin" ? "ผู้ดูแลระบบไม่มีสิทธิ์สร้างคดี" : "เฉพาะระดับหัวหน้า (ชั้นสัญญาบัตร) เท่านั้นที่สร้างคดีได้"}
            className="flex cursor-not-allowed items-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-400"
          >
            <Plus className="h-4 w-4" /> New Case
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาเลขคดี / ชื่อคดี..."
          className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-4 text-sm outline-none focus:border-primary"
        />
      </div>

      {/* Cases Card Grid — ภาพปก = รูปหลักฐานแรกของคดี */}
      <div className="grid grid-cols-3 gap-5">
        {filtered.length === 0 ? (
          <div className="col-span-3 rounded-xl border border-border bg-surface px-5 py-12 text-center text-sm text-muted">
            ไม่มีคดีที่คุณเข้าถึงได้
          </div>
        ) : (
          filtered.map((c) => {
            const cover = coverOf(evidence, c.case_id);
            const count = evidenceCountOf(evidence, c.case_id);
            return (
              <Link
                key={c.case_id}
                href={`/cases/${c.case_id}`}
                className="group overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                {/* Cover */}
                <div className="relative aspect-video overflow-hidden bg-slate-100">
                  {cover ? (
                    <img
                      src={cover}
                      alt={c.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 to-primary-light/40">
                      <FolderOpen className="h-8 w-8 text-slate-400" />
                      <span className="text-xs text-muted">ยังไม่มีหลักฐาน</span>
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="space-y-1.5 p-4">
                  <p className="font-mono text-xs text-primary">{c.case_number}</p>
                  <p className="font-medium line-clamp-1">{c.title}</p>
                  <div className="flex items-center gap-3 pt-1 text-xs text-muted">
                    <span className="flex items-center gap-1 whitespace-nowrap flex-shrink-0">
                      <Images className="h-3.5 w-3.5" /> {count} หลักฐาน
                    </span>
                    <span className="flex min-w-0 items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{c.location}</span>
                    </span>
                    <span className="flex items-center gap-1 flex-shrink-0">
                      <CalendarDays className="h-3.5 w-3.5" /> {formatIncident(c.incident_date)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getCases } from "@/utils/caseStore";
import { visibleCases, canCreateCase } from "@/utils/caseAccess";
import type { Case } from "@/interfaces";

const statusStyle: Record<string, string> = {
  open: "bg-blue-50 text-blue-700",
  investigating: "bg-amber-50 text-amber-700",
  closed: "bg-slate-100 text-slate-500",
  archived: "bg-slate-50 text-slate-400",
};

export default function CasesPage() {
  const { user } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    // โหลดจาก store ฝั่ง client (localStorage) หลัง mount เพื่อเลี่ยง hydration mismatch
    (async () => {
      setCases(getCases());
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

      {/* Cases Table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50/50 text-left text-xs font-medium text-muted uppercase tracking-wide">
              <th className="px-5 py-3">Case Number</th>
              <th className="px-5 py-3">Title</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Evidence</th>
              <th className="px-5 py-3">Location</th>
              <th className="px-5 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-muted">
                  ไม่มีคดีที่คุณเข้าถึงได้
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.case_id} className="hover:bg-surface-hover transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/cases/${c.case_id}`} className="font-mono text-primary hover:underline">{c.case_number}</Link>
                  </td>
                  <td className="px-5 py-3 font-medium">{c.title}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle[c.status]}`}>{c.status}</span>
                  </td>
                  <td className="px-5 py-3 text-muted">{c.evidence_count ?? 0} items</td>
                  <td className="px-5 py-3 text-muted text-xs">{c.location}</td>
                  <td className="px-5 py-3 text-muted text-xs">{c.incident_date}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

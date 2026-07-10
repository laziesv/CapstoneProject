"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getCases } from "@/utils/caseStore";
import { visibleCases } from "@/utils/caseAccess";
import { mockEvidence } from "@/utils/mockData";
import type { Case } from "@/interfaces";

const categoryLabel: Record<string, string> = {
  crime_scene: "Crime Scene",
  forensic: "Forensic",
  surveillance: "Surveillance",
  document: "Document",
};

const statusStyle: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  verified: "bg-green-50 text-green-700",
  flagged: "bg-red-50 text-red-700",
  rejected: "bg-slate-100 text-slate-500",
};

export default function EvidenceVaultPage() {
  const { user } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    (async () => {
      setCases(getCases());
    })();
  }, []);

  const list = useMemo(() => {
    // เห็นเฉพาะหลักฐานของคดีที่รับผิดชอบ (admin เห็นทุกคดี)
    const visibleCaseIds = new Set(visibleCases(user, cases).map((c) => c.case_id));
    const q = query.trim().toLowerCase();
    return mockEvidence.filter((e) => {
      if (!visibleCaseIds.has(e.case_id)) return false;
      if (category && e.category !== category) return false;
      if (status && e.status !== status) return false;
      if (q) {
        const hay = `${e.evidence_number} ${e.description} ${e.case_number ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [user, cases, query, category, status]);

  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Evidence Vault</h1>
        <p className="text-sm text-muted mt-1">
          {user.role === "admin" ? "คลังหลักฐานดิจิทัลทั้งหมด" : "หลักฐานของคดีที่คุณรับผิดชอบ"}
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาหลักฐาน..."
            className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-4 text-sm outline-none focus:border-primary"
          />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-muted outline-none focus:border-primary">
          <option value="">All Categories</option>
          <option value="crime_scene">Crime Scene</option>
          <option value="forensic">Forensic</option>
          <option value="surveillance">Surveillance</option>
          <option value="document">Document</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-muted outline-none focus:border-primary">
          <option value="">All Status</option>
          <option value="verified">Verified</option>
          <option value="pending">Pending</option>
          <option value="flagged">Flagged</option>
        </select>
      </div>

      {/* Evidence Grid */}
      {list.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-12 text-center text-sm text-muted">
          ไม่มีหลักฐานที่คุณเข้าถึงได้
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {list.map((e) => (
            <Link key={e.evidence_id} href={`/evidence/${e.evidence_id}`} className="group rounded-xl border border-border bg-surface overflow-hidden hover:shadow-md transition-all">
              <div className="aspect-video bg-slate-100 overflow-hidden relative">
                <img src={e.thumbnail_url} alt={e.description} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <span className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyle[e.status]}`}>{e.status}</span>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-xs text-primary">{e.evidence_number}</p>
                  <p className="text-[10px] text-muted">{categoryLabel[e.category]}</p>
                </div>
                <p className="mt-1.5 text-sm font-medium truncate">{e.description}</p>
                <p className="mt-1 text-xs text-muted">Case: {e.case_number}</p>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex gap-1.5">
                    {e.is_watermarked && <span className="rounded bg-primary-light px-1.5 py-0.5 text-[10px] font-medium text-primary">Watermarked</span>}
                    {e.is_blockchain_verified && <span className="rounded bg-success-light px-1.5 py-0.5 text-[10px] font-medium text-success">On-chain</span>}
                  </div>
                  <p className="text-[10px] text-muted">{new Date(e.uploaded_at).toLocaleDateString("th-TH")}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

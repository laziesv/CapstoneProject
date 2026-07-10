"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Calendar, Loader2, ShieldAlert, UploadCloud } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getCases } from "@/utils/caseStore";
import { canSeeCase } from "@/utils/caseAccess";
import { mockEvidence } from "@/utils/mockData";
import type { Case } from "@/interfaces";

const statusStyle: Record<string, string> = {
  open: "bg-blue-50 text-blue-700",
  investigating: "bg-amber-50 text-amber-700",
  closed: "bg-slate-100 text-slate-500",
  archived: "bg-slate-50 text-slate-400",
};

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [cases, setCases] = useState<Case[] | null>(null);

  useEffect(() => {
    (async () => {
      setCases(getCases());
    })();
  }, []);

  if (!user || cases === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const caseData = cases.find((c) => c.case_id === id);
  if (!caseData) return <p className="p-6">Case not found</p>;

  if (!canSeeCase(user, caseData)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <ShieldAlert className="h-10 w-10 text-danger" />
        <p className="text-lg font-semibold">ไม่มีสิทธิ์เข้าถึงคดีนี้</p>
        <p className="text-sm text-muted">คดีนี้อยู่นอกความรับผิดชอบของคุณ</p>
        <Link href="/cases" className="mt-2 text-sm text-primary hover:underline">← กลับไปหน้าคดี</Link>
      </div>
    );
  }

  const evidenceList = mockEvidence.filter((e) => e.case_id === id);

  return (
    <div className="space-y-6">
      <Link href="/cases" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Cases
      </Link>

      {/* Case Info */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-sm text-muted">{caseData.case_number}</p>
            <h1 className="mt-1 text-xl font-bold">{caseData.title}</h1>
            <p className="mt-2 text-sm text-text-secondary">{caseData.description}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyle[caseData.status]}`}>{caseData.status}</span>
        </div>
        <div className="mt-4 flex gap-6 text-sm text-muted">
          <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{caseData.location}</span>
          <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{caseData.incident_date}</span>
        </div>
      </div>

      {/* Evidence in Case */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Evidence ({evidenceList.length})</h2>
        {/* อัพโหลดได้เฉพาะผู้รับผิดชอบคดี (non-admin ที่ผ่าน guard มาถึงตรงนี้ = รับผิดชอบ) */}
        {user.role !== "admin" && (
          <Link
            href={`/evidence/upload?case=${caseData.case_id}`}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <UploadCloud className="h-4 w-4" /> อัพโหลดหลักฐาน
          </Link>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {evidenceList.map((e) => (
          <Link key={e.evidence_id} href={`/evidence/${e.evidence_id}`} className="group rounded-xl border border-border bg-surface overflow-hidden hover:shadow-md transition-all">
            <div className="aspect-video bg-slate-100 overflow-hidden">
              <img src={e.thumbnail_url} alt={e.description} className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
            </div>
            <div className="p-4">
              <p className="font-mono text-xs text-primary">{e.evidence_number}</p>
              <p className="mt-1 text-sm font-medium truncate">{e.description}</p>
              <div className="mt-2 flex gap-1.5">
                {e.is_watermarked && <span className="rounded bg-primary-light px-1.5 py-0.5 text-[10px] font-medium text-primary">WM</span>}
                {e.is_blockchain_verified && <span className="rounded bg-success-light px-1.5 py-0.5 text-[10px] font-medium text-success">BC</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

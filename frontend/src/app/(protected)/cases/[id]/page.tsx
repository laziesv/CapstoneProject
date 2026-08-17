"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Calendar, Loader2, ShieldAlert, UploadCloud, ImageOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSupervisorMap } from "@/hooks/useSupervisorMap";
import ProtectedImage from "@/components/ProtectedImage";
import { caseService, evidenceService } from "@/services";
import { canSeeCase } from "@/utils/caseAccess";
import type { Case, EvidenceItem } from "@/interfaces";
import { formatIncident } from "@/utils/format";


export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const supervisorMap = useSupervisorMap();
  const [caseData, setCaseData] = useState<Case | null | undefined>(undefined);
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);

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
        </div>
        <div className="mt-4 flex gap-6 text-sm text-muted">
          <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{caseData.location}</span>
          <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{formatIncident(caseData.incident_date)}</span>
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
              {e.thumbnail_url ? (
                <ProtectedImage src={e.thumbnail_url} alt={e.description} className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
              ) : (
                // TODO(backend): แสดงรูปได้เมื่อ EvidenceResponse ส่ง file_id มาด้วย
                <div className="flex h-full w-full items-center justify-center">
                  <ImageOff className="h-7 w-7 text-muted" />
                </div>
              )}
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

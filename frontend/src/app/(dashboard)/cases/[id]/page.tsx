import Link from "next/link";
import { mockCases, mockEvidence } from "@/lib/mockData";
import { ArrowLeft, MapPin, Calendar, UploadCloud } from "lucide-react";

const statusStyle: Record<string, string> = {
  open: "bg-blue-50 text-blue-700",
  investigating: "bg-amber-50 text-amber-700",
  closed: "bg-slate-100 text-slate-500",
};

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caseData = mockCases.find((c) => c.case_id === id);
  if (!caseData) return <p className="p-6">Case not found</p>;

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
        <Link href="/evidence/upload" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors">
          <UploadCloud className="h-4 w-4" /> Upload
        </Link>
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

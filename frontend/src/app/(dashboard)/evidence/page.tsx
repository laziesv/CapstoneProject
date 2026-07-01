import Link from "next/link";
import { mockEvidence } from "@/utils/mockData";
import { Search, Grid3X3, List } from "lucide-react";

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
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Evidence Vault</h1>
          <p className="text-sm text-muted mt-1">คลังหลักฐานดิจิทัลทั้งหมด</p>
        </div>
        <Link href="/evidence/upload" className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors">
          Upload Evidence
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input type="text" placeholder="ค้นหาหลักฐาน..." className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-4 text-sm outline-none focus:border-primary" />
        </div>
        <select className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-muted outline-none">
          <option value="">All Categories</option>
          <option value="crime_scene">Crime Scene</option>
          <option value="forensic">Forensic</option>
          <option value="surveillance">Surveillance</option>
          <option value="document">Document</option>
        </select>
        <select className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-muted outline-none">
          <option value="">All Status</option>
          <option value="verified">Verified</option>
          <option value="pending">Pending</option>
          <option value="flagged">Flagged</option>
        </select>
      </div>

      {/* Evidence Grid */}
      <div className="grid grid-cols-3 gap-4">
        {mockEvidence.map((e) => (
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
    </div>
  );
}

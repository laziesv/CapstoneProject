import Link from "next/link";
import { mockCases } from "@/lib/mockData";
import { Plus, Search } from "lucide-react";

const statusStyle: Record<string, string> = {
  open: "bg-blue-50 text-blue-700",
  investigating: "bg-amber-50 text-amber-700",
  closed: "bg-slate-100 text-slate-500",
  archived: "bg-slate-50 text-slate-400",
};

export default function CasesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cases</h1>
          <p className="text-sm text-muted mt-1">คดีที่คุณรับผิดชอบ</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> New Case
        </button>
      </div>

      {/* Search & Filter */}
      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input type="text" placeholder="ค้นหาเลขคดี / ชื่อคดี..." className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-4 text-sm outline-none focus:border-primary" />
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
            {mockCases.map((c) => (
              <tr key={c.case_id} className="hover:bg-surface-hover transition-colors">
                <td className="px-5 py-3">
                  <Link href={`/cases/${c.case_id}`} className="font-mono text-primary hover:underline">{c.case_number}</Link>
                </td>
                <td className="px-5 py-3 font-medium">{c.title}</td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle[c.status]}`}>{c.status}</span>
                </td>
                <td className="px-5 py-3 text-muted">{c.evidence_count} items</td>
                <td className="px-5 py-3 text-muted text-xs">{c.location}</td>
                <td className="px-5 py-3 text-muted text-xs">{c.incident_date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

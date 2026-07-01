import { mockLogs } from "@/utils/mockData";
import { Search } from "lucide-react";

const actionStyle: Record<string, string> = {
  view: "bg-blue-50 text-blue-700",
  download: "bg-purple-50 text-purple-700",
  print: "bg-amber-50 text-amber-700",
  share: "bg-cyan-50 text-cyan-700",
  export: "bg-slate-100 text-slate-600",
};
const resultStyle: Record<string, string> = {
  success: "bg-green-50 text-green-700",
  denied: "bg-red-50 text-red-700",
  unauthorized: "bg-red-100 text-red-800",
};

export default function LogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Access Logs</h1>
        <p className="text-sm text-muted mt-1">บันทึกการเข้าถึงหลักฐานทั้งหมด</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input type="text" placeholder="ค้นหา..." className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-4 text-sm outline-none focus:border-primary" />
        </div>
        <select className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-muted outline-none">
          <option value="">All Actions</option>
          <option value="view">View</option>
          <option value="download">Download</option>
          <option value="print">Print</option>
          <option value="share">Share</option>
        </select>
        <select className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-muted outline-none">
          <option value="">All Results</option>
          <option value="success">Success</option>
          <option value="denied">Denied</option>
        </select>
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50/50 text-left text-xs font-medium text-muted uppercase tracking-wide">
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Evidence</th>
              <th className="px-5 py-3">Action</th>
              <th className="px-5 py-3">IP Address</th>
              <th className="px-5 py-3">Tx Hash</th>
              <th className="px-5 py-3">Result</th>
              <th className="px-5 py-3">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockLogs.map((l) => (
              <tr key={l.log_id} className="hover:bg-surface-hover transition-colors">
                <td className="px-5 py-3 font-medium text-xs">{l.user_name}</td>
                <td className="px-5 py-3 font-mono text-xs text-primary">{l.evidence_number}</td>
                <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${actionStyle[l.action]}`}>{l.action}</span></td>
                <td className="px-5 py-3 font-mono text-xs text-muted">{l.ip_address}</td>
                <td className="px-5 py-3 font-mono text-xs text-muted">{l.tx_hash || "—"}</td>
                <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${resultStyle[l.result]}`}>{l.result}</span></td>
                <td className="px-5 py-3 text-xs text-muted">{new Date(l.accessed_at).toLocaleString("th-TH")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

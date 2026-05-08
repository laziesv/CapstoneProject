import { mockTx } from "@/lib/mockData";
import { Copy, Search } from "lucide-react";

const actionStyle: Record<string, string> = {
  upload: "bg-blue-50 text-blue-700",
  access: "bg-amber-50 text-amber-700",
  verify: "bg-green-50 text-green-700",
  transfer: "bg-purple-50 text-purple-700",
  flag: "bg-red-50 text-red-700",
};

const statusStyle: Record<string, string> = {
  confirmed: "bg-green-50 text-green-700",
  pending: "bg-amber-50 text-amber-700",
  failed: "bg-red-50 text-red-700",
};

export default function BlockchainPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Blockchain Ledger</h1>
        <p className="text-sm text-muted mt-1">ธุรกรรมทั้งหมดที่บันทึกบน Blockchain</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input type="text" placeholder="ค้นหา tx hash, evidence number..." className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-4 text-sm outline-none focus:border-primary" />
        </div>
        <select className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-muted outline-none">
          <option value="">All Actions</option>
          <option value="upload">Upload</option>
          <option value="access">Access</option>
          <option value="verify">Verify</option>
        </select>
        <select className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-muted outline-none">
          <option value="">All Status</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50/50 text-left text-xs font-medium text-muted uppercase tracking-wide">
              <th className="px-5 py-3">Tx Hash</th>
              <th className="px-5 py-3">Action</th>
              <th className="px-5 py-3">Evidence</th>
              <th className="px-5 py-3">Officer</th>
              <th className="px-5 py-3">Block</th>
              <th className="px-5 py-3">Gas</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockTx.map((tx) => (
              <tr key={tx.tx_internal_id} className="hover:bg-surface-hover transition-colors">
                <td className="px-5 py-3">
                  <span className="font-mono text-xs text-primary">{tx.tx_hash.slice(0, 18)}...</span>
                </td>
                <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${actionStyle[tx.action_type]}`}>{tx.action_type}</span></td>
                <td className="px-5 py-3 font-mono text-xs">{tx.evidence_number}</td>
                <td className="px-5 py-3 text-xs">{tx.officer_name}</td>
                <td className="px-5 py-3 font-mono text-xs">{tx.block_number}</td>
                <td className="px-5 py-3 text-xs text-muted">{tx.gas_used > 0 ? tx.gas_used.toLocaleString() : "—"}</td>
                <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[tx.status]}`}>{tx.status}</span></td>
                <td className="px-5 py-3 text-xs text-muted">{new Date(tx.block_timestamp).toLocaleString("th-TH")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

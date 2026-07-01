import Link from "next/link";
import { mockEvidence, mockTx, mockLogs } from "@/utils/mockData";
import { ArrowLeft, ShieldCheck, Link2, Clock, Info, Fingerprint } from "lucide-react";

const categoryLabel: Record<string, string> = { crime_scene: "Crime Scene", forensic: "Forensic", surveillance: "Surveillance", document: "Document" };
const statusStyle: Record<string, string> = { pending: "bg-amber-50 text-amber-700", verified: "bg-green-50 text-green-700", flagged: "bg-red-50 text-red-700" };

export default async function EvidenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const evidence = mockEvidence.find((e) => e.evidence_id === id);
  if (!evidence) return <p className="p-6">Evidence not found</p>;

  const relatedTx = mockTx.filter((t) => t.evidence_id === id);
  const relatedLogs = mockLogs.filter((l) => l.evidence_id === id);

  return (
    <div className="space-y-6">
      <Link href="/evidence" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Vault
      </Link>

      {/* Phase 2 Banner */}
      <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <Fingerprint className="h-5 w-5 text-primary" />
        <p className="text-sm text-blue-800">การเข้าถึงหน้านี้ถูกบันทึกลง Blockchain และฝัง Dynamic Watermark อัตโนมัติ</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Image */}
        <div className="col-span-2 space-y-4">
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <img src={evidence.thumbnail_url} alt={evidence.description} className="w-full object-cover" style={{ maxHeight: 420 }} />
          </div>

          {/* Blockchain Transactions */}
          <div className="rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-5 py-3 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-muted" />
              <h3 className="font-semibold text-sm">Blockchain Transactions</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border text-left text-muted"><th className="px-5 py-2">Tx Hash</th><th className="px-5 py-2">Action</th><th className="px-5 py-2">Block</th><th className="px-5 py-2">Status</th><th className="px-5 py-2">Time</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {relatedTx.map((tx) => (
                    <tr key={tx.tx_internal_id} className="hover:bg-surface-hover">
                      <td className="px-5 py-2 font-mono text-primary">{tx.tx_hash.slice(0, 18)}...</td>
                      <td className="px-5 py-2"><span className="rounded bg-slate-100 px-1.5 py-0.5">{tx.action_type}</span></td>
                      <td className="px-5 py-2 font-mono">{tx.block_number}</td>
                      <td className="px-5 py-2"><span className={`rounded-full px-2 py-0.5 ${tx.status === "confirmed" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{tx.status}</span></td>
                      <td className="px-5 py-2 text-muted">{new Date(tx.block_timestamp).toLocaleString("th-TH")}</td>
                    </tr>
                  ))}
                  {relatedTx.length === 0 && <tr><td colSpan={5} className="px-5 py-4 text-center text-muted">No transactions found</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Access History */}
          <div className="rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-5 py-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted" />
              <h3 className="font-semibold text-sm">Access History</h3>
            </div>
            <div className="divide-y divide-border">
              {relatedLogs.map((l) => (
                <div key={l.log_id} className="flex items-center gap-4 px-5 py-3 text-xs">
                  <span className="font-medium">{l.user_name}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5">{l.action}</span>
                  <span className="text-muted">{l.ip_address}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 ${l.result === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{l.result}</span>
                  <span className="text-muted">{new Date(l.accessed_at).toLocaleString("th-TH")}</span>
                </div>
              ))}
              {relatedLogs.length === 0 && <p className="px-5 py-4 text-center text-xs text-muted">No access logs</p>}
            </div>
          </div>
        </div>

        {/* Right: Info */}
        <div className="space-y-4">
          {/* Evidence Info */}
          <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Evidence Info</h3>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[evidence.status]}`}>{evidence.status}</span>
            </div>
            <div className="space-y-2.5 text-sm">
              <Row label="Number" value={evidence.evidence_number} mono />
              <Row label="Case" value={evidence.case_number || ""} mono />
              <Row label="Category" value={categoryLabel[evidence.category]} />
              <Row label="Officer" value={evidence.officer_name || ""} />
              <Row label="Filename" value={evidence.original_filename} />
              <Row label="Size" value={`${(evidence.file_size_bytes / 1e6).toFixed(1)} MB`} />
              <Row label="Captured" value={new Date(evidence.captured_at).toLocaleString("th-TH")} />
              <Row label="Uploaded" value={new Date(evidence.uploaded_at).toLocaleString("th-TH")} />
            </div>
          </div>

          {/* File Hash */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="font-semibold text-sm mb-2">SHA-256 Hash</h3>
            <p className="break-all font-mono text-[10px] text-muted leading-relaxed bg-slate-50 rounded-lg p-3">{evidence.file_hash_sha256}</p>
          </div>

          {/* Watermark Status */}
          <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Watermark</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">Static Watermark</span>
                <span className={`text-xs font-medium ${evidence.is_watermarked ? "text-success" : "text-muted"}`}>{evidence.is_watermarked ? "✓ Embedded" : "— Not embedded"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Blockchain</span>
                <span className={`text-xs font-medium ${evidence.is_blockchain_verified ? "text-success" : "text-muted"}`}>{evidence.is_blockchain_verified ? "✓ On-chain" : "— Pending"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={`font-medium text-right ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

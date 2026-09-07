"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  Blocks,
  CheckCircle2,
  Database,
  FileSearch,
  Loader2,
  Search,
  ServerCrash,
} from "lucide-react";

import type {
  BlockchainAccessEvent,
  BlockchainAccessSessionResult,
  BlockchainBlockResult,
  BlockchainEvidenceResult,
  BlockchainOverview,
  BlockchainRegistryEvent,
  BlockchainSearchResult,
  BlockchainSearchType,
  BlockchainTransactionResult,
} from "@/interfaces";
import { ApiError, blockchainService } from "@/services";
import { userFacingApiError } from "@/utils/evidenceDownloadError";
import { formatForensicAction, formatForensicUnixTime } from "@/utils/forensics";
import { isBlockchainSearchType } from "@/utils/blockchainExplorer";

const SEARCH_OPTIONS: Array<{ value: BlockchainSearchType; label: string; placeholder: string }> = [
  { value: "block", label: "Block Number", placeholder: "เช่น 21551" },
  { value: "transaction", label: "Transaction Hash", placeholder: "0x..." },
  { value: "evidence", label: "Evidence ID", placeholder: "UUID ของหลักฐาน" },
  { value: "evidence-ref", label: "Evidence Ref", placeholder: "0x + hexadecimal 64 ตัว" },
  { value: "access-session", label: "Access Session Ref", placeholder: "0x + hexadecimal 64 ตัว" },
];

export default function BlockchainExplorerPage() {
  const [overview, setOverview] = useState<BlockchainOverview | null>(null);
  const [type, setType] = useState<BlockchainSearchType>("block");
  const [value, setValue] = useState("");
  const [result, setResult] = useState<BlockchainSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeSearch = useCallback(async (searchType: BlockchainSearchType, searchValue: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await blockchainService.search(searchType, searchValue));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        setError(notFoundMessage(searchType));
      } else if (caught instanceof Error && !Reflect.has(caught, "status")) {
        setError(caught.message);
      } else {
        const feedback = userFacingApiError(caught);
        setError(`${feedback.title} ${feedback.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void blockchainService.overview()
      .then(setOverview)
      .catch(() => setOverview(null));
    const params = new URLSearchParams(window.location.search);
    const initialType = params.get("type");
    const initialValue = params.get("value") || "";
    const deepLinkTimer = window.setTimeout(() => {
      if (isBlockchainSearchType(initialType) && initialValue) {
        setType(initialType);
        setValue(initialValue);
        void executeSearch(initialType, initialValue);
      }
    }, 0);
    return () => window.clearTimeout(deepLinkTimer);
  }, [executeSearch]);

  const selected = SEARCH_OPTIONS.find((option) => option.value === type) ?? SEARCH_OPTIONS[0];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">ตรวจสอบ Blockchain</h1>
        <p className="mt-1 text-sm text-muted">ตรวจสอบข้อมูล EvidenceRegistryV3 จากเครือข่ายโดยตรงแบบอ่านอย่างเดียว</p>
      </header>

      <NetworkOverview overview={overview} />

      <section className="border-y border-border bg-surface py-5">
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">ค้นหาข้อมูลบน Blockchain</h2>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="ค้นหาด้วย">
          {SEARCH_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => { setType(option.value); setResult(null); setError(null); }}
              className={`border px-3 py-2 text-xs font-medium transition-colors ${
                type === option.value
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-white text-muted hover:border-primary/50 hover:text-text"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void executeSearch(type, value);
          }}
        >
          <label className="sr-only" htmlFor="blockchain-search">{selected.label}</label>
          <input
            id="blockchain-search"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={selected.placeholder}
            className="min-w-0 flex-1 border border-border bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-primary"
          />
          <button type="submit" disabled={loading || !value.trim()} className="inline-flex items-center gap-2 bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            ค้นหา
          </button>
        </form>
      </section>

      {loading && <StateMessage icon={<Loader2 className="h-6 w-6 animate-spin" />} text="กำลังอ่านข้อมูลจาก Blockchain..." />}
      {error && !loading && <StateMessage danger icon={<ServerCrash className="h-6 w-6" />} text={error} />}
      {result && !loading && <SearchResult result={result} />}
    </div>
  );
}

function NetworkOverview({ overview }: { overview: BlockchainOverview | null }) {
  const items = [
    ["Network", overview?.network],
    ["Consensus", overview?.consensus],
    ["Chain ID", numberValue(overview?.chain_id)],
    ["Current Block", numberValue(overview?.latest_block)],
    ["Deployment Block", numberValue(overview?.deployment_block)],
    ["EvidenceRegistryV3", overview?.contract_address],
  ];
  const connected = Boolean(overview?.enabled && overview.connected && overview.contract_deployed);
  return (
    <section className="border border-border bg-surface">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2"><Blocks className="h-5 w-5 text-primary" /><h2 className="font-semibold">เครือข่ายและสัญญา</h2></div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${connected ? "text-success" : "text-danger"}`}>
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-success" : "bg-danger"}`} />
          {connected ? "Connected" : "Unavailable"}
        </span>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3">
        {items.map(([label, itemValue]) => (
          <div key={label} className="min-w-0 border-b border-r border-border px-4 py-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 break-all font-mono text-sm">{itemValue || "—"}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SearchResult({ result }: { result: BlockchainSearchResult }) {
  if (result.type === "block") return <BlockResult data={result.data} />;
  if (result.type === "transaction") return <TransactionResult data={result.data} />;
  if (result.type === "access-session") return <SessionResult data={result.data} />;
  return <EvidenceResult data={result.data} />;
}

function BlockResult({ data }: { data: BlockchainBlockResult }) {
  return (
    <ResultSection title={`Block ${data.block_number}`} icon={<Blocks className="h-5 w-5" />}>
      <KeyValueGrid rows={[
        ["Block Hash", data.block_hash],
        ["Timestamp", formatForensicUnixTime(data.timestamp)],
        ["Parent Hash", data.parent_hash],
        ["Transaction Count", String(data.transaction_count)],
      ]} />
      <h3 className="mt-6 text-sm font-semibold">Transactions</h3>
      {data.transactions.length === 0 ? <EmptyRows text="Block นี้ไม่มี Transaction" /> : (
        <div className="mt-2 divide-y divide-border border-y border-border">
          {data.transactions.map((tx) => (
            <div key={tx.tx_hash} className="grid gap-2 py-3 text-xs lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_6rem]">
              <Link href={`/blockchain?type=transaction&value=${encodeURIComponent(tx.tx_hash)}`} className="break-all font-mono text-primary hover:underline">{tx.tx_hash}</Link>
              <span className="break-all font-mono text-muted">To: {tx.to_address || "Contract creation"}</span>
              <span>{tx.is_registry_transaction ? "EvidenceRegistryV3" : `Index ${tx.transaction_index}`}</span>
            </div>
          ))}
        </div>
      )}
    </ResultSection>
  );
}

function TransactionResult({ data }: { data: BlockchainTransactionResult }) {
  return (
    <ResultSection title="Transaction" icon={<Database className="h-5 w-5" />}>
      <KeyValueGrid rows={[
        ["Transaction Hash", data.tx_hash], ["Status", data.status],
        ["Block Number", String(data.block_number)], ["Transaction Index", String(data.transaction_index)],
        ["From", data.from_address], ["To", data.to_address],
        ["Gas Used", String(data.gas_used)], ["Contract", data.is_registry_transaction ? "EvidenceRegistryV3" : data.contract_address],
      ]} />
      <h3 className="mt-6 text-sm font-semibold">Decoded EvidenceRegistryV3 Events</h3>
      {data.registry_events.length === 0 ? <EmptyRows text="ไม่พบ Event ของ EvidenceRegistryV3 ใน Transaction นี้" /> : data.registry_events.map((event) => <RegistryEvent key={`${event.tx_hash}-${event.log_index}`} event={event} />)}
    </ResultSection>
  );
}

function RegistryEvent({ event }: { event: BlockchainRegistryEvent }) {
  return <div className="mt-3 border-l-2 border-primary bg-slate-50 px-4 py-3"><p className="text-sm font-semibold">{event.event_type === "EvidenceRecorded" ? "ลงทะเบียนหลักฐาน" : formatForensicAction(event.action)}</p><KeyValueGrid compact rows={[
    ["Evidence Ref", event.evidence_ref], ["Evidence Hash", event.evidence_hash],
    ["Uploader Ref", event.uploader_ref], ["Officer Ref", event.officer_ref],
    ["Access Session Ref", event.access_session_ref], ["Occurred At", formatForensicUnixTime(event.occurred_at)],
    ["Recorded At", formatForensicUnixTime(event.recorded_at)], ["Log Index", String(event.log_index)],
  ]} /></div>;
}

function EvidenceResult({ data }: { data: BlockchainEvidenceResult }) {
  return (
    <ResultSection title="EvidenceRegistryV3 Evidence" icon={<FileSearch className="h-5 w-5" />}>
      <KeyValueGrid rows={[
        ["เลขหลักฐาน", data.evidence_number], ["Evidence ID", data.evidence_id],
        ["Evidence Ref", data.evidence_ref], ["Evidence Hash", data.registration.evidence_hash],
        ["Uploader Ref", data.registration.uploader_ref], ["Registration Time", formatForensicUnixTime(data.registration.recorded_at)],
        ["Registration Transaction", data.registration.tx_hash], ["Registration Block", numberValue(data.registration.block_number)],
      ]} />
      <p className="mt-4 text-xs text-muted">อ่าน Event ช่วง Block {data.scan_from_block} ถึง {data.scan_to_block}</p>
      <h3 className="mt-6 text-sm font-semibold">Access History ({data.access_history.length})</h3>
      {data.access_history.length === 0 ? <EmptyRows text="ยังไม่มีประวัติการเข้าถึงบน Blockchain" /> : <AccessHistory events={data.access_history} />}
    </ResultSection>
  );
}

function SessionResult({ data }: { data: BlockchainAccessSessionResult }) {
  return (
    <ResultSection title="Access Session" icon={<CheckCircle2 className="h-5 w-5" />}>
      <KeyValueGrid rows={[
        ["Action", formatForensicAction(data.action)], ["Evidence Number", data.evidence_number],
        ["Evidence ID", data.evidence_id], ["Evidence Ref", data.evidence_ref],
        ["Officer Ref", data.officer_ref], ["Access Session Ref", data.access_session_ref],
        ["Occurred At", formatForensicUnixTime(data.occurred_at)], ["Recorded At", formatForensicUnixTime(data.recorded_at)],
        ["Transaction Hash", data.tx_hash], ["Block Number", numberValue(data.block_number)],
        ["Current User Profile", data.actor ? `${data.actor.full_name || data.actor.username || "—"} (${data.actor.badge_number || "ไม่มี Badge"})` : "ไม่สามารถระบุโปรไฟล์ผู้ใช้ปัจจุบันได้"],
        ["AccessLog ปัจจุบัน", data.database_access_log_found ? data.database_access_log_id : "ไม่พบ (ข้อมูลบน Blockchain ยังอยู่)"],
      ]} />
    </ResultSection>
  );
}

function AccessHistory({ events }: { events: BlockchainAccessEvent[] }) {
  return <div className="mt-2 divide-y divide-border border-y border-border">{events.map((event, index) => (
    <div key={`${event.tx_hash}-${event.log_index}`} className="grid gap-2 py-3 text-sm lg:grid-cols-[3rem_9rem_minmax(0,1fr)_8rem]">
      <span className="text-muted">#{index + 1}</span>
      <span className="font-medium">{formatForensicAction(event.action)}</span>
      <div><p>{formatForensicUnixTime(event.occurred_at)}</p><p className="mt-1 break-all font-mono text-xs text-muted">{event.access_session_ref}</p></div>
      <Link href={`/blockchain?type=transaction&value=${encodeURIComponent(event.tx_hash)}`} className="text-primary hover:underline">Block {event.block_number}</Link>
    </div>
  ))}</div>;
}

function ResultSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <section className="border border-border bg-surface p-5"><div className="flex items-center gap-2 text-primary">{icon}<h2 className="font-semibold text-text">{title}</h2></div><div className="mt-4">{children}</div></section>;
}

function KeyValueGrid({ rows, compact = false }: { rows: Array<[string, string | null | undefined]>; compact?: boolean }) {
  return <div className={`grid ${compact ? "mt-2" : "sm:grid-cols-2"}`}>{rows.map(([label, rowValue]) => <div key={label} className="min-w-0 border-b border-border py-2.5 sm:px-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 break-all font-mono text-sm">{rowValue || "—"}</p></div>)}</div>;
}

function StateMessage({ icon, text, danger = false }: { icon: ReactNode; text: string; danger?: boolean }) {
  return <div className={`flex items-center gap-3 border px-4 py-5 text-sm ${danger ? "border-danger/30 bg-danger-light text-danger" : "border-border bg-surface text-muted"}`}>{icon}<span>{text}</span></div>;
}

function EmptyRows({ text }: { text: string }) {
  return <p className="mt-3 border-y border-border py-5 text-center text-sm text-muted">{text}</p>;
}

function numberValue(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

function notFoundMessage(type: BlockchainSearchType): string {
  const labels: Record<BlockchainSearchType, string> = {
    block: "ไม่พบ Block",
    transaction: "ไม่พบ Transaction",
    evidence: "ไม่พบ Evidence บน Blockchain",
    "evidence-ref": "ไม่พบ Evidence บน Blockchain",
    "access-session": "ไม่พบ Access Session บน Blockchain",
  };
  return labels[type];
}

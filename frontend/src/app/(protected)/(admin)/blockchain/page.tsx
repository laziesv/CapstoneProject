"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  Blocks,
  CheckCircle2,
  Copy,
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
  BlockchainExplorerUser,
  BlockchainOverview,
  BlockchainRegistryEvent,
  BlockchainSearchResult,
  BlockchainSearchType,
  BlockchainTransactionResult,
} from "@/interfaces";
import { ApiError, blockchainService } from "@/services";
import { userFacingApiError } from "@/utils/evidenceDownloadError";
import { formatForensicAction, formatForensicUnixTime } from "@/utils/forensics";
import { copyTextWithFeedback } from "@/components/feedback/CopySuccessFeedback";
import {
  blockchainIndexValue,
  compactBlockchainValue,
  isBlockchainSearchType,
} from "@/utils/blockchainExplorer";

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
              <Link href={`/blockchain?type=transaction&value=${encodeURIComponent(tx.tx_hash)}`} className="font-mono text-primary hover:underline">{compactBlockchainValue(tx.tx_hash)}</Link>
              <span className="font-mono text-muted">To: {tx.to_address ? compactBlockchainValue(tx.to_address) : "Contract creation"}</span>
              <span>{tx.is_registry_transaction ? "EvidenceRegistryV3" : `Index ${blockchainIndexValue(tx.transaction_index)}`}</span>
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
      <SemanticSection title="Blockchain">
        <KeyValueGrid rows={[
          ["Block Number", String(data.block_number)],
          ["Transaction Hash", data.tx_hash],
          ["สถานะธุรกรรม", data.status],
        ]} />
      </SemanticSection>
      <TechnicalDetails>
        <KeyValueGrid rows={[
          ["Transaction Index", blockchainIndexValue(data.transaction_index)],
          ["From", data.from_address],
          ["To", data.to_address],
          ["Gas Used", String(data.gas_used)],
          ["Contract Address", data.contract_address],
        ]} />
      </TechnicalDetails>
      <h3 className="mt-6 text-sm font-semibold">ข้อมูลที่บันทึกใน EvidenceRegistryV3</h3>
      {data.registry_events.length === 0 ? <EmptyRows text="ไม่พบ Event ของ EvidenceRegistryV3 ใน Transaction นี้" /> : data.registry_events.map((event) => <RegistryEvent key={`${event.tx_hash}-${event.log_index}`} event={event} />)}
    </ResultSection>
  );
}

function RegistryEvent({ event }: { event: BlockchainRegistryEvent }) {
  const isRegistration = event.event_type === "EvidenceRecorded";
  return (
    <article className="mt-4 border-l-2 border-primary pl-4">
      <p className="text-sm font-semibold">{isRegistration ? "ลงทะเบียนหลักฐาน" : formatForensicAction(event.action)}</p>
      <SemanticSection title="ข้อมูลหลักฐาน">
        <KeyValueGrid rows={[
          ["Evidence Number", event.evidence_number],
          ["Evidence ID", event.evidence_id],
          ["Evidence Ref", event.evidence_ref],
          ...(isRegistration ? [["Evidence Hash", event.evidence_hash] as ValueRow] : []),
        ]} />
      </SemanticSection>
      {isRegistration ? (
        <ProfileSection title="ผู้อัปโหลด" profile={event.uploader} reference={event.uploader_ref} />
      ) : (
        <>
          <ProfileSection title="ผู้ดำเนินการ" profile={event.actor} reference={event.officer_ref} />
          <SemanticSection title="ข้อมูลการเข้าถึง">
            <KeyValueGrid rows={[
              ["Action", formatForensicAction(event.action)],
              ["Access Session Ref", event.access_session_ref],
              ["Occurred At", formatForensicUnixTime(event.occurred_at)],
              ["Recorded At", formatForensicUnixTime(event.recorded_at)],
            ]} />
          </SemanticSection>
          <RelatedEvidence record={event.related_evidence} />
        </>
      )}
      <SemanticSection title="Blockchain">
        <KeyValueGrid rows={[
          ["Block Number", String(event.block_number)],
          ["Transaction Hash", event.tx_hash],
        ]} />
      </SemanticSection>
      <TechnicalDetails>
        <KeyValueGrid rows={[
          [isRegistration ? "Uploader Ref" : "Officer Ref", isRegistration ? event.uploader_ref : event.officer_ref],
          ["Transaction Index", blockchainIndexValue(event.transaction_index)],
          ["Log Index", blockchainIndexValue(event.log_index)],
          ["Writer", event.writer],
        ]} />
      </TechnicalDetails>
    </article>
  );
}

function EvidenceResult({ data }: { data: BlockchainEvidenceResult }) {
  return (
    <ResultSection title="EvidenceRegistryV3 Evidence" icon={<FileSearch className="h-5 w-5" />}>
      <SemanticSection title="ข้อมูลหลักฐาน">
        <KeyValueGrid rows={[
          ["เลขหลักฐาน", data.evidence_number], ["Evidence ID", data.evidence_id],
          ["Evidence Ref", data.evidence_ref], ["Evidence Hash", data.registration.evidence_hash],
        ]} />
      </SemanticSection>
      <ProfileSection title="ผู้อัปโหลด" profile={data.registration.uploader} reference={data.registration.uploader_ref} />
      <SemanticSection title="Blockchain">
        <KeyValueGrid rows={[
          ["เวลาบันทึก", formatForensicUnixTime(data.registration.recorded_at)],
          ["Transaction Hash", data.registration.tx_hash],
          ["Block Number", numberValue(data.registration.block_number)],
        ]} />
      </SemanticSection>
      <TechnicalDetails>
        <KeyValueGrid rows={[
          ["Uploader Ref", data.registration.uploader_ref],
          ["Transaction Index", blockchainIndexValue(data.registration.transaction_index)],
          ["Log Index", blockchainIndexValue(data.registration.log_index)],
          ["Writer", data.registration.writer],
        ]} />
      </TechnicalDetails>
      <p className="mt-4 text-xs text-muted">อ่าน Event ช่วง Block {data.scan_from_block} ถึง {data.scan_to_block}</p>
      <h3 className="mt-6 text-sm font-semibold">Access History ({data.access_history.length})</h3>
      {data.access_history.length === 0 ? <EmptyRows text="ยังไม่มีประวัติการเข้าถึงบน Blockchain" /> : <AccessHistory events={data.access_history} />}
    </ResultSection>
  );
}

function SessionResult({ data }: { data: BlockchainAccessSessionResult }) {
  return (
    <ResultSection title="Access Session" icon={<CheckCircle2 className="h-5 w-5" />}>
      <SemanticSection title="ข้อมูลหลักฐาน">
        <KeyValueGrid rows={[
          ["Evidence Number", data.evidence_number],
          ["Evidence ID", data.evidence_id],
          ["Evidence Ref", data.evidence_ref],
        ]} />
      </SemanticSection>
      <ProfileSection title="ผู้ดำเนินการ" profile={data.actor} reference={data.officer_ref} />
      <SemanticSection title="ข้อมูลการเข้าถึง">
        <KeyValueGrid rows={[
          ["Action", formatForensicAction(data.action)],
          ["Access Session Ref", data.access_session_ref],
          ["Occurred At", formatForensicUnixTime(data.occurred_at)],
          ["Recorded At", formatForensicUnixTime(data.recorded_at)],
          ["AccessLog ปัจจุบัน", data.database_access_log_found ? data.database_access_log_id : "ไม่พบ (ข้อมูลบน Blockchain ยังอยู่)"],
        ]} />
      </SemanticSection>
      <RelatedEvidence record={data.related_evidence} />
      <SemanticSection title="Blockchain">
        <KeyValueGrid rows={[
          ["Block Number", numberValue(data.block_number)],
          ["Transaction Hash", data.tx_hash],
        ]} />
      </SemanticSection>
      <TechnicalDetails>
        <KeyValueGrid rows={[
          ["Officer Ref", data.officer_ref],
          ["Transaction Index", blockchainIndexValue(data.transaction_index)],
          ["Log Index", blockchainIndexValue(data.log_index)],
          ["Writer", data.writer],
        ]} />
      </TechnicalDetails>
    </ResultSection>
  );
}

function AccessHistory({ events }: { events: BlockchainAccessEvent[] }) {
  return <div className="mt-2 divide-y divide-border border-y border-border">{events.map((event, index) => (
    <div key={`${event.tx_hash}-${event.log_index}`} className="grid gap-2 py-3 text-sm lg:grid-cols-[3rem_9rem_minmax(0,1fr)_8rem]">
      <span className="text-muted">#{index + 1}</span>
      <span className="font-medium">{formatForensicAction(event.action)}</span>
      <div><p>{formatForensicUnixTime(event.occurred_at)}</p><p className="mt-1 font-mono text-xs text-muted">{compactBlockchainValue(event.access_session_ref)}</p></div>
      <Link href={`/blockchain?type=transaction&value=${encodeURIComponent(event.tx_hash)}`} className="text-primary hover:underline">Block {event.block_number}</Link>
    </div>
  ))}</div>;
}

function ResultSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <section className="border border-border bg-surface p-5"><div className="flex items-center gap-2 text-primary">{icon}<h2 className="font-semibold text-text">{title}</h2></div><div className="mt-4">{children}</div></section>;
}

type ValueRow = [string, string | null | undefined];

function KeyValueGrid({ rows }: { rows: ValueRow[] }) {
  return <div className="grid sm:grid-cols-2">{rows.map(([label, rowValue]) => <div key={label} className="min-w-0 border-b border-border py-2.5 sm:px-3"><p className="text-xs text-muted">{label}</p><ValueDisplay value={rowValue} /></div>)}</div>;
}

function ValueDisplay({ value }: { value: string | null | undefined }) {
  if (!value) return <p className="mt-1 text-sm text-muted">—</p>;
  if (!value.startsWith("0x") || value.length <= 14) return <p className="mt-1 break-all font-mono text-sm">{value}</p>;
  return (
    <div className="mt-1">
      <div className="flex items-center gap-2">
        <code className="text-sm">{compactBlockchainValue(value)}</code>
        <button type="button" title="คัดลอกค่าเต็ม" aria-label="คัดลอกค่าเต็ม" onClick={() => void copyTextWithFeedback(value)} className="text-muted hover:text-primary">
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
      <details className="mt-1 text-xs text-muted">
        <summary className="cursor-pointer hover:text-primary">ดูค่าเต็ม</summary>
        <p className="mt-1 break-all font-mono">{value}</p>
      </details>
    </div>
  );
}

function SemanticSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mt-4 border-t border-border pt-3"><h3 className="text-sm font-semibold">{title}</h3><div className="mt-2">{children}</div></section>;
}

function ProfileSection({ title, profile, reference }: { title: string; profile: BlockchainExplorerUser | null; reference: string | null }) {
  return (
    <SemanticSection title={title}>
      {profile ? <KeyValueGrid rows={[
        ["Full Name", profile.full_name], ["Rank", profile.rank],
        ["Badge Number", profile.badge_number], ["Username", profile.username],
        ["Email", profile.email],
      ]} /> : <p className="text-sm text-muted">ไม่สามารถระบุโปรไฟล์ผู้ใช้ปัจจุบันได้</p>}
      {!profile && reference && <ValueDisplay value={reference} />}
      <p className="mt-3 text-xs text-muted">ข้อมูลโปรไฟล์แสดงจากข้อมูลผู้ใช้ปัจจุบันในระบบ Blockchain ใช้ User Reference สำหรับอ้างอิงผู้ดำเนินการ</p>
    </SemanticSection>
  );
}

function RelatedEvidence({ record }: { record: BlockchainRegistryEvent["related_evidence"] }) {
  return (
    <SemanticSection title="ข้อมูลหลักฐานที่เกี่ยวข้อง">
      {record ? (
        <>
          <p className="mb-2 text-xs text-muted">ข้อมูลนี้มาจาก EvidenceRecord ของหลักฐานที่เกี่ยวข้อง ไม่ได้บันทึกอยู่ใน Access Transaction โดยตรง</p>
          <KeyValueGrid rows={[["Evidence Hash", record.evidence_hash], ["Uploader Ref", record.uploader_ref]]} />
          <ProfileSection title="ผู้อัปโหลดหลักฐาน" profile={record.uploader} reference={record.uploader_ref} />
        </>
      ) : <p className="text-sm text-muted">ไม่พบข้อมูล EvidenceRecord</p>}
    </SemanticSection>
  );
}

function TechnicalDetails({ children }: { children: ReactNode }) {
  return <details className="mt-4 border-t border-border pt-3"><summary className="cursor-pointer text-sm font-medium text-primary">รายละเอียดทางเทคนิค</summary><div className="mt-2">{children}</div></details>;
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

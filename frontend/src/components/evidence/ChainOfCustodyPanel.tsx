"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Copy,
  Download,
  Eye,
  FilePlus2,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type {
  ChainAccessHistoryItem,
  ChainIntegrityState,
  ChainOfCustodyResponse,
  ChainUserIdentity,
  IntegrityMismatch,
} from "@/interfaces";
import { evidenceService } from "@/services";
import { userFacingApiError } from "@/utils/evidenceDownloadError";
import { copyTextWithFeedback } from "@/components/feedback/CopySuccessFeedback";
import {
  compareBlockchainOrder,
  chainEvidenceIdentityRows,
  forensicMismatchLabel,
  formatForensicAction,
  formatForensicDateTime,
  formatForensicMismatchValue,
  formatForensicUnixTime,
  formatInclusionDelay,
  formatIntegrityState,
  shouldShowDatabaseActor,
} from "@/utils/forensics";

interface ChainOfCustodyPanelProps {
  evidenceId: string;
}

/** จำนวนเหตุการณ์ที่แสดงก่อนกด "แสดงทั้งหมด" */
const TIMELINE_WINDOW = 10;

type TimelineEvent =
  | { kind: "registration"; key: string }
  | { kind: "access"; key: string; entry: ChainAccessHistoryItem };

export function ChainOfCustodyPanel({ evidenceId }: ChainOfCustodyPanelProps) {
  const [data, setData] = useState<ChainOfCustodyResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  // โหลดประวัติทีละหน้าจาก backend — ไม่ดึงทั้งหมดมาแล้วค่อยซ่อน
  const [olderPages, setOlderPages] = useState<ChainAccessHistoryItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setData(await evidenceService.getChainOfCustody(evidenceId, { limit: TIMELINE_WINDOW }));
    } catch (cause) {
      setData(undefined);
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [evidenceId]);

  useEffect(() => {
    let cancelled = false;
    evidenceService
      .getChainOfCustody(evidenceId, { limit: TIMELINE_WINDOW })
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setOlderPages([]);
        setError(undefined);
        setLoading(false);
      })
      .catch((cause) => {
        if (cancelled) return;
        setData(undefined);
        setError(errorMessage(cause));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [evidenceId]);

  if (loading && !data) {
    return (
      <section className="rounded-lg border border-border bg-surface" aria-label="ลำดับการครอบครองหลักฐาน">
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          กำลังตรวจสอบข้อมูลกับ Blockchain
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-lg border border-border bg-surface p-5" aria-label="ลำดับการครอบครองหลักฐาน">
        <div className="flex flex-col items-center gap-3 py-5 text-center">
          <CircleAlert className="h-7 w-7 text-warning" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold">ลำดับการครอบครองหลักฐาน</h2>
            <p className="mt-1 text-sm text-muted">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-hover"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            ลองอีกครั้ง
          </button>
        </div>
      </section>
    );
  }

  // รวมหน้าที่โหลดเพิ่มเข้ากับหน้าแรก แล้วค่อยจัดลำดับตามตำแหน่งบนเชน
  const loaded = [...olderPages, ...data.access_history];
  const timeline = buildTimeline(data, loaded);
  const remaining = Math.max(0, data.access_history_total - loaded.length);
  // ลงทะเบียนหลักฐานเป็นจุดกำเนิดของ chain of custody — ปักหมุดไว้แม้ยังโหลดไม่ครบ
  const pinnedRegistration = remaining > 0 && timeline[0]?.kind === "registration";
  const visibleTimeline = pinnedRegistration ? timeline.slice(1) : timeline;

  const loadOlder = async () => {
    setLoadingMore(true);
    try {
      const page = await evidenceService.getChainOfCustody(evidenceId, {
        limit: TIMELINE_WINDOW,
        offset: loaded.length,
      });
      setOlderPages((current) => [...page.access_history, ...current]);
    } catch {
      // เงียบไว้ — ประวัติที่โหลดมาแล้วยังใช้งานได้ ผู้ใช้กดซ้ำได้
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface" aria-labelledby="chain-of-custody-heading">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="chain-of-custody-heading" className="text-sm font-semibold">ลำดับการครอบครองหลักฐาน</h2>
            <p className="text-xs text-muted">ตรวจสอบการลงทะเบียนและประวัติการเข้าถึงกับ Blockchain</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <VerificationBadge state={data.integrity_state} />
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
            aria-label="ตรวจสอบข้อมูลอีกครั้ง"
            title="ตรวจสอบข้อมูลอีกครั้ง"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        </div>
      </header>

      {!data.verified && (
        <div className="flex items-start gap-2 border-b border-warning/20 bg-warning-light/50 px-5 py-3 text-sm text-warning">
          <CircleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>{formatIntegrityState(data.integrity_state)}</span>
        </div>
      )}

      <div className="grid border-b border-border sm:grid-cols-2 lg:grid-cols-4">
        <VerificationCheck label="ค่าแฮชไฟล์ต้นฉบับ" verified={data.verification.evidence_hash_matches} />
        <VerificationCheck label="รหัสอ้างอิงผู้อัปโหลด" verified={data.verification.uploader_ref_matches} />
        <VerificationCheck label="ธุรกรรมลงทะเบียน" verified={data.verification.registration_transaction_matches} />
        <VerificationCheck
          label={`รายการเข้าถึง ${data.verification.access_records_verified}/${data.verification.access_records_total}`}
          verified={data.verification.access_records_verified === data.verification.access_records_total}
        />
      </div>

      <div className="border-b border-border px-5 py-4">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-muted">ข้อมูลหลักฐาน</p>
            <dl className="mt-2 space-y-1.5 text-sm">
              {chainEvidenceIdentityRows(data.evidence).map((item) => (
                <div key={item.label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                  <dt className="text-muted">{item.label}</dt>
                  <dd className="break-all font-mono text-xs font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-1 text-xs text-muted">อัปโหลดเมื่อ {formatForensicDateTime(data.evidence.uploaded_at)}</p>
            <p className="mt-1 text-xs text-muted">บันทึกลง Blockchain เมื่อ {formatForensicUnixTime(data.evidence.blockchain_recorded_at)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted">ผู้ใช้ที่อ้างอิงจาก Blockchain</p>
            <div className="mt-2">
              <ActorProfile user={data.uploader} referenceVerified={data.verification.uploader_ref_matches} />
            </div>
          </div>
        </div>
        <TechnicalDetails>
          <AuditValue label="รหัสอ้างอิงหลักฐาน" value={data.evidence.evidence_ref} copyable />
          <AuditValue label="Original SHA-256" value={data.evidence.original_sha256} copyable />
          <AuditValue label="Writer Address" value={data.evidence.writer} copyable />
          <AuditValue label="Transaction Hash บน Blockchain" value={data.evidence.registration_tx_hash} copyable />
          <AuditValue label="Block Number บน Blockchain" value={numberValue(data.evidence.registration_block_number)} />
          <AuditValue label="Transaction Hash ในฐานข้อมูล" value={data.registration_transaction?.tx_hash ?? null} copyable />
          <AuditValue label="Block Number ในฐานข้อมูล" value={numberValue(data.registration_transaction?.block_number)} />
        </TechnicalDetails>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-muted" aria-hidden="true" />
            <h3 className="text-sm font-semibold">ลำดับเหตุการณ์</h3>
          </div>
          <span className="text-xs text-muted">เรียงตามลำดับ Blockchain</span>
        </div>
        <p className="border-b border-border px-5 py-2 text-xs text-muted">
          ข้อมูลโปรไฟล์มาจาก PostgreSQL ปัจจุบัน ส่วน Blockchain ยืนยันเฉพาะ User Reference ที่อ้างอิงในการทำรายการ
        </p>

        {timeline.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center text-muted">
            <Clock3 className="h-6 w-6" aria-hidden="true" />
            <p className="text-sm">ยังไม่มีรายการที่บันทึกบน Blockchain</p>
          </div>
        ) : (
          <ol className="px-5 py-2">
            {pinnedRegistration && <RegistrationHistoryRow data={data} />}
            {remaining > 0 && (
              <li className="py-3 pl-12 text-xs text-muted">
                ยังไม่ได้โหลดอีก {remaining.toLocaleString("th-TH")} เหตุการณ์ระหว่างนี้
              </li>
            )}
            {visibleTimeline.map((event) =>
              event.kind === "registration" ? (
                <RegistrationHistoryRow key={event.key} data={data} />
              ) : (
                <AccessHistoryRow key={event.key} entry={event.entry} />
              ),
            )}
          </ol>
        )}
        {remaining > 0 && (
          <div className="border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={() => void loadOlder()}
              disabled={loadingMore}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
            >
              {loadingMore
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
              โหลดเหตุการณ์ก่อนหน้า (เหลืออีก {remaining.toLocaleString("th-TH")})
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/** โครงร่วมของทุกเหตุการณ์ — รางเวลาด้านซ้าย + เนื้อหาเรียงบนลงล่างเหมือนอ่านเรื่องเล่า */
function TimelineRow({
  icon: Icon,
  accent,
  title,
  badge,
  blockNumber,
  actor,
  when,
  children,
}: {
  icon: LucideIcon;
  accent: string;
  title: string;
  badge?: ReactNode;
  blockNumber: number | null | undefined;
  actor: ReactNode;
  when: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="relative flex gap-4 py-4 last:[&>div:first-child>span:last-child]:hidden">
      {/* รางเวลา: จุดของเหตุการณ์นี้ + เส้นต่อลงไปยังเหตุการณ์ถัดไป */}
      <div className="flex flex-col items-center" aria-hidden="true">
        <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${accent}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="mt-1 w-px flex-1 bg-border" />
      </div>

      <div className="min-w-0 flex-1 pb-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="text-sm font-semibold">{title}</p>
          {badge}
          <BlockChip number={blockNumber} />
        </div>
        <div className="mt-2">{actor}</div>
        <p className="mt-2 text-xs text-muted">{when}</p>
        {children}
      </div>
    </li>
  );
}

function RegistrationHistoryRow({ data }: { data: ChainOfCustodyResponse }) {
  return (
    <TimelineRow
      icon={FilePlus2}
      accent="bg-primary/10 text-primary"
      title={formatForensicAction("REGISTER")}
      blockNumber={data.evidence.registration_block_number}
      actor={<ActorProfile user={data.uploader} referenceVerified={data.verification.uploader_ref_matches} />}
      when={<>บันทึกลง Blockchain เมื่อ {formatForensicUnixTime(data.evidence.blockchain_recorded_at)}</>}
    >
      <TechnicalDetails compact>
        <AuditValue label="รหัสอ้างอิงหลักฐาน" value={data.evidence.evidence_ref} copyable />
        <AuditValue label="Transaction Hash" value={data.evidence.registration_tx_hash} copyable />
      </TechnicalDetails>
    </TimelineRow>
  );
}

function AccessHistoryRow({ entry }: { entry: ChainAccessHistoryItem }) {
  const inclusionDelay = formatInclusionDelay(entry.blockchain?.occurred_at, entry.blockchain?.recorded_at);
  const showDatabaseActor = shouldShowDatabaseActor({
    officerRefMatches: entry.verification.officer_ref_matches,
    databaseUserPresent: entry.database_user !== null,
  });
  const actionIcon = entry.action?.toUpperCase() === "DOWNLOAD" ? Download : Eye;
  // แสดงการกระทำบนเชนเฉพาะตอนไม่ตรงกับที่หัวข้อบอก — ปกติซ้ำกันจึงไม่ต้องย้ำ
  const chainActionDiffers =
    entry.blockchain?.action != null
    && entry.blockchain.action.toUpperCase() !== (entry.action ?? "").toUpperCase();

  return (
    <TimelineRow
      icon={actionIcon}
      accent="bg-surface-hover text-muted"
      title={formatForensicAction(entry.action)}
      badge={<VerificationBadge state={entry.integrity_state} compact />}
      blockNumber={entry.blockchain?.block_number ?? entry.transaction?.block_number}
      when={
        <>
          {formatForensicDateTime(entry.accessed_at)}
          {inclusionDelay && <span className="ml-2 text-muted/70">· ขึ้นเชนช้ากว่า {inclusionDelay}</span>}
        </>
      }
      actor={
      <div>
        <ActorProfile user={entry.user} referenceVerified={entry.user !== null} />
        {showDatabaseActor && (
          <div className="mt-4 border-t border-warning/20 pt-3">
            <p className="mb-2 text-xs font-semibold text-warning">ผู้ใช้ที่ AccessLog เชื่อมโยงอยู่ปัจจุบัน</p>
            <ActorProfile user={entry.database_user} referenceVerified={false} />
            <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              User Reference บน Blockchain ไม่ตรงกับผู้ใช้ที่ AccessLog เชื่อมโยงอยู่ในฐานข้อมูลปัจจุบัน
            </p>
          </div>
        )}
        {!entry.verification.access_log_exists && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-warning">
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            พบรายการบน Blockchain แต่ไม่พบข้อมูล AccessLog ที่ตรงกันในฐานข้อมูล
          </p>
        )}
      </div>
      }
    >
      {chainActionDiffers && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          การกระทำบน Blockchain คือ {formatForensicAction(entry.blockchain?.action)}
        </p>
      )}
      {entry.database && !entry.verification.action_matches && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          การกระทำปัจจุบันในฐานข้อมูลคือ {formatForensicAction(entry.database.action)}
        </p>
      )}
      <div className="mt-1">
        {/* เวลาสามชั้นเป็นข้อมูลนิติวิทยาศาสตร์ ไม่ใช่สิ่งที่ต้องกวาดตาอ่าน — เก็บไว้ในส่วนกาง */}
        <TechnicalDetails compact>
          <AuditValue label="เวลาที่เกิดการเข้าถึงในฐานข้อมูล" value={formatForensicDateTime(entry.accessed_at)} />
          <AuditValue label="เวลาการเข้าถึงที่อ้างอิงบน Blockchain" value={formatForensicUnixTime(entry.blockchain?.occurred_at)} />
          <AuditValue label="เวลาที่ธุรกรรมถูกบันทึกลง Blockchain" value={formatForensicUnixTime(entry.blockchain?.recorded_at)} />
          <AuditValue label="รหัสอ้างอิงรอบการเข้าถึง" value={entry.access_session_ref} copyable />
          <AuditValue label="Blockchain Evidence Reference" value={entry.blockchain?.evidence_ref ?? null} copyable />
          <AuditValue label="Blockchain Officer Reference" value={entry.blockchain?.officer_ref ?? null} copyable />
          <AuditValue label="Officer Reference จากผู้ใช้ใน AccessLog" value={mismatchValue(entry.mismatches, "officer_ref", "database_value")} copyable />
          <AuditValue label="Evidence ID ที่ AccessLog เชื่อมโยง" value={entry.database?.evidence_id ?? null} copyable />
          <AuditValue label="Transaction Hash บน Blockchain" value={entry.blockchain?.transaction_hash ?? null} copyable />
          <AuditValue label="Block Number บน Blockchain" value={numberValue(entry.blockchain?.block_number)} />
          <AuditValue label="Transaction Hash ในฐานข้อมูล" value={entry.transaction?.tx_hash ?? null} copyable />
          <AuditValue label="Block Number ในฐานข้อมูล" value={numberValue(entry.transaction?.block_number)} />
        </TechnicalDetails>
      </div>

      {entry.mismatches.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-lg border border-warning/30 bg-warning-light/30">
          <div className="flex items-center gap-2 border-b border-warning/20 px-3 py-2 text-xs font-semibold text-warning">
            <CircleAlert className="h-4 w-4" aria-hidden="true" />
            พบข้อมูลไม่ตรงกับ Blockchain
          </div>
          <MismatchTable mismatches={entry.mismatches} />
          <div className="space-y-1 border-t border-warning/20 px-3 py-2 text-xs text-warning">
            {entry.mismatches.map((mismatch) => (
              mismatch.explanation ? <p key={`${mismatch.field}-explanation`}>{mismatch.explanation}</p> : null
            ))}
          </div>
        </div>
      )}
    </TimelineRow>
  );
}

/** เลขบล็อกของเหตุการณ์ — ทำเป็นชิปให้เห็นว่าเป็นหมุดอ้างอิงบนเชน ไม่ใช่ข้อความประกอบ */
function BlockChip({ number }: { number: number | null | undefined }) {
  return (
    <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-hover px-2.5 py-1 text-xs text-muted">
      บล็อก
      <span className="font-mono font-medium text-foreground/80">{number ?? "—"}</span>
    </span>
  );
}

function ActorProfile({ user }: { user: ChainUserIdentity | null; referenceVerified: boolean }) {
  if (!user) {
    return <p className="text-sm text-muted">ไม่สามารถระบุโปรไฟล์ผู้ใช้ปัจจุบันได้</p>;
  }
  return (
    <div className="min-w-0">
      {/* ไม่ใส่ avatar — ในลำดับเหตุการณ์จะไปซ้อนความหมายกับจุดบนรางเวลา */}
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium">{user.full_name || user.display_name}</span>
        <span className="text-xs text-muted">{user.rank || user.role}</span>
      </p>
      {/* ย่อข้อมูลระบุตัวตนเป็นบรรทัดเดียว — ลำดับเหตุการณ์ซ้ำผู้ใช้คนเดิมได้หลายแถว */}
      <p className="mt-1 truncate text-xs text-muted" title={`${user.badge_number || "—"} · ${user.username} · ${user.email}`}>
        <span className="font-mono">{user.badge_number || "—"}</span>
        <span className="mx-1.5 text-border">·</span>
        {user.username}
        <span className="mx-1.5 text-border">·</span>
        {user.email}
      </p>
    </div>
  );
}

function MismatchTable({ mismatches }: { mismatches: IntegrityMismatch[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[38rem] text-left text-xs">
        <thead className="text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">รายการ</th>
            <th className="px-3 py-2 font-medium">ข้อมูลปัจจุบันในระบบ</th>
            <th className="px-3 py-2 font-medium">ข้อมูลอ้างอิงบน Blockchain</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-warning/15">
          {mismatches.map((mismatch) => (
            <tr key={mismatch.field}>
              <td className="px-3 py-2 font-medium">{forensicMismatchLabel(mismatch.field)}</td>
              <td className="break-all px-3 py-2">{formatForensicMismatchValue(mismatch.database_value, mismatch.field)}</td>
              <td className="break-all px-3 py-2">{formatForensicMismatchValue(mismatch.blockchain_value, mismatch.field)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VerificationBadge({ state, compact = false }: { state: ChainIntegrityState; compact?: boolean }) {
  const verified = state === "VERIFIED";
  const Icon = verified ? CheckCircle2 : CircleAlert;
  return (
    <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border font-medium ${compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"} ${verified ? "border-success/20 bg-success-light text-success" : "border-warning/20 bg-warning-light text-warning"}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {formatIntegrityState(state)}
    </span>
  );
}

function VerificationCheck({ label, verified }: { label: string; verified: boolean }) {
  const Icon = verified ? CheckCircle2 : CircleAlert;
  return (
    <div className="flex items-center gap-2 border-border px-5 py-3 text-xs sm:border-r last:border-r-0">
      <Icon className={`h-4 w-4 flex-shrink-0 ${verified ? "text-success" : "text-warning"}`} aria-hidden="true" />
      <span className="text-muted">{label}</span>
      <span className="sr-only">{verified ? "ข้อมูลตรงกับ Blockchain" : "พบข้อมูลไม่ตรงกับ Blockchain"}</span>
    </div>
  );
}

function AuditValue({ label, value, copyable = false }: { label: string; value: string | null; copyable?: boolean }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 text-xs">
      <span className="text-muted">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5 text-right">
        <span className="break-all" title={value ?? undefined}>{value || "—"}</span>
        {copyable && value && <CopyButton value={value} label={label} />}
      </div>
    </div>
  );
}

function TechnicalDetails({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <details className={compact ? "mt-3 border-t border-border pt-2" : "mt-4 border-t border-border pt-3"}>
      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted">
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        รายละเอียดทางเทคนิค
      </summary>
      <div className="mt-3 space-y-2">{children}</div>
    </details>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      setCopied(await copyTextWithFeedback(value));
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
      aria-label={`คัดลอก ${label}`}
      title={copied ? "คัดลอกแล้ว" : `คัดลอก ${label}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

function buildTimeline(data: ChainOfCustodyResponse, accessHistory: ChainAccessHistoryItem[]): TimelineEvent[] {
  const events: TimelineEvent[] = [
    { kind: "registration", key: `registration-${data.evidence.evidence_id}` },
    ...accessHistory.map((entry) => ({ kind: "access" as const, key: `access-${entry.access_session_ref}`, entry })),
  ];
  return events.sort((left, right) => compareBlockchainOrder(
    timelineOrder(left, data),
    timelineOrder(right, data),
  ));
}

function timelineOrder(event: TimelineEvent, data: ChainOfCustodyResponse) {
  const blockNumber = event.kind === "registration"
    ? data.evidence.registration_block_number
    : event.entry.blockchain?.block_number ?? event.entry.transaction?.block_number;
  const transactionIndex = event.kind === "registration"
    ? data.evidence.registration_transaction_index
    : event.entry.blockchain?.transaction_index;
  const logIndex = event.kind === "registration"
    ? data.evidence.registration_log_index
    : event.entry.blockchain?.log_index;
  const recordedAt = event.kind === "registration" ? data.evidence.blockchain_recorded_at : event.entry.blockchain?.recorded_at;
  return { blockNumber, transactionIndex, logIndex, recordedAt, stableKey: event.key };
}

function mismatchValue(
  mismatches: IntegrityMismatch[],
  field: string,
  side: "database_value" | "blockchain_value",
): string | null {
  const value = mismatches.find((mismatch) => mismatch.field === field)?.[side];
  return typeof value === "string" ? value : null;
}

function numberValue(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

function errorMessage(cause: unknown): string {
  const feedback = userFacingApiError(cause);
  return `${feedback.title} ${feedback.message}`;
}

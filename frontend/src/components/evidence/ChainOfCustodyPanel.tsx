"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Copy,
  Eye,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import type {
  ChainAccessHistoryItem,
  ChainOfCustodyResponse,
} from "@/interfaces";
import { ApiError, evidenceService } from "@/services";


interface ChainOfCustodyPanelProps {
  evidenceId: string;
}


export function ChainOfCustodyPanel({ evidenceId }: ChainOfCustodyPanelProps) {
  const [data, setData] = useState<ChainOfCustodyResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setData(await evidenceService.getChainOfCustody(evidenceId));
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
      .getChainOfCustody(evidenceId)
      .then((response) => {
        if (cancelled) return;
        setData(response);
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
      <section className="rounded-xl border border-border bg-surface shadow-sm" aria-label="Chain of Custody">
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Loading Chain of Custody
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-xl border border-border bg-surface p-5 shadow-sm" aria-label="Chain of Custody">
        <div className="flex flex-col items-center gap-3 py-5 text-center">
          <CircleAlert className="h-7 w-7 text-warning" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold">Chain of Custody</h2>
            <p className="mt-1 text-sm text-muted">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-hover"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm" aria-labelledby="chain-of-custody-heading">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="chain-of-custody-heading" className="text-sm font-semibold">Chain of Custody</h2>
            <p className="text-xs text-muted">Blockchain registration and auditable access history</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <VerificationBadge verified={data.verified} state={data.integrity_state} />
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
            aria-label="Refresh Chain of Custody"
            title="Refresh Chain of Custody"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        </div>
      </header>

      {!data.verified && (
        <div className="flex items-start gap-2 border-b border-warning/20 bg-warning-light/50 px-5 py-3 text-sm text-warning">
          <CircleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>
            {data.integrity_state === "LEGACY_PARTIAL_VERIFICATION"
              ? "Legacy V2 records support partial verification only."
              : "Blockchain verification mismatch. Review the checks and access records below."}
          </span>
        </div>
      )}

      <div className="grid border-b border-border sm:grid-cols-2 lg:grid-cols-4">
        <VerificationCheck label="Original hash" verified={data.verification.evidence_hash_matches} />
        <VerificationCheck label="Uploader reference" verified={data.verification.uploader_ref_matches} />
        <VerificationCheck label="Register transaction" verified={data.verification.registration_transaction_matches} />
        <VerificationCheck
          label={`Access sessions ${data.verification.access_records_verified}/${data.verification.access_records_total}`}
          verified={data.verification.access_records_verified === data.verification.access_records_total}
        />
      </div>

      <div className="grid border-b border-border md:grid-cols-2">
        <div className="space-y-3 px-5 py-4 md:border-r md:border-border">
          <p className="text-xs font-semibold uppercase text-muted">Evidence registration</p>
          <AuditValue label="Evidence reference" value={data.evidence.evidence_ref} copyable />
          <AuditValue label="Original SHA-256" value={data.evidence.original_sha256} copyable />
          <AuditValue label="Blockchain recorded" value={formatChainTime(data.evidence.blockchain_recorded_at)} />
          <AuditValue label="Application uploaded" value={formatDate(data.evidence.uploaded_at)} />
          <AuditValue label="Writer" value={data.evidence.writer} copyable />
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted">Uploader</p>
            {data.uploader ? (
              <div className="mt-2 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-hover text-muted">
                  <UserRound className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{data.uploader.display_name}</p>
                  <p className="text-xs text-muted" title={data.uploader.user_id}>
                    {data.uploader.role} · {shorten(data.uploader.user_id)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">Uploader identity unavailable</p>
            )}
          </div>
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs font-semibold uppercase text-muted">Register transaction</p>
            {data.registration_transaction ? (
              <div className="space-y-2">
                <AuditValue label="Transaction" value={data.registration_transaction.tx_hash} copyable />
                <AuditValue label="Block" value={String(data.registration_transaction.block_number)} />
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted">Status</span>
                  <span>{data.registration_transaction.status}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">Registration transaction metadata unavailable</p>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Access History</h3>
          </div>
          <span className="text-xs text-muted">
            {data.verification.access_records_verified}/{data.verification.access_records_total} verified
          </span>
        </div>

        {data.access_history.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center text-muted">
            <Clock3 className="h-6 w-6" aria-hidden="true" />
            <p className="text-sm">No blockchain-recorded access yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.access_history.map((entry) => (
              <AccessHistoryRow key={entry.access_log_id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}


function AccessHistoryRow({ entry }: { entry: ChainAccessHistoryItem }) {
  return (
    <article className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{entry.user?.display_name ?? "Unknown user"}</p>
          <VerificationBadge verified={entry.verified} state={entry.integrity_state} compact />
        </div>
        <p className="mt-1 text-xs text-muted">
          {entry.user?.role ?? "Role unavailable"} · <span className="font-semibold">{entry.action}</span>
        </p>
        <p className="mt-2 text-xs text-muted">Access Time {formatDate(entry.accessed_at)}</p>
      </div>

      <div className="min-w-0 space-y-2">
        <AuditValue label="Access session" value={entry.access_session_ref} copyable />
        <AuditValue label="Blockchain Occurred Time" value={formatChainTime(entry.blockchain?.occurred_at ?? null)} />
        <AuditValue label="Blockchain Recorded Time" value={formatChainTime(entry.blockchain?.recorded_at ?? null)} />
        <AuditValue label="Transaction" value={entry.transaction?.tx_hash ?? null} copyable />
      </div>

      <div className="min-w-24 text-left text-xs lg:text-right">
        <p className="text-muted">Block</p>
        <p className="mt-1 font-mono font-medium">{entry.transaction?.block_number ?? "—"}</p>
      </div>
    </article>
  );
}


function VerificationBadge({
  verified,
  state,
  compact = false,
}: {
  verified: boolean;
  state?: ChainOfCustodyResponse["integrity_state"];
  compact?: boolean;
}) {
  const Icon = verified ? CheckCircle2 : CircleAlert;
  const label = verified
    ? "Blockchain Verified"
    : state === "LEGACY_PARTIAL_VERIFICATION"
      ? "Legacy Partial Verification"
      : "Verification Failed";
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border font-medium ${
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      } ${
        verified
          ? "border-success/20 bg-success-light text-success"
          : "border-warning/20 bg-warning-light text-warning"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}


function VerificationCheck({ label, verified }: { label: string; verified: boolean }) {
  const Icon = verified ? CheckCircle2 : CircleAlert;
  return (
    <div className="flex items-center gap-2 border-border px-5 py-3 text-xs sm:border-r last:border-r-0">
      <Icon className={`h-4 w-4 flex-shrink-0 ${verified ? "text-success" : "text-warning"}`} aria-hidden="true" />
      <span className="text-muted">{label}</span>
      <span className="sr-only">{verified ? "Verified" : "Verification failed"}</span>
    </div>
  );
}


function AuditValue({ label, value, copyable = false }: { label: string; value: string | null; copyable?: boolean }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
      <span className="flex-shrink-0 text-muted">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-mono" title={value ?? undefined}>{value ? shorten(value) : "—"}</span>
        {copyable && value && <CopyButton value={value} label={label} />}
      </div>
    </div>
  );
}


function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
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
      aria-label={`Copy ${label}`}
      title={copied ? "Copied" : `Copy ${label}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}


function shorten(value: string): string {
  return value.length > 22 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}


function formatChainTime(value: number | null): string | null {
  return value === null ? null : new Date(value * 1000).toLocaleString("th-TH");
}


function formatDate(value: string | null): string | null {
  return value ? new Date(value).toLocaleString("th-TH") : null;
}


function errorMessage(cause: unknown): string {
  if (cause instanceof ApiError && cause.status === 503) {
    return "Blockchain verification is temporarily unavailable.";
  }
  if (cause instanceof ApiError && cause.status === 404) {
    return "Chain of Custody is unavailable for this evidence.";
  }
  return "Unable to load Chain of Custody.";
}

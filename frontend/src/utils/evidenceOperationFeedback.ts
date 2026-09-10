import type {
  EvidenceDownloadMetadata,
  EvidenceUploadApiResponse,
  EvidenceViewSessionResponse,
  UploadedEvidenceRef,
} from "../interfaces/evidence";

interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const VIEW_SUCCESS_KEY = "deva_evidence_view_success";

export const VIEW_SUCCESS_FEEDBACK = {
  title: "บันทึกการเข้าถึงเรียบร้อยแล้ว",
  message: "การดูหลักฐานถูกบันทึกในฐานข้อมูลและ Blockchain แล้ว",
} as const;

export const UPLOAD_RESULT_PRESENTATION = {
  stepLabel: "Registration Result",
  heading: "Registration Result",
  readBackVerified: false,
  description: "ข้อมูลนี้เป็นผลจากคำขออัปโหลดที่บันทึกฐานข้อมูลและ Blockchain สำเร็จ ไม่ใช่การตรวจสอบย้อนกลับด้วยคำขอใหม่",
} as const;

export function uploadResultFromResponse(
  dto: EvidenceUploadApiResponse,
  fallbackFilename: string,
): UploadedEvidenceRef {
  // การเชื่อมต่อ Blockchain: ทุกค่าบนหน้าผลลัพธ์ต้องมาจาก response ของ write รอบนี้
  return {
    original_filename: dto.original_filename ?? fallbackFilename,
    evidence_id: dto.evidence_id,
    evidence_number: dto.evidence_number,
    file_hash_sha256: dto.file_hash ?? "",
    evidence_ref: dto.evidence_ref,
    tx_hash: dto.tx_hash,
    block_number: dto.block_number,
    contract_address: dto.contract_address,
  };
}

export interface DownloadSuccessSummary {
  title: string;
  message: string;
  action: string | null;
  blockNumber: number | null;
  transactionHash: string | null;
  integrityMessage: string;
  integrityVerified: boolean;
}

export function rememberViewSuccess(
  session: EvidenceViewSessionResponse,
  storage: SessionStorageLike | null = browserSessionStorage(),
): void {
  if (!storage) return;
  storage.setItem(VIEW_SUCCESS_KEY, JSON.stringify(session));
}

export async function createViewSessionAndRemember(
  evidenceId: string,
  createSession: (id: string) => Promise<EvidenceViewSessionResponse>,
  storage: SessionStorageLike | null = browserSessionStorage(),
): Promise<EvidenceViewSessionResponse> {
  const session = await createSession(evidenceId);
  if (session.status === "CONFIRMED") rememberViewSuccess(session, storage);
  return session;
}

export async function waitForConfirmedViewSession(
  evidenceId: string,
  requestId: string,
  createSession: (
    id: string,
    requestId: string,
  ) => Promise<EvidenceViewSessionResponse>,
  wait: (milliseconds: number) => Promise<void>,
  onSession?: (session: EvidenceViewSessionResponse) => void,
  onLongWait?: () => void,
  longWaitAfterMilliseconds = 30_000,
): Promise<EvidenceViewSessionResponse> {
  let currentRequestId = requestId;
  let waitedMilliseconds = 0;
  let longWaitReported = false;
  while (true) {
    const session = await createSession(evidenceId, currentRequestId);
    onSession?.(session);
    currentRequestId = session.access_log_id;
    if (session.status === "CONFIRMED") return session;
    const retrySeconds = session.retry_after_seconds ?? 2;
    const waitMilliseconds = Math.max(retrySeconds, 1) * 1000;
    await wait(waitMilliseconds);
    waitedMilliseconds += waitMilliseconds;
    if (!longWaitReported && waitedMilliseconds >= longWaitAfterMilliseconds) {
      longWaitReported = true;
      onLongWait?.();
    }
  }
}

export function consumeViewSuccess(
  evidenceId: string,
  storage: SessionStorageLike | null = browserSessionStorage(),
): EvidenceViewSessionResponse | null {
  if (!storage) return null;
  const stored = storage.getItem(VIEW_SUCCESS_KEY);
  if (!stored) return null;
  storage.removeItem(VIEW_SUCCESS_KEY);

  try {
    const session = JSON.parse(stored) as Partial<EvidenceViewSessionResponse>;
    if (session.evidence_id !== evidenceId || session.action !== "VIEW") {
      return null;
    }
    return session as EvidenceViewSessionResponse;
  } catch {
    return null;
  }
}

export async function requestEvidenceDownloadOnce<T>(
  evidenceId: string,
  requester: (path: string, options: RequestInit) => Promise<T>,
): Promise<T> {
  return requester(
    `/api/evidences/${encodeURIComponent(evidenceId)}/download`,
    { method: "POST" },
  );
}

export function downloadSuccessSummary(
  metadata: EvidenceDownloadMetadata,
): DownloadSuccessSummary {
  return {
    title: "ดาวน์โหลดหลักฐานสำเร็จ",
    message: "Personalized Watermark ถูกสร้างเรียบร้อยแล้ว",
    action: metadata.action,
    blockNumber: metadata.blockNumber,
    transactionHash: metadata.transactionHash,
    integrityMessage: metadata.integrityStatus === "VERIFIED"
      ? "ตรวจสอบค่าแฮชไฟล์ต้นฉบับกับ Blockchain แล้ว"
      : "ไม่สามารถยืนยันสถานะความถูกต้องของไฟล์ต้นฉบับได้",
    integrityVerified: metadata.integrityStatus === "VERIFIED",
  };
}

function browserSessionStorage(): SessionStorageLike | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

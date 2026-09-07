const FORENSIC_TIME_ZONE = "Asia/Bangkok";

const forensicDateTimeFormatter = new Intl.DateTimeFormat(
  "th-TH-u-ca-gregory",
  {
    timeZone: FORENSIC_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  },
);

export function formatForensicDateTime(
  value: string | Date | null | undefined,
): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : forensicDateTimeFormatter.format(date);
}

export function formatForensicUnixTime(
  value: number | null | undefined,
): string {
  return value === null || value === undefined
    ? "—"
    : formatForensicDateTime(new Date(value * 1000));
}

export function formatForensicAction(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    REGISTER: "ลงทะเบียนหลักฐาน",
    VIEW: "ดูหลักฐาน",
    DOWNLOAD: "ดาวน์โหลดหลักฐาน",
  };
  return value ? labels[value.toUpperCase()] ?? value : "—";
}

export function formatIntegrityState(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    VERIFIED: "ข้อมูลตรงกับ Blockchain",
    INTEGRITY_MISMATCH: "พบข้อมูลไม่ตรงกับ Blockchain",
    LEGACY_PARTIAL_VERIFICATION: "ตรวจสอบได้บางส่วน (ข้อมูล Blockchain รุ่นเดิม)",
    MISSING_ON_CHAIN: "ไม่พบรายการบน Blockchain",
    BLOCKCHAIN_UNAVAILABLE: "ไม่สามารถตรวจสอบ Blockchain ได้ในขณะนี้",
    ORPHANED_ON_CHAIN: "พบรายการบน Blockchain แต่ไม่พบข้อมูลปัจจุบันในระบบ",
    ORIGINAL_FILE_MISMATCH: "ไฟล์ต้นฉบับปัจจุบันไม่ตรงกับ Blockchain",
    DATABASE_HASH_MISMATCH: "ค่าแฮชในฐานข้อมูลไม่ตรงกับ Blockchain",
    ORIGINAL_AND_DATABASE_HASH_MISMATCH: "ไฟล์ต้นฉบับและค่าแฮชในฐานข้อมูลไม่ตรงกับ Blockchain",
  };
  return value ? labels[value] ?? value : "—";
}

export function forensicMismatchLabel(field: string): string {
  const labels: Record<string, string> = {
    action: "การกระทำ",
    accessed_at: "เวลาที่เกิดการเข้าถึง",
    occurred_at: "เวลาการเข้าถึงที่อ้างอิงบน Blockchain",
    recorded_at: "เวลาที่ธุรกรรมถูกบันทึกลง Blockchain",
    officer_ref: "รหัสอ้างอิงผู้ใช้",
    evidence_ref: "รหัสอ้างอิงหลักฐาน",
    access_session_ref: "รหัสอ้างอิงรอบการเข้าถึง",
    transaction: "ธุรกรรม Blockchain",
    transaction_link: "ธุรกรรม Blockchain",
    transaction_hash: "Transaction Hash",
    block_number: "Block Number",
    access_log: "ข้อมูล AccessLog",
    original_file_bytes_hash: "ค่าแฮชของไฟล์ต้นฉบับปัจจุบัน",
    database_original_hash: "ค่าแฮชไฟล์ต้นฉบับที่บันทึกในระบบ",
    blockchain_evidence_hash: "ค่าแฮชไฟล์ต้นฉบับอ้างอิงบน Blockchain",
    watermark_dynamic_hash: "ค่าแฮชไฟล์ต้นฉบับที่อ่านจาก Watermark",
  };
  return labels[field] ?? field;
}

export function formatForensicMismatchValue(
  value: unknown,
  field: string,
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (
    ["accessed_at", "occurred_at", "recorded_at"].includes(field)
    && typeof value === "number"
  ) {
    return formatForensicUnixTime(value);
  }
  if (
    ["accessed_at", "occurred_at", "recorded_at"].includes(field)
    && typeof value === "string"
  ) {
    return formatForensicDateTime(value);
  }
  if (field === "action" && typeof value === "string") {
    return formatForensicAction(value);
  }
  return String(value);
}

export function formatInclusionDelay(
  occurredAt: number | null | undefined,
  recordedAt: number | null | undefined,
): string | null {
  if (occurredAt === null || occurredAt === undefined) return null;
  if (recordedAt === null || recordedAt === undefined) return null;
  const delay = recordedAt - occurredAt;
  return delay >= 0 ? `${delay} วินาที` : null;
}

export interface BlockchainOrderValue {
  blockNumber: number | null | undefined;
  transactionIndex?: number | null;
  logIndex?: number | null;
  recordedAt: number | null | undefined;
  stableKey: string;
}

export function shouldShowMatchedDownloadSession(result: {
  dynamicMode: string | null;
  blockchainSessionVerified: boolean;
}): boolean {
  // การตรวจสอบเชิงนิติพิสูจน์: session บน Blockchain เป็นอิสระจาก
  // ความถูกต้องของไฟล์ต้นฉบับหรือค่า hash ที่แก้ไขได้ในฐานข้อมูล
  return result.dynamicMode === "personalized"
    && result.blockchainSessionVerified;
}

export function shouldShowDatabaseActor(result: {
  officerRefMatches: boolean;
  databaseUserPresent: boolean;
}): boolean {
  return !result.officerRefMatches && result.databaseUserPresent;
}

export function compareBlockchainOrder(
  left: BlockchainOrderValue,
  right: BlockchainOrderValue,
): number {
  const leftBlock = left.blockNumber ?? Number.MAX_SAFE_INTEGER;
  const rightBlock = right.blockNumber ?? Number.MAX_SAFE_INTEGER;
  const leftTransaction = left.transactionIndex ?? Number.MAX_SAFE_INTEGER;
  const rightTransaction = right.transactionIndex ?? Number.MAX_SAFE_INTEGER;
  const leftLog = left.logIndex ?? Number.MAX_SAFE_INTEGER;
  const rightLog = right.logIndex ?? Number.MAX_SAFE_INTEGER;
  const leftRecordedAt = left.recordedAt ?? Number.MAX_SAFE_INTEGER;
  const rightRecordedAt = right.recordedAt ?? Number.MAX_SAFE_INTEGER;
  return leftBlock - rightBlock
    || leftTransaction - rightTransaction
    || leftLog - rightLog
    || leftRecordedAt - rightRecordedAt
    || left.stableKey.localeCompare(right.stableKey);
}

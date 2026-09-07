export type EvidenceIntegrityMismatchType =
  | "DATABASE_HASH_MISMATCH"
  | "ORIGINAL_FILE_MISMATCH"
  | "ORIGINAL_AND_DATABASE_HASH_MISMATCH"
  | "MISSING_ON_CHAIN";

export interface DownloadErrorDialogContent {
  title: string;
  message: string;
  kind: "integrity" | "blockchain" | "general";
  hashComparison?: EvidenceHashComparison;
}

export interface EvidenceHashComparison {
  currentOriginalHash: string | null;
  databaseHash: string | null;
  blockchainEvidenceHash: string | null;
  currentMatchesBlockchain: boolean | null;
  databaseMatchesBlockchain: boolean | null;
}

interface DownloadErrorLike {
  status?: unknown;
  code?: unknown;
  message?: unknown;
  details?: Record<string, unknown> | null;
}

export interface ApiErrorFeedback {
  title: string;
  message: string;
  kind: "network" | "authentication" | "authorization" | "not-found" | "blockchain" | "server" | "general";
}

/** แปลงข้อผิดพลาดจาก API เป็นข้อความปลอดภัยและสม่ำเสมอสำหรับผู้ใช้ */
export function userFacingApiError(error: DownloadErrorLike | unknown): ApiErrorFeedback {
  const candidate = error !== null && typeof error === "object"
    ? error as DownloadErrorLike
    : {};
  const status = typeof candidate.status === "number" ? candidate.status : null;
  const code = typeof candidate.code === "string" ? candidate.code : null;

  if (status === 0 || code === "NETWORK_ERROR" || error instanceof TypeError) {
    return {
      title: "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้",
      message: "กรุณาตรวจสอบการเชื่อมต่อหรือลองใหม่ภายหลัง",
      kind: "network",
    };
  }
  if (status === 401) {
    return {
      title: "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ",
      message: "กรุณาเข้าสู่ระบบอีกครั้ง",
      kind: "authentication",
    };
  }
  if (status === 403) {
    return {
      title: "คุณไม่มีสิทธิ์ดำเนินการนี้",
      message: "กรุณาติดต่อผู้ดูแลระบบหากต้องการสิทธิ์เพิ่มเติม",
      kind: "authorization",
    };
  }
  if (status === 404) {
    return {
      title: "ไม่พบข้อมูลที่ร้องขอ",
      message: "ข้อมูลอาจถูกย้าย ลบ หรืออยู่นอกสิทธิ์การเข้าถึงของคุณ",
      kind: "not-found",
    };
  }
  if (status === 503) {
    return {
      title: "ไม่สามารถตรวจสอบ Blockchain ได้ในขณะนี้",
      message: "ระบบไม่สามารถยืนยันข้อมูลกับ Blockchain ได้ กรุณาลองใหม่ภายหลัง",
      kind: "blockchain",
    };
  }
  if (status !== null && status >= 500) {
    return {
      title: "ระบบเกิดข้อผิดพลาด",
      message: "กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบหากปัญหายังคงเกิดขึ้น",
      kind: "server",
    };
  }
  return {
    title: "ไม่สามารถดำเนินการได้",
    message: typeof candidate.message === "string"
      ? candidate.message
      : "กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง",
    kind: "general",
  };
}

const INTEGRITY_MESSAGES: Record<
  EvidenceIntegrityMismatchType,
  DownloadErrorDialogContent
> = {
  DATABASE_HASH_MISMATCH: {
    title: "พบความผิดปกติของข้อมูลหลักฐาน",
    message: "ค่าแฮชไฟล์ต้นฉบับที่บันทึกในฐานข้อมูลไม่ตรงกับข้อมูลอ้างอิงบน Blockchain ระบบระงับการดาวน์โหลดเพื่อป้องกันการสร้างสำเนาในขณะที่ข้อมูลหลักฐานอยู่ในสถานะไม่สอดคล้องกัน",
    kind: "integrity",
  },
  ORIGINAL_FILE_MISMATCH: {
    title: "ไฟล์หลักฐานไม่ผ่านการตรวจสอบความถูกต้อง",
    message: "ไฟล์ต้นฉบับปัจจุบันไม่ตรงกับค่าแฮชที่ลงทะเบียนไว้บน Blockchain ระบบจึงระงับการดาวน์โหลด",
    kind: "integrity",
  },
  ORIGINAL_AND_DATABASE_HASH_MISMATCH: {
    title: "พบความผิดปกติของไฟล์และข้อมูลหลักฐาน",
    message: "ไฟล์ต้นฉบับปัจจุบันและค่าแฮชที่บันทึกในฐานข้อมูลไม่ตรงกับข้อมูลอ้างอิงบน Blockchain ระบบจึงระงับการดาวน์โหลด",
    kind: "integrity",
  },
  MISSING_ON_CHAIN: {
    title: "ไม่สามารถยืนยันข้อมูลหลักฐานบน Blockchain",
    message: "ไม่พบค่าแฮชอ้างอิงของหลักฐานบน Blockchain ระบบจึงระงับการดาวน์โหลด",
    kind: "integrity",
  },
};

export function downloadErrorDialog(
  error: DownloadErrorLike,
): DownloadErrorDialogContent {
  if (
    error.status === 409
    && error.code === "EVIDENCE_INTEGRITY_MISMATCH"
  ) {
    const mismatchType = error.details?.mismatch_type;
    if (
      typeof mismatchType === "string"
      && mismatchType in INTEGRITY_MESSAGES
    ) {
      return {
        ...INTEGRITY_MESSAGES[
          mismatchType as EvidenceIntegrityMismatchType
        ],
        hashComparison: integrityHashComparison(error.details),
      };
    }
    return {
      title: "พบความผิดปกติของข้อมูลหลักฐาน",
      message: "ระบบไม่สามารถยืนยันความถูกต้องของข้อมูลหลักฐานได้ จึงระงับการดาวน์โหลด",
      kind: "integrity",
    };
  }

  const feedback = userFacingApiError(error);
  return {
    title: feedback.title,
    message: feedback.message,
    kind: feedback.kind === "blockchain" ? "blockchain" : "general",
  };
}

function integrityHashComparison(
  details: Record<string, unknown> | null | undefined,
): EvidenceHashComparison | undefined {
  if (!details) return undefined;
  const currentOriginalHash = nullableString(details.current_original_hash);
  const databaseHash = nullableString(details.database_hash);
  const blockchainEvidenceHash = nullableString(details.blockchain_evidence_hash);
  if (!currentOriginalHash && !databaseHash && !blockchainEvidenceHash) return undefined;

  return {
    currentOriginalHash,
    databaseHash,
    blockchainEvidenceHash,
    currentMatchesBlockchain: nullableBoolean(details.current_matches_blockchain),
    databaseMatchesBlockchain: nullableBoolean(details.database_matches_blockchain),
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

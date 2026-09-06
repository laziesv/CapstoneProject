export type EvidenceIntegrityMismatchType =
  | "DATABASE_HASH_MISMATCH"
  | "ORIGINAL_FILE_MISMATCH"
  | "ORIGINAL_AND_DATABASE_HASH_MISMATCH"
  | "MISSING_ON_CHAIN";

export interface DownloadErrorDialogContent {
  title: string;
  message: string;
  kind: "integrity" | "blockchain" | "general";
}

interface DownloadErrorLike {
  status?: unknown;
  code?: unknown;
  message?: unknown;
  details?: Record<string, unknown> | null;
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
      return INTEGRITY_MESSAGES[
        mismatchType as EvidenceIntegrityMismatchType
      ];
    }
    return {
      title: "พบความผิดปกติของข้อมูลหลักฐาน",
      message: "ระบบไม่สามารถยืนยันความถูกต้องของข้อมูลหลักฐานได้ จึงระงับการดาวน์โหลด",
      kind: "integrity",
    };
  }

  if (error.status === 503) {
    return {
      title: "ไม่สามารถตรวจสอบ Blockchain ได้",
      message: "ระบบไม่สามารถยืนยันความถูกต้องของหลักฐานได้ในขณะนี้ กรุณาลองใหม่ภายหลัง",
      kind: "blockchain",
    };
  }

  return {
    title: "ไม่สามารถดาวน์โหลดหลักฐานได้",
    message: typeof error.message === "string"
      ? error.message
      : "เกิดข้อผิดพลาดระหว่างดาวน์โหลด กรุณาลองใหม่อีกครั้ง",
    kind: "general",
  };
}

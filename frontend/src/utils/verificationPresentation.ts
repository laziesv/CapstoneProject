import type { VerifyResult } from "../interfaces/evidence";

export type VerificationTone = "success" | "warning" | "danger";

export interface VerificationCheckPresentation {
  id: string;
  title: string;
  result: string;
  explanation: string;
  tone: VerificationTone;
}

export interface VerificationPresentation {
  title: string;
  description: string;
  tone: VerificationTone;
  checks: VerificationCheckPresentation[];
}

export function buildVerificationPresentation(
  result: VerifyResult,
): VerificationPresentation {
  const extractionOk = Boolean(result.staticDecoded && result.dynamicDecoded);
  const personalized = result.dynamicMode === "personalized";
  const canonical = result.dynamicMode === "canonical";
  const sessionOk = personalized
    && result.dynamicOk
    && result.blockchainSessionVerified;
  const blockchainOk = result.blockchainVerified
    && (!personalized || result.blockchainSessionVerified);

  const checks: VerificationCheckPresentation[] = [
    binaryCheck(
      "watermark-extraction",
      "การอ่านลายน้ำดิจิทัล",
      extractionOk,
      "อ่านข้อมูล Static และ Dynamic Watermark ได้",
      "อ่านข้อมูล Watermark ได้ไม่ครบถ้วน",
      "ตรวจว่าระบบสามารถถอดข้อมูล Watermark จากภาพได้ ไม่ได้ยืนยันความถูกต้องของฐานข้อมูลหรือ Blockchain",
    ),
    binaryCheck(
      "evidence-identity",
      "รหัสอ้างอิงหลักฐาน",
      result.staticOk,
      "ระบุหลักฐานที่ลงทะเบียนไว้ได้",
      "ไม่สามารถยืนยันรหัสอ้างอิงหลักฐานได้",
      "Static Watermark ใช้ระบุตัวตนหลักฐานในระบบ โดยไม่เปิดเผย Evidence UUID บน Blockchain",
    ),
  ];

  if (personalized) {
    checks.push(binaryCheck(
      "download-session",
      "รหัสติดตามรอบการดาวน์โหลด",
      sessionOk,
      "พบ Download Session ของหลักฐานเดียวกันบน Blockchain",
      "ไม่พบ Download Session ที่ยืนยันได้",
      "Dynamic Watermark ต้องอ้างถึง Access Session บน Blockchain ของหลักฐานเดียวกันและมีการกระทำเป็น DOWNLOAD",
    ));
  }

  checks.push(binaryCheck(
    "blockchain-reference",
    "ข้อมูลอ้างอิงบน Blockchain",
    blockchainOk,
    personalized
      ? "พบข้อมูลหลักฐานและ Download Session บน EvidenceRegistryV3"
      : "พบข้อมูลหลักฐานบน EvidenceRegistryV3",
    "ไม่สามารถยืนยันข้อมูลอ้างอิงบน Blockchain ได้",
    personalized
      ? "ตรวจว่ามีทั้ง Evidence Record และ Access Session ที่สัมพันธ์กันบน Blockchain"
      : "ตรวจว่ามี Evidence Record ที่ใช้เป็นค่าอ้างอิงความถูกต้องบน Blockchain",
  ));

  appendIntegrityCheck(
    checks,
    "original-file",
    "ความถูกต้องของไฟล์ต้นฉบับ",
    result.originalFileIntegrityStatus,
    "ค่า SHA-256 ของไฟล์ต้นฉบับปัจจุบันตรงกับ evidenceHash บน Blockchain",
  );
  appendIntegrityCheck(
    checks,
    "database-hash",
    "ความถูกต้องของค่าแฮชในฐานข้อมูล",
    result.databaseHashIntegrityStatus,
    "ค่าแฮชไฟล์ต้นฉบับในฐานข้อมูลตรงกับ evidenceHash บน Blockchain",
  );

  if (canonical) {
    appendIntegrityCheck(
      checks,
      "canonical-watermark-hash",
      "ความถูกต้องของค่าแฮชจาก Watermark",
      result.watermarkHashIntegrityStatus,
      "ค่าแฮชจาก Dynamic Watermark ตรงกับ evidenceHash บน Blockchain",
    );
  }

  const identityEstablished = extractionOk
    && result.staticOk
    && blockchainOk
    && (canonical
      ? result.watermarkHashIntegrityStatus === "VERIFIED"
      : sessionOk);
  if (!identityEstablished) {
    return {
      title: "ไม่สามารถยืนยันข้อมูลจาก Watermark ได้",
      description: "ข้อมูลที่อ่านได้ไม่เพียงพอหรือไม่ตรงกับข้อมูลอ้างอิงบน Blockchain",
      tone: "danger",
      checks,
    };
  }

  const originalMismatch = result.originalFileIntegrityStatus === "INTEGRITY_MISMATCH";
  const mutableMismatch = originalMismatch
    || result.databaseHashIntegrityStatus === "INTEGRITY_MISMATCH"
    || result.databaseIntegrityState === "INTEGRITY_MISMATCH"
    || result.watermarkHashIntegrityStatus === "INTEGRITY_MISMATCH";

  if (personalized && originalMismatch) {
    return {
      title: "พบ Download Session ที่ตรงกับไฟล์นี้",
      description: "แต่พบความผิดปกติของไฟล์ต้นฉบับปัจจุบัน",
      tone: "warning",
      checks,
    };
  }
  if (mutableMismatch) {
    return {
      title: "ตรวจสอบ Watermark และข้อมูลบน Blockchain สำเร็จ",
      description: "แต่พบข้อมูลบางส่วนในระบบไม่ตรงกับ Blockchain",
      tone: "warning",
      checks,
    };
  }
  return {
    title: "ตรวจสอบข้อมูลสำเร็จ",
    description: "ไม่พบความไม่สอดคล้องในข้อมูลที่ตรวจสอบ",
    tone: "success",
    checks,
  };
}

function binaryCheck(
  id: string,
  title: string,
  ok: boolean,
  okResult: string,
  failedResult: string,
  explanation: string,
): VerificationCheckPresentation {
  return {
    id,
    title,
    result: ok ? okResult : failedResult,
    explanation,
    tone: ok ? "success" : "danger",
  };
}

function appendIntegrityCheck(
  checks: VerificationCheckPresentation[],
  id: string,
  title: string,
  status: string | null,
  verifiedExplanation: string,
): void {
  if (status === null) return;
  const verified = status === "VERIFIED";
  checks.push({
    id,
    title,
    result: verified
      ? "ข้อมูลตรงกับ Blockchain"
      : status === "MISSING_ON_CHAIN"
        ? "ไม่พบข้อมูลอ้างอิงบน Blockchain"
        : "พบข้อมูลไม่ตรงกับ Blockchain",
    explanation: verified
      ? verifiedExplanation
      : `${verifiedExplanation.replace("ตรงกับ", "ถูกเปรียบเทียบกับ")} และพบความไม่สอดคล้อง`,
    tone: verified ? "success" : "warning",
  });
}

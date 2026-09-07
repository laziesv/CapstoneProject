import type { EvidenceDownloadMetadata } from "@/interfaces";

const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export interface PersonalizedWatermarkPayloads {
  staticPayload: string | null;
  dynamicPayload: string | null;
}

export function personalizedWatermarkPayloads(
  metadata: EvidenceDownloadMetadata,
): PersonalizedWatermarkPayloads {
  // Static Watermark ใช้ digest เดียวกับ evidence_ref แต่ payload ของ QR ไม่มี 0x
  const staticPayload = metadata.evidenceRef && BYTES32_PATTERN.test(metadata.evidenceRef)
    ? metadata.evidenceRef.slice(2).toLowerCase()
    : null;
  const dynamicPayload = metadata.accessSessionRef
    && BYTES32_PATTERN.test(metadata.accessSessionRef)
    ? metadata.accessSessionRef.toLowerCase()
    : null;

  return { staticPayload, dynamicPayload };
}

export function dynamicWatermarkDescription(
  mode: "canonical" | "personalized" | "unresolved" | null,
): string {
  if (mode === "canonical") return "ใช้ตรวจสอบค่าแฮชของไฟล์ต้นฉบับ (Original File SHA-256)";
  if (mode === "personalized") return "ใช้ติดตาม Download Session ของสำเนานี้";
  return "ไม่สามารถระบุประเภทของข้อมูล Dynamic ได้";
}

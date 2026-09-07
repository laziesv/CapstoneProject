import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  dynamicWatermarkDescription,
  personalizedWatermarkPayloads,
} from "../src/utils/watermarkPresentation.ts";

const readSource = (relativePath) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  "utf8",
);

const qrPresentationSource = readSource("src/components/evidence/WatermarkQrPresentation.tsx");
const evidenceDetailSource = readSource("src/app/(protected)/evidence/[id]/page.tsx");
const verifySource = readSource("src/app/(protected)/(admin)/verify/page.tsx");

function downloadMetadata(overrides = {}) {
  return {
    evidenceId: "11111111-1111-4111-8111-111111111111",
    evidenceRef: `0x${"A".repeat(64)}`,
    accessSessionRef: `0x${"B".repeat(64)}`,
    action: "DOWNLOAD",
    transactionHash: `0x${"c".repeat(64)}`,
    blockNumber: 20001,
    integrityStatus: "VERIFIED",
    ...overrides,
  };
}

test("personalized Download maps operation metadata to the exact codec QR payloads", () => {
  assert.deepEqual(personalizedWatermarkPayloads(downloadMetadata()), {
    staticPayload: "a".repeat(64),
    dynamicPayload: `0x${"b".repeat(64)}`,
  });
});

test("malformed Download references do not produce fabricated QR payloads", () => {
  assert.deepEqual(personalizedWatermarkPayloads(downloadMetadata({
    evidenceRef: "not-an-evidence-ref",
    accessSessionRef: "0x1234",
  })), {
    staticPayload: null,
    dynamicPayload: null,
  });
});

test("canonical and personalized Dynamic descriptions preserve their semantics", () => {
  assert.match(dynamicWatermarkDescription("canonical"), /แฮชของไฟล์ต้นฉบับ/);
  assert.doesNotMatch(dynamicWatermarkDescription("canonical"), /Download Session/);
  assert.match(dynamicWatermarkDescription("personalized"), /Download Session/);
});

test("Download result displays Static and Dynamic before deterministic QR previews", () => {
  assert.match(evidenceDetailSource, /title="Personalized Watermark"/);
  assert.match(evidenceDetailSource, /staticValue=\{watermarkPayloads\.staticPayload\}/);
  assert.match(evidenceDetailSource, /dynamicValue=\{watermarkPayloads\.dynamicPayload\}/);
  assert.match(evidenceDetailSource, /dynamicMode="personalized"/);
  assert.match(evidenceDetailSource, /generateQr/);
  assert.match(qrPresentationSource, /label="Static"/);
  assert.match(qrPresentationSource, /label="Dynamic"/);
  assert.ok(qrPresentationSource.indexOf("<WatermarkValue") < qrPresentationSource.indexOf("<WatermarkQr"));
  assert.match(qrPresentationSource, /<QRCodeSVG value=\{value\}/);
  assert.match(qrPresentationSource, /marginSize=\{4\}/);
});

test("Verify displays decoded values before QR images returned by the backend", () => {
  assert.match(verifySource, /staticValue=\{result\.staticDecoded\}/);
  assert.match(verifySource, /dynamicValue=\{result\.dynamicDecoded\}/);
  assert.match(verifySource, /staticQrPng=\{result\.staticQrPng\}/);
  assert.match(verifySource, /dynamicQrPng=\{result\.dynamicQrPng\}/);
  assert.match(verifySource, /dynamicMode=\{result\.dynamicMode\}/);
  assert.doesNotMatch(verifySource, /รหัสอ้างอิงหลักฐาน.*QrValue|รหัสติดตามรอบการดาวน์โหลด.*QrValue/s);
});

test("long watermark values are constrained, copyable, and expandable", () => {
  assert.match(qrPresentationSource, /truncate font-mono/);
  assert.match(qrPresentationSource, /copyTextWithFeedback\(value\)/);
  assert.match(qrPresentationSource, /ดูค่าเต็ม/);
  assert.match(qrPresentationSource, /break-all font-mono/);
  assert.match(qrPresentationSource, /max-w-full/);
});

test("QR presentation adds no Download request or watermark generation", () => {
  assert.equal((evidenceDetailSource.match(/evidenceService\.download\(/g) ?? []).length, 1);
  assert.doesNotMatch(evidenceDetailSource, /create_personalized_copy|PersonalizedWatermarkService|watermarkService\.embed/);
  assert.doesNotMatch(qrPresentationSource, /fetch\(|evidenceService|watermarkService/);
});

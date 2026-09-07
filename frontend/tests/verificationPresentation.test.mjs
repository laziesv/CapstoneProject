import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildVerificationPresentation } from "../src/utils/verificationPresentation.ts";

function result(overrides = {}) {
  return {
    found: true,
    staticDecoded: "a".repeat(64),
    dynamicDecoded: "b".repeat(64),
    staticOk: true,
    dynamicOk: true,
    dynamicMode: "canonical",
    blockchainVerified: true,
    blockchainSessionVerified: false,
    originalFileIntegrityStatus: "VERIFIED",
    databaseHashIntegrityStatus: "VERIFIED",
    watermarkHashIntegrityStatus: "VERIFIED",
    databaseIntegrityState: null,
    ...overrides,
  };
}

test("canonical verification presents each independent check without percentages", () => {
  const presentation = buildVerificationPresentation(result());
  assert.equal(presentation.title, "ตรวจสอบข้อมูลสำเร็จ");
  assert.deepEqual(
    presentation.checks.map((check) => check.id),
    [
      "watermark-extraction",
      "evidence-identity",
      "blockchain-reference",
      "original-file",
      "database-hash",
      "canonical-watermark-hash",
    ],
  );
  assert.ok(presentation.checks.every((check) => check.explanation.length > 0));
  assert.doesNotMatch(JSON.stringify(presentation), /100%|เปอร์เซ็นต์/);
});

test("database hash mismatch keeps a valid personalized session green", () => {
  const presentation = buildVerificationPresentation(result({
    dynamicDecoded: `0x${"c".repeat(64)}`,
    dynamicMode: "personalized",
    blockchainSessionVerified: true,
    databaseHashIntegrityStatus: "INTEGRITY_MISMATCH",
    watermarkHashIntegrityStatus: null,
  }));

  assert.equal(presentation.tone, "warning");
  assert.equal(
    presentation.title,
    "ตรวจสอบ Watermark และข้อมูลบน Blockchain สำเร็จ",
  );
  assert.equal(
    presentation.checks.find((check) => check.id === "download-session")?.tone,
    "success",
  );
  assert.equal(
    presentation.checks.find((check) => check.id === "database-hash")?.tone,
    "warning",
  );
});

test("a valid session stays visible while current original integrity is broken", () => {
  const presentation = buildVerificationPresentation(result({
    dynamicDecoded: `0x${"d".repeat(64)}`,
    dynamicMode: "personalized",
    blockchainSessionVerified: true,
    originalFileIntegrityStatus: "INTEGRITY_MISMATCH",
    watermarkHashIntegrityStatus: null,
  }));

  assert.equal(presentation.title, "พบ Download Session ที่ตรงกับไฟล์นี้");
  assert.equal(presentation.tone, "warning");
  assert.equal(
    presentation.checks.find((check) => check.id === "download-session")?.tone,
    "success",
  );
});

test("an unresolved personalized session cannot establish identity", () => {
  const presentation = buildVerificationPresentation(result({
    dynamicDecoded: `0x${"e".repeat(64)}`,
    dynamicMode: "personalized",
    dynamicOk: false,
    blockchainSessionVerified: false,
    watermarkHashIntegrityStatus: null,
  }));

  assert.equal(presentation.tone, "danger");
  assert.equal(presentation.title, "ไม่สามารถยืนยันข้อมูลจาก Watermark ได้");
});

test("canonical watermark hash mismatch cannot produce a successful summary", () => {
  const presentation = buildVerificationPresentation(result({
    dynamicOk: false,
    watermarkHashIntegrityStatus: "INTEGRITY_MISMATCH",
  }));

  assert.equal(presentation.tone, "danger");
  assert.equal(
    presentation.checks.find((check) => check.id === "canonical-watermark-hash")?.tone,
    "warning",
  );
});

test("verify page no longer renders matchPercent or 100 percent copy", async () => {
  const source = await readFile(
    new URL("../src/app/(protected)/(admin)/verify/page.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /matchPercent|100%|ตรงกัน\s*\{/);
});

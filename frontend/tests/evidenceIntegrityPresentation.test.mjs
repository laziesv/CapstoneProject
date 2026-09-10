import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const evidencePageSource = readSource("src/app/(protected)/evidence/[id]/page.tsx");
const comparisonSource = readSource("src/components/evidence/EvidenceHashComparison.tsx");
const downloadServiceSource = readSource("src/services/http/evidence.service.ts");

test("integrity Download dialog shows all computed SHA-256 values", () => {
  assert.match(evidencePageSource, /content\.kind === "integrity" && content\.hashComparison/);
  assert.match(evidencePageSource, /<EvidenceHashComparison comparison=\{content\.hashComparison\}/);
  assert.match(comparisonSource, /ค่าแฮชไฟล์ต้นฉบับปัจจุบัน/);
  assert.match(comparisonSource, /ค่าแฮชในฐานข้อมูล/);
  assert.match(comparisonSource, /ค่าแฮชอ้างอิงบน Blockchain/);
});

test("hash comparison distinguishes DB-only, file-only, and combined mismatches", () => {
  assert.match(comparisonSource, /comparison\.currentMatchesBlockchain/);
  assert.match(comparisonSource, /comparison\.databaseMatchesBlockchain/);
  assert.match(comparisonSource, /ตรงกับ Blockchain/);
  assert.match(comparisonSource, /ไม่ตรงกับ Blockchain/);
  assert.match(comparisonSource, /break-all/);
  assert.match(comparisonSource, /title=\{value \?\? undefined\}/);
  assert.match(comparisonSource, /copyTextWithFeedback\(value\)/);
});

test("Download integrity presentation adds no request or Blockchain write", () => {
  assert.equal((evidencePageSource.match(/evidenceService\.download\(/g) ?? []).length, 1);
  assert.equal((downloadServiceSource.match(/requestEvidenceDownloadOnce\(/g) ?? []).length, 1);
  assert.doesNotMatch(comparisonSource, /fetch\(|recordAccess|blockchainService/);
});

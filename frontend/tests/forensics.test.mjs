import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  chainEvidenceIdentityRows,
  compareBlockchainOrder,
  formatForensicDateTime,
  formatForensicMismatchValue,
  formatForensicUnixTime,
  formatInclusionDelay,
  formatIntegrityState,
  forensicMismatchLabel,
  shouldShowDatabaseActor,
  shouldShowMatchedDownloadSession,
} from "../src/utils/forensics.ts";

test("shows application evidence identifiers separately from Blockchain refs", () => {
  assert.deepEqual(
    chainEvidenceIdentityRows({
      evidence_number: "EV-20260907-TEST",
      evidence_id: "822396ec-1111-4222-8333-123456789abc",
    }),
    [
      { label: "เลขหลักฐาน", value: "EV-20260907-TEST" },
      { label: "Evidence ID", value: "822396ec-1111-4222-8333-123456789abc" },
    ],
  );
});

test("keeps Evidence Ref inside Chain of Custody technical details", async () => {
  const source = await readFile(
    new URL("../src/components/evidence/ChainOfCustodyPanel.tsx", import.meta.url),
    "utf8",
  );
  const identityIndex = source.indexOf("chainEvidenceIdentityRows(data.evidence)");
  const detailsIndex = source.indexOf("<TechnicalDetails>", identityIndex);
  const evidenceRefIndex = source.indexOf(
    'label="รหัสอ้างอิงหลักฐาน"',
    detailsIndex,
  );
  assert.ok(identityIndex >= 0);
  assert.ok(detailsIndex > identityIndex);
  assert.ok(evidenceRefIndex > detailsIndex);
});

test("formats forensic timestamps in Asia/Bangkok with one shared format", () => {
  const iso = "2026-08-01T20:58:35+07:00";
  const unix = Date.parse(iso) / 1000;

  assert.equal(formatForensicDateTime(iso), "01 ส.ค. 2026 20:58:35");
  assert.equal(formatForensicUnixTime(unix), "01 ส.ค. 2026 20:58:35");
  assert.equal(
    formatForensicMismatchValue(unix, "accessed_at"),
    "01 ส.ค. 2026 20:58:35",
  );
});

test("shows a later Blockchain inclusion time and its delay", () => {
  const occurredAt = Date.parse("2026-08-01T20:58:30+07:00") / 1000;
  const recordedAt = occurredAt + 5;

  assert.equal(formatForensicUnixTime(occurredAt), "01 ส.ค. 2026 20:58:30");
  assert.equal(formatForensicUnixTime(recordedAt), "01 ส.ค. 2026 20:58:35");
  assert.equal(formatInclusionDelay(occurredAt, recordedAt), "5 วินาที");
});

test("sorts custody events by Blockchain block despite mutable database time", () => {
  const events = [
    { action: "DOWNLOAD", blockNumber: 105, recordedAt: 1_057, databaseTime: 1 },
    { action: "REGISTER", blockNumber: 100, recordedAt: 1_007, databaseTime: 3 },
    { action: "VIEW", blockNumber: 102, recordedAt: 1_027, databaseTime: 2 },
  ];

  events.sort((left, right) => compareBlockchainOrder(
    { ...left, stableKey: left.action },
    { ...right, stableKey: right.action },
  ));

  assert.deepEqual(events.map((event) => event.action), ["REGISTER", "VIEW", "DOWNLOAD"]);
});

test("sorts same-block custody events by transaction and log index", () => {
  const events = [
    { id: "third", blockNumber: 200, transactionIndex: 2, logIndex: 0, recordedAt: 1 },
    { id: "second", blockNumber: 200, transactionIndex: 1, logIndex: 4, recordedAt: 1 },
    { id: "first", blockNumber: 200, transactionIndex: 1, logIndex: 3, recordedAt: 9 },
  ];

  events.sort((left, right) => compareBlockchainOrder(
    { ...left, stableKey: left.id },
    { ...right, stableKey: right.id },
  ));

  assert.deepEqual(events.map((event) => event.id), ["first", "second", "third"]);
});

test("formats original evidence integrity states for forensic review", () => {
  assert.equal(
    formatIntegrityState("ORIGINAL_FILE_MISMATCH"),
    "ไฟล์ต้นฉบับปัจจุบันไม่ตรงกับ Blockchain",
  );
  assert.equal(
    formatIntegrityState("DATABASE_HASH_MISMATCH"),
    "ค่าแฮชในฐานข้อมูลไม่ตรงกับ Blockchain",
  );
});

test("uses readable labels for original hash comparisons", () => {
  assert.equal(
    forensicMismatchLabel("original_file_bytes_hash"),
    "ค่าแฮชของไฟล์ต้นฉบับปัจจุบัน",
  );
  assert.equal(
    forensicMismatchLabel("database_original_hash"),
    "ค่าแฮชไฟล์ต้นฉบับที่บันทึกในระบบ",
  );
  assert.equal(forensicMismatchLabel("access_log"), "ข้อมูล AccessLog");
  assert.equal(forensicMismatchLabel("transaction_hash"), "Transaction Hash");
});

test("keeps a verified personalized session visible under integrity warnings", () => {
  assert.equal(
    shouldShowMatchedDownloadSession({
      dynamicMode: "personalized",
      blockchainSessionVerified: true,
      dynamicOk: false,
      originalFileIntegrityStatus: "INTEGRITY_MISMATCH",
      databaseHashIntegrityStatus: "INTEGRITY_MISMATCH",
    }),
    true,
  );
});

test("hides attribution when no personalized blockchain session is verified", () => {
  assert.equal(
    shouldShowMatchedDownloadSession({
      dynamicMode: "personalized",
      blockchainSessionVerified: false,
    }),
    false,
  );
  assert.equal(
    shouldShowMatchedDownloadSession({
      dynamicMode: "canonical",
      blockchainSessionVerified: true,
    }),
    false,
  );
});

test("shows the AccessLog-linked actor only when it differs from Blockchain", () => {
  assert.equal(
    shouldShowDatabaseActor({
      officerRefMatches: false,
      databaseUserPresent: true,
    }),
    true,
  );
  assert.equal(
    shouldShowDatabaseActor({
      officerRefMatches: true,
      databaseUserPresent: true,
    }),
    false,
  );
  assert.equal(
    shouldShowDatabaseActor({
      officerRefMatches: false,
      databaseUserPresent: false,
    }),
    false,
  );
});

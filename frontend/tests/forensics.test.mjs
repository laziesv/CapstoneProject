import assert from "node:assert/strict";
import test from "node:test";

import {
  compareBlockchainOrder,
  formatForensicDateTime,
  formatForensicMismatchValue,
  formatForensicUnixTime,
  formatInclusionDelay,
  formatIntegrityState,
  forensicMismatchLabel,
} from "../src/utils/forensics.ts";

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
});

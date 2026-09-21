import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const logsPage = readFileSync(
  new URL("../src/app/(protected)/(admin)/logs/page.tsx", import.meta.url),
  "utf8",
);

test("Access Log page identifies Blockchain integrity alerts by log id", () => {
  assert.match(logsPage, /integrityAlertService\s*\.list\(\)/);
  assert.match(logsPage, /alert\.access_log_id/);
  assert.match(logsPage, /ข้อมูลไม่ตรงกับ Blockchain/);
  assert.match(logsPage, /ACCESS_LOG_MISSING_IN_DATABASE/);
});

test("Access Log integrity rows are included in the anomaly category", () => {
  assert.match(logsPage, /id=\{`access-log-\$\{l\.log_id\}`\}/);
  assert.match(logsPage, /setQuick\("anomaly"\)/);
  assert.match(logsPage, /integrityLogIds\.has\(log\.log_id\)/);
});

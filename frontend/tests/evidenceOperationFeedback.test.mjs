import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeViewSuccess,
  createViewSessionAndRemember,
  downloadSuccessSummary,
  rememberViewSuccess,
  requestEvidenceDownloadOnce,
  UPLOAD_RESULT_PRESENTATION,
  VIEW_SUCCESS_FEEDBACK,
} from "../src/utils/evidenceOperationFeedback.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function viewSession(evidenceId) {
  return {
    access_log_id: "11111111-1111-4111-8111-111111111111",
    evidence_id: evidenceId,
    access_session_ref: `0x${"a".repeat(64)}`,
    action: "VIEW",
    occurred_at: "2026-09-07T12:00:00Z",
    tx_hash: `0x${"b".repeat(64)}`,
    block_number: 19001,
  };
}

test("intentional VIEW success is consumed exactly once", () => {
  const storage = memoryStorage();
  const session = viewSession("22222222-2222-4222-8222-222222222222");
  rememberViewSuccess(session, storage);

  assert.deepEqual(consumeViewSuccess(session.evidence_id, storage), session);
  assert.equal(consumeViewSuccess(session.evidence_id, storage), null);
  assert.match(VIEW_SUCCESS_FEEDBACK.message, /ฐานข้อมูลและ Blockchain/);
});

test("refresh or direct URL without a success marker shows no VIEW feedback", () => {
  assert.equal(
    consumeViewSuccess("22222222-2222-4222-8222-222222222222", memoryStorage()),
    null,
  );
});

test("failed VIEW orchestration stores no success feedback", async () => {
  const storage = memoryStorage();
  const evidenceId = "22222222-2222-4222-8222-222222222222";
  await assert.rejects(
    createViewSessionAndRemember(
      evidenceId,
      async () => { throw new Error("Blockchain write failed"); },
      storage,
    ),
  );
  assert.equal(consumeViewSuccess(evidenceId, storage), null);
});

test("one download action invokes the backend requester exactly once", async () => {
  const calls = [];
  const response = { blob: "blob", headers: "headers" };
  const requester = async (...args) => {
    calls.push(args);
    return response;
  };

  assert.equal(
    await requestEvidenceDownloadOnce("evidence id", requester),
    response,
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    "/api/evidences/evidence%20id/download",
    { method: "POST" },
  ]);
});

test("download success explains actual watermark and Blockchain metadata", () => {
  const summary = downloadSuccessSummary({
    evidenceId: "22222222-2222-4222-8222-222222222222",
    evidenceRef: `0x${"c".repeat(64)}`,
    accessSessionRef: `0x${"d".repeat(64)}`,
    action: "DOWNLOAD",
    transactionHash: `0x${"e".repeat(64)}`,
    blockNumber: 19002,
    integrityStatus: "VERIFIED",
  });

  assert.match(summary.staticWatermark, /Static Watermark/);
  assert.match(summary.dynamicWatermark, /Dynamic Watermark/);
  assert.equal(summary.action, "DOWNLOAD");
  assert.equal(summary.blockNumber, 19002);
  assert.equal(summary.integrityVerified, true);
  assert.match(summary.integrityMessage, /ไฟล์ต้นฉบับกับ Blockchain/);
  assert.doesNotMatch(
    JSON.stringify(summary),
    /personalized (image|file) hash.*(Blockchain|on-chain)/i,
  );
});

test("upload completion is accurately classified as a result, not read-back authentication", () => {
  assert.equal(UPLOAD_RESULT_PRESENTATION.readBackVerified, false);
  assert.equal(UPLOAD_RESULT_PRESENTATION.heading, "ผลการบันทึกหลักฐาน");
  assert.doesNotMatch(
    `${UPLOAD_RESULT_PRESENTATION.stepLabel} ${UPLOAD_RESULT_PRESENTATION.heading}`,
    /Authenticate|รับรอง/,
  );
});

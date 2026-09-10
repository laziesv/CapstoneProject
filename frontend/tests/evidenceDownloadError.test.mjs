import assert from "node:assert/strict";
import test from "node:test";

import {
  downloadErrorDialog,
  userFacingApiError,
} from "../src/utils/evidenceDownloadError.ts";


function integrityError(mismatchType) {
  return {
    status: 409,
    code: "EVIDENCE_INTEGRITY_MISMATCH",
    message: "raw backend message",
    details: {
      mismatch_type: mismatchType,
      current_original_hash: "c".repeat(64),
      database_hash: "d".repeat(64),
      blockchain_evidence_hash: "a".repeat(64),
      current_matches_blockchain: mismatchType === "DATABASE_HASH_MISMATCH",
      database_matches_blockchain: mismatchType === "ORIGINAL_FILE_MISMATCH",
    },
  };
}


test("maps a database hash mismatch to the dedicated warning", () => {
  const dialog = downloadErrorDialog(integrityError("DATABASE_HASH_MISMATCH"));

  assert.equal(dialog.title, "พบความผิดปกติของข้อมูลหลักฐาน");
  assert.match(dialog.message, /ฐานข้อมูล/);
  assert.match(dialog.message, /Blockchain/);
  assert.doesNotMatch(dialog.message, /409|EVIDENCE_INTEGRITY_MISMATCH/);
  assert.equal(dialog.hashComparison?.currentMatchesBlockchain, true);
  assert.equal(dialog.hashComparison?.databaseMatchesBlockchain, false);
});

test("maps an original file mismatch to the file integrity warning", () => {
  const dialog = downloadErrorDialog(integrityError("ORIGINAL_FILE_MISMATCH"));

  assert.equal(dialog.title, "ไฟล์หลักฐานไม่ผ่านการตรวจสอบความถูกต้อง");
  assert.match(dialog.message, /ไฟล์ต้นฉบับปัจจุบัน/);
  assert.equal(dialog.hashComparison?.currentOriginalHash, "c".repeat(64));
  assert.equal(dialog.hashComparison?.databaseHash, "d".repeat(64));
  assert.equal(dialog.hashComparison?.blockchainEvidenceHash, "a".repeat(64));
});

test("maps a combined mismatch to a distinct warning", () => {
  const dialog = downloadErrorDialog(
    integrityError("ORIGINAL_AND_DATABASE_HASH_MISMATCH"),
  );

  assert.equal(dialog.title, "พบความผิดปกติของไฟล์และข้อมูลหลักฐาน");
  assert.match(dialog.message, /ไฟล์ต้นฉบับปัจจุบัน/);
  assert.match(dialog.message, /ฐานข้อมูล/);
});

test("does not classify an unrelated 409 as evidence corruption", () => {
  const dialog = downloadErrorDialog({
    status: 409,
    code: "SOME_OTHER_CONFLICT",
    message: "คำขอขัดแย้งกับข้อมูลปัจจุบัน",
  });

  assert.equal(dialog.kind, "general");
  assert.equal(dialog.title, "ไม่สามารถดำเนินการได้");
});

test("shows blockchain unavailable wording for 503", () => {
  const dialog = downloadErrorDialog({
    status: 503,
    message: "Evidence download could not be recorded",
  });

  assert.equal(dialog.kind, "blockchain");
  assert.equal(dialog.hashComparison, undefined);
  assert.equal(dialog.title, "ไม่สามารถตรวจสอบ Blockchain ได้ในขณะนี้");
  assert.doesNotMatch(dialog.message, /แก้ไข|เปลี่ยนแปลง|ผิดปกติ/);
});

test("maps network and common HTTP failures to safe shared messages", () => {
  assert.equal(
    userFacingApiError(new TypeError("fetch failed")).title,
    "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้",
  );
  assert.equal(
    userFacingApiError({ status: 401 }).title,
    "เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ",
  );
  assert.equal(
    userFacingApiError({ status: 403 }).title,
    "คุณไม่มีสิทธิ์ดำเนินการนี้",
  );
  assert.equal(
    userFacingApiError({ status: 404 }).title,
    "ไม่พบข้อมูลที่ร้องขอ",
  );
  assert.equal(
    userFacingApiError({ status: 500, message: "raw exception" }).title,
    "ระบบเกิดข้อผิดพลาด",
  );
  assert.doesNotMatch(
    userFacingApiError({ status: 500, message: "raw exception" }).message,
    /raw exception/,
  );
});

test("keeps the integrity 409 dialog more specific than shared errors", () => {
  const dialog = downloadErrorDialog(integrityError("ORIGINAL_FILE_MISMATCH"));
  assert.equal(dialog.kind, "integrity");
  assert.equal(dialog.title, "ไฟล์หลักฐานไม่ผ่านการตรวจสอบความถูกต้อง");
});

test("combined mismatch preserves all three compared hashes", () => {
  const dialog = downloadErrorDialog(integrityError("ORIGINAL_AND_DATABASE_HASH_MISMATCH"));
  assert.deepEqual(dialog.hashComparison, {
    currentOriginalHash: "c".repeat(64),
    databaseHash: "d".repeat(64),
    blockchainEvidenceHash: "a".repeat(64),
    currentMatchesBlockchain: false,
    databaseMatchesBlockchain: false,
  });
});

test("image-too-small keeps the backend's required pixel size in the message", () => {
  // ข้อความต้องบอกตัวเลขที่ผู้ใช้ต้องทำตาม ไม่ใช่ถูกกลืนเป็นข้อความกลาง ๆ
  const feedback = userFacingApiError({
    status: 422,
    code: "IMAGE_TOO_SMALL_FOR_WATERMARK",
    message:
      "ภาพมีขนาด 260x320 พิกเซล เล็กเกินกว่าจะฝังลายน้ำที่ตรวจสอบย้อนกลับได้ "
      + "ด้านที่สั้นที่สุดต้องมีอย่างน้อย 640 พิกเซล",
  });
  assert.equal(feedback.title, "ภาพมีขนาดเล็กเกินไป");
  assert.match(feedback.message, /640/);
});

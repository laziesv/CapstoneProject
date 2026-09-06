import assert from "node:assert/strict";
import test from "node:test";

import { downloadErrorDialog } from "../src/utils/evidenceDownloadError.ts";


function integrityError(mismatchType) {
  return {
    status: 409,
    code: "EVIDENCE_INTEGRITY_MISMATCH",
    message: "raw backend message",
    details: { mismatch_type: mismatchType },
  };
}


test("maps a database hash mismatch to the dedicated warning", () => {
  const dialog = downloadErrorDialog(integrityError("DATABASE_HASH_MISMATCH"));

  assert.equal(dialog.title, "พบความผิดปกติของข้อมูลหลักฐาน");
  assert.match(dialog.message, /ฐานข้อมูล/);
  assert.match(dialog.message, /Blockchain/);
  assert.doesNotMatch(dialog.message, /409|EVIDENCE_INTEGRITY_MISMATCH/);
});

test("maps an original file mismatch to the file integrity warning", () => {
  const dialog = downloadErrorDialog(integrityError("ORIGINAL_FILE_MISMATCH"));

  assert.equal(dialog.title, "ไฟล์หลักฐานไม่ผ่านการตรวจสอบความถูกต้อง");
  assert.match(dialog.message, /ไฟล์ต้นฉบับปัจจุบัน/);
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
  assert.equal(dialog.title, "ไม่สามารถดาวน์โหลดหลักฐานได้");
});

test("shows blockchain unavailable wording for 503", () => {
  const dialog = downloadErrorDialog({
    status: 503,
    message: "Evidence download could not be recorded",
  });

  assert.equal(dialog.kind, "blockchain");
  assert.equal(dialog.title, "ไม่สามารถตรวจสอบ Blockchain ได้");
  assert.doesNotMatch(dialog.message, /แก้ไข|เปลี่ยนแปลง|ผิดปกติ/);
});

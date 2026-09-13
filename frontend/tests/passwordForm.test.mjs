import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MIN_PASSWORD_LENGTH, validateNewPassword } from "../src/utils/passwordForm.ts";

test("new password must meet the backend minimum length", () => {
  // ตรงกับ ChangePasswordRequest.new_password (min_length=8) ฝั่ง backend
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.match(validateNewPassword("short", "short"), /อย่างน้อย 8/);
  assert.equal(validateNewPassword("12345678", "12345678"), null);
});

test("new password and confirmation must match", () => {
  assert.match(validateNewPassword("password-one", "password-two"), /ไม่ตรงกัน/);
});

test("forced change page stays outside the protected layout", () => {
  // หน้า (protected) โหลด Sidebar/TopBar ที่เรียก API ซึ่ง backend ปฏิเสธ
  // ด้วย PASSWORD_CHANGE_REQUIRED — ถ้าย้ายเข้าไปจะวนพากลับหน้านี้ไม่รู้จบ
  const page = readFileSync(
    new URL("../src/app/change-password/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /validateNewPassword/);

  const client = readFileSync(new URL("../src/services/http/client.ts", import.meta.url), "utf8");
  assert.match(client, /PASSWORD_CHANGE_REQUIRED/);
  assert.match(client, /pathname !== "\/change-password"/);
});

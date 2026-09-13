import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assignableOptions, toDateTimeLocal } from "../src/utils/caseForm.ts";

test("toDateTimeLocal fills a datetime-local input in local time", () => {
  const d = new Date(2026, 8, 3, 7, 5);
  assert.equal(toDateTimeLocal(d.toISOString()), "2026-09-03T07:05");
});

test("toDateTimeLocal returns empty for missing or invalid values", () => {
  assert.equal(toDateTimeLocal(""), "");
  assert.equal(toDateTimeLocal(null), "");
  assert.equal(toDateTimeLocal("not-a-date"), "");
});

test("assignableOptions keeps only people in scope who are not assigned yet", () => {
  const users = [
    { user_id: "me", username: "me" },
    { user_id: "junior", username: "junior" },
    { user_id: "already", username: "already" },
    { user_id: "outsider", username: "outsider" },
  ];
  const options = assignableOptions(["me", "junior", "already"], users, ["already"]);
  assert.deepEqual(options.map((u) => u.user_id), ["me", "junior"]);
});

test("case page sends existing assignees along with new ones", () => {
  // backend ตอบ 400 ถ้ารายชื่อขาดคนเดิม — หน้าเว็บต้องส่งคนเดิมกลับไปทุกครั้ง
  const page = readFileSync(new URL("../src/app/(protected)/cases/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /assigned_officers: \[\.\.\.caseData\.assigned_officers, \.\.\.added\]/);
});

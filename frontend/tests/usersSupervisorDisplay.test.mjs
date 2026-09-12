import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const usersPage = readFileSync(
  new URL("../src/app/(protected)/(admin)/users/page.tsx", import.meta.url),
  "utf8",
);

test("supervisor column shows the real supervisor even when they are no longer an investigator", () => {
  // ตัวเลือกหัวหน้ามีแค่ investigator ถ้าหัวหน้าจริงถูกถอดสิทธิ์ไปแล้ว
  // select จะหา value ไม่เจอ แล้วเด้งไปตัวเลือกแรกเอง ("— ไม่มี —")
  // หน้าเว็บจึงบอกว่าไม่มีหัวหน้าทั้งที่มี และการบันทึกแถวนั้นจะล้างหัวหน้าจริงทิ้ง
  assert.match(usersPage, /const staleSupervisorOf = useCallback\(/);
  assert.match(usersPage, /staleSupervisorOf\(u\) && \(/);
  assert.match(usersPage, /ไม่ใช่พนักงานสืบสวนแล้ว/);

  // ดูเฉพาะ select ของแถวในตาราง (ฟอร์มเพิ่มผู้ใช้ก็มี supervisorOptions เหมือนกัน
  // แต่ผู้ใช้ใหม่ยังไม่มีหัวหน้าเดิม จึงไม่เกี่ยวกับปัญหานี้)
  const rowSelectStart = usersPage.indexOf('value={u.supervisor_id ?? ""}');
  assert.ok(rowSelectStart > 0, "ไม่พบ select หัวหน้าของแถวในตาราง");
  const rowSelect = usersPage.slice(
    rowSelectStart,
    usersPage.indexOf("</select>", rowSelectStart),
  );
  // option ของหัวหน้าที่ค้างอยู่ ต้องอยู่ใน select เดียวกันและมาก่อนรายการ investigator
  assert.ok(rowSelect.includes("staleSupervisorOf(u) && ("));
  assert.ok(
    rowSelect.indexOf("staleSupervisorOf(u) && (")
      < rowSelect.indexOf("{supervisorOptions"),
  );
});

test("supervisor options themselves stay limited to investigators", () => {
  // กฎเดิมต้องไม่ถูกคลายโดยไม่ตั้งใจ — เลือกหัวหน้าใหม่ได้เฉพาะ investigator
  assert.match(
    usersPage,
    /supervisorOptions = useMemo\(\(\) => users\.filter\(\(u\) => u\.role === "investigator"\)/,
  );
});

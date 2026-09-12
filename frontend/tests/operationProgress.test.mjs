import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  "utf8",
);

const toastSource = readSource("src/components/feedback/OperationToast.tsx");
const progressSource = readSource("src/components/feedback/OperationProgress.tsx");
const copyFeedbackSource = readSource("src/components/feedback/CopySuccessFeedback.tsx");
const protectedLayoutSource = readSource("src/app/(protected)/layout.tsx");
const uploadSource = readSource("src/app/(protected)/evidence/upload/page.tsx");
const viewProgressSource = readSource("src/components/feedback/IntentionalEvidenceProgress.tsx");
const viewHookSource = readSource("src/hooks/useIntentionalEvidenceNavigation.ts");
// ตรรกะบันทึก VIEW ย้ายมาอยู่ที่เดียวแล้ว ทั้งการกดเปิดและหน้าปลายทางใช้ตัวนี้
const viewSessionSource = readSource("src/hooks/useEvidenceViewSession.ts");
const evidenceDetailSource = readSource("src/app/(protected)/evidence/[id]/page.tsx");
const dashboardSource = readSource("src/app/(protected)/dashboard/page.tsx");
const caseDetailSource = readSource("src/app/(protected)/cases/[id]/page.tsx");
const verifySource = readSource("src/app/(protected)/(admin)/verify/page.tsx");

test("operation and copy notifications use one top-right toast host", () => {
  assert.match(toastSource, /fixed right-5 top-5/);
  assert.doesNotMatch(toastSource, /fixed bottom-5/);
  assert.match(copyFeedbackSource, /window\.dispatchEvent\(new Event\(COPY_SUCCESS_EVENT\)\)/);
  assert.equal((protectedLayoutSource.match(/<CopySuccessFeedbackHost\s*\/>/g) ?? []).length, 1);
});

test("shared progress component supports truthful operation states", () => {
  assert.match(progressSource, /"completed" \| "active" \| "pending" \| "error"/);
  assert.match(progressSource, /aria-busy/);
  assert.match(progressSource, /aria-live="polite"/);
  assert.match(progressSource, /overlay\?: boolean/);
});

test("upload shows aggregate waiting progress without simulated timers", () => {
  assert.match(uploadSource, /เตรียมไฟล์สำหรับอัปโหลด/);
  assert.match(uploadSource, /กำลังส่งและประมวลผลหลักฐานในระบบ/);
  assert.match(uploadSource, /รอผลการลงทะเบียน/);
  assert.match(uploadSource, /คำนวณ SHA-256/);
  assert.match(uploadSource, /ส่งธุรกรรม Blockchain/);
  assert.doesNotMatch(uploadSource, /setTimeout|setInterval/);
  assert.match(uploadSource, /if \(uploadInProgress\.current\) return/);
});

test("upload completion appears only in the response-success render branch", () => {
  const waitingBranch = uploadSource.slice(
    uploadSource.indexOf("{isProcessing ? ("),
    uploadSource.indexOf(") : (", uploadSource.indexOf("{isProcessing ? (")),
  );
  assert.doesNotMatch(waitingBranch, /บันทึกธุรกรรม Blockchain สำเร็จ/);
  assert.match(uploadSource, /บันทึกข้อมูลสำเร็จ/);
  assert.match(uploadSource, /บันทึกธุรกรรม Blockchain สำเร็จ/);
  assert.equal((uploadSource.match(/evidenceService\.upload\(/g) ?? []).length, 1);
});

test("intentional VIEW waits for the write before navigation and has one overlay per page", () => {
  assert.match(viewProgressSource, /กำลังเปิดหลักฐาน/);
  assert.match(viewProgressSource, /ส่งคำขอเข้าถึงแล้ว/);
  assert.match(viewProgressSource, /รายการเข้าดูถูกส่งแล้วและกำลังรอ Blockchain ยืนยัน/);
  assert.match(viewProgressSource, /เครือข่ายยังไม่สามารถสร้าง Block ใหม่ได้/);
  // มีที่เดียวที่ยิงและรอ VIEW — ไม่ให้ตรรกะนี้ถูกคัดลอกไปตามหน้าต่าง ๆ
  assert.equal((viewSessionSource.match(/waitForConfirmedViewSession\(/g) ?? []).length, 1);
  // ต้องบันทึกเสร็จก่อนจึงเปลี่ยนหน้า
  assert.ok(
    viewHookSource.indexOf("await recordView") < viewHookSource.indexOf("router.push"),
  );
  assert.match(viewSessionSource, /crypto\.randomUUID\(\)/);
  assert.match(viewSessionSource, /viewRequestStorageKey\(user\.user_id, evidenceId\)/);
  assert.match(viewSessionSource, /synchronizeViewRequestUser\(user\.user_id\)/);
  assert.match(viewSessionSource, /pendingSession\.access_log_id/);
  assert.match(viewProgressSource, /Blockchain ใช้เวลายืนยันนานกว่าปกติ/);
  assert.match(viewProgressSource, /โดยไม่สร้างรายการใหม่/);
  assert.match(viewSessionSource, /BLOCKCHAIN_STALLED/);
  assert.match(viewSessionSource, /ยังไม่พร้อมยืนยันรายการใหม่/);
  assert.equal((caseDetailSource.match(/<IntentionalEvidenceProgress/g) ?? []).length, 1);
  assert.equal((evidenceDetailSource.match(/<IntentionalEvidenceProgress/g) ?? []).length, 1);
});

test("failed or non-intentional VIEW cannot navigate or create success feedback", () => {
  assert.match(viewSessionSource, /catch \(cause\)/);
  // บันทึกไม่สำเร็จ = ไม่เปลี่ยนหน้า
  assert.match(viewHookSource, /if \(!session\) return;/);
  assert.doesNotMatch(dashboardSource, /createViewSessionAndRemember|createViewSession\(/);
  assert.doesNotMatch(caseDetailSource, /createViewSessionAndRemember|createViewSession\(/);
});

test("every route into evidence detail records a VIEW before showing anything", () => {
  // ด่านสุดท้ายอยู่ที่หน้าปลายทาง ทางเข้าใหม่ ๆ จึงไม่ต้องจำว่าต้องบันทึกก่อน
  assert.match(evidenceDetailSource, /recordView\(evidence\.evidence_id\)/);
  // ยังบันทึกไม่สำเร็จ ต้องไม่ render รายละเอียดหลักฐาน
  assert.match(evidenceDetailSource, /if \(!viewRecorded\) \{/);
  assert.ok(
    evidenceDetailSource.indexOf("if (!viewRecorded) {")
      < evidenceDetailSource.indexOf("<EvidencePreviewImage"),
  );
  // การกดครั้งเดียวต้องไม่เกิดสองรายการ — ข้ามเมื่อเพิ่งบันทึกไปก่อนเปลี่ยนหน้า
  assert.match(evidenceDetailSource, /consumeViewSuccess\(evidence\.evidence_id\)/);
  // หน้าอื่นลิงก์เข้ามาตรง ๆ ได้ เพราะด่านอยู่ปลายทาง
  assert.match(dashboardSource, /href: `\/evidence\/\$\{encodeURIComponent/);
});

test("watermark verification uses aggregate request progress and blocks repeat input", () => {
  assert.match(verifySource, /กำลังตรวจสอบลายน้ำดิจิทัล/);
  assert.match(verifySource, /กำลังตรวจสอบข้อมูลทั้งหมด/);
  assert.match(verifySource, /อ่านข้อมูล Watermark/);
  assert.match(verifySource, /ตรวจสอบ Download Session/);
  assert.match(verifySource, /เปรียบเทียบ SHA-256/);
  assert.match(verifySource, /if \(verificationInProgress\.current\) return/);
  assert.match(verifySource, /disabled=\{isVerifying\}/);
  assert.doesNotMatch(verifySource, /setTimeout|setInterval/);
  assert.doesNotMatch(verifySource, /Static.*state: "completed"|Dynamic.*state: "completed"/s);
});

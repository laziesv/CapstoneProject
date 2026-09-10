import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  blockchainExplorerHref,
  blockchainIndexValue,
  blockchainExplorerPath,
  compactBlockchainValue,
  isBlockchainSearchType,
} from "../src/utils/blockchainExplorer.ts";

const bytes32 = `0x${"a".repeat(64)}`;
const evidenceId = "11111111-1111-4111-8111-111111111111";

test("builds explicit endpoints for all five explorer search modes", () => {
  assert.equal(blockchainExplorerPath("block", "21551"), "/api/blockchain/block/21551");
  assert.equal(blockchainExplorerPath("transaction", bytes32), `/api/blockchain/transaction/${bytes32}`);
  assert.equal(blockchainExplorerPath("evidence", evidenceId), `/api/blockchain/evidence/${evidenceId}`);
  assert.equal(blockchainExplorerPath("evidence-ref", bytes32), `/api/blockchain/evidence-ref/${bytes32}`);
  assert.equal(blockchainExplorerPath("access-session", bytes32), `/api/blockchain/access-session/${bytes32}`);
});

test("rejects malformed values before making an RPC request", () => {
  assert.throws(() => blockchainExplorerPath("block", "-1"));
  assert.throws(() => blockchainExplorerPath("evidence", "not-a-uuid"));
  assert.throws(() => blockchainExplorerPath("transaction", "0x1234"));
  assert.throws(() => blockchainExplorerPath("access-session", "a".repeat(64)));
});

test("creates stable Explorer deep links", () => {
  assert.equal(
    blockchainExplorerHref("transaction", bytes32),
    `/blockchain?type=transaction&value=${encodeURIComponent(bytes32)}`,
  );
  assert.equal(isBlockchainSearchType("access-session"), true);
  assert.equal(isBlockchainSearchType("wallet"), false);
});

test("formats blockchain references and indices without fabricating zero", () => {
  assert.equal(compactBlockchainValue(`0x${"5e18"}${"a".repeat(56)}ae53`), "0x5e18...ae53");
  assert.equal(blockchainIndexValue(0), "0");
  assert.equal(blockchainIndexValue(7), "7");
  assert.equal(blockchainIndexValue(null), "—");
  assert.equal(blockchainIndexValue(undefined), "—");
});

test("admin navigation includes the read-only Blockchain Explorer", async () => {
  const source = await readFile(new URL("../src/components/layout/Sidebar.tsx", import.meta.url), "utf8");
  assert.match(source, /href: "\/blockchain"/);
  assert.match(source, /isAdmin \? \[\.\.\.navItems, \.\.\.adminItems\] : navItems/);
});

test("Explorer exposes explicit selectors and separate loading/error results", async () => {
  const source = await readFile(new URL("../src/app/(protected)/(admin)/blockchain/page.tsx", import.meta.url), "utf8");
  for (const label of ["Block Number", "Transaction Hash", "Evidence ID", "Evidence Ref", "Access Session Ref"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /กำลังอ่านข้อมูลจาก Blockchain/);
  assert.match(source, /userFacingApiError/);
  assert.match(source, /URLSearchParams\(window\.location\.search\)/);
  assert.match(source, /ข้อมูลหลักฐานที่เกี่ยวข้อง/);
  assert.match(source, /ข้อมูลนี้มาจาก EvidenceRecord ของหลักฐานที่เกี่ยวข้อง/);
  assert.match(source, /ไม่พบข้อมูล EvidenceRecord/);
  assert.match(source, /ข้อมูลโปรไฟล์เป็นข้อมูลผู้ใช้ปัจจุบันจากระบบ/);
  assert.match(source, /รายละเอียดทางเทคนิค/);
  assert.doesNotMatch(source, /ดูค่าเต็ม|คัดลอกค่าเต็ม/);
  assert.match(source, /title=\{value\}/);
  assert.match(source, /copyTextWithFeedback\(value\)/);
});

test("Verify shows Evidence ID as primary metadata and only one mismatch detail source", async () => {
  const source = await readFile(new URL("../src/app/(protected)/(admin)/verify/page.tsx", import.meta.url), "utf8");
  const evidenceSection = source.slice(source.indexOf('title="ข้อมูลหลักฐาน"'), source.indexOf('title="ผู้อัปโหลดหลักฐาน"'));
  assert.ok(evidenceSection.indexOf('label="หมายเลขหลักฐาน"') < evidenceSection.indexOf('label="Evidence ID"'));
  assert.ok(evidenceSection.indexOf('label="Evidence ID"') < evidenceSection.indexOf('label="ชื่อไฟล์ต้นฉบับ"'));
  assert.match(evidenceSection, /<IntegrityMismatchTable mismatches=\{result\.originalIntegrityMismatches\}/);
  assert.doesNotMatch(evidenceSection, /ค่า SHA-256 ที่ใช้เปรียบเทียบ/);
  assert.equal((evidenceSection.match(/currentOriginalHash/g) ?? []).length, 0);
  assert.equal((evidenceSection.match(/databaseOriginalHash/g) ?? []).length, 0);
  assert.equal((evidenceSection.match(/blockchainEvidenceHash/g) ?? []).length, 0);
  assert.doesNotMatch(source, /confirmed V3 access transaction/i);
  assert.match(source, /พบรายการบน Blockchain แต่ข้อมูลปัจจุบันในระบบไม่ตรงกับข้อมูลอ้างอิง/);
});

test("Explorer renders raw Blockchain event fields before supporting profiles", async () => {
  const source = await readFile(new URL("../src/app/(protected)/(admin)/blockchain/page.tsx", import.meta.url), "utf8");
  const registryEvent = source.slice(source.indexOf("function RegistryEvent"), source.indexOf("function EvidenceResult"));
  assert.ok(registryEvent.indexOf("EvidenceRecorded Event") < registryEvent.indexOf("<ProfileSection"));
  assert.ok(registryEvent.indexOf("EvidenceAccessRecorded Event") < registryEvent.indexOf("<ProfileSection"));
  for (const field of ["Evidence Ref", "Evidence Hash", "Uploader Ref", "Officer Ref", "Access Session Ref", "Transaction Hash", "Block Number", "Recorded At"]) {
    assert.match(registryEvent, new RegExp(field));
  }
  assert.match(source, /title="ผู้อัปโหลด"/);
  assert.match(source, /title="ผู้ดำเนินการ"/);
  assert.match(source, /EvidenceRecord บน Blockchain/);
});

test("personalized verification renders chain history and matched download marker", async () => {
  const source = await readFile(new URL("../src/app/(protected)/(admin)/verify/page.tsx", import.meta.url), "utf8");
  assert.match(source, /ประวัติการเข้าถึงก่อนการดาวน์โหลดนี้/);
  assert.match(source, /รายการดาวน์โหลดที่ตรงกับ Watermark/);
  assert.match(source, /blockchainAccessHistory/);
  assert.match(source, /blockchainExplorerHref/);
});

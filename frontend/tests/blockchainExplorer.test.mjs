import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  blockchainExplorerHref,
  blockchainExplorerPath,
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
});

test("personalized verification renders chain history and matched download marker", async () => {
  const source = await readFile(new URL("../src/app/(protected)/(admin)/verify/page.tsx", import.meta.url), "utf8");
  assert.match(source, /ประวัติการเข้าถึงก่อนการดาวน์โหลดนี้/);
  assert.match(source, /รายการดาวน์โหลดที่ตรงกับ Watermark/);
  assert.match(source, /blockchainAccessHistory/);
  assert.match(source, /blockchainExplorerHref/);
});

// ── mock: ตรวจสอบความสมบูรณ์กับบล็อกเชน ──────────────────
// ยังไม่มีระบบบล็อกเชนจริง — จำลองผลตรง/ไม่ตรงแบบ deterministic ต่อ evidence_id
// (seeded) เพื่อโชว์ทั้งกรณีปกติและถูกแก้ไข
// TODO(backend): ลบทั้งไฟล์นี้เมื่อมี endpoint ดึงแฮชไฟล์/แฮชของแต่ละ log จากเชนจริงมาเทียบ
//                (เทียบทีละรายการ หรือคำนวณ merkle root ของ log ทั้งชุดแล้วเทียบ root เดียว)

import type {
  EvidenceItem,
  AccessLog,
  BlockchainVerification,
  LogAuditEntry,
} from "@/interfaces";
import { mockTx } from "@/utils/mockData";

/** string → seed 32-bit (djb2) ให้ผลคงที่ต่อ id เดียวกัน */
function seedOf(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

/** PRNG จาก seed — mulberry32 (คืน 0..1 คงที่ตาม seed) */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** hex ความยาว len ที่ derive จาก key แบบคงที่ (ใช้ตอนไม่มีค่าจริง) */
function derivedHex(key: string, len: number): string {
  const rand = mulberry32(seedOf(key));
  let out = "";
  while (out.length < len) out += Math.floor(rand() * 16).toString(16);
  return out.slice(0, len);
}

/** เทียบ 2 ชั้น: แฮชไฟล์ + access log ทีละรายการ (audit trail) */
export async function mockVerifyOnChain(
  evidence: EvidenceItem,
  logs: AccessLog[]
): Promise<BlockchainVerification> {
  await new Promise((r) => setTimeout(r, 700)); // จำลองเวลา query เชน

  const rand = mulberry32(seedOf(evidence.evidence_id));
  // ส่วนใหญ่ผ่าน (~75%) — บางชิ้นมีปัญหาเพื่อสาธิตการจับการดัดแปลง
  // เมื่อมีปัญหา ปกติจะเพี้ยนแค่ด้านเดียว (ไฟล์ หรือ log) นานๆ ทีถึงเพี้ยนทั้งคู่
  let fileMatch = true;
  let logIssue = false;
  if (rand() < 0.25) {
    const which = rand();
    if (which < 0.45) fileMatch = false;
    else if (which < 0.9) logIssue = true;
    else { fileMatch = false; logIssue = true; }
  }

  const currentHash =
    evidence.file_hash_sha256 ?? derivedHex(evidence.evidence_id, 64);
  // ไม่ตรง = แฮชที่บันทึกบนเชนต่างจากไฟล์ปัจจุบัน (ไฟล์ถูกแก้)
  const recordedHash = fileMatch
    ? currentHash
    : derivedHex(`${evidence.evidence_id}:tampered`, 64);

  // ── เทียบ access log ทีละรายการ ──
  // แฮชของแต่ละบันทึก = แฮชจากเนื้อหา log (mock: derive จาก log_id + ข้อมูลสำคัญ)
  const logEntries: LogAuditEntry[] = logs.map((l) => ({
    label: `${l.user_name ?? "—"} · ${l.action} · ${new Date(l.accessed_at).toLocaleString("th-TH")}`,
    hash: `0x${derivedHex(`${l.log_id}|${l.action}|${l.accessed_at}`, 64)}`,
    status: "match" as const,
  }));

  // จำลองความผิดปกติแบบคงที่ต่อ evidence (เฉพาะเมื่อ logIssue และมี log ให้เทียบ)
  if (logIssue && logEntries.length > 0) {
    if (rand() < 0.5) {
      // ถูกแก้: บันทึกยังอยู่แต่แฮชไม่ตรงกับที่ขึ้นเชนไว้ (แก้ทีหลัง) — จำนวนเท่าเดิม
      const idx = Math.floor(rand() * logEntries.length);
      logEntries[idx].status = "altered";
    } else {
      // ถูกลบ: บนเชนมีบันทึกที่หายไปจากระบบ — เพิ่มรายการ missing (ไม่มีคู่ในระบบ)
      logEntries.push({
        label: "บันทึกที่หายไปจากระบบ (พบบนเชน)",
        hash: `0x${derivedHex(`${evidence.evidence_id}:missing`, 64)}`,
        status: "missing",
      });
    }
  }
  const logMatch = logEntries.every((e) => e.status === "match");
  const localLogCount = logs.length;
  const onChainLogCount = logEntries.filter((e) => e.status !== "altered").length;

  // ใช้ธุรกรรม upload จริงใน mockTx ถ้ามี ไม่มีก็ derive แบบคงที่
  const tx = mockTx.find(
    (t) => t.evidence_id === evidence.evidence_id && t.action_type === "upload"
  );

  return {
    verified: fileMatch && logMatch,
    fileMatch,
    recordedHash,
    currentHash,
    logMatch,
    localLogCount,
    onChainLogCount,
    logEntries,
    txHash: tx?.tx_hash ?? `0x${derivedHex(evidence.evidence_id, 64)}`,
    blockNumber: tx?.block_number ?? 18_450_000 + (seedOf(evidence.evidence_id) % 500_000),
    blockTimestamp: tx?.block_timestamp ?? evidence.uploaded_at,
    contractAddress: tx?.contract_address ?? "0x5b8da53d35a0993d44c1825c3ed955525a",
    network: "DEVA Private Chain",
    confirmations: 12 + (seedOf(evidence.evidence_id) % 240),
  };
}

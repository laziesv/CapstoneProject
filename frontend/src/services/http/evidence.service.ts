// ── Evidence service ────────────────────────────────────
// เชื่อมกับ API จริงแล้ว (ยกเว้น blockchain transactions ที่ยังไม่มี endpoint)
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │ endpoint ที่ backend มีอยู่ตอนนี้                                      │
// ├──────────────────────────────────────────────────────────────────────┤
// │ GET  /api/evidences?case_id={uuid}  → EvidenceApiResponse[]          │
// │      ต้อง auth · ไม่ส่ง case_id = คืนทั้งหมด                          │
// │ POST /api/evidences/upload          → EvidenceApiResponse            │
// │      ต้อง auth · multipart: file (1 ไฟล์ต่อ 1 request)                │
// │              + evidence = JSON string ของ                            │
// │                { case_id, description?, captured_at? }               │
// │      uploaded_by มาจาก token (ไม่ต้องส่ง) · server คำนวณ SHA-256 จริง  │
// │ GET  /api/evidences/{id}            → EvidenceApiResponse (+log VIEW) │
// │ GET  /api/evidence-files/{file_id}?action=download → ไฟล์ (+log DL)   │
// └──────────────────────────────────────────────────────────────────────┘
//
// TODO(backend): ยังไม่มี endpoint blockchain — transactionsOf และ verifyOnChain ยัง mock

import type {
  EvidenceItem,
  BlockchainTx,
  BlockchainVerification,
  LogAuditEntry,
  AccessLog,
  UploadEvidenceInput,
  UploadedEvidenceRef,
  EvidenceApiResponse,
} from "@/interfaces";
import { API_BASE } from "@/config";
import { mockTx } from "@/utils/mockData";
import { request, ApiError } from "./client";

/** สุ่ม hex — ใช้เฉพาะ tx/block ที่ยังไม่มี endpoint จริง
 *  TODO(backend): ลบทิ้งเมื่อมี blockchain endpoint */
function randomHex(len: number): string {
  const bytes = new Uint8Array(len / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ── helper สำหรับ mock blockchain verification (deterministic ต่อ evidence_id) ──
// TODO(backend): ลบทั้งบล็อกนี้เมื่อมี endpoint เทียบแฮช/log จริงบนบล็อกเชน

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

/** แปลงรูปแบบของ backend → รูปแบบที่ frontend ใช้ทั้งระบบ */
function toEvidence(dto: EvidenceApiResponse): EvidenceItem {
  return {
    evidence_id: dto.evidence_id,
    evidence_number: dto.evidence_number,
    case_id: dto.case_id,
    case_number: dto.case_number ?? undefined,
    uploaded_by: dto.uploaded_by,
    officer_name: dto.officer_name ?? undefined,
    description: dto.description ?? "",
    original_filename: dto.original_filename ?? "",
    is_watermarked: dto.is_watermarked,
    is_blockchain_verified: dto.is_blockchain_verified,
    uploaded_at: dto.uploaded_at,
    captured_at: dto.captured_at ?? undefined,
    file_hash_sha256: dto.file_hash ?? undefined,
    file_size_bytes: dto.file_size_bytes ?? undefined,
    // ไฟล์เสิร์ฟผ่าน endpoint แยก — ใช้ไฟล์ที่ฝังลายน้ำแล้ว (display_file_id)
    // เพื่อให้ภาพที่โชว์และดาวน์โหลดมีลายน้ำติดไปด้วย (fallback file_id ถ้าไม่มี)
    thumbnail_url: (dto.display_file_id ?? dto.file_id)
      ? `${API_BASE}/api/evidence-files/${dto.display_file_id ?? dto.file_id}`
      : undefined,
  };
}

export const evidenceService = {
  /** รายการหลักฐาน (กรองตามคดีได้ — กรองฝั่ง server) */
  async list(filters: { case_id?: string } = {}): Promise<EvidenceItem[]> {
    const qs = filters.case_id ? `?case_id=${encodeURIComponent(filters.case_id)}` : "";
    const data = await request<EvidenceApiResponse[]>(`/api/evidences${qs}`);
    return data.map(toEvidence);
  },

  /** หลักฐานตาม id (undefined ถ้าไม่พบ)
   *  เปิดหน้านี้ = server บันทึก VIEW log ให้อัตโนมัติ (เลี่ยงไม่ได้) */
  async get(id: string): Promise<EvidenceItem | undefined> {
    try {
      const dto = await request<EvidenceApiResponse>(`/api/evidences/${id}`);
      return toEvidence(dto);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return undefined;
      throw e;
    }
  },

  /** อัพโหลดหลักฐานใหม่ — ยิงทีละไฟล์เพราะ endpoint รับครั้งละ 1 ไฟล์ */
  async upload(input: UploadEvidenceInput): Promise<UploadedEvidenceRef[]> {
    const refs: UploadedEvidenceRef[] = [];

    for (const item of input.files) {
      const form = new FormData();
      form.append("file", item.file);
      form.append(
        "evidence",
        JSON.stringify({
          case_id: input.case_id,
          description: item.description || null,
          captured_at: item.captured_at || null,
        })
      );

      const dto = await request<EvidenceApiResponse>("/api/evidences/upload", {
        method: "POST",
        body: form,
      });

      refs.push({
        original_filename: dto.original_filename ?? item.file.name,
        evidence_number: dto.evidence_number,
        // SHA-256 จริงที่ server คำนวณจากไฟล์ที่บันทึกไว้
        file_hash_sha256: dto.file_hash ?? "",
        // TODO(backend): ใช้ค่าจริงเมื่อมี blockchain endpoint
        tx_hash: `0x${randomHex(40)}`,
        block_number: 18450 + Math.floor(Math.random() * 500),
      });
    }

    return refs;
  },

  /** ธุรกรรม blockchain ของหลักฐานชิ้นนั้น — ยัง mock (ไม่มี endpoint) */
  async transactionsOf(evidenceId: string): Promise<BlockchainTx[]> {
    return mockTx.filter((t) => t.evidence_id === evidenceId);
  },

  /** ตรวจสอบความสมบูรณ์กับบล็อกเชน — เทียบ 2 ชั้น: แฮชไฟล์ + access log ทีละรายการ (audit trail)
   *  ยัง mock: ผลตรง/ไม่ตรงคงที่ต่อ evidence_id (seeded) เพื่อโชว์ทั้งกรณีปกติและถูกแก้ไข
   *  TODO(backend): แทนที่ด้วย endpoint ที่ดึงแฮชไฟล์/แฮชของแต่ละ log จากเชนจริงมาเทียบ
   *  (เทียบทีละรายการ หรือคำนวณ merkle root ของ log ทั้งชุดแล้วเทียบ root เดียว) */
  async verifyOnChain(
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
    // มี log ให้เทียบแต่ระบบว่าง (logIssue) แต่ยังไม่มี log จริง → ถือว่าตรวจไม่ได้ = ผ่าน
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
  },
};

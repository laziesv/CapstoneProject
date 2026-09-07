import type { BlockchainSearchType } from "@/interfaces";

const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export function blockchainExplorerPath(
  type: BlockchainSearchType,
  rawValue: string,
): string {
  const value = rawValue.trim();
  if (type === "block") {
    if (!/^\d+$/.test(value)) throw new Error("กรุณาระบุ Block Number เป็นเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
    return `/api/blockchain/block/${value}`;
  }
  if (type === "evidence") {
    if (!UUID_PATTERN.test(value)) throw new Error("รูปแบบ Evidence ID ไม่ถูกต้อง");
    return `/api/blockchain/evidence/${encodeURIComponent(value)}`;
  }
  if (!BYTES32_PATTERN.test(value)) {
    throw new Error(
      type === "transaction"
        ? "รูปแบบ Transaction Hash ไม่ถูกต้อง"
        : "ค่าที่ค้นหาต้องเป็น 0x ตามด้วย hexadecimal 64 ตัว",
    );
  }
  const routes = {
    transaction: "transaction",
    "evidence-ref": "evidence-ref",
    "access-session": "access-session",
  } as const;
  return `/api/blockchain/${routes[type]}/${encodeURIComponent(value.toLowerCase())}`;
}

export function blockchainExplorerHref(
  type: BlockchainSearchType,
  value: string,
): string {
  return `/blockchain?type=${type}&value=${encodeURIComponent(value)}`;
}

export function isBlockchainSearchType(value: string | null): value is BlockchainSearchType {
  return ["block", "transaction", "evidence", "evidence-ref", "access-session"].includes(value || "");
}

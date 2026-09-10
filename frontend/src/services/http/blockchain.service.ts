import type {
  BlockchainAccessSessionResult,
  BlockchainBlockResult,
  BlockchainEvidenceResult,
  BlockchainOverview,
  BlockchainSearchResult,
  BlockchainSearchType,
  BlockchainTransactionResult,
} from "@/interfaces";
import { blockchainExplorerPath } from "@/utils/blockchainExplorer";
import { request } from "./client";

export const blockchainService = {
  overview: () => request<BlockchainOverview>("/api/blockchain/overview"),

  async search(type: BlockchainSearchType, value: string): Promise<BlockchainSearchResult> {
    const path = blockchainExplorerPath(type, value);
    if (type === "block") {
      return { type, data: await request<BlockchainBlockResult>(path) };
    }
    if (type === "transaction") {
      return { type, data: await request<BlockchainTransactionResult>(path) };
    }
    if (type === "access-session") {
      return { type, data: await request<BlockchainAccessSessionResult>(path) };
    }
    return { type, data: await request<BlockchainEvidenceResult>(path) };
  },
};

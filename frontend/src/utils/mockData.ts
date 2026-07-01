import { Case, EvidenceItem, BlockchainTx, AccessLog } from "@/interfaces";

export const currentUser = {
  user_id: "u-001",
  username: "somchai.k",
  email: "somchai@police.go.th",
  full_name: "ร.ต.อ.สมชาย แก้วมณี",
  badge_number: "OFF-2847",
  rank: "ร้อยตำรวจเอก",
  department: "กองพิสูจน์หลักฐาน",
  role: "officer" as const,
  is_active: true,
};

export const mockCases: Case[] = [
  { case_id: "c-001", case_number: "CASE-2026-0042", title: "คดีลักทรัพย์ ซ.สุขุมวิท 23", description: "เหตุลักทรัพย์ภายในอาคารพาณิชย์", status: "investigating", created_by: "u-001", assigned_officer: "u-001", incident_date: "2026-04-10", location: "ซ.สุขุมวิท 23 กรุงเทพฯ", created_at: "2026-04-11T08:00:00Z", evidence_count: 8 },
  { case_id: "c-002", case_number: "CASE-2026-0058", title: "คดีทำร้ายร่างกาย ตลาดนัด", description: "เหตุทำร้ายร่างกายบริเวณตลาดนัด", status: "open", created_by: "u-001", assigned_officer: "u-001", incident_date: "2026-04-22", location: "ตลาดนัดจตุจักร กรุงเทพฯ", created_at: "2026-04-22T14:30:00Z", evidence_count: 3 },
  { case_id: "c-003", case_number: "CASE-2026-0061", title: "คดีวิ่งราวทรัพย์ สยามสแควร์", description: "เหตุวิ่งราวทรัพย์บริเวณทางเดินสยามสแควร์", status: "open", created_by: "u-002", assigned_officer: "u-001", incident_date: "2026-04-28", location: "สยามสแควร์ กรุงเทพฯ", created_at: "2026-04-28T10:15:00Z", evidence_count: 5 },
  { case_id: "c-004", case_number: "CASE-2025-0189", title: "คดียาเสพติด ลาดพร้าว", description: "จับกุมยาเสพติดย่านลาดพร้าว", status: "closed", created_by: "u-001", assigned_officer: "u-001", incident_date: "2025-12-05", location: "ลาดพร้าว กรุงเทพฯ", created_at: "2025-12-05T16:00:00Z", evidence_count: 12 },
];

export const mockEvidence: EvidenceItem[] = [
  { evidence_id: "e-001", evidence_number: "EV-2026-00101", case_id: "c-001", case_number: "CASE-2026-0042", uploaded_by: "u-001", officer_name: "ร.ต.อ.สมชาย", category: "crime_scene", description: "ภาพถ่ายจุดเกิดเหตุ ประตูหน้าร้าน", original_filename: "scene_001.jpg", file_hash_sha256: "a3f2c8d1e5b94f7a6c0d3e8b1f4a7c2d5e8b0f3a6c9d2e5b8a1c4f7d0e3b6a9", file_size_bytes: 4200000, status: "verified", is_watermarked: true, is_blockchain_verified: true, thumbnail_url: "/evidence/crime_scene_shop.png", captured_at: "2026-04-10T14:23:00Z", uploaded_at: "2026-04-11T08:15:00Z" },
  { evidence_id: "e-002", evidence_number: "EV-2026-00102", case_id: "c-001", case_number: "CASE-2026-0042", uploaded_by: "u-001", officer_name: "ร.ต.อ.สมชาย", category: "forensic", description: "ลายนิ้วมือบริเวณลูกบิดประตู", original_filename: "fingerprint_door.jpg", file_hash_sha256: "b4e3d9a2f6c05e8b7d1a4f7c0e3b6a9d2f5c8b1e4a7d0c3f6b9a2e5d8c1f4a7", file_size_bytes: 3100000, status: "verified", is_watermarked: true, is_blockchain_verified: true, thumbnail_url: "/evidence/fingerprint_evidence.png", captured_at: "2026-04-10T14:45:00Z", uploaded_at: "2026-04-11T08:20:00Z" },
  { evidence_id: "e-003", evidence_number: "EV-2026-00103", case_id: "c-001", case_number: "CASE-2026-0042", uploaded_by: "u-001", officer_name: "ร.ต.อ.สมชาย", category: "surveillance", description: "ภาพจากกล้องวงจรปิดด้านหน้าร้าน", original_filename: "cctv_front.jpg", file_hash_sha256: "c5f4e0b3a7d16f9c8e2b5a8d1f4c7e0b3a6d9c2f5e8b1a4d7f0c3e6b9a2d5c8", file_size_bytes: 5500000, status: "pending", is_watermarked: true, is_blockchain_verified: false, thumbnail_url: "/evidence/cctv_footage.png", captured_at: "2026-04-10T13:00:00Z", uploaded_at: "2026-04-12T09:00:00Z" },
  { evidence_id: "e-004", evidence_number: "EV-2026-00201", case_id: "c-002", case_number: "CASE-2026-0058", uploaded_by: "u-001", officer_name: "ร.ต.อ.สมชาย", category: "crime_scene", description: "ภาพถ่ายจุดเกิดเหตุภายในตลาด", original_filename: "market_scene.jpg", file_hash_sha256: "d6a5f1c4b8e27a0d9f3c6b9e2a5d8f1c4b7e0a3d6c9f2b5e8a1d4c7f0b3e6a9", file_size_bytes: 3800000, status: "verified", is_watermarked: true, is_blockchain_verified: true, thumbnail_url: "/evidence/market_crime_scene.png", captured_at: "2026-04-22T15:10:00Z", uploaded_at: "2026-04-22T16:00:00Z" },
  { evidence_id: "e-005", evidence_number: "EV-2026-00301", case_id: "c-003", case_number: "CASE-2026-0061", uploaded_by: "u-001", officer_name: "ร.ต.อ.สมชาย", category: "surveillance", description: "กล้องวงจรปิด ทางเดินสยามสแควร์", original_filename: "siam_cctv_01.jpg", file_hash_sha256: "e7b6a2d5c9f38b1e0a4d7c0f3b6e9a2d5c8f1b4e7a0d3c6f9b2e5a8d1c4f7b0", file_size_bytes: 6100000, status: "flagged", is_watermarked: false, is_blockchain_verified: false, thumbnail_url: "/evidence/siam_cctv.png", captured_at: "2026-04-28T09:30:00Z", uploaded_at: "2026-04-29T10:00:00Z" },
  { evidence_id: "e-006", evidence_number: "EV-2026-00302", case_id: "c-003", case_number: "CASE-2026-0061", uploaded_by: "u-001", officer_name: "ร.ต.อ.สมชาย", category: "document", description: "ใบแจ้งความ เหตุวิ่งราวทรัพย์", original_filename: "report_doc.jpg", file_hash_sha256: "f8c7b3e6d0a49c2f1b5e8a1d4c7f0b3e6a9d2c5f8b1e4a7d0c3f6b9a2e5d8c1", file_size_bytes: 1200000, status: "pending", is_watermarked: false, is_blockchain_verified: false, thumbnail_url: "/evidence/police_report_doc.png", captured_at: "2026-04-28T11:00:00Z", uploaded_at: "2026-04-29T10:05:00Z" },
];

export const mockTx: BlockchainTx[] = [
  { tx_internal_id: "tx-001", tx_hash: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b", evidence_id: "e-001", evidence_number: "EV-2026-00101", initiated_by: "u-001", officer_name: "ร.ต.อ.สมชาย", action_type: "upload", block_number: 18234501, contract_address: "0x5b8da53d35a0993d44c1825c3ed955525a", status: "confirmed", gas_used: 52341, block_timestamp: "2026-04-11T08:15:30Z" },
  { tx_internal_id: "tx-002", tx_hash: "0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c", evidence_id: "e-001", evidence_number: "EV-2026-00101", initiated_by: "u-002", officer_name: "พ.ต.ท.สมศักดิ์", action_type: "access", block_number: 18234892, contract_address: "0x5b8da53d35a0993d44c1825c3ed955525a", status: "confirmed", gas_used: 21050, block_timestamp: "2026-04-12T10:30:00Z" },
  { tx_internal_id: "tx-003", tx_hash: "0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d", evidence_id: "e-002", evidence_number: "EV-2026-00102", initiated_by: "u-001", officer_name: "ร.ต.อ.สมชาย", action_type: "upload", block_number: 18234510, contract_address: "0x5b8da53d35a0993d44c1825c3ed955525a", status: "confirmed", gas_used: 52100, block_timestamp: "2026-04-11T08:20:15Z" },
  { tx_internal_id: "tx-004", tx_hash: "0x4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e", evidence_id: "e-004", evidence_number: "EV-2026-00201", initiated_by: "u-001", officer_name: "ร.ต.อ.สมชาย", action_type: "upload", block_number: 18245102, contract_address: "0x5b8da53d35a0993d44c1825c3ed955525a", status: "confirmed", gas_used: 53200, block_timestamp: "2026-04-22T16:01:00Z" },
  { tx_internal_id: "tx-005", tx_hash: "0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f", evidence_id: "e-001", evidence_number: "EV-2026-00101", initiated_by: "u-001", officer_name: "ร.ต.อ.สมชาย", action_type: "verify", block_number: 18250100, contract_address: "0x5b8da53d35a0993d44c1825c3ed955525a", status: "confirmed", gas_used: 31500, block_timestamp: "2026-04-15T09:00:00Z" },
  { tx_internal_id: "tx-006", tx_hash: "0x6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a", evidence_id: "e-003", evidence_number: "EV-2026-00103", initiated_by: "u-001", officer_name: "ร.ต.อ.สมชาย", action_type: "upload", block_number: 18251000, contract_address: "0x5b8da53d35a0993d44c1825c3ed955525a", status: "pending", gas_used: 0, block_timestamp: "2026-04-12T09:01:00Z" },
];

export const mockLogs: AccessLog[] = [
  { log_id: "l-001", user_id: "u-002", user_name: "พ.ต.ท.สมศักดิ์", evidence_id: "e-001", evidence_number: "EV-2026-00101", action: "view", ip_address: "192.168.1.45", user_agent: "Chrome/125", tx_hash: "0x2b3c4d5e6f...", result: "success", accessed_at: "2026-04-12T10:30:00Z" },
  { log_id: "l-002", user_id: "u-001", user_name: "ร.ต.อ.สมชาย", evidence_id: "e-001", evidence_number: "EV-2026-00101", action: "download", ip_address: "192.168.1.20", user_agent: "Chrome/125", tx_hash: "0x7a8b9c0d1e...", result: "success", accessed_at: "2026-04-13T11:00:00Z" },
  { log_id: "l-003", user_id: "u-003", user_name: "ด.ต.วิชัย", evidence_id: "e-002", evidence_number: "EV-2026-00102", action: "view", ip_address: "10.0.0.55", user_agent: "Firefox/130", result: "denied", accessed_at: "2026-04-14T09:15:00Z" },
  { log_id: "l-004", user_id: "u-001", user_name: "ร.ต.อ.สมชาย", evidence_id: "e-004", evidence_number: "EV-2026-00201", action: "view", ip_address: "192.168.1.20", user_agent: "Chrome/125", tx_hash: "0x8b9c0d1e2f...", result: "success", accessed_at: "2026-04-23T08:00:00Z" },
  { log_id: "l-005", user_id: "u-002", user_name: "พ.ต.ท.สมศักดิ์", evidence_id: "e-004", evidence_number: "EV-2026-00201", action: "print", ip_address: "192.168.1.45", user_agent: "Chrome/125", tx_hash: "0x9c0d1e2f3a...", result: "success", accessed_at: "2026-04-24T14:00:00Z" },
];

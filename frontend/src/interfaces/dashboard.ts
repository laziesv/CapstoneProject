// ── Dashboard interfaces (ตาม /api/dashboard) ───────────

export interface DashboardStats {
  total_evidence: number;
  active_cases: number;
  blockchain_tx: number;
  verified: number;
}

export interface RecentEvidence {
  evidence_id: string;
  evidence_number: string | null;
  description: string | null;
  thumbnail_url: string | null;
  is_watermarked: boolean;
  is_blockchain_verified: boolean;
}

export interface RecentActivity {
  log_id: string;
  user_name: string | null;
  action: string | null;
  evidence_number: string | null;
  result: string;
  accessed_at: string | null;
}

export interface DashboardData {
  stats: DashboardStats;
  recent_evidence: RecentEvidence[];
  recent_activity: RecentActivity[];
}

// ── รูปแบบดิบที่ backend คืนมาจริง (/api/dashboard) ──────
// ต่างจาก RecentEvidence ตรงที่ส่ง display_file_id มา แล้ว frontend ต่อเป็น thumbnail_url เอง
export interface RecentEvidenceApiResponse {
  evidence_id: string;
  evidence_number: string | null;
  description: string | null;
  display_file_id: string | null;
  is_watermarked: boolean;
  is_blockchain_verified: boolean;
}

export interface DashboardApiResponse {
  stats: DashboardStats;
  recent_evidence: RecentEvidenceApiResponse[];
  recent_activity: RecentActivity[];
}

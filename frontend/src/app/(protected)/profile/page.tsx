"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { authService, evidenceService, ApiError } from "@/services";
import type { EvidenceItem } from "@/interfaces";
import { labelForRole } from "@/utils/labels";

export default function ProfilePage() {
  const { user: u, signOut } = useAuth();
  const [myEvidence, setMyEvidence] = useState<EvidenceItem[] | null>(null);

  // กิจกรรมจริงของฉัน — นับหลักฐานที่ "ฉัน" อัปโหลด (จากชุดที่มองเห็นได้ตามสิทธิ์)
  // TODO(backend): ดึงทั้ง collection มานับ 2 ตัวเลขสิ้นเปลืองถ้า backend เป็นจริง
  //   — ขอ endpoint สรุป เช่น GET /api/users/me/stats (uploads, cases) จะเบากว่า
  useEffect(() => {
    if (!u) return;
    evidenceService
      .list()
      .then((all) => setMyEvidence(all.filter((e) => e.uploaded_by === u.user_id)))
      .catch(() => setMyEvidence([]));
  }, [u]);

  const activity = useMemo(() => {
    if (!myEvidence) return null;
    const cases = new Set(myEvidence.map((e) => e.case_id));
    return { uploads: myEvidence.length, cases: cases.size };
  }, [myEvidence]);

  if (!u) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const initial = (u.full_name || u.username || "?").trim().charAt(0);
  const role = u.role ?? "";

  return (
    <div className="space-y-5">
      {/* Breadcrumb + ออกจากระบบ */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted">บัญชี</span>
        <span className="text-muted/60">/</span>
        <span className="text-base font-semibold">โปรไฟล์</span>
        <button
          onClick={signOut}
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-[18px] text-sm font-semibold text-danger transition-colors hover:bg-danger-light"
        >
          <LogOut className="h-4 w-4" /> ออกจากระบบ
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
        {/* ── ซ้าย: ตัวตน + กิจกรรม ── */}
        <div className="space-y-4">
          {/* การ์ดตัวตน */}
          <div className="flex flex-col items-center gap-3.5 rounded-[20px] border border-border bg-surface p-7 text-center">
            <span className="flex items-center justify-center rounded-full bg-ink text-[34px] font-semibold text-white" style={{ width: 88, height: 88 }}>
              {initial}
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-xl font-semibold">{u.full_name || u.username}</span>
              <span className="font-mono text-sm text-muted">@{u.username}</span>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <span className="rounded-full bg-primary-light px-3 py-1 text-xs font-semibold text-primary">{labelForRole(role)}</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${u.is_active ? "bg-success-light text-success" : "bg-danger-light text-danger"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${u.is_active ? "bg-success" : "bg-danger"}`} />
                {u.is_active ? "บัญชีใช้งานอยู่" : "บัญชีถูกระงับ"}
              </span>
            </div>
          </div>

          {/* การ์ดกิจกรรม (สีดำ) — ข้อมูลจริงที่คำนวณได้ */}
          <div className="flex flex-col gap-4 rounded-[20px] bg-ink p-6 text-white">
            <span className="text-[15px] font-semibold">กิจกรรมของฉัน</span>
            <ActivityRow label="หลักฐานที่ฉันอัปโหลด" value={activity?.uploads} />
            <div className="h-px bg-ink-border" />
            <ActivityRow label="คดีที่เกี่ยวข้อง" value={activity?.cases} />
          </div>
        </div>

        {/* ── ขวา: ข้อมูล + ความปลอดภัย ── */}
        <div className="space-y-4">
          {/* ข้อมูลเจ้าหน้าที่ */}
          <div className="overflow-hidden rounded-[20px] border border-border bg-surface">
            <div className="border-b border-border px-6 py-5 text-base font-semibold">ข้อมูลเจ้าหน้าที่</div>
            <DetailRow label="เลขประจำตัว" mono value={u.badge_number} />
            <DetailRow label="ยศ" value={u.rank} />
            <DetailRow label="หน่วยงาน" value={u.department} />
            <DetailRow label="อีเมล" value={u.email} last />
          </div>

          {/* ความปลอดภัย — เปลี่ยนรหัสผ่าน */}
          <ChangePasswordCard />
        </div>
      </div>
    </div>
  );
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) {
      setMsg({ type: "err", text: "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร" });
      return;
    }
    if (next !== confirm) {
      setMsg({ type: "err", text: "รหัสผ่านใหม่และยืนยันไม่ตรงกัน" });
      return;
    }
    setLoading(true);
    try {
      await authService.changePassword(current, next);
      setMsg({ type: "ok", text: "เปลี่ยนรหัสผ่านสำเร็จ" });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      const text = err instanceof ApiError ? err.message : "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้";
      setMsg({ type: "err", text });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-[18px] rounded-[20px] border border-border bg-surface p-6">
      <div className="flex flex-col gap-1">
        <span className="text-base font-semibold">ความปลอดภัย</span>
        <span className="text-[13px] text-text-secondary">รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร</span>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${msg.type === "ok" ? "bg-success-light text-success" : "bg-danger-light text-danger"}`}>
          {msg.type === "ok" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <PwField className="sm:col-span-2" label="รหัสผ่านปัจจุบัน" value={current} onChange={setCurrent} autoComplete="current-password" />
        <PwField label="รหัสผ่านใหม่" value={next} onChange={setNext} autoComplete="new-password" />
        <PwField label="ยืนยันรหัสผ่านใหม่" value={confirm} onChange={setConfirm} autoComplete="new-password" />
      </div>

      <button type="submit" disabled={loading} className="flex h-12 items-center gap-2 self-start rounded-full bg-primary px-6 text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        บันทึกการเปลี่ยนแปลง
      </button>
    </form>
  );
}

function PwField({ label, value, onChange, autoComplete, className = "" }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-[13px] font-semibold">{label}</label>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        autoComplete={autoComplete}
        className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-[15px] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

function ActivityRow({ label, value }: { label: string; value?: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className="text-[22px] tabular-nums text-white">{value ?? "—"}</span>
    </div>
  );
}

function DetailRow({ label, value, mono, last }: { label: string; value?: string | null; mono?: boolean; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 px-6 py-4 ${last ? "" : "border-b border-border"}`}>
      <span className="flex-shrink-0 text-sm text-text-secondary">{label}</span>
      <span className={`min-w-0 truncate text-right text-[15px] font-semibold ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
    </div>
  );
}

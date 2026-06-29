"use client";

import { useEffect, useState } from "react";
import { Mail, Hash, Building, Star, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { getUser, authFetch, type AuthUser } from "@/lib/auth";

export default function ProfilePage() {
  const [u, setU] = useState<AuthUser | null>(null);

  useEffect(() => {
    setU(getUser());
  }, []);

  if (!u) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const initial = (u.full_name || u.username || "?").charAt(0);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-sm text-muted mt-1">ข้อมูลเจ้าหน้าที่</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
            {initial}
          </div>
          <div>
            <h2 className="text-lg font-bold">{u.full_name || u.username}</h2>
            <p className="text-sm text-muted">@{u.username}</p>
            {u.rank && (
              <span className="mt-1 inline-block rounded-full bg-primary-light px-2.5 py-0.5 text-xs font-medium text-primary">{u.rank}</span>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <InfoRow icon={Hash} label="Badge Number" value={u.badge_number} />
          <InfoRow icon={Star} label="Rank" value={u.rank} />
          <InfoRow icon={Building} label="Department" value={u.department} />
          <InfoRow icon={Mail} label="Email" value={u.email} />
        </div>
      </div>

      <ChangePasswordForm />
    </div>
  );
}

function ChangePasswordForm() {
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
      const res = await authFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: next }),
      });

      if (res.ok) {
        setMsg({ type: "ok", text: "เปลี่ยนรหัสผ่านสำเร็จ" });
        setCurrent("");
        setNext("");
        setConfirm("");
      } else {
        const data = await res.json().catch(() => ({}));
        setMsg({ type: "err", text: data.detail?.toString?.() || "เปลี่ยนรหัสผ่านไม่สำเร็จ" });
      }
    } catch {
      setMsg({ type: "err", text: "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h3 className="font-semibold mb-4">Change Password</h3>

      {msg && (
        <div className={`mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${msg.type === "ok" ? "bg-success-light text-success" : "bg-danger-light text-danger"}`}>
          {msg.type === "ok" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="space-y-3 max-w-sm">
        <div>
          <label className="text-xs font-medium text-muted">Current Password</label>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted">New Password</label>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted">Confirm New Password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-primary" />
        </div>
        <button type="submit" disabled={loading} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-60">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Update Password
        </button>
      </div>
    </form>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3">
      <Icon className="h-4 w-4 text-muted" />
      <div>
        <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
        <p className="font-medium">{value || "-"}</p>
      </div>
    </div>
  );
}

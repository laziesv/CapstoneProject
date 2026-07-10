"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { UserPlus, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { userService, ApiError } from "@/services";
import type { AuthUser } from "@/interfaces";
import { POLICE_RANKS, canCreateByRank } from "@/utils/caseAccess";
import { getSupervisorMap, setSupervisor } from "@/utils/hierarchyStore";

const ROLES = ["admin", "investigator", "officer", "viewer"];

const emptyForm = {
  username: "",
  email: "",
  password: "",
  full_name: "",
  rank: "",
  department: "",
  badge_number: "",
  role: "officer",
  supervisor: "",
};

export default function UsersPage() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // สายบังคับบัญชา (username → หัวหน้า) จาก hierarchyStore — admin เป็นผู้ควบคุม
  const [supMap, setSupMap] = useState<Record<string, string | null>>({});

  // หัวหน้าที่เลือกได้ = ผู้มียศชั้นสัญญาบัตร (คนที่สร้างคดีได้)
  const supervisorOptions = useMemo(() => users.filter((u) => canCreateByRank(u.rank)), [users]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await userService.list());
    } catch {
      // ไม่มีสิทธิ์/โหลดไม่ได้ — ปล่อยรายการว่าง
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    // อ่านสายบังคับบัญชาจาก store (client) หลัง mount
    (async () => {
      setSupMap(getSupervisorMap());
    })();
  }, []);

  // ตั้ง/แก้หัวหน้าของผู้ใช้ + อัปเดต state ให้ตารางรีเฟรชทันที
  const changeSupervisor = (username: string, supervisor: string) => {
    setSupervisor(username, supervisor);
    setSupMap((m) => ({ ...m, [username]: supervisor || null }));
  };

  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (form.password.length < 8) {
      setMsg({ type: "err", text: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" });
      return;
    }

    setSubmitting(true);
    try {
      // supervisor เก็บฝั่ง client เท่านั้น (backend ยังไม่มี field นี้) — แยกออกจาก payload
      const { supervisor, ...payload } = form;
      await userService.create(payload);
      changeSupervisor(form.username, supervisor);
      setMsg({ type: "ok", text: `เพิ่มผู้ใช้ "${form.username}" สำเร็จ` });
      setForm(emptyForm);
      loadUsers();
    } catch (err) {
      const text = err instanceof ApiError ? err.message : "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้";
      setMsg({ type: "err", text });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Manage Users</h1>
        <p className="text-sm text-muted mt-1">จัดการบัญชีเจ้าหน้าที่</p>
      </div>

      {/* Add user form */}
      <form onSubmit={submit} className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">เพิ่มผู้ใช้ใหม่</h2>
        </div>

        {msg && (
          <div className={`mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${msg.type === "ok" ? "bg-success-light text-success" : "bg-danger-light text-danger"}`}>
            {msg.type === "ok" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
            <span>{msg.text}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="ชื่อผู้ใช้ *"><input required value={form.username} onChange={set("username")} className={inputCls} autoComplete="off" /></Field>
          <Field label="อีเมล *"><input required type="email" value={form.email} onChange={set("email")} className={inputCls} autoComplete="off" /></Field>
          <Field label="รหัสผ่าน * (≥ 8 ตัว)"><input required type="password" value={form.password} onChange={set("password")} className={inputCls} autoComplete="new-password" /></Field>
          <Field label="สิทธิ์ (role)">
            <select value={form.role} onChange={set("role")} className={inputCls}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="ชื่อ-นามสกุล"><input value={form.full_name} onChange={set("full_name")} className={inputCls} /></Field>
          <Field label="ยศ">
            <select value={form.rank} onChange={set("rank")} className={inputCls}>
              <option value="">— เลือกยศ —</option>
              {POLICE_RANKS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="หน่วยงาน"><input value={form.department} onChange={set("department")} className={inputCls} /></Field>
          <Field label="เลขบัตร"><input value={form.badge_number} onChange={set("badge_number")} className={inputCls} /></Field>
          <Field label="หัวหน้า (สายบังคับบัญชา)">
            <select value={form.supervisor} onChange={set("supervisor")} className={inputCls}>
              <option value="">— ไม่มี (เป็นหัวหน้าสูงสุด) —</option>
              {supervisorOptions.map((u) => (
                <option key={u.user_id} value={u.username}>{u.full_name || u.username} ({u.rank})</option>
              ))}
            </select>
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted">* หัวหน้าเลือกได้เฉพาะผู้มียศชั้นสัญญาบัตร (ระดับที่สร้างคดีได้)</p>

        <button type="submit" disabled={submitting} className="mt-5 flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-60">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          เพิ่มผู้ใช้
        </button>
      </form>

      {/* Users table */}
      <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">รายชื่อผู้ใช้ ({users.length})</h2>
        </div>
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-5 py-3 font-medium">ผู้ใช้</th>
                <th className="px-5 py-3 font-medium">อีเมล</th>
                <th className="px-5 py-3 font-medium">หน่วยงาน</th>
                <th className="px-5 py-3 font-medium">หัวหน้า</th>
                <th className="px-5 py-3 font-medium">สิทธิ์</th>
                <th className="px-5 py-3 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.user_id} className="hover:bg-surface-hover transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium">{u.full_name || u.username}</p>
                    <p className="text-xs text-muted">@{u.username} · {u.badge_number || "-"}</p>
                  </td>
                  <td className="px-5 py-3 text-muted">{u.email}</td>
                  <td className="px-5 py-3 text-muted">{u.department || "-"}</td>
                  <td className="px-5 py-3">
                    <select
                      value={supMap[u.username] ?? ""}
                      onChange={(e) => changeSupervisor(u.username, e.target.value)}
                      className="h-8 rounded-lg border border-border bg-surface px-2 text-xs text-muted outline-none focus:border-primary"
                    >
                      <option value="">— ไม่มี —</option>
                      {supervisorOptions
                        .filter((s) => s.username !== u.username)
                        .map((s) => (
                          <option key={s.user_id} value={s.username}>{s.full_name || s.username}</option>
                        ))}
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${u.role === "admin" ? "bg-primary-light text-primary" : "bg-slate-100 text-text-secondary"}`}>{u.role}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${u.is_active ? "bg-success-light text-success" : "bg-danger-light text-danger"}`}>
                      {u.is_active ? "active" : "inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const inputCls = "mt-1 h-10 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}

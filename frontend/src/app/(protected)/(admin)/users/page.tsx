"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { UserPlus, Loader2, CheckCircle2, AlertCircle, Search, X, KeyRound, Copy } from "lucide-react";
import { copyTextWithFeedback } from "@/components/feedback/CopySuccessFeedback";
import { userService, ApiError } from "@/services";
import type { AuthUser } from "@/interfaces";
import { POLICE_RANKS } from "@/utils/caseAccess";
import { roleLabel, labelForRole } from "@/utils/labels";
import { useAuth } from "@/hooks/useAuth";

const ROLES = ["admin", "investigator", "officer"];

const emptyForm = {
  username: "",
  email: "",
  password: "",
  full_name: "",
  rank: "",
  department: "",
  badge_number: "",
  role: "officer",
  supervisor_id: "",
};

export default function UsersPage() {
  // ใช้ระบุบัญชีตัวเอง — สิทธิ์ของตัวเองแก้ไม่ได้ (backend ก็ปฏิเสธ)
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // แถวที่กำลังบันทึกอยู่ — กันกดซ้ำระหว่างรอ API
  const [savingId, setSavingId] = useState<string | null>(null);
  // ผู้ใช้ที่กำลังจะรีเซ็ตรหัส — null = ปิด dialog
  const [resetTarget, setResetTarget] = useState<AuthUser | null>(null);

  // ตัวกรอง
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // หัวหน้าตาม use case = investigator เท่านั้น
  const supervisorOptions = useMemo(() => users.filter((u) => u.role === "investigator"), [users]);

  /** หัวหน้าที่ผูกอยู่จริงแต่ไม่ได้เป็น investigator แล้ว (ข้อมูลค้างจากการถอดสิทธิ์)
   *  คืน undefined เมื่อไม่มีหัวหน้า หรือหัวหน้ายังเป็น investigator ตามปกติ */
  const staleSupervisorOf = useCallback(
    (u: AuthUser) => {
      if (!u.supervisor_id) return undefined;
      if (supervisorOptions.some((s) => s.user_id === u.supervisor_id)) return undefined;
      return users.find((candidate) => candidate.user_id === u.supervisor_id);
    },
    [users, supervisorOptions],
  );

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
    const task = window.setTimeout(() => void loadUsers(), 0);
    return () => window.clearTimeout(task);
  }, [loadUsers]);

  // สรุปสถิติ (จากข้อมูลจริง)
  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.is_active).length,
    admins: users.filter((u) => u.role === "admin").length,
    suspended: users.filter((u) => !u.is_active).length,
  }), [users]);

  // กรอง in-memory
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (q) {
        const h = [u.full_name, u.username, u.email, u.badge_number, u.department].filter(Boolean).join(" ").toLowerCase();
        if (!h.includes(q)) return false;
      }
      return true;
    });
  }, [users, roleFilter, query]);

  /** ยิง PUT แล้วเอา user ที่ backend คืนมาแทนแถวเดิม */
  const patchUser = async (
    userId: string,
    input: Parameters<typeof userService.update>[1],
    okText: string
  ) => {
    setSavingId(userId);
    setMsg(null);
    try {
      const updated = await userService.update(userId, input);
      setUsers((us) => us.map((u) => (u.user_id === userId ? updated : u)));
      setMsg({ type: "ok", text: okText });
    } catch (err) {
      const text = err instanceof ApiError ? err.message : "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้";
      setMsg({ type: "err", text });
    } finally {
      setSavingId(null);
    }
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
      // "" จาก select = ไม่มีหัวหน้า → ต้องส่ง null ไม่ใช่ "" (backend คาด UUID)
      await userService.create({ ...form, supervisor_id: form.supervisor_id || null });
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
    <div className="space-y-5">
      {/* หัวแถว: ชื่อ + ค้นหา + ปุ่มเพิ่ม */}
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-semibold">จัดการผู้ใช้</h1>
        <div className="relative min-w-[220px] flex-1 md:max-w-sm">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อ / เลขประจำตัว / อีเมล…"
            className="h-10 w-full rounded-full bg-surface-hover pl-11 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-primary/25"
          />
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setMsg(null); }}
          className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          {showForm ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          {showForm ? "ปิดฟอร์ม" : "เพิ่มผู้ใช้"}
        </button>
      </div>

      {/* การ์ดสรุป */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="ผู้ใช้ทั้งหมด" value={stats.total} />
        <StatCard label="ใช้งานอยู่" value={stats.active} valueClass="text-success" />
        <StatCard label="ผู้ดูแลระบบ" value={stats.admins} valueClass="text-primary" />
        <StatCard label="ระงับการใช้งาน" value={stats.suspended} dark />
      </div>

      {/* ฟอร์มเพิ่มผู้ใช้ (เปิด/ปิดด้วยปุ่ม) */}
      {showForm && (
        <form onSubmit={submit} className="rounded-2xl border border-border bg-surface p-6">
          <div className="mb-4 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">เพิ่มผู้ใช้ใหม่</h2>
          </div>

          {msg && (
            <div className={`mb-4 flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${msg.type === "ok" ? "bg-success-light text-success" : "bg-danger-light text-danger"}`}>
              {msg.type === "ok" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
              <span>{msg.text}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="ชื่อผู้ใช้ *"><input required value={form.username} onChange={set("username")} className={inputCls} autoComplete="off" /></Field>
            <Field label="อีเมล *"><input required type="email" value={form.email} onChange={set("email")} className={inputCls} autoComplete="off" /></Field>
            <Field label="รหัสผ่าน * (≥ 8 ตัว)"><input required type="password" value={form.password} onChange={set("password")} className={inputCls} autoComplete="new-password" /></Field>
            <Field label="สิทธิ์ (role)">
              <select value={form.role} onChange={set("role")} className={inputCls}>
                {ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]} ({r})</option>)}
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
              <select value={form.supervisor_id} onChange={set("supervisor_id")} className={inputCls}>
                <option value="">— ไม่มี (เป็นหัวหน้าสูงสุด) —</option>
                {supervisorOptions.map((u) => (
                  <option key={u.user_id} value={u.user_id}>{u.full_name || u.username} ({u.rank})</option>
                ))}
              </select>
            </Field>
          </div>
          <p className="mt-2 text-xs text-muted">* หัวหน้าเลือกได้เฉพาะผู้ใช้ role investigator เท่านั้น</p>

          <button type="submit" disabled={submitting} className="mt-5 flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            เพิ่มผู้ใช้
          </button>
        </form>
      )}

      {/* แจ้งผล (เมื่อฟอร์มปิด แต่มี action จากตาราง) */}
      {!showForm && msg && (
        <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm ${msg.type === "ok" ? "bg-success-light text-success" : "bg-danger-light text-danger"}`}>
          {msg.type === "ok" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* ตาราง */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {/* ชิปกรองตามสิทธิ์ */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
          <RoleChip active={roleFilter === "all"} onClick={() => setRoleFilter("all")}>ทั้งหมด</RoleChip>
          {ROLES.map((r) => (
            <RoleChip key={r} active={roleFilter === r} onClick={() => setRoleFilter(r)}>
              {roleLabel[r]} {users.filter((u) => u.role === r).length}
            </RoleChip>
          ))}
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-hover text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-semibold">ชื่อ</th>
                  <th className="px-5 py-3 font-semibold">เลขประจำตัว</th>
                  <th className="px-5 py-3 font-semibold">สิทธิ์</th>
                  <th className="px-5 py-3 font-semibold">หน่วยงาน</th>
                  <th className="px-5 py-3 font-semibold">หัวหน้า</th>
                  <th className="px-5 py-3 text-right font-semibold">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-muted">ไม่พบผู้ใช้</td></tr>
                ) : (
                  filtered.map((u) => (
                    <tr key={u.user_id} className="transition-colors hover:bg-surface-hover">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${u.role === "admin" ? "bg-ink text-white" : "bg-surface-hover text-foreground"}`}>
                            {(u.full_name || u.username).trim().charAt(0)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{u.full_name || u.username}</p>
                            <p className="truncate text-xs text-muted">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-text-secondary">{u.badge_number || "—"}</td>
                      <td className="px-5 py-3.5">
                        {u.user_id === currentUser?.user_id ? (
                          // บัญชีตัวเอง: backend ปฏิเสธการถอดสิทธิ์ admin ของตัวเองอยู่แล้ว
                          // แสดงเป็นป้ายแทน dropdown เพื่อไม่ให้กดแล้วเจอ error โดยไม่จำเป็น
                          <span
                            title="เปลี่ยนสิทธิ์ของบัญชีตัวเองไม่ได้"
                            className="inline-block rounded-full bg-primary-light px-2.5 py-1 text-xs font-semibold text-primary"
                          >
                            {labelForRole(u.role)}
                          </span>
                        ) : (
                          <select
                            value={u.role}
                            aria-label={`สิทธิ์ของ ${u.username}`}
                            disabled={savingId === u.user_id}
                            onChange={(e) =>
                              patchUser(u.user_id, { role: e.target.value }, `เปลี่ยนสิทธิ์ของ "${u.username}" เป็น ${labelForRole(e.target.value)} แล้ว`)
                            }
                            className="h-8 rounded-lg border border-border bg-surface px-2 text-xs font-semibold text-text-secondary outline-none focus:border-primary disabled:opacity-50"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{roleLabel[r]}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-text-secondary">{u.department || "—"}</td>
                      <td className="px-5 py-3.5">
                        <select
                          value={u.supervisor_id ?? ""}
                          disabled={savingId === u.user_id}
                          onChange={(e) =>
                            patchUser(u.user_id, { supervisor_id: e.target.value || null }, `อัปเดตหัวหน้าของ "${u.username}" แล้ว`)
                          }
                          className="h-8 max-w-[160px] rounded-lg border border-border bg-surface px-2 text-xs text-text-secondary outline-none focus:border-primary disabled:opacity-50"
                        >
                          <option value="">— ไม่มี —</option>
                          {/* หัวหน้าที่ไม่ใช่ investigator แล้ว จะไม่อยู่ใน supervisorOptions
                              ถ้าไม่ใส่ option ให้ที่นี่ select จะหา value ไม่เจอแล้วเด้งไป
                              "— ไม่มี —" เอง ทำให้หน้าเว็บบอกว่าไม่มีหัวหน้าทั้งที่มี
                              และถ้าผู้ใช้เผลอบันทึกแถวนี้ หัวหน้าจริงจะถูกล้างทิ้ง */}
                          {staleSupervisorOf(u) && (
                            <option value={staleSupervisorOf(u)!.user_id}>
                              {staleSupervisorOf(u)!.full_name || staleSupervisorOf(u)!.username} (ไม่ใช่พนักงานสืบสวนแล้ว)
                            </option>
                          )}
                          {supervisorOptions
                            .filter((s) => s.user_id !== u.user_id)
                            .map((s) => (
                              <option key={s.user_id} value={s.user_id}>{s.full_name || s.username}</option>
                            ))}
                        </select>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-3">
                        {/* รหัสของตัวเองเปลี่ยนที่หน้าโปรไฟล์ (backend ก็ปฏิเสธการรีเซ็ตตัวเอง) */}
                        {u.user_id !== currentUser?.user_id && (
                          <button
                            type="button"
                            disabled={savingId === u.user_id}
                            onClick={() => { setMsg(null); setResetTarget(u); }}
                            title={`รีเซ็ตรหัสผ่านของ ${u.username}`}
                            aria-label={`รีเซ็ตรหัสผ่านของ ${u.username}`}
                            className="rounded-full p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={savingId === u.user_id}
                          onClick={() =>
                            patchUser(u.user_id, { is_active: !u.is_active }, `${u.is_active ? "ระงับ" : "เปิดใช้"}บัญชี "${u.username}" แล้ว`)
                          }
                          title={u.is_active ? "คลิกเพื่อระงับบัญชี" : "คลิกเพื่อเปิดใช้บัญชี"}
                          className="inline-flex items-center gap-2 text-xs font-semibold transition-opacity hover:opacity-70 disabled:opacity-50"
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${u.is_active ? "bg-success" : "bg-danger"}`} />
                          <span className={u.is_active ? "text-success" : "text-danger"}>{u.is_active ? "ใช้งาน" : "ระงับ"}</span>
                        </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {resetTarget && (
        <ResetPasswordDialog user={resetTarget} onClose={() => setResetTarget(null)} />
      )}
    </div>
  );
}

/** ยืนยัน → รีเซ็ต → แสดงรหัสชั่วคราวครั้งเดียว
 *  รหัสอยู่แค่ใน state ของ dialog นี้ ปิดแล้ว component ถูกถอด รหัสหายไปด้วย */
function ResetPasswordDialog({ user, onClose }: { user: AuthUser; onClose: () => void }) {
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !working) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, working]);

  const confirm = async () => {
    setWorking(true);
    setError("");
    try {
      setTemporaryPassword(await userService.resetPassword(user.user_id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setWorking(false);
    }
  };

  const name = user.full_name || user.username;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-password-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <KeyRound aria-hidden="true" className={`mt-0.5 h-5 w-5 flex-shrink-0 ${temporaryPassword ? "text-success" : "text-primary"}`} />
          <div className="min-w-0 flex-1">
            <h2 id="reset-password-title" className="font-semibold">
              {temporaryPassword ? "รีเซ็ตรหัสผ่านแล้ว" : "รีเซ็ตรหัสผ่าน"}
            </h2>

            {temporaryPassword ? (
              <>
                <p className="mt-2 text-sm leading-6 text-muted">
                  ส่งรหัสชั่วคราวนี้ให้ <span className="font-semibold text-foreground">{name}</span> โดยตรง
                  ระบบจะให้ตั้งรหัสผ่านใหม่เมื่อเข้าสู่ระบบครั้งถัดไป
                </p>
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-surface-hover px-4 py-3">
                  <code className="flex-1 select-all font-mono text-lg tracking-wider">{temporaryPassword}</code>
                  <button
                    type="button"
                    onClick={() => void copyTextWithFeedback(temporaryPassword)}
                    title="คัดลอกรหัสชั่วคราว"
                    aria-label="คัดลอกรหัสชั่วคราว"
                    className="rounded-full p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-3 text-xs text-danger">รหัสนี้แสดงครั้งเดียว ปิดหน้าต่างแล้วจะดูอีกไม่ได้</p>
              </>
            ) : (
              <p className="mt-2 text-sm leading-6 text-muted">
                รีเซ็ตรหัสผ่านของ <span className="font-semibold text-foreground">{name}</span> ({user.username})?
                รหัสผ่านเดิมจะใช้ไม่ได้ทันที และผู้ใช้ที่เปิดระบบค้างไว้จะต้องตั้งรหัสใหม่ก่อนใช้งานต่อ
              </p>
            )}

            {error && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-danger-light px-3 py-2 text-sm text-danger" role="alert">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          {temporaryPassword ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> ส่งรหัสให้ผู้ใช้แล้ว
            </button>
          ) : (
            <>
              <button
                ref={cancelRef}
                type="button"
                onClick={onClose}
                disabled={working}
                className="rounded-lg px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={working}
                className="inline-flex items-center gap-2 rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-60"
              >
                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                รีเซ็ตรหัสผ่าน
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

const inputCls = "mt-1 h-11 w-full rounded-xl border border-border px-3.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}

function StatCard({ label, value, valueClass, dark }: { label: string; value: number; valueClass?: string; dark?: boolean }) {
  return (
    <div className={`flex flex-col gap-2 rounded-2xl border p-[18px] ${dark ? "border-ink bg-ink" : "border-border bg-surface"}`}>
      <span className={`text-[13px] ${dark ? "text-ink-muted" : "text-text-secondary"}`}>{label}</span>
      <span className={`font-mono text-[30px] leading-none ${dark ? "text-white" : valueClass ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}

function RoleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-8 rounded-full px-3.5 text-xs font-semibold transition-colors ${
        active ? "bg-ink text-white" : "bg-surface-hover text-text-secondary hover:bg-border/60"
      }`}
    >
      {children}
    </button>
  );
}

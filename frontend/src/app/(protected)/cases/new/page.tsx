"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FolderPlus, Loader2, ShieldAlert, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { caseService } from "@/services";
import { canCreateCase, subordinatesOf } from "@/utils/caseAccess";
// TODO(backend): ตัวเลือกผู้รับผิดชอบยังใช้ mockUsers — เปลี่ยนเป็น userService.list()
// เมื่อ backend มีข้อมูล supervisor/ยศ ครบชุดเดียวกับ mock
import { mockUsers } from "@/utils/mockData";
import type { CaseStatus } from "@/interfaces";

const STATUSES: CaseStatus[] = ["open", "investigating", "closed", "archived"];

const emptyForm = {
  title: "",
  description: "",
  status: "open" as CaseStatus,
  location: "",
  incident_date: "",
  assigned_officer: "",
};

export default function NewCasePage() {
  const { user } = useAuth();
  const router = useRouter();
  const allowed = user ? canCreateCase(user) : null;

  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // ตัวเลือกผู้รับผิดชอบ = ตัวเอง + ลูกน้อง
  const officerOptions = useMemo(() => {
    if (!user?.username) return [];
    const scope = [user.username, ...subordinatesOf(user.username)];
    return mockUsers.filter((u) => scope.includes(u.username));
  }, [user]);

  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (!form.title.trim()) {
      setMsg({ type: "err", text: "กรุณากรอกชื่อคดี" });
      return;
    }

    setSubmitting(true);
    try {
      const created = await caseService.create({
        title: form.title.trim(),
        description: form.description.trim(),
        status: form.status,
        location: form.location.trim(),
        incident_date: form.incident_date,
        created_by: user!.username!,
        assigned_officer: form.assigned_officer || user!.username!,
      });
      router.push(`/cases/${created.case_id}`);
    } catch {
      setMsg({ type: "err", text: "ไม่สามารถสร้างคดีได้" });
      setSubmitting(false);
    }
  };

  if (allowed === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <ShieldAlert className="h-10 w-10 text-danger" />
        <p className="text-lg font-semibold">ไม่มีสิทธิ์สร้างคดี</p>
        <p className="text-sm text-muted">
          {user?.role === "admin"
            ? "ผู้ดูแลระบบไม่มีสิทธิ์สร้างคดี"
            : "เฉพาะระดับหัวหน้า (ยศชั้นสัญญาบัตร) เท่านั้นที่สร้างคดีได้"}
        </p>
        <Link href="/cases" className="mt-2 text-sm text-primary hover:underline">← กลับไปหน้าคดี</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/cases" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary transition-colors">
        <ArrowLeft className="h-4 w-4" /> กลับไปหน้าคดี
      </Link>

      <div>
        <h1 className="text-2xl font-bold">สร้างคดีใหม่</h1>
        <p className="text-sm text-muted mt-1">ผู้สร้าง: {user?.full_name || user?.username}</p>
      </div>

      <form onSubmit={submit} className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <FolderPlus className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">รายละเอียดคดี</h2>
        </div>

        {msg && (
          <div className={`mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${msg.type === "ok" ? "bg-success-light text-success" : "bg-danger-light text-danger"}`}>
            {msg.type === "ok" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
            <span>{msg.text}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="ชื่อคดี *"><input required value={form.title} onChange={set("title")} className={inputCls} /></Field>
          </div>
          <div className="col-span-2">
            <Field label="รายละเอียด"><textarea value={form.description} onChange={set("description")} rows={3} className={`${inputCls} h-auto py-2`} /></Field>
          </div>
          <Field label="สถานะ">
            <select value={form.status} onChange={set("status")} className={inputCls}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="ผู้รับผิดชอบ">
            <select value={form.assigned_officer} onChange={set("assigned_officer")} className={inputCls}>
              <option value="">— ตัวเอง —</option>
              {officerOptions.map((u) => (
                <option key={u.username} value={u.username}>{u.full_name} ({u.rank})</option>
              ))}
            </select>
          </Field>
          <Field label="สถานที่เกิดเหตุ"><input value={form.location} onChange={set("location")} className={inputCls} /></Field>
          <Field label="วันที่เกิดเหตุ"><input type="date" value={form.incident_date} onChange={set("incident_date")} className={inputCls} /></Field>
        </div>

        <button type="submit" disabled={submitting} className="mt-5 flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-60">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          สร้างคดี
        </button>
      </form>
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

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, AlertCircle, Loader2, KeyRound } from "lucide-react";
import { getToken, getUser, setSession, logout } from "@/utils/session";
import { validateNewPassword } from "@/utils/passwordForm";
import { authService, ApiError } from "@/services";

/** หน้าบังคับตั้งรหัสผ่านใหม่ หลัง admin รีเซ็ตเป็นรหัสชั่วคราว
 *
 *  อยู่นอก (protected) เพราะ Sidebar/TopBar เรียก API ที่ backend ปฏิเสธ
 *  ด้วย PASSWORD_CHANGE_REQUIRED จนกว่าจะตั้งรหัสใหม่เสร็จ
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    // ถามสถานะจริงจาก backend — ค่าใน localStorage อาจค้างจากรอบก่อน
    authService
      .me()
      .then((user) => {
        if (!active) return;
        setSession(getToken() ?? "", user);
        if (!user.must_change_password) {
          router.replace("/dashboard");
          return;
        }
        setReady(true);
      })
      .catch(() => {
        if (active) router.replace("/login");
      });
    return () => {
      active = false;
    };
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const invalid = validateNewPassword(next, confirm);
    if (invalid) {
      setError(invalid);
      return;
    }
    setLoading(true);
    try {
      await authService.changePassword(current, next);
      const user = await authService.me();
      setSession(getToken() ?? "", user);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
      setLoading(false);
    }
  };

  const beYear = new Date().getFullYear() + 543;
  const username = getUser()?.username;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-6 sm:px-10">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink">
            <ShieldCheck className="h-5 w-5 text-white" />
          </span>
          <span className="text-lg font-bold tracking-tight">DEVA</span>
          <span className="hidden text-sm text-muted sm:inline">ระบบคลังหลักฐานดิจิทัล</span>
        </div>
        <button
          type="button"
          onClick={logout}
          className="text-sm text-text-secondary transition-colors hover:text-foreground"
        >
          ออกจากระบบ
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        {!ready ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        ) : (
          <div className="w-full max-w-[460px] rounded-3xl border border-border bg-surface p-11 shadow-sm">
            <h1 className="text-3xl font-bold tracking-tight">ตั้งรหัสผ่านใหม่</h1>
            <p className="mt-1.5 text-sm text-muted">
              {username ? `บัญชี ${username} ` : ""}ถูกรีเซ็ตรหัสผ่านโดยผู้ดูแลระบบ
              กรุณาตั้งรหัสผ่านของคุณเองก่อนใช้งานต่อ
            </p>

            <form onSubmit={submit} className="mt-7 space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-danger-light px-4 py-3 text-sm text-danger" role="alert">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <PasswordInput id="current-password" label="รหัสผ่านชั่วคราว" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
              <PasswordInput id="new-password" label="รหัสผ่านใหม่" value={next} onChange={setNext} autoComplete="new-password" />
              <PasswordInput id="confirm-password" label="ยืนยันรหัสผ่านใหม่" value={confirm} onChange={setConfirm} autoComplete="new-password" />

              <button
                type="submit"
                disabled={loading}
                className="mt-1 flex h-[56px] w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    กำลังบันทึก...
                  </>
                ) : (
                  "บันทึกรหัสผ่านใหม่"
                )}
              </button>
            </form>

            <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-surface-hover px-4 py-3 text-xs text-muted">
              <KeyRound className="h-4 w-4 flex-shrink-0" />
              <span>รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร และห้ามซ้ำกับรหัสชั่วคราว</span>
            </div>
          </div>
        )}
      </main>

      <footer className="flex flex-col items-center justify-between gap-1 bg-ink px-6 py-5 text-xs text-ink-muted sm:flex-row sm:px-10">
        <span>Blockchain &amp; Watermark-based Digital Evidence Authentication</span>
        <span>DEVA Evidence System &middot; สงวนลิขสิทธิ์ &copy; {beYear}</span>
      </footer>
    </div>
  );
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">{label}</label>
      <input
        id={id}
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[52px] w-full rounded-xl border border-border bg-surface px-4 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        required
        autoComplete={autoComplete}
        autoFocus={autoFocus}
      />
    </div>
  );
}

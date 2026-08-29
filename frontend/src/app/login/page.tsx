"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Eye, EyeOff, AlertCircle, Loader2, Lock } from "lucide-react";
import { isAuthenticated } from "@/utils/session";
import { authService, ApiError } from "@/services";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ถ้า login อยู่แล้ว เด้งเข้า dashboard เลย
  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/dashboard");
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await authService.login(username, password);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
      }
    } finally {
      setLoading(false);
    }
  };

  // ปี พ.ศ. (พุทธศักราช = ค.ศ. + 543)
  const beYear = new Date().getFullYear() + 543;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ── Top bar ── */}
      <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-6 sm:px-10">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink">
            <ShieldCheck className="h-5 w-5 text-white" />
          </span>
          <span className="text-lg font-bold tracking-tight">DEVA</span>
          <span className="hidden text-sm text-muted sm:inline">ระบบคลังหลักฐานดิจิทัล</span>
        </div>
        <span className="cursor-pointer text-sm text-text-secondary transition-colors hover:text-foreground">
          ต้องการความช่วยเหลือ?
        </span>
      </header>

      {/* ── กลางจอ: การ์ดฟอร์ม ── */}
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-[460px] rounded-3xl border border-border bg-surface p-11 shadow-sm">
          <h1 className="text-3xl font-bold tracking-tight">ลงชื่อเข้าใช้</h1>
          <p className="mt-1.5 text-sm text-muted">สำหรับเจ้าหน้าที่ผู้ได้รับอนุญาตเท่านั้น</p>

          <form onSubmit={handleLogin} className="mt-7 space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-danger-light px-4 py-3 text-sm text-danger" role="alert">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* ชื่อผู้ใช้ */}
            <div>
              <label htmlFor="username" className="mb-1.5 block text-sm font-semibold">ชื่อผู้ใช้</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-[52px] w-full rounded-xl border border-border bg-surface px-4 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                required
                autoComplete="username"
                autoFocus
              />
            </div>

            {/* รหัสผ่าน */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-semibold">รหัสผ่าน</label>
                <span className="cursor-pointer text-sm font-medium text-primary hover:underline">ลืมรหัสผ่าน</span>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-[52px] w-full rounded-xl border border-border bg-surface px-4 pr-11 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-foreground"
                  tabIndex={-1}
                  aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* ปุ่มเข้าสู่ระบบ (pill น้ำเงิน) */}
            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex h-[56px] w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  กำลังเข้าสู่ระบบ...
                </>
              ) : (
                "เข้าสู่ระบบ"
              )}
            </button>
          </form>

          {/* แจ้งเตือนการบันทึก */}
          <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-surface-hover px-4 py-3 text-xs text-muted">
            <Lock className="h-4 w-4 flex-shrink-0" />
            <span>การเข้าใช้งานทุกครั้งจะถูกบันทึกเพื่อการตรวจสอบย้อนหลัง</span>
          </div>
        </div>
      </main>

      {/* ── Footer (แถบดำ) ── */}
      <footer className="flex flex-col items-center justify-between gap-1 bg-ink px-6 py-5 text-xs text-ink-muted sm:flex-row sm:px-10">
        <span>Blockchain &amp; Watermark-based Digital Evidence Authentication</span>
        <span>DEVA Evidence System &middot; สงวนลิขสิทธิ์ &copy; {beYear}</span>
      </footer>
    </div>
  );
}

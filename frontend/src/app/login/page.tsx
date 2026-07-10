"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Eye, EyeOff, Lock, User, AlertCircle, Loader2 } from "lucide-react";
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

  return (
    <div className="login-page">
      <div className="login-shell">
        {/* ── Left: official branding ── */}
        <aside className="login-brand">
          <div className="login-emblem">
            <ShieldCheck />
          </div>

          <h1 className="login-title">DEVA</h1>
          <p className="login-subtitle">
            คลังหลักฐานภาพดิจิทัลรับรองด้วยลายน้ำและบล็อกเชน
          </p>

          <div className="login-rule" />

          <p className="login-desc">
            Blockchain &amp; Watermark-based Digital Evidence Authentication
          </p>

          <div className="login-notice">
            <ShieldCheck />
            <span>
              ระบบสำหรับเจ้าหน้าที่ผู้ได้รับอนุญาตเท่านั้น
              การเข้าใช้งานทุกครั้งจะถูกบันทึกเพื่อการตรวจสอบ
            </span>
          </div>
        </aside>

        {/* ── Right: form ── */}
        <main className="login-main">
          <div className="login-form-box">
            {/* โลโก้สำหรับจอเล็ก */}
            <div className="login-mobilebrand">
              <ShieldCheck />
              <span className="login-mobilebrand-text">DEVA</span>
            </div>

            <h2 className="login-heading">เข้าสู่ระบบ</h2>
            <p className="login-subheading">
              กรุณาลงชื่อเข้าใช้ด้วยบัญชีเจ้าหน้าที่
            </p>

            <form onSubmit={handleLogin} className="login-form" id="login-form">
              {error && (
                <div className="login-error" id="login-error" role="alert">
                  <AlertCircle />
                  <span>{error}</span>
                </div>
              )}

              {/* Username */}
              <div className="login-field">
                <label htmlFor="username" className="login-label">
                  ชื่อผู้ใช้
                </label>
                <div className="login-inputwrap">
                  <User className="login-inicon" />
                  <input
                    id="username"
                    type="text"
                    placeholder="ระบุชื่อผู้ใช้"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="login-input"
                    required
                    autoComplete="username"
                    autoFocus
                  />
                </div>
              </div>

              {/* Password */}
              <div className="login-field">
                <label htmlFor="password" className="login-label">
                  รหัสผ่าน
                </label>
                <div className="login-inputwrap">
                  <Lock className="login-inicon" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="ระบุรหัสผ่าน"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="login-input login-input-password"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="login-toggle"
                    id="toggle-password"
                    tabIndex={-1}
                    aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="login-submit"
                id="login-submit"
              >
                {loading ? (
                  <>
                    <Loader2 className="login-submit-spinner" />
                    กำลังเข้าสู่ระบบ...
                  </>
                ) : (
                  "เข้าสู่ระบบ"
                )}
              </button>
            </form>

            <p className="login-foot">
              DEVA Evidence System &middot; สงวนลิขสิทธิ์ &copy; {new Date().getFullYear()}
              <br />
              การเข้าถึงโดยไม่ได้รับอนุญาตถือเป็นความผิดตามกฎหมาย
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

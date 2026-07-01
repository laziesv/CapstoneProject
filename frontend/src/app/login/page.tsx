"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, Eye, EyeOff, Shield, Lock, User, AlertCircle, Loader2 } from "lucide-react";
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
      {/* Animated background */}
      <div className="login-bg">
        <div className="login-bg-orb login-bg-orb-1" />
        <div className="login-bg-orb login-bg-orb-2" />
        <div className="login-bg-orb login-bg-orb-3" />
        <div className="login-bg-grid" />
      </div>

      <div className="login-container">
        {/* Left panel — branding */}
        <div className="login-branding">
          <div className="login-branding-content">
            <div className="login-logo-badge">
              <Fingerprint className="login-logo-icon" />
            </div>
            <h1 className="login-brand-title">DEVA</h1>
            <p className="login-brand-subtitle">
              Digital Evidence Vault<br />& Authentication
            </p>
            <div className="login-brand-divider" />
            <p className="login-brand-desc">
              ระบบคลังหลักฐานดิจิทัลรับรองด้วยลายน้ำและบล็อกเชน
            </p>

            {/* Feature pills */}
            <div className="login-features">
              <div className="login-feature-pill">
                <Shield className="login-feature-icon" />
                <span>Watermark Protected</span>
              </div>
              <div className="login-feature-pill">
                <Lock className="login-feature-icon" />
                <span>Blockchain Verified</span>
              </div>
            </div>
          </div>

          {/* Decorative fingerprint watermark */}
          <Fingerprint className="login-branding-watermark" />
        </div>

        {/* Right panel — form */}
        <div className="login-form-panel">
          <div className="login-form-wrapper">
            {/* Mobile logo */}
            <div className="login-mobile-logo">
              <Fingerprint className="login-mobile-logo-icon" />
              <span className="login-mobile-logo-text">DEVA</span>
            </div>

            <div className="login-form-header">
              <h2 className="login-form-title">เข้าสู่ระบบ</h2>
              <p className="login-form-desc">ลงชื่อเข้าใช้เพื่อเข้าถึงคลังหลักฐาน</p>
            </div>

            <form onSubmit={handleLogin} className="login-form" id="login-form">
              {/* Error */}
              {error && (
                <div className="login-error" id="login-error">
                  <AlertCircle className="login-error-icon" />
                  <span>{error}</span>
                </div>
              )}

              {/* Username */}
              <div className="login-field">
                <label htmlFor="username" className="login-label">ชื่อผู้ใช้</label>
                <div className="login-input-wrapper">
                  <User className="login-input-icon" />
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
                <label htmlFor="password" className="login-label">รหัสผ่าน</label>
                <div className="login-input-wrapper">
                  <Lock className="login-input-icon" />
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
                    className="login-toggle-pw"
                    id="toggle-password"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="login-toggle-pw-icon" /> : <Eye className="login-toggle-pw-icon" />}
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

            {/* Footer */}
            <p className="login-footer">
              DEVA Evidence System &copy; {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

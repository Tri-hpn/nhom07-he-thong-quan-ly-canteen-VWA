// ============================================================
// FORGOTPASSWORD.JSX — Khôi phục mật khẩu (V4 — AuthLayout + bg VWA)
// ============================================================
// V4 (2026-10):
//   - 🎨 Dùng AuthLayout wrapper, background ảnh trường
//   - Giữ 100% logic: 3 bước OTP → reset → success
// ============================================================

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Mail, LockKeyhole, ArrowRight, Eye, EyeOff, Loader2, RefreshCw,
} from "lucide-react";
import { toast } from "../components/Effects";
import { useI18n } from "../hooks/useI18n";
import { LogoVWACompact } from "../components/LogoVWA";
import AuthLayout from "../components/AuthLayout";

const DEMO_OTP = "123456";
const RESEND_COOLDOWN = 60;

export default function ForgotPassword() {
  const { t } = useI18n();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const clearError = () => error && setError("");

  const sendOTP = async (e, isResend = false) => {
    if (e) e.preventDefault();
    if (loading) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail) return setError(t("Vui lòng nhập email"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return setError(t("Email không hợp lệ"));
    }

    setError("");
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 1000));
      toast(
        isResend
          ? t("Đã gửi lại mã OTP")
          : t("Mã OTP đã được gửi đến email của bạn"),
        "success"
      );
      setOtp(DEMO_OTP);
      if (!isResend) setStep(2);
      setCountdown(RESEND_COOLDOWN);
    } catch (err) {
      setError(err.message || t("Không gửi được mã OTP"));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = () => {
    if (countdown > 0 || loading) return;
    sendOTP(null, true);
  };

  const resetPassword = async (e) => {
    if (e) e.preventDefault();
    if (loading) return;

    if (!otp.trim()) return setError(t("Vui lòng nhập mã OTP"));
    if (otp.length !== 6) return setError(t("Mã OTP phải có 6 chữ số"));
    if (newPassword.length < 6) return setError(t("Mật khẩu phải từ 6 ký tự"));

    setError("");
    if (otp !== DEMO_OTP) {
      return setError(t("Mã OTP không đúng. Vui lòng kiểm tra lại."));
    }

    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 1000));
      toast(t("Đặt lại mật khẩu thành công!"), "success");
      setStep(3);
    } catch (err) {
      setError(err.message || t("Đặt lại mật khẩu thất bại"));
    } finally {
      setLoading(false);
    }
  };

  const titleText =
    step === 1
      ? t("Quên mật khẩu?")
      : step === 2
      ? t("Đặt lại mật khẩu")
      : t("Đổi mật khẩu thành công");

  const subtitleText =
    step === 1
      ? t("Nhập email để nhận mã xác thực")
      : step === 2
      ? t("Nhập mã OTP và mật khẩu mới")
      : t("Bạn có thể đăng nhập bằng mật khẩu mới");

  return (
    <AuthLayout maxWidth={440} bgImage="/vwa-campus.jpg">
      <div className="v10-auth-logo">
        <LogoVWACompact size={56} />
      </div>

      <h1 className="v10-auth-title">{titleText}</h1>
      <p className="v10-auth-subtitle">{subtitleText}</p>

      {error && <div className="v10-auth-error">{error}</div>}

      {step === 1 && (
        <form onSubmit={sendOTP} autoComplete="off" name="forgot-email-form">
          <label className="v10-auth-label" htmlFor="forgot-email">
            {t("Email")}
          </label>
          <div className="v10-auth-field">
            <Mail size={17} className="v10-auth-field-icon" />
            <input
              id="forgot-email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearError();
              }}
              placeholder={t("email@vwa.vn")}
              disabled={loading}
              autoComplete="email"
              autoFocus
            />
          </div>

          <button type="submit" className="v10-auth-submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={16} className="spin" />
                {t("Đang gửi...")}
              </>
            ) : (
              <>
                {t("Gửi mã OTP")}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={resetPassword} autoComplete="off" name="forgot-reset-form">
          <label className="v10-auth-label" htmlFor="forgot-otp">
            {t("Mã OTP (demo: 123456)")}
          </label>
          <div className="v10-auth-field">
            <input
              id="forgot-otp"
              name="otp"
              value={otp}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                setOtp(val);
                clearError();
              }}
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              disabled={loading}
              autoComplete="one-time-code"
              autoFocus
              style={{
                fontSize: 18,
                letterSpacing: 6,
                textAlign: "center",
                fontWeight: 700,
                fontFamily: "monospace",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 10,
              marginBottom: 4,
              fontSize: 12,
            }}
          >
            <span style={{ color: "#64748b" }}>
              {t("Chưa nhận được mã?")}
            </span>
            <button
              type="button"
              onClick={handleResend}
              disabled={countdown > 0 || loading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "transparent",
                border: 0,
                cursor: countdown > 0 || loading ? "not-allowed" : "pointer",
                color: countdown > 0 ? "#94a3b8" : "#2634d5",
                fontWeight: 600,
                fontSize: 12,
                padding: 4,
              }}
            >
              <RefreshCw size={12} />
              {countdown > 0
                ? `${t("Gửi lại sau")} ${countdown}s`
                : t("Gửi lại")}
            </button>
          </div>

          <label className="v10-auth-label" htmlFor="forgot-new-password">
            {t("Mật khẩu mới")}
          </label>
          <div className="v10-auth-field">
            <LockKeyhole size={17} className="v10-auth-field-icon" />
            <input
              id="forgot-new-password"
              name="newPassword"
              type={showPwd ? "text" : "password"}
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                clearError();
              }}
              placeholder={t("Tối thiểu 6 ký tự")}
              disabled={loading}
              autoComplete="new-password"
              onKeyDown={(e) => e.key === "Enter" && resetPassword(e)}
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              tabIndex={-1}
              className="v10-auth-eye"
              aria-label={showPwd ? t("Ẩn mật khẩu") : t("Hiện mật khẩu")}
            >
              {showPwd ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          <button type="submit" className="v10-auth-submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={16} className="spin" />
                {t("Đang xử lý...")}
              </>
            ) : (
              <>
                {t("Đặt lại mật khẩu")}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      )}

      {step === 3 && (
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <p
            style={{
              color: "#18a967",
              marginBottom: 24,
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            {t(
              "Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập lại."
            )}
          </p>
          <Link
            to="/"
            className="v10-auth-submit"
            style={{
              textDecoration: "none",
              display: "inline-flex",
              marginTop: 0,
            }}
          >
            {t("Đăng nhập ngay")}
            <ArrowRight size={16} />
          </Link>
        </div>
      )}

      {step !== 3 && (
        <p className="v10-auth-bottom">
          <Link to="/">{t("← Về trang đăng nhập")}</Link>
        </p>
      )}
    </AuthLayout>
  );
}
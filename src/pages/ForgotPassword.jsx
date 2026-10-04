// ============================================================
// FORGOTPASSWORD.JSX — Khôi phục mật khẩu (style Login V8)
// ============================================================
// Demo — OTP hardcode "123456"
// 3 bước: Email → OTP + mật khẩu mới → Thành công
//
// FIX v2:
//   - ✅ Áp dụng i18n cho TẤT CẢ text
// ============================================================

import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Mail, LockKeyhole, ArrowRight, ShieldCheck, CheckCircle2, Eye, EyeOff, Loader2, RefreshCw,
} from "lucide-react";
import { toast } from "../components/Effects";
import { useI18n } from "../hooks/useI18n";
import CuteCharacters from "../components/LoginIllustration";

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
  const [peeking, setPeeking] = useState(false);

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
    if (!trimmedEmail) return setError(t("forgot.errorEmailRequired"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail))
      return setError(t("forgot.errorEmailInvalid"));

    setError("");
    setLoading(true);

    try {
      await new Promise((r) => setTimeout(r, 1000));

      toast(
        isResend ? t("forgot.toastOtpResent") : t("forgot.toastOtpSent"),
        "success"
      );

      setOtp(DEMO_OTP);
      if (!isResend) setStep(2);
      setCountdown(RESEND_COOLDOWN);
    } catch (err) {
      setError(err.message || t("forgot.errorSendOtp"));
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

    if (!otp.trim()) return setError(t("forgot.errorOtpRequired"));
    if (otp.length !== 6) return setError(t("forgot.errorOtpLength"));
    if (newPassword.length < 6) return setError(t("forgot.errorPasswordMin"));

    setError("");

    if (otp !== DEMO_OTP) {
      return setError(t("forgot.errorOtpWrong"));
    }

    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 1000));
      toast(t("forgot.toastSuccess"), "success");
      setStep(3);
    } catch (err) {
      setError(err.message || t("forgot.errorResetFailed"));
    } finally {
      setLoading(false);
    }
  };

  // Bubble + caption — memo theo step
  const bubbleText = useMemo(() => {
    if (step === 3) return t("forgot.bubbleStep3");
    if (peeking) return t("forgot.bubblePeek");
    if (step === 2) return t("forgot.bubbleStep2");
    return t("forgot.bubbleStep1");
  }, [step, peeking, t]);

  const caption = useMemo(() => {
    if (step === 3) {
      return {
        b: t("forgot.captionDone"),
        s: t("forgot.captionDoneSub"),
      };
    }
    return {
      b: t("forgot.captionTitle"),
      s: t("forgot.captionSub"),
    };
  }, [step, t]);

  const titleText = useMemo(() => {
    if (step === 1) return t("forgot.title1");
    if (step === 2) return t("forgot.title2");
    return t("forgot.title3");
  }, [step, t]);

  const subtitleText = useMemo(() => {
    if (step === 1) return t("forgot.subtitle1");
    if (step === 2) return t("forgot.subtitle2");
    return t("forgot.subtitle3");
  }, [step, t]);

  return (
    <div className="v8-login-page">
      {/* LEFT */}
      <section className="v8-login-left">
        <div className="v8-login-brand">
          <div className="v8-brand-mark">C</div>
          <div className="v8-brand-text">
            <b>{t("login.brandName")}</b>
            <small>{t("login.brandSub")}</small>
          </div>
        </div>

        <div className="v8-illustration-wrap">
          <div className="v8-illustration-inner">
            <div className="v8-speech-bubble">{bubbleText}</div>
            <CuteCharacters peeking={peeking} />
          </div>
        </div>

        <div className="v8-left-caption">
          <b>{caption.b}</b>
          <span>{caption.s}</span>
        </div>
      </section>

      {/* RIGHT */}
      <main className="v8-login-right">
        <div className="v8-form-inner">
          {/* Logo + Tabs */}
          <div className="v8-form-top">
            <div className="v8-form-logo">
              <div className="v8-form-logo-mark">
                {step === 3 ? <CheckCircle2 size={22} /> : <ShieldCheck size={22} />}
              </div>
            </div>

            <nav className="v8-tabs" aria-label="Chuyển trang">
              <Link to="/" className="v8-tab">
                {t("forgot.backToLoginShort")}
              </Link>
            </nav>
          </div>

          {/* Heading */}
          <h1 className="v8-form-title">{titleText}</h1>
          <p className="v8-form-subtitle">{subtitleText}</p>

          {error && <div className="v8-error-box">{error}</div>}

          {/* STEP 1 — Email */}
          {step === 1 && (
            <form onSubmit={sendOTP} autoComplete="off">
              <label className="v8-label">{t("forgot.emailLabel")}</label>
              <div className="v8-input-wrap">
                <Mail size={16} className="v8-input-icon" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError();
                  }}
                  placeholder={t("forgot.emailPlaceholder")}
                  disabled={loading}
                  autoFocus
                />
              </div>

              <button
                type="submit"
                className="v8-cta"
                disabled={loading}
                style={{ marginTop: 20 }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    {t("forgot.sendingOtp")}
                  </>
                ) : (
                  <>
                    {t("forgot.sendOtpBtn")} <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* STEP 2 — OTP + Password */}
          {step === 2 && (
            <form onSubmit={resetPassword} autoComplete="off">
              <label className="v8-label">{t("forgot.otpLabelDemo")}</label>
              <div className="v8-input-wrap">
                <input
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
                  marginTop: 8,
                  marginBottom: 4,
                  fontSize: 12,
                }}
              >
                <span style={{ color: "#64748b" }}>
                  {t("forgot.notReceived")}
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
                    ? `${t("forgot.resendIn")} ${countdown}s`
                    : t("forgot.resend")}
                </button>
              </div>

              <label className="v8-label">{t("forgot.passwordLabel")}</label>
              <div className="v8-input-wrap">
                <LockKeyhole size={16} className="v8-input-icon" />
                <input
                  type={showPwd ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    clearError();
                  }}
                  placeholder={t("forgot.passwordPlaceholder")}
                  disabled={loading}
                  autoComplete="new-password"
                  onFocus={() => setPeeking(true)}
                  onBlur={() => setPeeking(false)}
                  onKeyDown={(e) => e.key === "Enter" && resetPassword(e)}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  tabIndex={-1}
                  className="v8-eye-btn"
                  aria-label={
                    showPwd ? t("login.hidePassword") : t("login.showPassword")
                  }
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <button
                type="submit"
                className="v8-cta"
                disabled={loading}
                style={{ marginTop: 20 }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    {t("forgot.resetting")}
                  </>
                ) : (
                  <>
                    {t("forgot.resetBtn")} <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* STEP 3 — Success */}
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
                {t("forgot.successMsg")}
              </p>
              <Link
                to="/"
                className="v8-cta"
                style={{ textDecoration: "none", display: "inline-flex" }}
              >
                {t("forgot.loginNowBtn")} <ArrowRight size={16} />
              </Link>
            </div>
          )}

          {step !== 3 && (
            <p className="v8-bottom-text" style={{ marginTop: 24 }}>
              <Link to="/">{t("forgot.backToLogin")}</Link>
            </p>
          )}
        </div>
      </main>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .spin { animation: spin 1s linear infinite; }

        .v8-illustration-inner svg circle,
        .v8-illustration-inner svg path,
        .v8-illustration-inner svg line,
        .v8-illustration-inner svg ellipse {
          transition: all 0.2s ease;
        }
      `}</style>
    </div>
  );
}
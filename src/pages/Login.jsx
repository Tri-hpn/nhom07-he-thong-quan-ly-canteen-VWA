// ============================================================
// LOGIN.JSX — Đăng nhập (style Login Animation V8)
// ============================================================
// V5: FIX endpoint Microsoft - dùng /organizations/ + redirectUri chuẩn
// ============================================================

import { useState, useEffect, useMemo } from "react";
import { LogoVWACompact } from "../components/LogoVWA";
import { Link } from "react-router-dom";
import {
  Eye, EyeOff, LockKeyhole, Mail, ArrowRight, Loader2,
} from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import { toast } from "../components/Effects";
import CuteCharacters from "../components/LoginIllustration";

const REMEMBER_KEY = "canteen_remember_email";

const DEMO_ACCOUNTS = [
  { role: "Quản trị viên", email: "admin@vwa.vn", password: "123456" },
  { role: "Nhân viên", email: "nhanvien@vwa.vn", password: "123456" },
  { role: "Khách hàng", email: "sinhvien@vwa.vn", password: "123456" },
];

function startGoogleOAuth(t) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    toast(t("Chưa cấu hình Google Client ID"), "error");
    return;
  }
  const redirectUri = encodeURIComponent(
    window.location.origin + "/auth/google/callback"
  );
  const scope = encodeURIComponent("openid email profile");
  const url =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=code` +
    `&scope=${scope}` +
    `&prompt=select_account`;
  window.location.href = url;
}

function startFacebookOAuth(t) {
  const appId = import.meta.env.VITE_FACEBOOK_APP_ID;
  if (!appId) {
    toast(t("Chưa cấu hình Facebook App ID"), "error");
    return;
  }
  const redirectUri = encodeURIComponent(
    window.location.origin + "/auth/facebook/callback"
  );
  const url =
    `https://www.facebook.com/v18.0/dialog/oauth?` +
    `client_id=${appId}` +
    `&redirect_uri=${redirectUri}` +
    `&scope=email,public_profile` +
    `&response_type=code`;
  window.location.href = url;
}

// ✅ MICROSOFT OAUTH — FIX TRIỆT ĐỂ
function startMicrosoftOAuth(t) {
  const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID;

  if (!clientId) {
    toast(t("Chưa cấu hình Microsoft Client ID"), "error");
    return;
  }

  // Redirect URI PHẢI KHỚP 100% với URI khai báo trên Azure
  const redirectUri = encodeURIComponent(
    window.location.origin + "/auth/microsoft/callback"
  );

  const scope = encodeURIComponent("openid email profile User.Read");

  // Endpoint /organizations/ + prompt=select_account
  const url =
    `https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?` +
    `client_id=${clientId}` +
    `&response_type=code` +
    `&redirect_uri=${redirectUri}` +
    `&response_mode=query` +
    `&scope=${scope}` +
    `&prompt=select_account` +
    `&state=12345`;

  window.location.href = url;
}

export default function Login({ onLogin }) {
  const { t } = useI18n();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);
  const [peeking, setPeeking] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setEmail(saved);
        setRemember(true);
      }
    } catch {}
  }, []);

  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    if (error) setError("");
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    if (error) setError("");
  };

  const fillDemo = (account) => {
    setEmail(account.email);
    setPassword(account.password);
    setError("");
  };

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (loading) return;

    if (!email.trim()) return setError(t("Vui lòng nhập email"));
    if (!password) return setError(t("Vui lòng nhập mật khẩu"));

    setError("");
    setLoading(true);

    try {
      const result = await onLogin(email.trim(), password);

      if (!result) {
        setError(t("Tài khoản hoặc mật khẩu không đúng."));
        return;
      }

      try {
        if (remember) {
          localStorage.setItem(REMEMBER_KEY, email.trim());
        } else {
          localStorage.removeItem(REMEMBER_KEY);
        }
      } catch {}
    } catch (err) {
      setError(err.message || t("Đăng nhập thất bại"));
    } finally {
      setLoading(false);
    }
  };

  const bubbleText = useMemo(() => {
    return peeking
      ? t("Đừng nhìn mật khẩu nhé! 🙈")
      : t("Chào mừng đến Canteen VWA! 👋");
  }, [peeking, t]);

  return (
    <div className="v8-login-page">
      <section className="v8-login-left">
        <div className="v8-login-brand">
          <div className="v8-brand-mark">C</div>
          <div className="v8-brand-text">
            <b>{t("CANTEEN VWA")}</b>
            <small>{t("HỆ THỐNG QUẢN LÝ")}</small>
          </div>
        </div>

        <div className="v8-illustration-wrap">
          <div className="v8-illustration-inner">
            <div className="v8-speech-bubble">{bubbleText}</div>
            <CuteCharacters peeking={peeking} />
          </div>
        </div>

        <div className="v8-left-caption">
          <b>{t("Chào mừng đến Canteen VWA")}</b>
          <span>{t("Đặt món nhanh chóng, tiện lợi mỗi ngày.")}</span>
        </div>
      </section>

      <main className="v8-login-right">
        <div className="v8-form-inner">
          <div className="v8-form-top">
            <div className="v8-form-logo">
              <LogoVWACompact size={64} />
            </div>
            <nav className="v8-tabs" aria-label={t("Chuyển trang")}>
              <span className="v8-tab active">{t("Đăng nhập")}</span>
              <Link to="/register" className="v8-tab">
                {t("Đăng ký")}
              </Link>
            </nav>
          </div>

          <h1 className="v8-form-title">{t("Chào mừng trở lại")}</h1>
          <p className="v8-form-subtitle">
            {t("Nhập thông tin để tiếp tục")}
          </p>

          {error && <div className="v8-error-box">{error}</div>}

          <form onSubmit={submit} autoComplete="off" data-form-type="other">
            <label className="v8-label">
              {t("Email hoặc tên đăng nhập")}
            </label>
            <div className="v8-input-wrap">
              <Mail size={16} className="v8-input-icon" />
              <input
                type="text"
                value={email}
                onChange={handleEmailChange}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                autoComplete="off"
                data-form-type="other"
                placeholder={t("email@vwa.vn")}
                disabled={loading}
              />
            </div>

            <label className="v8-label v8-label-row">
              <span>{t("Mật khẩu")}</span>
              <Link to="/forgot-password" className="v8-forgot">
                {t("Quên mật khẩu?")}
              </Link>
            </label>
            <div className="v8-input-wrap">
              <LockKeyhole size={16} className="v8-input-icon" />
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={handlePasswordChange}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                autoComplete="new-password"
                data-form-type="other"
                placeholder={t("Nhập mật khẩu")}
                disabled={loading}
                onFocus={() => setPeeking(true)}
                onBlur={() => setPeeking(false)}
                onKeyDown={(e) => e.key === "Enter" && submit(e)}
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label={show ? t("Ẩn mật khẩu") : t("Hiện mật khẩu")}
                tabIndex={-1}
                className="v8-eye-btn"
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <label className="v8-check">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>{t("Ghi nhớ đăng nhập 7 ngày")}</span>
            </label>

            <button type="submit" className="v8-cta" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={16} className="spin" />
                  {t("Đang đăng nhập...")}
                </>
              ) : (
                <>
                  {t("Đăng nhập")}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="v8-divider">
            <span>{t("Hoặc tiếp tục với")}</span>
          </div>

          <div className="v8-socials">
            <button
              type="button"
              className="v8-social"
              onClick={() => startGoogleOAuth(t)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Google
            </button>

            <button
              type="button"
              className="v8-social"
              onClick={() => startFacebookOAuth(t)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true">
                <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
              </svg>
              Facebook
            </button>
          </div>

          {/* NÚT MICROSOFT VWA CONNECT */}
          <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              className="v8-social"
              onClick={() => startMicrosoftOAuth(t)}
              style={{
                width: '100%',
                maxWidth: '280px',
                borderColor: '#0078D4',
                color: '#0078D4',
                fontWeight: '700',
                background: '#f0f8ff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '10px',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#0078D4';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f0f8ff';
                e.currentTarget.style.color = '#0078D4';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden="true">
                <path fill="#f35325" d="M1 1h10v10H1z"/>
                <path fill="#81bc06" d="M12 1h10v10H12z"/>
                <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                <path fill="#ffba08" d="M12 12h10v10H12z"/>
              </svg>
              {t("Đăng nhập với VWA Connect")}
            </button>
          </div>

          <p className="v8-bottom-text" style={{ marginTop: '24px' }}>
            {t("Chưa có tài khoản?")}{" "}
            <Link to="/register">{t("Đăng ký miễn phí")}</Link>
          </p>

          <div className="v8-demo">
            <div className="v8-demo-title">{t("Tài khoản demo")}</div>
            <div className="v8-demo-list">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => fillDemo(acc)}
                  disabled={loading}
                  className="v8-demo-item"
                >
                  <span className="v8-demo-role">{t(acc.role)}</span>
                  <span className="v8-demo-email">{acc.email}</span>
                </button>
              ))}
            </div>
            <div className="v8-demo-hint">
              {t("Bấm để điền nhanh tài khoản demo")}
            </div>
          </div>
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
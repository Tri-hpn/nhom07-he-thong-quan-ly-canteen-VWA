// ============================================================
// LOGIN.JSX — Deep-link returnUrl + OAuth preserve
// ============================================================

import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { api, setToken } from "../api";
import { useI18n } from "../hooks/useI18n";
import { toast } from "../components/Effects";
import { LogoVWACompact } from "../components/LogoVWA";
import AuthLayout from "../components/AuthLayout";
import { homePathForRole } from "../components/ProtectedRoute";

const REMEMBER_KEY = "canteen_remember_email";
const OAUTH_RETURN_KEY = "oauth_return_url";

const DEMO_ACCOUNTS = [
  { short: "Admin", role: "Quản trị", email: "admin@vwa.vn", password: "123456" },
  { short: "NV", role: "Nhân viên", email: "nhanvien@vwa.vn", password: "123456" },
  { short: "KH", role: "Khách", email: "sinhvien@vwa.vn", password: "123456" },
];

// ── Helpers ─────────────────────────────────────────────────
function getSafeReturnUrl(searchParams) {
  try {
    const raw = searchParams.get("returnUrl");
    if (!raw) return null;
    const decoded = decodeURIComponent(raw);
    if (!decoded.startsWith("/") || decoded.startsWith("//")) return null;
    const u = new URL(decoded, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

function saveReturnUrlForOAuth() {
  try {
    const ru = getSafeReturnUrl(new URLSearchParams(window.location.search));
    if (ru) sessionStorage.setItem(OAUTH_RETURN_KEY, ru);
    else sessionStorage.removeItem(OAUTH_RETURN_KEY);
  } catch {}
}

function consumeOAuthReturnUrl() {
  try {
    const v = sessionStorage.getItem(OAUTH_RETURN_KEY);
    sessionStorage.removeItem(OAUTH_RETURN_KEY);
    return v;
  } catch {
    return null;
  }
}

// ── OAuth starts ────────────────────────────────────────────
function startGoogleOAuth(t) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    toast(t("Chưa cấu hình Google Client ID"), "error");
    return;
  }
  saveReturnUrlForOAuth();
  const redirectUri = encodeURIComponent(
    window.location.origin + "/auth/google/callback"
  );
  const scope = encodeURIComponent("openid email profile");
  window.location.href =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=code` +
    `&scope=${scope}` +
    `&prompt=select_account`;
}

function startFacebookOAuth(t) {
  const appId = import.meta.env.VITE_FACEBOOK_APP_ID;
  if (!appId) {
    toast(t("Chưa cấu hình Facebook App ID"), "error");
    return;
  }
  saveReturnUrlForOAuth();
  const redirectUri = encodeURIComponent(
    window.location.origin + "/auth/facebook/callback"
  );
  window.location.href =
    `https://www.facebook.com/v18.0/dialog/oauth?` +
    `client_id=${appId}` +
    `&redirect_uri=${redirectUri}` +
    `&scope=email,public_profile` +
    `&response_type=code`;
}

function startMicrosoftOAuth(t) {
  const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID;
  const tenantId = import.meta.env.VITE_MICROSOFT_TENANT_ID;
  if (!clientId) {
    toast(t("Chưa cấu hình Microsoft Client ID"), "error");
    return;
  }
  saveReturnUrlForOAuth();
  const redirectUri = encodeURIComponent(
    window.location.origin + "/auth/microsoft-entra-id/callback"
  );
  const scope = encodeURIComponent("openid email profile User.Read");
  const tenant = tenantId || "organizations";
  window.location.href =
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?` +
    `client_id=${clientId}` +
    `&response_type=code` +
    `&redirect_uri=${redirectUri}` +
    `&response_mode=query` +
    `&scope=${scope}` +
    `&prompt=select_account` +
    `&state=12345`;
}

// ── Component ───────────────────────────────────────────────
export default function Login({ onLogin }) {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(false);

  const urlTokenHandledRef = useRef(false);
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  // Legacy ?token= (OAuth return flow cũ)
  useEffect(() => {
    if (urlTokenHandledRef.current) return;
    urlTokenHandledRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get("token");
    const providerFromUrl = params.get("provider");
    if (!tokenFromUrl) return;

    window.history.replaceState(
      {},
      "",
      window.location.pathname + window.location.hash
    );

    setLoading(true);
    setToken(tokenFromUrl);

    api
      .me()
      .then((user) => {
        const tr = tRef.current;
        try {
          const hasMssv = !!user.student_code;
          const hasTeacherCode = !!user.teacher_code;
          const isTeacher = user.email && user.email.endsWith("@vwa.edu.vn");
          const isStudent = user.email && user.email.endsWith("@hpn.edu.vn");
          const hasMajor = !!user.major_name;

          if (hasMssv && hasMajor) {
            toast(
              tr("Đã đồng bộ MSSV {code} — {major}")
                .replace("{code}", user.student_code)
                .replace("{major}", user.major_name),
              "success"
            );
          } else if (hasMssv) {
            toast(
              tr("Đã đồng bộ MSSV {code}").replace(
                "{code}",
                user.student_code
              ),
              "success"
            );
          } else if (hasTeacherCode) {
            toast(
              tr("Đã đồng bộ mã giảng viên {code}").replace(
                "{code}",
                user.teacher_code
              ),
              "success"
            );
          } else if (isTeacher) {
            toast(
              `${tr("Xin chào")} ${user.name || ""}! ${tr(
                "Vào hồ sơ để cập nhật thông tin nếu cần."
              )}`,
              "success"
            );
          } else if (isStudent) {
            toast(
              `${tr("Xin chào")} ${user.name || ""}! ${tr(
                "Vào hồ sơ để liên kết MSSV."
              )}`,
              "info",
              { duration: 5000 }
            );
          } else {
            toast(
              `${tr("Xin chào")} ${user.name || ""}! ${tr(
                "Vào hồ sơ để cập nhật MSSV (nếu là sinh viên)."
              )}`,
              "info",
              { duration: 5000 }
            );
          }
        } catch {
          toast(`${tr("Xin chào")} ${user.name || ""}!`, "success");
        }
        try {
          window.dispatchEvent(new CustomEvent("refresh-user"));
        } catch {}
        const saved = consumeOAuthReturnUrl();
        navigate(saved || homePathForRole(user.role), { replace: true });
      })
      .catch((err) => {
        setToken(null);
        setError(
          err?.message ||
            tRef.current("Đăng nhập {provider} thất bại").replace(
              "{provider}",
              providerFromUrl || "OAuth"
            )
        );
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setEmail(saved);
        setRemember(true);
      }
    } catch {}
  }, []);

  const fillDemo = (acc) => {
    setEmail(acc.email);
    setPassword(acc.password);
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
      // App.handleLogin() tự điều hướng (đọc returnUrl)
      const result = await onLogin(email.trim(), password);
      if (!result) {
        setError(t("Tài khoản hoặc mật khẩu không đúng."));
        return;
      }
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, email.trim());
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {}
    } catch (err) {
      setError(err.message || t("Đăng nhập thất bại"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout maxWidth={440} bgImage="/vwa-campus.jpg">
      <div className="v10-auth-logo">
        <LogoVWACompact size={56} />
      </div>

      <h1 className="v10-auth-title">{t("Chào mừng trở lại")}</h1>
      <p className="v10-auth-subtitle">
        {t("Đăng nhập để tiếp tục đặt món tại Canteen VWA")}
      </p>
      {error && <div className="v10-auth-error">{error}</div>}

      <form onSubmit={submit} autoComplete="off" name="login-form">
        <label className="v10-auth-label" htmlFor="login-email">
          {t("Email")}
        </label>
        <div className="v10-auth-field">
          <Mail size={17} className="v10-auth-field-icon" />
          <input
            id="login-email"
            name="email"
            type="text"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError("");
            }}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
            placeholder={t("email@vwa.vn")}
            disabled={loading}
          />
        </div>

        <label className="v10-auth-label" htmlFor="login-password">
          {t("Mật khẩu")}
        </label>
        <div className="v10-auth-field">
          <LockKeyhole size={17} className="v10-auth-field-icon" />
          <input
            id="login-password"
            name="password"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError("");
            }}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="new-password"
            placeholder={t("Nhập mật khẩu")}
            disabled={loading}
            onKeyDown={(e) => e.key === "Enter" && submit(e)}
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? t("Ẩn mật khẩu") : t("Hiện mật khẩu")}
            tabIndex={-1}
            className="v10-auth-eye"
          >
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>

        <div className="v10-auth-row">
          <label htmlFor="login-remember">
            <input
              id="login-remember"
              name="remember"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>{t("Ghi nhớ 7 ngày")}</span>
          </label>
          <Link to="/forgot-password">{t("Quên mật khẩu?")}</Link>
        </div>

        <button type="submit" className="v10-auth-submit" disabled={loading}>
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

      <div className="v10-auth-divider">
        <span>{t("Hoặc tiếp tục với")}</span>
      </div>

      <div className="v10-auth-socials">
        <button
          type="button"
          className="v10-auth-social-btn"
          onClick={() => startGoogleOAuth(t)}
          aria-label={t("Đăng nhập bằng Google")}
          title="Google"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
        </button>

        <button
          type="button"
          className="v10-auth-social-btn"
          onClick={() => startFacebookOAuth(t)}
          aria-label={t("Đăng nhập bằng Facebook")}
          title="Facebook"
        >
          <svg viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true">
            <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
          </svg>
        </button>

        <button
          type="button"
          className="v10-auth-social-btn"
          onClick={() => startMicrosoftOAuth(t)}
          aria-label={t("Đăng nhập với VWA Connect")}
          title="VWA Connect (Microsoft)"
        >
          <svg viewBox="0 0 23 23" aria-hidden="true">
            <path fill="#f35325" d="M1 1h10v10H1z" />
            <path fill="#81bc06" d="M12 1h10v10H12z" />
            <path fill="#05a6f0" d="M1 12h10v10H1z" />
            <path fill="#ffba08" d="M12 12h10v10H12z" />
          </svg>
        </button>
      </div>

      <p className="v10-auth-bottom">
        {t("Chưa có tài khoản?")} <Link to="/register">{t("Đăng ký ngay")}</Link>
      </p>

      <details className="v10-auth-demo">
        <summary>{t("Tài khoản demo")}</summary>
        <div className="v10-auth-demo-chips">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.email}
              type="button"
              onClick={() => fillDemo(acc)}
              disabled={loading}
              className="v10-auth-demo-chip"
              title={`${acc.role} · ${acc.email}`}
            >
              {t(acc.short)}
            </button>
          ))}
        </div>
      </details>
    </AuthLayout>
  );
}
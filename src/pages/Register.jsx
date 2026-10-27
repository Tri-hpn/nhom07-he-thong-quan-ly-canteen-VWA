// ============================================================
// REGISTER.JSX — Đăng ký tài khoản (V10 — AuthLayout + bg VWA)
// ============================================================
// V10 (2026-11):
//   🔧 FIX CRITICAL: startMicrosoftOAuth dùng nhầm URL
//      `/api/auth/callback/microsoft-entra-id` (backend) → user thấy
//      raw JSON thay vì app. Đổi sang `/auth/microsoft-entra-id/callback`
//      (frontend route → OAuthCallback → POST backend).
// V9 (2026-10):
//   - Dùng AuthLayout wrapper
// ============================================================

import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Eye, EyeOff, LockKeyhole, Mail, ArrowRight, Loader2,
  User as UserIcon, Phone, Check,
} from "lucide-react";
import { api, setToken } from "../api";
import { useI18n } from "../hooks/useI18n";
import { toast } from "../components/Effects";
import { LogoVWACompact } from "../components/LogoVWA";
import StudentCodeInput from "../components/StudentCodeInput";
import AuthLayout from "../components/AuthLayout";

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
  // 🔧 FIX V10: dùng frontend route (khớp Login.jsx) — backend sẽ nhận
  // qua POST /api/auth/microsoft-entra-id/callback từ OAuthCallback
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

export default function Register({ onRegister }) {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [parsedMssv, setParsedMssv] = useState(null);
  const [mssvError, setMssvError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);

  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const clearError = () => error && setError("");

  const validate = () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();
    const trimmedMssv = studentCode.trim();

    if (!trimmedName) return t("Vui lòng nhập họ tên");
    if (!trimmedEmail) return t("Vui lòng nhập email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return t("Email không hợp lệ");
    }
    if (trimmedPhone && !/^[0-9]{10,11}$/.test(trimmedPhone)) {
      return t("SĐT phải 10-11 số");
    }
    if (!password) return t("Vui lòng nhập mật khẩu");
    if (password.length < 6) return t("Mật khẩu phải từ 6 ký tự");
    if (password !== confirm) return t("Xác nhận mật khẩu không khớp");
    if (!agree) return t("Vui lòng đồng ý điều khoản để tiếp tục");

    if (trimmedMssv) {
      if (!/^\d{10}$/.test(trimmedMssv)) return t("MSSV phải là 10 chữ số");
      if (mssvError) return mssvError;
    }
    return null;
  };

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (loading) return;

    const errMsg = validate();
    if (errMsg) return setError(errMsg);

    setError("");
    setLoading(true);

    try {
      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password,
      };
      if (studentCode.trim()) payload.student_code = studentCode.trim();

      const res = await api.register(payload);
      if (!res || !res.token) throw new Error(t("Đăng ký thất bại"));

      setToken(res.token);
      const newUser = res.user || { email: email.trim().toLowerCase() };

      toast(
        t("Đăng ký thành công! Chào mừng {name}").replace(
          "{name}",
          newUser.name || name.trim()
        ),
        "success"
      );

      if (newUser.student_code && newUser.major_name) {
        toast(
          t("Đã liên kết MSSV {code} — {major}")
            .replace("{code}", newUser.student_code)
            .replace("{major}", newUser.major_name),
          "info"
        );
      }

      if (typeof onRegister === "function") {
        onRegister(newUser);
        navigate("/customer", { replace: true });
      } else {
        window.location.href = "/";
      }
    } catch (err) {
      const msg = err.message || t("Đăng ký thất bại");
      if (
        err.body?.code === "MSSV_ALREADY_LINKED" ||
        msg.includes("MSSV này đã được liên kết")
      ) {
        setMssvError(
          t(
            "MSSV này đã được liên kết với tài khoản khác. Vui lòng đăng nhập bằng tài khoản trường."
          )
        );
        setError(
          err.body?.linked_email_masked
            ? t("MSSV đã liên kết với {email}").replace(
                "{email}",
                err.body.linked_email_masked
              )
            : msg
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      window.scrollTo(0, 0);
    } catch {}
  }, []);

  return (
    <AuthLayout maxWidth={480} bgImage="/vwa-campus.jpg">
      <div className="v10-auth-logo">
        <LogoVWACompact size={56} />
      </div>

      <h1 className="v10-auth-title">{t("Tạo tài khoản mới")}</h1>
      <p className="v10-auth-subtitle">
        {t("Đăng ký miễn phí — chỉ mất 30 giây.")}
      </p>
      {error && <div className="v10-auth-error">{error}</div>}

      <form onSubmit={submit} autoComplete="off" name="register-form">
        <label className="v10-auth-label" htmlFor="register-name">
          {t("Họ và tên")} *
        </label>
        <div className="v10-auth-field">
          <UserIcon size={17} className="v10-auth-field-icon" />
          <input
            id="register-name"
            name="name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearError();
            }}
            spellCheck={false}
            autoComplete="off"
            placeholder={t("Nguyễn Văn A")}
            disabled={loading}
            autoFocus
          />
        </div>

        <label className="v10-auth-label" htmlFor="register-email">
          {t("Email")} *
        </label>
        <div className="v10-auth-field">
          <Mail size={17} className="v10-auth-field-icon" />
          <input
            id="register-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearError();
            }}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
            placeholder={t("email@vwa.vn")}
            disabled={loading}
          />
        </div>

        <label className="v10-auth-label" htmlFor="register-phone">
          {t("Số điện thoại")}{" "}
          <span style={{ fontWeight: 400, color: "#94a3b8" }}>
            ({t("không bắt buộc")})
          </span>
        </label>
        <div className="v10-auth-field">
          <Phone size={17} className="v10-auth-field-icon" />
          <input
            id="register-phone"
            name="phone"
            type="text"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value.replace(/[^0-9]/g, ""));
              clearError();
            }}
            placeholder={t("0901234567")}
            inputMode="numeric"
            maxLength={11}
            disabled={loading}
          />
        </div>

        <fieldset className="v10-auth-fieldset">
          <StudentCodeInput
            value={studentCode}
            onChange={(code, info) => {
              setStudentCode(code);
              setParsedMssv(info);
              if (mssvError) setMssvError("");
              clearError();
            }}
            disabled={loading}
            required={false}
            showPreview={true}
            label={`${t("Mã số sinh viên (MSSV)")} (${t("không bắt buộc")})`}
          />
        </fieldset>

        <label className="v10-auth-label" htmlFor="register-password">
          {t("Mật khẩu")} *
        </label>
        <div className="v10-auth-field">
          <LockKeyhole size={17} className="v10-auth-field-icon" />
          <input
            id="register-password"
            name="password"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearError();
            }}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="new-password"
            placeholder={t("Tối thiểu 6 ký tự")}
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            tabIndex={-1}
            className="v10-auth-eye"
            aria-label={show ? t("Ẩn mật khẩu") : t("Hiện mật khẩu")}
          >
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>

        <label className="v10-auth-label" htmlFor="register-confirm">
          {t("Xác nhận mật khẩu")} *
        </label>
        <div className="v10-auth-field">
          <Check size={17} className="v10-auth-field-icon" />
          <input
            id="register-confirm"
            name="confirmPassword"
            type={showConfirm ? "text" : "password"}
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              clearError();
            }}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="new-password"
            placeholder={t("Nhập lại mật khẩu")}
            disabled={loading}
            onKeyDown={(e) => e.key === "Enter" && submit(e)}
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            tabIndex={-1}
            className="v10-auth-eye"
            aria-label={showConfirm ? t("Ẩn mật khẩu") : t("Hiện mật khẩu")}
          >
            {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>

        <label className="v10-auth-check" htmlFor="register-agree">
          <input
            id="register-agree"
            name="agree"
            type="checkbox"
            checked={agree}
            onChange={(e) => {
              setAgree(e.target.checked);
              clearError();
            }}
            disabled={loading}
          />
          <span>
            {t("Tôi đồng ý với")}{" "}
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              style={{ color: "#2634d5", fontWeight: 600 }}
            >
              {t("Điều khoản & Chính sách")}
            </a>{" "}
            {t("của Canteen VWA")}
          </span>
        </label>

        <button type="submit" className="v10-auth-submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 size={16} className="spin" />
              {t("Đang tạo tài khoản...")}
            </>
          ) : (
            <>
              {t("Đăng ký")}
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      <div className="v10-auth-divider">
        <span>{t("Hoặc đăng ký với")}</span>
      </div>

      <div className="v10-auth-socials">
        <button
          type="button"
          className="v10-auth-social-btn"
          onClick={() => startGoogleOAuth(t)}
          disabled={loading}
          aria-label={t("Đăng ký bằng Google")}
          title="Google"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
        </button>

        <button
          type="button"
          className="v10-auth-social-btn"
          onClick={() => startFacebookOAuth(t)}
          disabled={loading}
          aria-label={t("Đăng ký bằng Facebook")}
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
          disabled={loading}
          aria-label={t("Đăng ký bằng Microsoft")}
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
        {t("Đã có tài khoản?")}{" "}
        <Link to="/">{t("Đăng nhập ngay")}</Link>
      </p>
    </AuthLayout>
  );
}
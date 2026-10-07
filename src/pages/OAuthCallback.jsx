// ============================================================
// OAUTHCALLBACK.JSX — Xử lý callback từ Google/Facebook/Microsoft OAuth
// ============================================================
// V2: FIX redirectUri cho Microsoft - dùng /auth/microsoft/callback
// ============================================================

import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import {
  Loader2, AlertCircle,
} from "lucide-react";
import { api, setToken } from "../api";
import { toast } from "../components/Effects";
import { useI18n } from "../hooks/useI18n";

export default function OAuthCallback({ provider, onLoginSuccess }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [status, setStatus] = useState("processing");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const code = params.get("code");
    const error = params.get("error");
    const errorDescription = params.get("error_description");

    if (error) {
      const msg = errorDescription || error || t("Đăng nhập bị huỷ");
      setStatus("error");
      setErrorMsg(msg);
      toast(`${t("Đăng nhập bị huỷ")}: ${msg}`, "error");
      return;
    }

    if (!code) {
      const msg = t("Không nhận được mã xác thực từ {provider}").replace(
        "{provider}",
        provider
      );
      setStatus("error");
      setErrorMsg(msg);
      toast(msg, "error");
      return;
    }

    let cancelled = false;

    // 🔧 FIX: Microsoft dùng URI đã đăng ký trên Azure
    const redirectUri =
      window.location.origin +
      (provider === "microsoft-entra-id"
        ? "/auth/microsoft/callback"
        : `/auth/${provider}/callback`);

    api.oauth
      .callback(provider, code, redirectUri)
      .then(({ token, user }) => {
        if (cancelled) return;

        setToken(token);
        toast(`${t("Xin chào")} ${user.name}!`, "success");

        if (onLoginSuccess) {
          onLoginSuccess(user);
        }

        const home =
          user.role === "ADMIN"
            ? "/owner"
            : user.role === "EMPLOYEE"
            ? "/employee"
            : "/customer";

        navigate(home, { replace: true });
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e.message || t("Đăng nhập thất bại");
        setStatus("error");
        setErrorMsg(msg);
        toast(msg, "error");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(135deg, #f5f3ff 0%, #eef2ff 50%, #f0f9ff 100%)",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 20,
          padding: "48px 40px",
          maxWidth: 440,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(0,0,0,0.08)",
          border: "1px solid #e5e9ef",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            margin: "0 auto 20px",
            borderRadius: 14,
            background: "linear-gradient(135deg, #2634d5 0%, #3b82f6 50%, #20c779 100%)",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
            fontSize: 26,
            boxShadow: "0 8px 24px rgba(38, 52, 213, 0.3)",
          }}
        >
          C
        </div>

        {status === "processing" ? (
          <>
            <Loader2
              size={36}
              style={{
                animation: "oauthSpin 1s linear infinite",
                color: "#2634d5",
                marginBottom: 16,
              }}
            />
            <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: "#172033" }}>
              {t("Đang xử lý đăng nhập")}
            </h2>
            <p style={{ margin: 0, fontSize: 13.5, color: "#64748b", lineHeight: 1.6 }}>
              {t("Vui lòng chờ trong giây lát khi chúng tôi xác thực tài khoản {provider} của bạn...")
                .replace("{provider}", provider)}
            </p>
          </>
        ) : (
          <>
            <AlertCircle size={40} style={{ color: "#ef4444", marginBottom: 14 }} />
            <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: "#172033" }}>
              {t("Đăng nhập thất bại")}
            </h2>
            <p style={{ margin: "0 0 24px", fontSize: 13.5, color: "#64748b", lineHeight: 1.6 }}>
              {errorMsg}
            </p>
            <Link
              to="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "12px 24px",
                background: "#2634d5",
                color: "#fff",
                textDecoration: "none",
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              ← {t("Về trang đăng nhập")}
            </Link>
          </>
        )}
      </div>

      <style>{`
        @keyframes oauthSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
// ============================================================
// OAUTHCALLBACK.JSX — Xử lý callback từ Google/Facebook/Microsoft
// ============================================================
// V7 (2026-10): FIX AADSTS50011
//   - 🔧 Sửa redirectUri trỏ về route Frontend thay vì /api/
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";
import { api, setToken } from "../api";
import { toast } from "../components/Effects";
import { useI18n } from "../hooks/useI18n";
import { useAuth } from "../contexts/AuthContext";

export default function OAuthCallback({ provider, onLoginSuccess }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { setUser } = useAuth();

  const [status, setStatus] = useState("processing");
  const [errorMsg, setErrorMsg] = useState("");
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

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
      const msg = t("Không nhận được mã xác thực từ {provider}").replace("{provider}", provider);
      setStatus("error");
      setErrorMsg(msg);
      toast(msg, "error");
      return;
    }

    // 🔧 FIX: Luôn trỏ về Route của Frontend (VD: /auth/google/callback)
    // Backend sẽ nhận POST request chứa code để đổi lấy token
    const redirectUri = window.location.origin + `/auth/${provider}/callback`;

    api.oauth
      .callback(provider, code, redirectUri)
      .then(({ token, user }) => {
        setToken(token);
        setUser(user); 
        toast(`${t("Xin chào")} ${user.name}!`, "success");
        if (onLoginSuccess) onLoginSuccess(user);

        const home = user.role === "ADMIN" ? "/owner" : user.role === "EMPLOYEE" ? "/employee" : "/customer";
        navigate(home, { replace: true });
      })
      .catch((e) => {
        const msg = e.message || t("Đăng nhập thất bại");
        setStatus("error");
        setErrorMsg(msg);
        toast(msg, "error");
      });
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f3ff", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "48px 40px", maxWidth: 440, width: "100%", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.08)" }}>
        <div style={{ width: 56, height: 56, margin: "0 auto 20px", borderRadius: 14, background: "linear-gradient(135deg, #2634d5 0%, #3b82f6 50%, #20c779 100%)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 26 }}>C</div>

        {status === "processing" ? (
          <>
            <Loader2 size={36} style={{ animation: "oauthSpin 1s linear infinite", color: "#2634d5", marginBottom: 16 }} />
            <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: "#172033" }}>{t("Đang xử lý đăng nhập")}</h2>
            <p style={{ margin: 0, fontSize: 13.5, color: "#64748b" }}>{t("Vui lòng chờ trong giây lát...")}</p>
          </>
        ) : (
          <>
            <AlertCircle size={40} style={{ color: "#ef4444", marginBottom: 14 }} />
            <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: "#172033" }}>{t("Đăng nhập thất bại")}</h2>
            <p style={{ margin: "0 0 24px", fontSize: 13.5, color: "#64748b" }}>{errorMsg}</p>
            <Link to="/" style={{ display: "inline-flex", padding: "12px 24px", background: "#2634d5", color: "#fff", textDecoration: "none", borderRadius: 10, fontWeight: 700 }}>← {t("Về trang đăng nhập")}</Link>
          </>
        )}
      </div>
      <style>{`@keyframes oauthSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
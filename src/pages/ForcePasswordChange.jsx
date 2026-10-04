// ============================================================
// FORCE PASSWORD CHANGE — Bắt buộc đổi mật khẩu lần đầu đăng nhập
// ============================================================
// GIAI ĐOẠN 2 — Theo yêu cầu khách hàng:
//   "Nhân viên được cấp tài khoản phải đổi mật khẩu trong lần đăng
//    nhập đầu tiên, sau đó đăng nhập lại."
//
// Luồng:
//   1. Nhân viên đăng nhập bằng mật khẩu tạm do admin cấp
//      → /api/auth/login trả về user.must_change_password = true
//   2. App.jsx thấy cờ này → render trang này (chặn mọi route khác)
//   3. Nhân viên nhập mật khẩu hiện tại + mật khẩu mới
//      → PUT /api/auth/password (server xóa cờ must_change_password)
//   4. Tự động đăng xuất → quay về trang đăng nhập → đăng nhập lại
//      bằng mật khẩu mới.
// ============================================================

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldAlert, LockKeyhole, Eye, EyeOff, Loader2, LogOut, CheckCircle2,
} from "lucide-react";
import { api } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../hooks/useI18n";
import { toast } from "../components/Effects";

const MIN_LENGTH = 6;

export default function ForcePasswordChange() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // ---------- Ràng buộc hiển thị ngay cho người dùng ----------
  const rules = [
    { ok: newPassword.length >= MIN_LENGTH, text: t("Ít nhất 6 ký tự") },
    {
      ok: !!newPassword && newPassword !== currentPassword,
      text: t("Khác mật khẩu hiện tại"),
    },
    {
      ok: !!confirmPassword && confirmPassword === newPassword,
      text: t("Nhập lại mật khẩu trùng khớp"),
    },
  ];

  const allOk = rules.every((r) => r.ok);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (saving) return;

    if (!currentPassword) return setError(t("Vui lòng nhập mật khẩu hiện tại"));
    if (newPassword.length < MIN_LENGTH)
      return setError(t("Mật khẩu mới phải từ 6 ký tự"));
    if (newPassword === currentPassword)
      return setError(t("Mật khẩu mới phải khác mật khẩu hiện tại"));
    if (confirmPassword !== newPassword)
      return setError(t("Nhập lại mật khẩu không trùng khớp"));

    setError("");
    setSaving(true);

    try {
      await api.changePassword({ currentPassword, newPassword });

      toast(t("Đổi mật khẩu thành công!"), "success", { center: true });

      // Đăng xuất để đăng nhập lại bằng mật khẩu mới
      logout();

      try {
        localStorage.removeItem("canteen_cart");
        localStorage.removeItem("canteen_cart_selected");
      } catch {}

      navigate("/", { replace: true });
      toast(t("Vui lòng đăng nhập lại bằng mật khẩu mới."), "info", {
        center: true,
      });
    } catch (err) {
      const msg = err && err.message ? err.message : t("Đổi mật khẩu thất bại");
      setError(msg);
      toast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  // ============================================================
  // UI
  // ============================================================
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background:
          "linear-gradient(135deg, #eef2ff 0%, #f5f3ff 50%, #f0f9ff 100%)",
      }}
    >
      <div
        className="fpc-card"
        style={{
          background: "#fff",
          borderRadius: 20,
          padding: "40px 36px",
          maxWidth: 520,
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.08)",
          border: "1px solid #e5e9ef",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              background:
                "linear-gradient(135deg, #2634d5 0%, #3b82f6 50%, #20c779 100%)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              fontSize: 22,
              boxShadow: "0 8px 24px rgba(38, 52, 213, 0.3)",
            }}
          >
            C
          </div>
          <div>
            <b style={{ display: "block", fontSize: 15, color: "#172033" }}>
              {t("CANTEEN VWA")}
            </b>
            <small style={{ fontSize: 12, color: "#64748b" }}>
              {t("HỆ THỐNG QUẢN LÝ")}
            </small>
          </div>
        </div>

        {/* Tiêu đề */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 24,
          }}
        >
          <ShieldAlert size={22} style={{ color: "#f59e0b" }} />
          <h2
            style={{
              margin: 0,
              fontSize: 19,
              fontWeight: 800,
              color: "#172033",
            }}
          >
            {t("Đổi mật khẩu lần đầu đăng nhập")}
          </h2>
        </div>

        <p
          style={{
            margin: "10px 0 0",
            fontSize: 13.5,
            lineHeight: 1.65,
            color: "#64748b",
          }}
        >
          {t(
            "Vì lý do bảo mật, tài khoản được cấp mới phải đổi mật khẩu trước khi sử dụng hệ thống."
          )}
        </p>

        {/* Thông tin tài khoản */}
        {user && (
          <div
            style={{
              marginTop: 16,
              padding: "10px 14px",
              borderRadius: 10,
              background: "#f8fafc",
              border: "1px solid #e5e9ef",
              fontSize: 13,
              color: "#334155",
            }}
          >
            <b>{user.name}</b>
            <span style={{ color: "#94a3b8" }}> • </span>
            <span>{user.email}</span>
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: 16,
              padding: "10px 14px",
              borderRadius: 10,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#b91c1c",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          autoComplete="off"
          style={{ marginTop: 18 }}
        >
          <PasswordField
            id="fpc-current"
            label={t("Mật khẩu hiện tại")}
            placeholder={t("Nhập mật khẩu tạm được cấp")}
            value={currentPassword}
            onChange={(v) => {
              setCurrentPassword(v);
              if (error) setError("");
            }}
            show={showCurrent}
            onToggleShow={() => setShowCurrent((s) => !s)}
            disabled={saving}
            t={t}
          />

          <PasswordField
            id="fpc-new"
            label={t("Mật khẩu mới")}
            placeholder={t("Nhập mật khẩu mới")}
            value={newPassword}
            onChange={(v) => {
              setNewPassword(v);
              if (error) setError("");
            }}
            show={showNew}
            onToggleShow={() => setShowNew((s) => !s)}
            disabled={saving}
            t={t}
          />

          <PasswordField
            id="fpc-confirm"
            label={t("Nhập lại mật khẩu mới")}
            placeholder={t("Nhập lại mật khẩu mới")}
            value={confirmPassword}
            onChange={(v) => {
              setConfirmPassword(v);
              if (error) setError("");
            }}
            show={showConfirm}
            onToggleShow={() => setShowConfirm((s) => !s)}
            disabled={saving}
            onEnter={handleSubmit}
            t={t}
          />

          {/* Checklist ràng buộc */}
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "14px 0 18px",
              display: "grid",
              gap: 6,
            }}
          >
            {rules.map((r) => (
              <li
                key={r.text}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12.5,
                  color: r.ok ? "#16a34a" : "#94a3b8",
                  fontWeight: r.ok ? 700 : 500,
                }}
              >
                <CheckCircle2 size={15} />
                {r.text}
              </li>
            ))}
          </ul>

          <button
            type="submit"
            disabled={saving || !allOk}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "13px 18px",
              borderRadius: 10,
              border: "none",
              background:
                saving || !allOk
                  ? "#c7d2fe"
                  : "linear-gradient(135deg, #2634d5 0%, #3b82f6 100%)",
              color: "#fff",
              fontSize: 14.5,
              fontWeight: 800,
              cursor: saving || !allOk ? "not-allowed" : "pointer",
            }}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="fpc-spin" />
                {t("Đang lưu...")}
              </>
            ) : (
              <>
                <LockKeyhole size={16} />
                {t("Đổi mật khẩu & đăng nhập lại")}
              </>
            )}
          </button>
        </form>

        {/* Đăng xuất */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={saving}
          style={{
            marginTop: 14,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "11px 18px",
            borderRadius: 10,
            border: "1px solid #e5e9ef",
            background: "#fff",
            color: "#475569",
            fontSize: 13.5,
            fontWeight: 700,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          <LogOut size={15} />
          {t("Đăng xuất")}
        </button>
      </div>

      <style>{`
        @keyframes fpcSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .fpc-spin { animation: fpcSpin 1s linear infinite; }
        .fpc-card input:focus {
          border-color: #2634d5 !important;
          box-shadow: 0 0 0 3px rgba(38, 52, 213, 0.12);
        }
        .fpc-card button[type="submit"]:hover:not(:disabled) {
          filter: brightness(1.05);
        }
      `}</style>
    </div>
  );
}

// ============================================================
// SUB-COMPONENT — Ô nhập mật khẩu có nút hiện / ẩn
// ============================================================
function PasswordField({
  id,
  label,
  placeholder,
  value,
  onChange,
  show,
  onToggleShow,
  disabled,
  onEnter,
  t,
}) {
  return (
    <>
      <label
        htmlFor={id}
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 700,
          color: "#334155",
          marginBottom: 6,
          marginTop: 12,
        }}
      >
        {label}
      </label>

      <div style={{ position: "relative" }}>
        <LockKeyhole
          size={16}
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "#94a3b8",
          }}
        />

        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="new-password"
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) onEnter(e);
          }}
          style={{
            width: "100%",
            padding: "11px 42px",
            borderRadius: 10,
            border: "1px solid #e5e9ef",
            fontSize: 14,
            outline: "none",
            boxSizing: "border-box",
            color: "#172033",
            background: disabled ? "#f8fafc" : "#fff",
          }}
        />

        <button
          type="button"
          onClick={onToggleShow}
          tabIndex={-1}
          aria-label={show ? t("Ẩn mật khẩu") : t("Hiện mật khẩu")}
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "#94a3b8",
            display: "grid",
            placeItems: "center",
            padding: 6,
          }}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </>
  );
}

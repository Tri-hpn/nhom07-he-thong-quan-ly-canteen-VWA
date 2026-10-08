// ============================================================
// SECURITYPANEL.JSX — Bảo mật 2 lớp & Mật khẩu
// ============================================================
// - Đổi mật khẩu (gọi api.changePassword)
// - 2FA placeholder (chưa có backend)
// ============================================================

import { useState, useRef, useEffect } from "react";
import {
  Lock, KeyRound, Eye, EyeOff, Check, Loader2, ShieldCheck,
} from "lucide-react";
import { api } from "../../api";
import { toast } from "../Effects";
import { useI18n } from "../../hooks/useI18n";

export default function SecurityPanel() {
  const { t } = useI18n();
  const mountedRef = useRef(true);

  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const update = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (error) setError("");
  };

  const submit = async () => {
    if (loading) return;
    setError("");

    if (!form.currentPassword || !form.newPassword) {
      setError(t("Nhập đầy đủ thông tin"));
      return;
    }
    if (form.newPassword.length < 6) {
      setError(t("Mật khẩu mới phải từ 6 ký tự"));
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError(t("Xác nhận mật khẩu không khớp"));
      return;
    }

    setLoading(true);
    try {
      await api.changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      if (!mountedRef.current) return;
      toast(t("Đổi mật khẩu thành công!"), "success");
      setForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (e) {
      if (mountedRef.current) {
        setError(e.message || t("Lỗi đổi mật khẩu"));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-section">
        <h4 className="settings-section__title">
          {t("Đổi mật khẩu")}
        </h4>
        <p className="settings-section__desc">
          {t(
            "Đổi mật khẩu định kỳ để bảo vệ tài khoản Canteen VWA của bạn."
          )}
        </p>

        <div className="settings-security-card">
          {error && (
            <div className="settings-form__error">{error}</div>
          )}

          <div className="settings-form">
            <div className="settings-form__field">
              <label className="settings-form__label">
                {t("Mật khẩu hiện tại")}
              </label>
              <div className="settings-form__input-wrap">
                <Lock size={16} />
                <input
                  type={showPwd ? "text" : "password"}
                  value={form.currentPassword}
                  onChange={update("currentPassword")}
                  placeholder={t("Nhập mật khẩu hiện tại")}
                  disabled={loading}
                  className="settings-form__input"
                />
              </div>
            </div>

            <div className="settings-form__field">
              <label className="settings-form__label">
                {t("Mật khẩu mới")}
              </label>
              <div className="settings-form__input-wrap">
                <KeyRound size={16} />
                <input
                  type={showPwd ? "text" : "password"}
                  value={form.newPassword}
                  onChange={update("newPassword")}
                  placeholder={t("Tối thiểu 6 ký tự")}
                  disabled={loading}
                  className="settings-form__input"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="settings-form__eye"
                  aria-label={
                    showPwd ? t("Ẩn mật khẩu") : t("Hiện mật khẩu")
                  }
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="settings-form__field">
              <label className="settings-form__label">
                {t("Xác nhận mật khẩu mới")}
              </label>
              <div className="settings-form__input-wrap">
                <Check size={16} />
                <input
                  type={showPwd ? "text" : "password"}
                  value={form.confirmPassword}
                  onChange={update("confirmPassword")}
                  placeholder={t("Nhập lại mật khẩu mới")}
                  disabled={loading}
                  className="settings-form__input"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                  }}
                />
              </div>
            </div>

            <button
              type="button"
              className="settings-btn settings-btn--primary"
              onClick={submit}
              disabled={loading}
              style={{ alignSelf: "flex-start" }}
            >
              {loading ? (
                <>
                  <Loader2
                    size={14}
                    style={{ animation: "settingsSpin 1s linear infinite" }}
                  />
                  {t("Đang xử lý...")}
                </>
              ) : (
                <>
                  <KeyRound size={14} />
                  {t("Đổi mật khẩu")}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h4 className="settings-section__title">
          {t("Xác thực hai yếu tố (2FA)")}
        </h4>

        <div className="settings-security-card">
          <div className="settings-security-card__head">
            <div className="settings-security-card__icon">
              <ShieldCheck size={22} />
            </div>
            <div className="settings-security-card__body">
              <b>{t("Bảo vệ tài khoản 2 lớp")}</b>
              <span>
                {t(
                  "Thêm một lớp bảo vệ bằng mã OTP khi đăng nhập từ thiết bị lạ."
                )}
              </span>
            </div>
            <span className="settings-security-card__badge settings-security-card__badge--soon">
              {t("Sắp ra mắt")}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes settingsSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
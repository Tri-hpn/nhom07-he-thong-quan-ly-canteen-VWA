// ============================================================
// SETTINGSMODAL.JSX — Modal cài đặt dùng chung 3 role (V1)
// ============================================================
// - List 5-6 mục (ảnh 1)
// - Bấm 1 mục → chuyển sang sub-panel + nút back
// - Dùng cho CUSTOMER / EMPLOYEE / ADMIN
// - Tự chứa settings state (qua useSettings hook)
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings, ArrowLeft, X, Palette, Globe, CreditCard, Bell, Shield,
  UserRound, LogOut,
} from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import { useSettings } from "../hooks/useSettings";
import ConfirmDialog, { LogoutIcon } from "./ConfirmDialog";
import {
  SettingsList,
  AppearancePanel,
  LanguagePanel,
  WalletPanel,
  NotificationsPanel,
  SecurityPanel,
} from "./settings";
import "./settings/settings.css";

// ============================================================
// PANEL CONFIG
// ============================================================

const PANEL_CONFIG = {
  appearance: {
    icon: Palette,
    titleKey: "Giao diện & Trải nghiệm",
    subKey: "Sáng, Tối, Theo hệ thống và cỡ chữ",
    Component: AppearancePanel,
  },
  language: {
    icon: Globe,
    titleKey: "Ngôn ngữ & Khu vực",
    subKey: "Tiếng Việt, English, 日本語, 한국어, 中文",
    Component: LanguagePanel,
  },
  wallet: {
    icon: CreditCard,
    titleKey: "Ví VWA & Thẻ sinh viên",
    subKey: "Số dư, liên kết ngân hàng, mã PIN",
    Component: WalletPanel,
    customerOnly: true,
  },
  notifications: {
    icon: Bell,
    titleKey: "Thông báo & Giờ ca ăn",
    subKey: "Loại thông báo, khung giờ nhắc nhở",
    Component: NotificationsPanel,
  },
  security: {
    icon: Shield,
    titleKey: "Bảo mật 2 lớp & Mật khẩu",
    subKey: "Đổi mật khẩu, xác thực hai yếu tố",
    Component: SecurityPanel,
  },
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function SettingsModal({
  open,
  onClose,
  role,
  user,
  onLogout,
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const settings = useSettings();

  const [currentPanel, setCurrentPanel] = useState(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  // Reset về list khi mở
  useEffect(() => {
    if (open) setCurrentPanel(null);
  }, [open]);

  // ESC đóng
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (currentPanel) setCurrentPanel(null);
      else onClose?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, currentPanel, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (document.body.style.overflow === "hidden") {
        document.body.style.overflow = prev;
      }
    };
  }, [open]);

  const handleOpenProfile = useCallback(() => {
    const map = {
      CUSTOMER: "/customer/profile",
      EMPLOYEE: "/employee/profile",
      ADMIN: "/owner/profile",
    };
    const path = map[role] || "/customer/profile";
    onClose?.();
    navigate(path);
  }, [role, navigate, onClose]);

  const handleLogoutRequest = useCallback(() => {
    setConfirmLogout(true);
  }, []);

  const executeLogout = useCallback(() => {
    setConfirmLogout(false);
    onClose?.();
    onLogout?.();
  }, [onLogout, onClose]);

  if (!open) return null;

  const panel = currentPanel ? PANEL_CONFIG[currentPanel] : null;
  const PanelComponent = panel?.Component;
  const PanelIcon = panel?.icon;

  // Nếu panel yêu cầu customerOnly mà role không phải customer → back về list
  if (panel?.customerOnly && role !== "CUSTOMER") {
    setCurrentPanel(null);
    return null;
  }

  return (
    <>
      <div
        className="settings-overlay"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={t("Cài đặt")}
      >
        <div
          className={`settings-modal ${
            currentPanel ? "settings-modal--wide" : ""
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* HEADER */}
          <header className="settings-header">
            {currentPanel ? (
              <button
                type="button"
                className="settings-header__back"
                onClick={() => setCurrentPanel(null)}
                aria-label={t("Quay lại")}
              >
                <ArrowLeft size={20} />
              </button>
            ) : (
              <div className="settings-header__icon">
                <Settings size={20} />
              </div>
            )}

            <div className="settings-header__title">
              {panel && PanelIcon ? (
                <>
                  <h2>
                    <PanelIcon
                      size={18}
                      style={{
                        verticalAlign: "middle",
                        marginRight: 8,
                        display: "inline",
                      }}
                    />
                    {t(panel.titleKey)}
                  </h2>
                  <p>{t(panel.subKey)}</p>
                </>
              ) : (
                <>
                  <h2>{t("Cài đặt")}</h2>
                  <p>{t("Tùy chỉnh trải nghiệm Canteen VWA của bạn")}</p>
                </>
              )}
            </div>

            <button
              type="button"
              className="settings-header__close"
              onClick={onClose}
              aria-label={t("Đóng")}
            >
              <X size={20} />
            </button>
          </header>

          {/* BODY */}
          <div className="settings-body">
            {currentPanel && PanelComponent ? (
              <PanelComponent settings={settings} user={user} onClose={onClose} />
            ) : (
              <SettingsList
                role={role}
                onSelectPanel={setCurrentPanel}
                onOpenProfile={handleOpenProfile}
                onLogout={role === "CUSTOMER" ? onLogout : handleLogoutRequest}
              />
            )}
          </div>

          {/* FOOTER — chỉ hiện khi ở panel */}
          {currentPanel && (
            <footer className="settings-footer">
              <button
                type="button"
                className="settings-btn settings-btn--ghost"
                onClick={() => setCurrentPanel(null)}
              >
                {t("Quay lại")}
              </button>
              <button
                type="button"
                className="settings-btn settings-btn--primary"
                onClick={onClose}
              >
                {t("Xong")}
              </button>
            </footer>
          )}
        </div>
      </div>

      {/* LOGOUT CONFIRM */}
      <ConfirmDialog
        open={role !== "CUSTOMER" && confirmLogout}
        icon={LogoutIcon}
        title={t("Đăng xuất khỏi Canteen VWA?")}
        message={t(
          "Giỏ hàng hiện tại sẽ bị xoá. Bạn sẽ cần đăng nhập lại để tiếp tục."
        )}
        confirmText={t("Đăng xuất")}
        cancelText={t("Ở lại")}
        danger
        onConfirm={executeLogout}
        onClose={() => setConfirmLogout(false)}
      />
    </>
  );
}
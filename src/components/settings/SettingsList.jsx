// ============================================================
// SETTINGSLIST.JSX — Màn list chính của SettingsModal
// ============================================================
// 6 mục chính (theo ảnh 1):
//   1. Giao diện & Trải nghiệm     → AppearancePanel
//   2. Ngôn ngữ & Khu vực          → LanguagePanel
//   3. Ví VWA & Thẻ sinh viên      → WalletPanel (chỉ Customer)
//   4. Thông báo & Giờ ca ăn       → NotificationsPanel
//   5. Bảo mật 2 lớp & Mật khẩu    → SecurityPanel
//   + Đăng xuất (Q2:C)
// ============================================================

import {
  Palette, Globe, CreditCard, Bell, Shield, LogOut, ChevronRight,
  UserRound, HelpCircle,
} from "lucide-react";
import { useI18n } from "../../hooks/useI18n";

export default function SettingsList({
  role,
  onSelectPanel,
  onOpenProfile,
  onLogout,
}) {
  const { t } = useI18n();

  const isCustomer = role === "CUSTOMER";

  const items = [
    {
      key: "appearance",
      icon: Palette,
      title: t("Giao diện & Trải nghiệm"),
      desc: t("Sáng / Tối / Theo hệ thống, cỡ chữ hiển thị"),
      dot: true,
    },
    {
      key: "language",
      icon: Globe,
      title: t("Ngôn ngữ & Khu vực"),
      desc: t("Tiếng Việt, English, 日本語, 한국어, 中文"),
    },
    isCustomer
      ? {
          key: "wallet",
          icon: CreditCard,
          title: t("Ví VWA & Thẻ sinh viên"),
          desc: t("Số dư, liên kết ngân hàng, mã PIN"),
          badge: "PIN",
        }
      : null,
    {
      key: "notifications",
      icon: Bell,
      title: t("Thông báo & Giờ ca ăn"),
      desc: t("Loại thông báo, khung giờ nhắc nhở"),
    },
    {
      key: "security",
      icon: Shield,
      title: t("Bảo mật 2 lớp & Mật khẩu"),
      desc: t("Đổi mật khẩu, xác thực hai yếu tố"),
    },
  ].filter(Boolean);

  return (
    <div className="settings-list">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            className="settings-list__item"
            onClick={() => onSelectPanel(item.key)}
          >
            <div className="settings-list__icon">
              <Icon size={20} />
            </div>
            <div className="settings-list__body">
              <b>{item.title}</b>
              <span>{item.desc}</span>
            </div>
            <div className="settings-list__right">
              {item.badge && (
                <span className="settings-list__badge">{item.badge}</span>
              )}
              {item.dot && <span className="settings-list__dot" />}
              <ChevronRight
                size={18}
                className="settings-list__chevron"
              />
            </div>
          </button>
        );
      })}

      <>
<div className="settings-list__sep" />

      <button
        type="button"
        className="settings-list__item"
        onClick={onOpenProfile}
      >
        <div className="settings-list__icon">
          <UserRound size={20} />
        </div>
        <div className="settings-list__body">
          <b>{t("Hồ sơ cá nhân")}</b>
          <span>{t("Xem và chỉnh sửa thông tin tài khoản")}</span>
        </div>
        <div className="settings-list__right">
          <ChevronRight
            size={18}
            className="settings-list__chevron"
          />
        </div>
      </button>

      <button
        type="button"
        className="settings-list__item"
      >
        <div className="settings-list__icon">
          <HelpCircle size={20} />
        </div>
        <div className="settings-list__body">
          <b>{t("Trợ giúp & Quy chế")}</b>
          <span>{t("Câu hỏi thường gặp, quy định Canteen VWA")}</span>
        </div>
        <div className="settings-list__right">
          <ChevronRight
            size={18}
            className="settings-list__chevron"
          />
        </div>
      </button>

      <div className="settings-list__sep" />

      <button
        type="button"
        className="settings-list__item settings-list__item--danger"
        onClick={onLogout}
      >
        <div className="settings-list__icon">
          <LogOut size={20} />
        </div>
        <div className="settings-list__body">
          <b>{t("Đăng xuất")}</b>
          <span>{t("Thoát khỏi tài khoản hiện tại")}</span>
        </div>
        <div className="settings-list__right">
          <ChevronRight
            size={18}
            className="settings-list__chevron"
          />
        </div>
      </button>
</>
    </div>
  );
}
// ============================================================
// APPEARANCEPANEL.JSX — Giao diện & Trải nghiệm
// ============================================================
// - Theme: light / dark / auto (theo hệ thống)
// - Font size: 1 / 2 / 3 (range slider)
// ============================================================

import { Sun, Moon, Monitor, Type, Check } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";

const THEMES = [
  {
    id: "light",
    icon: Sun,
    labelKey: "Giao diện Sáng",
    descKey:
      "Khung cửa sổ trắng sáng, chữ tối tương phản cao, lý tưởng cho phòng học sáng và ban ngày.",
  },
  {
    id: "dark",
    icon: Moon,
    labelKey: "Giao diện Tối",
    descKey:
      "Tông than chì đen dịu mắt, chống mỏi mắt khi đặt đồ ăn khuya hoặc ca học tối tại ký túc xá.",
  },
  {
    id: "auto",
    icon: Monitor,
    labelKey: "Tự động hệ điều hành",
    descKey:
      "Tự động đồng bộ theo cài đặt Dark/Light của Windows, macOS, iOS hoặc Android của bạn.",
  },
];

const FONT_LABELS = [
  "Tiêu chuẩn (100% - Khuyến nghị)",
  "Vừa (Dễ nhìn)",
  "Lớn (Đọc nhanh)",
];

export default function AppearancePanel({ settings }) {
  const { t } = useI18n();
  const { theme, fontSize, setTheme, setFontSize } = settings;

  return (
    <div className="settings-panel">
      <div className="settings-section">
        <h4 className="settings-section__title">
          {t("Chế độ hiển thị (Theme Mode)")}
        </h4>
        <p className="settings-section__desc">
          {t(
            "Tùy chọn tông màu giao diện phù hợp với môi trường sử dụng hoặc tự động theo thiết bị của bạn."
          )}
        </p>

        <div className="settings-theme-grid">
          {THEMES.map((th) => {
            const Icon = th.icon;
            const active = theme === th.id;
            return (
              <button
                key={th.id}
                type="button"
                className={`settings-theme-card ${
                  active ? "active" : ""
                }`}
                onClick={() => setTheme(th.id)}
              >
                <div
                  className={`settings-theme-preview settings-theme-preview--${th.id}`}
                >
                  <div className="settings-theme-preview__bar" />
                  <div className="settings-theme-preview__row" />
                  <div className="settings-theme-preview__grid">
                    <span />
                    <span />
                  </div>
                </div>

                <div className="settings-theme-card__head">
                  <div className="settings-theme-card__title">
                    <Icon size={16} />
                    <span>{t(th.labelKey)}</span>
                  </div>
                  {active && (
                    <span className="settings-theme-card__check">
                      <Check size={12} />
                    </span>
                  )}
                </div>

                <p className="settings-theme-card__desc">
                  {t(th.descKey)}
                </p>

                <span
                  className={`settings-theme-card__tag ${
                    active ? "active" : ""
                  }`}
                >
                  {active ? t("Đang áp dụng") : t("Chuyển sang")}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="settings-section">
        <h4 className="settings-section__title">
          {t("Kích thước phông chữ hiển thị")}
        </h4>
        <p className="settings-section__desc">
          {t(
            "Tăng cỡ chữ giúp bạn dễ dàng đọc tên món, thành phần dị ứng và mức giá khi xếp hàng đặt món."
          )}
        </p>

        <div className="settings-fontsize">
          <div className="settings-fontsize__head">
            <div className="settings-fontsize__title">
              <Type size={16} />
              <span>{t("Cỡ chữ")}</span>
            </div>
            <span className="settings-fontsize__value">
              {t(FONT_LABELS[fontSize - 1])}
            </span>
          </div>

          <input
            type="range"
            min={1}
            max={3}
            value={fontSize}
            onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
            className="settings-fontsize__slider"
            aria-label={t("Cỡ chữ")}
          />

          <div className="settings-fontsize__labels">
            <span className={fontSize === 1 ? "active" : ""}>
              {t("Tiêu chuẩn")}
            </span>
            <span className={fontSize === 2 ? "active" : ""}>
              {t("Vừa")}
            </span>
            <span className={fontSize === 3 ? "active" : ""}>
              {t("Lớn")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
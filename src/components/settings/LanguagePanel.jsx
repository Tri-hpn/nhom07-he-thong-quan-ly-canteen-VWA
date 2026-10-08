// ============================================================
// LANGUAGEPANEL.JSX — Ngôn ngữ & Khu vực
// ============================================================
// 5 ngôn ngữ: vi / en / ja / ko / zh
// ============================================================

import { Check } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";

const LANGUAGES = [
  {
    code: "vi",
    flag: "🇻🇳",
    name: "Tiếng Việt",
    sub: "Vietnamese (Mặc định)",
  },
  {
    code: "en",
    flag: "🇺🇸",
    name: "English",
    sub: "United States • Global",
  },
  {
    code: "ja",
    flag: "🇯🇵",
    name: "日本語",
    sub: "Japanese",
  },
  {
    code: "ko",
    flag: "🇰🇷",
    name: "한국어",
    sub: "Korean Exchange",
  },
  {
    code: "zh",
    flag: "🇨🇳",
    name: "中文 (简体)",
    sub: "Simplified Chinese",
  },
];

export default function LanguagePanel({ settings }) {
  const { t } = useI18n();
  const { language, setLanguage } = settings;

  return (
    <div className="settings-panel">
      <div className="settings-section">
        <h4 className="settings-section__title">
          {t("Chọn ngôn ngữ hiển thị")}
        </h4>
        <p className="settings-section__desc">
          {t(
            "Áp dụng cho toàn bộ cổng thông tin Canteen VWA, hóa đơn điện tử và thông báo đẩy."
          )}
        </p>

        <div className="settings-lang-grid">
          {LANGUAGES.map((l) => {
            const active = language === l.code;
            return (
              <button
                key={l.code}
                type="button"
                className={`settings-lang-card ${
                  active ? "active" : ""
                }`}
                onClick={() => setLanguage(l.code)}
              >
                <div className="settings-lang-card__top">
                  <span className="settings-lang-card__flag">
                    {l.flag}
                  </span>
                  {active && (
                    <span className="settings-lang-card__check">
                      <Check size={12} />
                    </span>
                  )}
                </div>
                <div className="settings-lang-card__body">
                  <b>{l.name}</b>
                  <span>{l.sub}</span>
                </div>
                <span
                  className={`settings-lang-card__tag ${
                    active ? "active" : ""
                  }`}
                >
                  {active ? t("Đang chọn") : t("Chuyển đổi")}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
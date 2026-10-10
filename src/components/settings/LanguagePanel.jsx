// ============================================================
// LANGUAGEPANEL.JSX — Ngôn ngữ & Khu vực (V2 - FINAL)
// ============================================================
// V2 (2026-10):
//   - 🔧 FIX: tự dispatch event + ghi localStorage + gọi setLocale
//     → đổi ngôn ngữ có hiệu lực NGAY, không cần F5
// ============================================================

import { Check } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import { setLocale as setI18nLocale } from "../../lib/i18n";

const LANGUAGES = [
  { code: "vi", flag: "🇻🇳", name: "Tiếng Việt", sub: "Vietnamese (Mặc định)" },
  { code: "en", flag: "🇺🇸", name: "English", sub: "United States • Global" },
  { code: "ja", flag: "🇯🇵", name: "日本語", sub: "Japanese" },
  { code: "ko", flag: "🇰🇷", name: "한국어", sub: "Korean Exchange" },
  { code: "zh", flag: "🇨🇳", name: "中文 (简体)", sub: "Simplified Chinese" },
];

export default function LanguagePanel({ settings }) {
  const { t, locale } = useI18n();
  const { language, setLanguage } = settings || {};

  const currentLang = language || locale;

  const handleSelect = (code) => {
    // 1. Đồng bộ i18n engine (đây là cái quyết định render)
    try {
      setI18nLocale(code);
    } catch (e) {
      console.warn("[LanguagePanel] setLocale failed:", e);
    }

    // 2. Đồng bộ useSettings state (nếu có)
    if (typeof setLanguage === "function") {
      try {
        setLanguage(code);
      } catch (e) {
        console.warn("[LanguagePanel] settings.setLanguage failed:", e);
      }
    }

    // 3. Ghi localStorage cả 2 key
    try {
      localStorage.setItem("vwa_lang", code);
      localStorage.setItem("canteen_locale", code);
    } catch {}

    // 4. Dispatch event cho chắc
    try {
      window.dispatchEvent(
        new CustomEvent("language-change", { detail: { lang: code } })
      );
    } catch {}
  };

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
            const active = currentLang === l.code;
            return (
              <button
                key={l.code}
                type="button"
                className={`settings-lang-card ${active ? "active" : ""}`}
                onClick={() => handleSelect(l.code)}
              >
                <div className="settings-lang-card__top">
                  <span className="settings-lang-card__flag">{l.flag}</span>
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
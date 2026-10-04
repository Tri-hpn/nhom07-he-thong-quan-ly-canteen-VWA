// ============================================================
// useI18n — React hook chính thức
// ============================================================
// Usage:
//   const { t, tData, lang, setLang, languages, ready } = useI18n();
//   <h1>{t("Thực đơn")}</h1>
//   <p>{t("Xin chào {name}", { name: user.name })}</p>
//   <h3>{tData(item, "name")}</h3>       ← dịch dữ liệu động
// ============================================================

import { useState, useEffect, useCallback } from "react";
import {
  t as translate,
  getLang,
  setLang as setLangGlobal,
  getAvailableLangs,
  onLangChange,
  isReady,
} from "../lib/i18n";

/**
 * Lấy text đã localize từ object dữ liệu động (danh mục, món ăn).
 * Backend tự sinh field name_en, name_ja, ... khi trả về.
 *
 * @param {object} obj   - Document (VD: menu item, category)
 * @param {string} field - Field gốc (name, description, ...)
 * @returns {string}
 */
export function tData(obj, field = "name") {
  if (!obj) return "";

  const lang = getLang();

  // Tiếng Việt → trả field gốc
  if (lang === "vi") return obj[field] || "";

  // Thử field_{lang} (name_en, description_ja, ...)
  const localized = obj[`${field}_${lang}`];
  if (typeof localized === "string" && localized.trim()) {
    return localized;
  }

  // Fallback về tiếng Việt
  return obj[field] || "";
}

export function useI18n() {
  const [lang, setLangState] = useState(getLang);
  const [ready, setReady] = useState(isReady);

  useEffect(() => {
    const unsub = onLangChange((newLang) => {
      setLangState(newLang);
      setReady(true);
    });
    return unsub;
  }, []);

  const t = useCallback(
    (source, vars) => translate(source, vars),
    [lang] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const tD = useCallback(
    (obj, field) => tData(obj, field),
    [lang] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const setLang = useCallback((newLang) => {
    setLangGlobal(newLang);
  }, []);

  return {
    t,
    tData: tD,
    lang,
    setLang,
    languages: getAvailableLangs(),
    ready,
  };
}

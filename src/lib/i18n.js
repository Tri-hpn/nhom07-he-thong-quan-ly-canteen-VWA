// ============================================================
// i18n.js â€” Há»‡ thá»‘ng Ä‘a ngÃ´n ngá»¯ (V6 - FINAL)
// ============================================================
// V5 (2026-10) - FINAL:
//   - ðŸ”§ FIX L11: getCoverage() â€” chá»‰ cáº§n v !== "" lÃ  "Ä‘Ã£ dá»‹ch"
//   - ðŸ”§ FIX L17: import.meta.hot.dispose() cleanup listener
// V6 (2026-10):
//   - ðŸ”§ FIX H5: getCoverage bá» Ä‘iá»u kiá»‡n `v !== k` (trÃ¹ng vá»›i
//     comment L11 nÃ³i fix nhÆ°ng code cÅ© váº«n chÆ°a fix)
// ============================================================

import vi from "./i18n/locales/vi.json";
import en from "./i18n/locales/en.json";
import ja from "./i18n/locales/ja.json";
import ko from "./i18n/locales/ko.json";
import zh from "./i18n/locales/zh.json";

const LOCALES = { vi, en, ja, ko, zh };
const STORAGE_KEY = "canteen_locale";
const SETTINGS_STORAGE_KEY = "vwa_lang";

let currentLocale = "vi";
let snapshot = currentLocale;

const listeners = new Set();

// ---------- Load initial locale ----------
try {
  const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
  const savedOld = localStorage.getItem(STORAGE_KEY);

  if (savedSettings && LOCALES[savedSettings]) {
    currentLocale = savedSettings;
  } else if (savedOld && LOCALES[savedOld]) {
    currentLocale = savedOld;
    localStorage.setItem(SETTINGS_STORAGE_KEY, savedOld);
  }
  snapshot = currentLocale;
} catch {}

// ---------- Public API ----------

export function getLocale() {
  return snapshot;
}

export function setLocale(locale) {
  if (!LOCALES[locale]) {
    console.warn(`[i18n] Locale "${locale}" khÃ´ng tá»“n táº¡i`);
    return;
  }
  if (currentLocale === locale) return;

  currentLocale = locale;
  snapshot = locale;

  try {
    localStorage.setItem(STORAGE_KEY, locale);
    localStorage.setItem(SETTINGS_STORAGE_KEY, locale);
  } catch {}

  listeners.forEach((fn) => {
    try {
      fn(locale);
    } catch (e) {
      console.error("[i18n] listener error:", e);
    }
  });

  try {
    document.documentElement.lang = locale;
  } catch {}
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(key) {
  if (!key) return "";

  const k = String(key);
  const dict = LOCALES[currentLocale] || {};

  if (dict[k] !== undefined && dict[k] !== "") return dict[k];

  if (currentLocale !== "vi") {
    const viDict = LOCALES.vi || {};
    if (viDict[k] !== undefined && viDict[k] !== "") return viDict[k];
  }

  return k;
}

export function getAvailableKeys() {
  return Object.keys(LOCALES[currentLocale] || {});
}

export function getCoverage(locale = currentLocale) {
  const viKeys = Object.keys(LOCALES.vi || {});
  const dict = LOCALES[locale] || {};
  let translated = 0;
  const missing = [];

  for (const k of viKeys) {
    const v = dict[k];
    // âœ… FIX H5: báº£n dá»‹ch trÃ¹ng VI (tÃªn riÃªng, thÆ°Æ¡ng hiá»‡u) váº«n lÃ  "Ä‘Ã£ dá»‹ch".
    // Chá»‰ coi lÃ  "missing" khi value rá»—ng/null/undefined.
    if (v !== undefined && v !== null && v !== "") {
      translated++;
    } else {
      missing.push(k);
    }
  }

  return {
    locale,
    total: viKeys.length,
    translated,
    missing: missing.length,
    percent:
      viKeys.length > 0
        ? Math.round((translated / viKeys.length) * 1000) / 10
        : 0,
    missingKeys: missing,
  };
}

export function initI18n() {
  try {
    document.documentElement.lang = currentLocale;
  } catch {}
  return Promise.resolve();
}

// ---------- SYNC vá»›i settings + Ä‘a tab ----------
if (typeof window !== "undefined") {
  const onLanguageChange = (e) => {
    const newLang = e?.detail?.lang;
    if (!newLang || !LOCALES[newLang]) return;
    if (newLang === currentLocale) return;

    setLocale(newLang);
  };

  const onStorage = (e) => {
    if (e.key !== SETTINGS_STORAGE_KEY && e.key !== STORAGE_KEY) return;
    const newLang = e.newValue;
    if (!newLang || !LOCALES[newLang]) return;
    if (newLang === currentLocale) return;

    setLocale(newLang);
  };

  window.addEventListener("language-change", onLanguageChange);
  window.addEventListener("storage", onStorage);

  if (import.meta && import.meta.hot) {
    import.meta.hot.dispose(() => {
      window.removeEventListener("language-change", onLanguageChange);
      window.removeEventListener("storage", onStorage);
    });
  }
}

export default { t, getLocale, setLocale, initI18n, subscribe };
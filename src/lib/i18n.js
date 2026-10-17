// ============================================================
// i18n.js — Hệ thống đa ngôn ngữ (V7 - PERFORMANCE)
// ============================================================
// V7 (2026-10):
//   - ✅ Thêm cache (translationCache) để tăng tốc độ dịch.
//   - ✅ Tránh việc phải tìm kiếm lại các key đã biết.
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
const translationCache = new Map(); // 🔧 Cache tăng tốc độ dịch

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
    console.warn(`[i18n] Locale "${locale}" không tồn tại`);
    return;
  }
  if (currentLocale === locale) return;

  currentLocale = locale;
  snapshot = locale;
  translationCache.clear(); // 🔧 Xoá cache khi đổi ngôn ngữ

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
  const cacheKey = `${currentLocale}::${k}`;

  // 🔧 1. Kiểm tra cache trước (nhanh nhất)
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  const dict = LOCALES[currentLocale] || {};

  // 🔧 2. Tìm trong từ điển hiện tại
  if (dict[k] !== undefined && dict[k] !== "") {
    translationCache.set(cacheKey, dict[k]);
    return dict[k];
  }

  // 🔧 3. Fallback về tiếng Việt
  if (currentLocale !== "vi") {
    const viDict = LOCALES.vi || {};
    if (viDict[k] !== undefined && viDict[k] !== "") {
      translationCache.set(cacheKey, viDict[k]);
      return viDict[k];
    }
  }

  // 🔧 4. Không tìm thấy -> Lưu cache là chính nó để lần sau không phải tìm lại
  translationCache.set(cacheKey, k);
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

// ---------- SYNC với settings + đa tab ----------
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
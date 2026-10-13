// ============================================================
// i18n.js — Hệ thống đa ngôn ngữ (V4 - FINAL)
// ============================================================
// V2 (2026-10):
//   - ✅ Load tất cả locale files
//   - ✅ Persist ngôn ngữ vào localStorage
//   - ✅ Subscribe pattern để React re-render khi đổi lang
//   - ✅ Fallback: nếu key không có → trả key (tiếng Việt)
//
// V3 (2026-10):
//   - 🔧 Đồng bộ với useSettings.js (key "vwa_lang")
//   - 🔧 Lắng nghe sự kiện "language-change" và "storage"
//
// V4 (2026-10) - FINAL:
//   - 🔧 FIX CRITICAL: thêm `snapshot` cache cho useSyncExternalStore
//     → useI18n re-render ĐÚNG, không cần F5
//   - 🔧 getLocale() trả snapshot thay vì currentLocale
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
// 🔧 V4: snapshot cho useSyncExternalStore
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
  // 🔧 V4: phải trả snapshot (stable reference) cho useSyncExternalStore
  return snapshot;
}

export function setLocale(locale) {
  if (!LOCALES[locale]) {
    console.warn(`[i18n] Locale "${locale}" không tồn tại`);
    return;
  }
  if (currentLocale === locale) return;

  currentLocale = locale;
  snapshot = locale; // 🔧 V4: update snapshot TRƯỚC khi notify

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

/**
 * t(key) — dịch key
 * - Ưu tiên locale hiện tại
 * - Fallback VI
 * - Fallback key
 */
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
    if (v && v !== k && v !== LOCALES.vi[k]) {
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
  window.addEventListener("language-change", (e) => {
    const newLang = e?.detail?.lang;
    if (!newLang || !LOCALES[newLang]) return;
    if (newLang === currentLocale) return;
    console.log("[i18n] Sync từ settings:", newLang);
    setLocale(newLang);
  });

  window.addEventListener("storage", (e) => {
    if (e.key !== SETTINGS_STORAGE_KEY && e.key !== STORAGE_KEY) return;
    const newLang = e.newValue;
    if (!newLang || !LOCALES[newLang]) return;
    if (newLang === currentLocale) return;
    console.log("[i18n] Sync từ tab khác:", newLang);
    setLocale(newLang);
  });
}

export default { t, getLocale, setLocale, initI18n, subscribe };
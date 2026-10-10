// ============================================================
// i18n.js — Hệ thống đa ngôn ngữ (V2 - FINAL)
// ============================================================
// V2 (2026-10):
//   - ✅ Load tất cả locale files
//   - ✅ Persist ngôn ngữ vào localStorage
//   - ✅ Subscribe pattern để React re-render khi đổi lang
//   - ✅ Fallback: nếu key không có → trả key (tiếng Việt)
// ============================================================

import vi from "./i18n/locales/vi.json";
import en from "./i18n/locales/en.json";
import ja from "./i18n/locales/ja.json";
import ko from "./i18n/locales/ko.json";
import zh from "./i18n/locales/zh.json";

const LOCALES = { vi, en, ja, ko, zh };
const STORAGE_KEY = "canteen_locale";

let currentLocale = "vi";
const listeners = new Set();

// Load từ localStorage
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && LOCALES[saved]) currentLocale = saved;
} catch {}

export function getLocale() {
  return currentLocale;
}

export function setLocale(locale) {
  if (!LOCALES[locale]) {
    console.warn(`[i18n] Locale "${locale}" không tồn tại`);
    return;
  }
  if (currentLocale === locale) return;

  currentLocale = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {}

  // Notify all listeners
  listeners.forEach((fn) => {
    try {
      fn(locale);
    } catch (e) {
      console.error("[i18n] listener error:", e);
    }
  });

  // Update <html lang="">
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
 * - Nếu key không có trong locale hiện tại → fallback VI
 * - Nếu VI cũng không có → trả key
 */
export function t(key) {
  if (!key) return "";

  const k = String(key);
  const dict = LOCALES[currentLocale] || {};

  // 1. Thử dict hiện tại
  if (dict[k] !== undefined && dict[k] !== "") return dict[k];

  // 2. Fallback sang VI
  if (currentLocale !== "vi") {
    const viDict = LOCALES.vi || {};
    if (viDict[k] !== undefined && viDict[k] !== "") return viDict[k];
  }

  // 3. Trả key gốc
  return k;
}

/** Trả về danh sách key có sẵn trong locale hiện tại */
export function getAvailableKeys() {
  return Object.keys(LOCALES[currentLocale] || {});
}

/** Debug: xem coverage của 1 locale */
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
    percent: viKeys.length > 0
      ? Math.round((translated / viKeys.length) * 1000) / 10
      : 0,
    missingKeys: missing,
  };
}

/** Init — gọi ở main.jsx */
export function initI18n() {
  try {
    document.documentElement.lang = currentLocale;
  } catch {}
  return Promise.resolve();
}
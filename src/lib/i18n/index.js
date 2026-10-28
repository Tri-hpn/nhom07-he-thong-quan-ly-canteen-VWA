// ============================================================
// I18N CORE — Hệ thống đa ngôn ngữ (V10 - B8)
// ============================================================
// V10 (B8): applyVars escape regex special chars trong `key`
//           → tránh crash nếu key chứa . $ + ( [ ...

import vi from "./locales/vi.json";
import en from "./locales/en.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import zh from "./locales/zh.json";

const LANG_KEY = "vwa_lang";
const DEFAULT_LANG = "vi";

export const AVAILABLE_LANGS = [
  { code: "vi", flag: "🇻🇳", name: "Tiếng Việt" },
  { code: "en", flag: "🇺🇸", name: "English" },
  { code: "ja", flag: "🇯🇵", name: "日本語" },
  { code: "ko", flag: "🇰🇷", name: "한국어" },
  { code: "zh", flag: "🇨🇳", name: "中文" },
];

const DICTS = { vi, en, ja, ko, zh };

let currentLang = DEFAULT_LANG;
let ready = false;
let inited = false;

const listeners = new Set();
const translationCache = new Map();

// Escape regex specials trong tên biến {var}
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

try {
  if (typeof window !== "undefined" && typeof sessionStorage !== "undefined") {
    const saved = sessionStorage.getItem(LANG_KEY);
    if (saved && DICTS[saved]) {
      currentLang = saved;
    }
  }
} catch {}

export function getLang() { return currentLang; }
export function getLocale() { return currentLang; }
export function isReady() { return ready; }
export function getAvailableLangs() { return AVAILABLE_LANGS; }

export function onLangChange(cb) {
  if (typeof cb !== "function") return () => {};
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function subscribe(cb) { return onLangChange(cb); }

// 🔧 B8: escape ký tự regex đặc biệt trong `key`
function applyVars(text, vars) {
  if (!vars || typeof vars !== "object") return text;
  let out = text;
  for (const key of Object.keys(vars)) {
    const safeKey = String(key).replace(REGEX_SPECIALS, "\\$&");
    const re = new RegExp(`\\{${safeKey}\\}`, "g");
    out = out.replace(re, String(vars[key]));
  }
  return out;
}

export function t(source, vars) {
  if (source === null || source === undefined) return "";
  const key = String(source);

  const cacheKey = `${currentLang}::${key}`;
  if (translationCache.has(cacheKey) && !vars) {
    return translationCache.get(cacheKey);
  }

  let translated = key;

  if (currentLang !== "vi") {
    const dict = DICTS[currentLang] || {};
    translated = dict[key];

    if (!translated || translated === key) {
      const trimmed = key.trim();
      if (trimmed !== key) translated = dict[trimmed];

      if (!translated || translated === trimmed) {
        const normalized = key.replace(/\s+/g, " ").trim();
        if (normalized !== key) translated = dict[normalized];
      }
    }
  }

  if (!translated || translated === key) {
    translated = key;
  }

  if (!vars) {
    translationCache.set(cacheKey, translated);
  }

  return applyVars(translated, vars);
}

export function setLang(lang) {
  if (!lang || typeof lang !== "string") return;
  if (!DICTS[lang]) return;
  if (lang === currentLang) return;

  currentLang = lang;
  translationCache.clear();

  try {
    sessionStorage.setItem(LANG_KEY, lang);
  } catch {}

  listeners.forEach((cb) => {
    try { cb(lang); } catch (e) { console.error("[i18n] listener error:", e); }
  });

  try {
    window.dispatchEvent(new CustomEvent("language-change", { detail: { lang } }));
  } catch {}

  try { document.documentElement.lang = lang; } catch {}
}
export function setLocale(lang) { setLang(lang); }

if (typeof window !== "undefined") {
  try {
    window.addEventListener("language-change", (e) => {
      const next = e?.detail?.lang;
      if (!next || !DICTS[next] || next === currentLang) return;
      setLang(next);
    });
  } catch {}
}

export function initI18n() {
  ready = true;
  if (inited) return Promise.resolve(true);
  inited = true;

  try {
    document.documentElement.lang = currentLang;
  } catch {}

  return Promise.resolve(true);
}

export function getAvailableKeys() {
  return Object.keys(DICTS[currentLang] || {});
}

export function getCoverage(locale = currentLang) {
  const viKeys = Object.keys(DICTS.vi || {});
  const dict = DICTS[locale] || {};
  let translated = 0;
  const missing = [];

  for (const k of viKeys) {
    if (dict[k] !== undefined && dict[k] !== null && dict[k] !== "") {
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
    percent: viKeys.length > 0 ? Math.round((translated / viKeys.length) * 1000) / 10 : 0,
    missingKeys: missing,
  };
}

export default {
  t, getLang, getLocale, setLang, setLocale, initI18n,
  onLangChange, subscribe,
};
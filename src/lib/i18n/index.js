// ============================================================
// I18N CORE — Hệ thống đa ngôn ngữ (V9 - MULTI-TAB ISOLATED)
// ============================================================
// V9 (2026-10):
//   - 🔴 localStorage → sessionStorage: mỗi TAB độc lập
//   - 🔴 BỎ "storage" event listener (không sync cross-tab nữa)
//   - 🔴 BỎ OLD_STORAGE_KEY (không đọc localStorage nữa)
//   - ✅ "language-change" listener add ngay khi module load
//     (không cần gọi initI18n)
//   - ✅ useSettings(role) lo persist per-role; lib/i18n chỉ là
//     bộ nhớ đệm cho boot (đọc sessionStorage.vwa_lang không role)
// ============================================================

import vi from "./locales/vi.json";
import en from "./locales/en.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import zh from "./locales/zh.json";

const LANG_KEY = "vwa_lang"; // sessionStorage key (per tab)
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

// ============================================================
// BOOT: Đọc lang đã lưu (per-tab) — chỉ sessionStorage
// ============================================================
try {
  if (typeof window !== "undefined" && typeof sessionStorage !== "undefined") {
    const saved = sessionStorage.getItem(LANG_KEY);
    if (saved && DICTS[saved]) {
      currentLang = saved;
    }
  }
} catch {}

// ============================================================
// API CƠ BẢN
// ============================================================
export function getLang() { return currentLang; }
export function getLocale() { return currentLang; } // Alias cho useI18n
export function isReady() { return ready; }
export function getAvailableLangs() { return AVAILABLE_LANGS; }

// ---------- Subscribe / Listener ----------
export function onLangChange(cb) {
  if (typeof cb !== "function") return () => {};
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function subscribe(cb) { return onLangChange(cb); } // Alias cho useI18n

// ============================================================
// HÀM DỊCH
// ============================================================
function applyVars(text, vars) {
  if (!vars || typeof vars !== "object") return text;
  let out = text;
  for (const key of Object.keys(vars)) {
    const re = new RegExp(`\\{${key}\\}`, "g");
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

    // Fallback: trim / normalize
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

// ============================================================
// ĐỔI NGÔN NGỮ
// ============================================================
export function setLang(lang) {
  if (!lang || typeof lang !== "string") return;
  if (!DICTS[lang]) return;
  if (lang === currentLang) return;

  currentLang = lang;
  translationCache.clear();

  // 🔴 Ghi vào sessionStorage (per tab) — KHÔNG ghi localStorage
  try {
    sessionStorage.setItem(LANG_KEY, lang);
  } catch {}

  // Notify hook
  listeners.forEach((cb) => {
    try { cb(lang); } catch (e) { console.error("[i18n] listener error:", e); }
  });

  // Notify same-tab components
  try {
    window.dispatchEvent(new CustomEvent("language-change", { detail: { lang } }));
  } catch {}

  try { document.documentElement.lang = lang; } catch {}
}
export function setLocale(lang) { setLang(lang); } // Alias

// ============================================================
// 🔴 SAME-TAB EVENT LISTENER (add ngay, không cần initI18n)
// ============================================================
if (typeof window !== "undefined") {
  // Lắng nghe "language-change" (do useSettings dispatch)
  try {
    window.addEventListener("language-change", (e) => {
      const next = e?.detail?.lang;
      if (!next || !DICTS[next] || next === currentLang) return;
      setLang(next);
    });
  } catch {}

  // 🔴 KHÔNG listen "storage" event nữa — mỗi tab đã độc lập qua sessionStorage
}

// ============================================================
// KHỞI TẠO (giữ để tương thích ngược, không bắt buộc)
// ============================================================
export function initI18n() {
  ready = true;
  if (inited) return Promise.resolve(true);
  inited = true;

  try {
    document.documentElement.lang = currentLang;
  } catch {}

  // 🔴 Không add "storage" listener nữa
  // "language-change" đã được add ở module load

  return Promise.resolve(true);
}

// ============================================================
// EXPORT BỔ SUNG
// ============================================================
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
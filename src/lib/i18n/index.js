// ============================================================
// I18N CORE — Hệ thống đa ngôn ngữ (V8 - CANONICAL)
// ============================================================
// V8 (2026-10):
//   - ✅ Gộp toàn bộ logic của V5 và V7.
//   - ✅ Bổ sung getLocale/setLocale/subscribe cho useI18n.js.
//   - ✅ Thêm translationCache (Map) tăng tốc độ tra cứu.
//   - ✅ Đồng bộ 2 chiều: storage event + language-change event.
// ============================================================

import vi from "./locales/vi.json";
import en from "./locales/en.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import zh from "./locales/zh.json";

const LANG_KEY = "vwa_lang"; // Key chính
const OLD_STORAGE_KEY = "canteen_locale"; // Key cũ (tương thích ngược)
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

// Đọc lang đã lưu khi khởi tạo (ưu tiên vwa_lang, fallback canteen_locale)
try {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(LANG_KEY) || localStorage.getItem(OLD_STORAGE_KEY);
    if (saved && DICTS[saved]) {
      currentLang = saved;
      // Đồng bộ lại key mới nếu trước đó chỉ có key cũ
      localStorage.setItem(LANG_KEY, saved);
    }
  }
} catch {}

// ---------- API Cơ bản ----------
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

// ---------- Hàm dịch ----------
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
  
  // Cache key bao gồm cả lang và source
  const cacheKey = `${currentLang}::${key}`;
  if (translationCache.has(cacheKey) && !vars) {
    return translationCache.get(cacheKey);
  }

  let translated = key;

  if (currentLang !== "vi") {
    const dict = DICTS[currentLang] || {};
    translated = dict[key];
    
    // Fallback: thử trim / normalize nếu không tìm thấy
    if (!translated || translated === key) {
      const trimmed = key.trim();
      if (trimmed !== key) translated = dict[trimmed];
      
      if (!translated || translated === trimmed) {
        const normalized = key.replace(/\s+/g, " ").trim();
        if (normalized !== key) translated = dict[normalized];
      }
    }
  }

  // Nếu không có bản dịch, trả về source gốc
  if (!translated || translated === key) {
    translated = key;
  }

  // Lưu cache (chỉ lưu khi không có vars để tránh cache sai placeholder)
  if (!vars) {
    translationCache.set(cacheKey, translated);
  }

  return applyVars(translated, vars);
}

// ---------- Đổi ngôn ngữ ----------
export function setLang(lang) {
  if (!lang || typeof lang !== "string") return;
  if (!DICTS[lang]) return;
  if (lang === currentLang) return;

  currentLang = lang;
  translationCache.clear();

  try {
    localStorage.setItem(LANG_KEY, lang);
    localStorage.setItem(OLD_STORAGE_KEY, lang);
  } catch {}

  // Notify hook
  listeners.forEach((cb) => {
    try { cb(lang); } catch (e) { console.error("[i18n] listener error:", e); }
  });

  // Notify window (Topbar, CustomerProfile...)
  try {
    window.dispatchEvent(new CustomEvent("language-change", { detail: { lang } }));
  } catch {}

  try { document.documentElement.lang = lang; } catch {}
}
export function setLocale(lang) { setLang(lang); } // Alias cho useI18n

// ---------- Khởi tạo ----------
export function initI18n() {
  ready = true;
  if (inited) return Promise.resolve(true);
  inited = true;

  try {
    document.documentElement.lang = currentLang;
  } catch {}

  // Đồng bộ khi tab khác đổi lang
  try {
    window.addEventListener("storage", (e) => {
      if (e.key !== LANG_KEY && e.key !== OLD_STORAGE_KEY) return;
      const next = e.newValue;
      if (!next || !DICTS[next] || next === currentLang) return;
      setLang(next);
    });
  } catch {}

  // Đồng bộ khi component dispatch "language-change"
  try {
    window.addEventListener("language-change", (e) => {
      const next = e?.detail?.lang;
      if (!next || !DICTS[next] || next === currentLang) return;
      setLang(next);
    });
  } catch {}

  return Promise.resolve(true);
}

// ---------- Export bổ sung ----------
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
    locale, total: viKeys.length, translated, missing: missing.length,
    percent: viKeys.length > 0 ? Math.round((translated / viKeys.length) * 1000) / 10 : 0,
    missingKeys: missing,
  };
}

export default { t, getLang, getLocale, setLang, setLocale, initI18n, onLangChange, subscribe };
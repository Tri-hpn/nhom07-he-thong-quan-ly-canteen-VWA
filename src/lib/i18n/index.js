// ============================================================
// I18N CORE — Hệ thống đa ngôn ngữ (V10 - SYNC FIX)
// ============================================================
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

// ============================================================
// BOOT: Đọc lang đã lưu (per-tab) — ưu tiên key có role
// ============================================================
try {
  if (typeof window !== "undefined" && typeof sessionStorage !== "undefined") {
    const roles = ["ADMIN", "EMPLOYEE", "CUSTOMER"];
    let saved = null;
    // Tìm key có role trước
    for (const r of roles) {
      const val = sessionStorage.getItem(`${LANG_KEY}::${r}`);
      if (val && DICTS[val]) {
        saved = val;
        break;
      }
    }
    // Nếu không có, fallback về key chung
    if (!saved) {
      saved = sessionStorage.getItem(LANG_KEY);
    }
    if (saved && DICTS[saved]) {
      currentLang = saved;
    }
  }
} catch {}

// ============================================================
// API CƠ BẢN
// ============================================================
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

  // Chỉ dịch nếu ngôn ngữ hiện tại KHÁC tiếng Việt
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

// ============================================================
// ĐỔI NGÔN NGỮ
// ============================================================
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

// ============================================================
// SAME-TAB EVENT LISTENER
// ============================================================
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
  try { document.documentElement.lang = currentLang; } catch {}
  return Promise.resolve(true);
}

export default {
  t, getLang, getLocale, setLang, setLocale, initI18n,
  onLangChange, subscribe,
};
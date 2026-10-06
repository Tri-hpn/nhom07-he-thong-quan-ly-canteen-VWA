// ============================================================
// I18N CORE — Engine đa ngôn ngữ cho Canteen VWA
// ============================================================
// - Nguồn: `locales/_source.json` (VI)
// - Bản dịch: `locales/en.json`, `ja.json`, `ko.json`, `zh.json`
// - `t(source, vars)`: tra bản dịch theo lang hiện tại
//   + Placeholder `{name}`, `{n}`... thay bằng vars
//   + Fallback về source nếu thiếu bản dịch
// - `setLang`: đổi lang + dispatch "language-change" event
//   → Topbar.jsx / CustomerProfile.jsx đã listen event này
// 🔧 FIX #71: initI18n set ready ĐỒNG BỘ (dict đã import tĩnh),
//             guard chống gắn listener 2 lần
// ============================================================

import en from "./locales/en.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import zh from "./locales/zh.json";

// ---------- Constants ----------

const LANG_KEY = "vwa_lang";
const DEFAULT_LANG = "vi";

export const AVAILABLE_LANGS = [
  { code: "vi", flag: "🇻🇳", name: "Tiếng Việt" },
  { code: "en", flag: "🇺🇸", name: "English" },
  { code: "ja", flag: "🇯🇵", name: "日本語" },
  { code: "ko", flag: "🇰🇷", name: "한국어" },
  { code: "zh", flag: "🇨🇳", name: "中文" },
];

// ---------- Dictionaries ----------

const DICTS = {
  vi: null, // VI = source, không cần dict
  en,
  ja,
  ko,
  zh,
};

// ---------- State ----------

let currentLang = DEFAULT_LANG;
let ready = false;
let inited = false; // 🔧 FIX #71: guard chống init 2 lần

const listeners = new Set();

// Đọc lang đã lưu — đồng bộ với Topbar/CustomerProfile dùng key "vwa_lang"
try {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && DICTS[saved] !== undefined) {
      currentLang = saved;
    } else if (saved && !AVAILABLE_LANGS.some((l) => l.code === saved)) {
      currentLang = DEFAULT_LANG;
    }
  }
} catch {
  currentLang = DEFAULT_LANG;
}

// ---------- Public API ----------

export function getLang() {
  return currentLang;
}

export function isReady() {
  return ready;
}

export function getAvailableLangs() {
  return AVAILABLE_LANGS;
}

/**
 * Subscribe sự kiện đổi ngôn ngữ.
 * @param {(lang:string)=>void} cb
 * @returns {() => void} unsubscribe
 */
export function onLangChange(cb) {
  if (typeof cb !== "function") return () => {};
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Thay placeholder dạng `{name}`, `{n}`, `{amount}` trong text.
 */
function applyVars(text, vars) {
  if (!vars || typeof vars !== "object") return text;
  let out = text;
  for (const key of Object.keys(vars)) {
    const re = new RegExp(`\\{${key}\\}`, "g");
    out = out.replace(re, String(vars[key]));
  }
  return out;
}

/**
 * Dịch 1 câu.
 * @param {string} source Text gốc (tiếng Việt).
 * @param {object} [vars]  Placeholder values.
 * @returns {string}
 */
export function t(source, vars) {
  if (source === null || source === undefined) return "";
  const key = String(source);

  // VI → trả nguyên
  if (currentLang === "vi") {
    return applyVars(key, vars);
  }

  const dict = DICTS[currentLang];
  const translated = dict && dict[key];

  // Có bản dịch thật (không phải self-ref)
  if (
    typeof translated === "string" &&
    translated.length > 0 &&
    translated !== key
  ) {
    return applyVars(translated, vars);
  }

  // Fallback về source
  return applyVars(key, vars);
}

/**
 * Đổi ngôn ngữ. Phát event "language-change" để các component đồng bộ
 * (Topbar, CustomerProfile, ChatBotWidget... đã listen event này).
 * @param {string} lang
 */
export function setLang(lang) {
  if (!lang || typeof lang !== "string") return;
  if (!AVAILABLE_LANGS.some((l) => l.code === lang)) return;
  if (lang === currentLang) {
    // Vẫn phát event để UI re-sync (Topbar đọc localStorage)
    try {
      window.dispatchEvent(
        new CustomEvent("language-change", { detail: { lang } })
      );
    } catch {}
    return;
  }

  currentLang = lang;

  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {}

  // Notify internal listeners
  listeners.forEach((cb) => {
    try {
      cb(lang);
    } catch (e) {
      console.error("[i18n] listener error:", e);
    }
  });

  // Notify window listeners (Topbar, CustomerProfile, ...)
  try {
    window.dispatchEvent(
      new CustomEvent("language-change", { detail: { lang } })
    );
  } catch {}
}

/**
 * Khởi tạo i18n. Gọi 1 lần ở main.jsx.
 *
 * 🔧 FIX #71: dict đã import tĩnh (không fetch) → set `ready = true`
 *   ĐỒNG BỘ trước khi return. Promise trả về chỉ để tương thích
 *   API async của main.jsx (await initI18n()).
 *   Guard `inited` tránh gắn listener 2 lần nếu gọi nhiều lần.
 */
export function initI18n() {
  // 🔧 FIX #71: set ready NGAY (sync) — dict đã có sẵn, không cần chờ
  ready = true;

  // 🔧 FIX #71: chỉ gắn listener 1 lần duy nhất
  if (inited) return Promise.resolve(true);
  inited = true;

  // Đồng bộ khi tab khác đổi lang
  try {
    window.addEventListener("storage", (e) => {
      if (e.key !== LANG_KEY || !e.newValue) return;
      if (!AVAILABLE_LANGS.some((l) => l.code === e.newValue)) return;
      if (e.newValue === currentLang) return;
      currentLang = e.newValue;
      listeners.forEach((cb) => {
        try {
          cb(currentLang);
        } catch {}
      });
    });
  } catch {}

  // Đồng bộ khi Topbar/CustomerProfile dispatch "language-change"
  try {
    window.addEventListener("language-change", (e) => {
      const next = e?.detail?.lang;
      if (!next || next === currentLang) return;
      if (!AVAILABLE_LANGS.some((l) => l.code === next)) return;
      currentLang = next;
      try {
        localStorage.setItem(LANG_KEY, next);
      } catch {}
      listeners.forEach((cb) => {
        try {
          cb(currentLang);
        } catch {}
      });
    });
  } catch {}

  return Promise.resolve(true);
}

export default { t, getLang, setLang, initI18n, onLangChange };
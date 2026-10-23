// ============================================================
// USESETTINGS.JS — Hook quản lý cài đặt người dùng (V3 - FINAL)
// ============================================================
// V3 (2026-10):
//   - 🔧 FIX: listen "language-change" để sync state khi cùng tab
//     có ai gọi setLang() từ i18n (storage event chỉ fire tab khác).
//   - 🔧 Pattern cleanup theme an toàn (array cleanup).
//   - Giữ fix L13: resetAll không removeItem — các effect persist
//     tự ghi lại DEFAULT.
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

export const LS_KEYS = {
  THEME: "vwa_theme",
  LANG: "vwa_lang",
  DIETARY: "vwa_dietary",
  NOTI_PREFS: "vwa_noti_prefs",
  MEAL_SLOTS: "vwa_meal_slots",
  FONT_SIZE: "vwa_font_size",
};

export const DEFAULT_DIETARY = {
  vegetarian: true,
  lessSpicy: true,
  seafoodAllergy: false,
  brownRice: false,
};

export const DEFAULT_NOTI_PREFS = {
  orderReady: true,
  orderStatus: true,
  promotion: true,
  wallet: true,
  sound: true,
  vibration: false,
};

export const DEFAULT_MEAL_SLOTS = {
  breakfast: true,
  lunch: true,
  dinner: false,
  notifyBefore: 15,
};

const VALID_THEMES = ["light", "dark", "auto"];
const VALID_LANGS = ["vi", "en", "ja", "ko", "zh"];
const VALID_FONT_SIZES = [1, 2, 3];

// ---------- Helpers ----------
function safeGetItem(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSetItem(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}
function readLocalJson(key, fallback) {
  try {
    const raw = safeGetItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ...fallback, ...parsed };
    }
    return parsed;
  } catch { return fallback; }
}
function writeLocalJson(key, value) {
  try { safeSetItem(key, JSON.stringify(value)); } catch {}
}
function readTheme() {
  if (typeof window === "undefined") return "light";
  const saved = safeGetItem(LS_KEYS.THEME);
  return VALID_THEMES.includes(saved) ? saved : "light";
}
function readLanguage() {
  if (typeof window === "undefined") return "vi";
  const saved = safeGetItem(LS_KEYS.LANG);
  return VALID_LANGS.includes(saved) ? saved : "vi";
}
function readFontSize() {
  if (typeof window === "undefined") return 1;
  const n = parseInt(safeGetItem(LS_KEYS.FONT_SIZE) || "1", 10);
  return VALID_FONT_SIZES.includes(n) ? n : 1;
}

// ---------- Main hook ----------
export function useSettings() {
  const [theme, setThemeState] = useState(readTheme);
  const [language, setLanguageState] = useState(readLanguage);
  const [fontSize, setFontSizeState] = useState(readFontSize);

  const [dietary, setDietaryState] = useState(() => readLocalJson(LS_KEYS.DIETARY, DEFAULT_DIETARY));
  const [notiPrefs, setNotiPrefsState] = useState(() => readLocalJson(LS_KEYS.NOTI_PREFS, DEFAULT_NOTI_PREFS));
  const [mealSlots, setMealSlotsState] = useState(() => readLocalJson(LS_KEYS.MEAL_SLOTS, DEFAULT_MEAL_SLOTS));

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Apply theme → DOM + localStorage + event
  useEffect(() => {
    if (typeof document === "undefined") return;

    const applyTheme = () => {
      safeSetItem(LS_KEYS.THEME, theme);
      document.documentElement.classList.remove("dark-mode");
      if (theme === "dark") {
        document.documentElement.classList.add("dark-mode");
      } else if (theme === "auto") {
        try {
          const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
          if (prefersDark) document.documentElement.classList.add("dark-mode");
        } catch {}
      }
    };

    applyTheme();

    try {
      window.dispatchEvent(new CustomEvent("theme-change", { detail: { theme } }));
    } catch {}

    // 🔧 Cleanup array pattern
    const cleanups = [];
    if (theme === "auto") {
      try {
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = () => applyTheme();
        if (mq.addEventListener) {
          mq.addEventListener("change", handler);
          cleanups.push(() => mq.removeEventListener("change", handler));
        } else if (mq.addListener) {
          mq.addListener(handler);
          cleanups.push(() => mq.removeListener(handler));
        }
      } catch {}
    }
    return () => cleanups.forEach((fn) => { try { fn(); } catch {} });
  }, [theme]);

  // Apply font scale
  useEffect(() => {
    if (typeof document === "undefined") return;
    try {
      safeSetItem(LS_KEYS.FONT_SIZE, String(fontSize));
      const scale = 1 + (fontSize - 1) * 0.12;
      document.documentElement.style.setProperty("--app-font-scale", String(scale));
    } catch {}
  }, [fontSize]);

  // Apply language → dispatch event
  useEffect(() => {
    safeSetItem(LS_KEYS.LANG, language);
    try {
      window.dispatchEvent(new CustomEvent("language-change", { detail: { lang: language } }));
    } catch {}
  }, [language]);

  // 🔧 FIX: listen "language-change" để same-tab sync khi ai đó
  // gọi setLang() từ i18n (storage event chỉ fire ở tab khác).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onLang = (e) => {
      const next = e?.detail?.lang;
      if (!next || !VALID_LANGS.includes(next)) return;
      setLanguageState((prev) => (prev === next ? prev : next));
    };
    window.addEventListener("language-change", onLang);
    return () => window.removeEventListener("language-change", onLang);
  }, []);

  // Persist dietary / noti / meal
  useEffect(() => { writeLocalJson(LS_KEYS.DIETARY, dietary); }, [dietary]);
  useEffect(() => { writeLocalJson(LS_KEYS.NOTI_PREFS, notiPrefs); }, [notiPrefs]);
  useEffect(() => { writeLocalJson(LS_KEYS.MEAL_SLOTS, mealSlots); }, [mealSlots]);

  // Listen storage (tab khác đổi)
  useEffect(() => {
    const handler = (e) => {
      if (!mountedRef.current) return;
      if (e.key === LS_KEYS.THEME && VALID_THEMES.includes(e.newValue)) {
        setThemeState(e.newValue);
      } else if (e.key === LS_KEYS.LANG && VALID_LANGS.includes(e.newValue)) {
        setLanguageState(e.newValue);
      } else if (e.key === LS_KEYS.FONT_SIZE) {
        const n = parseInt(e.newValue || "1", 10);
        if (VALID_FONT_SIZES.includes(n)) setFontSizeState(n);
      } else if (e.key === LS_KEYS.DIETARY) {
        setDietaryState(readLocalJson(LS_KEYS.DIETARY, DEFAULT_DIETARY));
      } else if (e.key === LS_KEYS.NOTI_PREFS) {
        setNotiPrefsState(readLocalJson(LS_KEYS.NOTI_PREFS, DEFAULT_NOTI_PREFS));
      } else if (e.key === LS_KEYS.MEAL_SLOTS) {
        setMealSlotsState(readLocalJson(LS_KEYS.MEAL_SLOTS, DEFAULT_MEAL_SLOTS));
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Setters
  const setTheme = useCallback((value) => {
    if (!VALID_THEMES.includes(value)) return;
    setThemeState(value);
  }, []);
  const setLanguage = useCallback((value) => {
    if (!VALID_LANGS.includes(value)) return;
    setLanguageState(value);
  }, []);
  const setFontSize = useCallback((value) => {
    const n = parseInt(value, 10);
    if (!VALID_FONT_SIZES.includes(n)) return;
    setFontSizeState(n);
  }, []);
  const toggleDietary = useCallback((key) => {
    setDietaryState((d) => ({ ...d, [key]: !d[key] }));
  }, []);
  const toggleNotiPref = useCallback((key) => {
    setNotiPrefsState((p) => ({ ...p, [key]: !p[key] }));
  }, []);
  const toggleMealSlot = useCallback((key) => {
    setMealSlotsState((s) => ({ ...s, [key]: !s[key] }));
  }, []);
  const setNotifyBefore = useCallback((minutes) => {
    const n = parseInt(minutes, 10);
    if (isNaN(n) || n < 0) return;
    setMealSlotsState((s) => ({ ...s, notifyBefore: n }));
  }, []);

  const resetAll = useCallback(() => {
    setThemeState("light");
    setLanguageState("vi");
    setFontSizeState(1);
    setDietaryState({ ...DEFAULT_DIETARY });
    setNotiPrefsState({ ...DEFAULT_NOTI_PREFS });
    setMealSlotsState({ ...DEFAULT_MEAL_SLOTS });
  }, []);

  return useMemo(
    () => ({
      theme, language, fontSize, dietary, notiPrefs, mealSlots,
      setTheme, setLanguage, setFontSize,
      toggleDietary, toggleNotiPref, toggleMealSlot, setNotifyBefore,
      resetAll,
    }),
    [
      theme, language, fontSize, dietary, notiPrefs, mealSlots,
      setTheme, setLanguage, setFontSize,
      toggleDietary, toggleNotiPref, toggleMealSlot, setNotifyBefore,
      resetAll,
    ]
  );
}

export default useSettings;
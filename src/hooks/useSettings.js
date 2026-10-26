// ============================================================
// USESETTINGS.JS — Hook cài đặt NGƯỜI DÙNG (V4 - MULTI-TAB ISOLATED)
// ============================================================
// V4 (2026-10):
//   - 🔴 ĐỔI localStorage → sessionStorage: mỗi TAB độc lập
//   - 🔴 Thêm suffix ROLE vào key: vwa_theme::ADMIN / ::EMPLOYEE / ::CUSTOMER
//   - 🔴 BỎ storage event listener (không sync cross-tab nữa)
//   - Giữ: language-change same-tab, theme apply DOM, font scale
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
const roleSuffix = (role) => (role ? `::${role}` : "");
const keyWithRole = (base, role) => `${base}${roleSuffix(role)}`;

function safeGetItem(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function safeSetItem(key, value) {
  try { sessionStorage.setItem(key, value); } catch {}
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

function readTheme(role) {
  if (typeof window === "undefined") return "light";
  const saved = safeGetItem(keyWithRole(LS_KEYS.THEME, role));
  return VALID_THEMES.includes(saved) ? saved : "light";
}
function readLanguage(role) {
  if (typeof window === "undefined") return "vi";
  const saved = safeGetItem(keyWithRole(LS_KEYS.LANG, role));
  return VALID_LANGS.includes(saved) ? saved : "vi";
}
function readFontSize(role) {
  if (typeof window === "undefined") return 1;
  const n = parseInt(safeGetItem(keyWithRole(LS_KEYS.FONT_SIZE, role)) || "1", 10);
  return VALID_FONT_SIZES.includes(n) ? n : 1;
}

// ---------- Main hook ----------
export function useSettings(role = "CUSTOMER") {
  const [theme, setThemeState] = useState(() => readTheme(role));
  const [language, setLanguageState] = useState(() => readLanguage(role));
  const [fontSize, setFontSizeState] = useState(() => readFontSize(role));

  const [dietary, setDietaryState] = useState(() =>
    readLocalJson(keyWithRole(LS_KEYS.DIETARY, role), DEFAULT_DIETARY)
  );
  const [notiPrefs, setNotiPrefsState] = useState(() =>
    readLocalJson(keyWithRole(LS_KEYS.NOTI_PREFS, role), DEFAULT_NOTI_PREFS)
  );
  const [mealSlots, setMealSlotsState] = useState(() =>
    readLocalJson(keyWithRole(LS_KEYS.MEAL_SLOTS, role), DEFAULT_MEAL_SLOTS)
  );

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Apply theme → DOM + sessionStorage + event (same tab)
  useEffect(() => {
    if (typeof document === "undefined") return;

    const applyTheme = () => {
      safeSetItem(keyWithRole(LS_KEYS.THEME, role), theme);
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
  }, [theme, role]);

  // Apply font scale
  useEffect(() => {
    if (typeof document === "undefined") return;
    try {
      safeSetItem(keyWithRole(LS_KEYS.FONT_SIZE, role), String(fontSize));
      const scale = 1 + (fontSize - 1) * 0.12;
      document.documentElement.style.setProperty("--app-font-scale", String(scale));
    } catch {}
  }, [fontSize, role]);

  // Apply language → dispatch event (chỉ trong tab hiện tại)
  useEffect(() => {
    safeSetItem(keyWithRole(LS_KEYS.LANG, role), language);
    try {
      window.dispatchEvent(new CustomEvent("language-change", { detail: { lang: language } }));
    } catch {}
  }, [language, role]);

  // Listen "language-change" (same-tab sync khi ai đó gọi setLang từ i18n)
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
  useEffect(() => { writeLocalJson(keyWithRole(LS_KEYS.DIETARY, role), dietary); }, [dietary, role]);
  useEffect(() => { writeLocalJson(keyWithRole(LS_KEYS.NOTI_PREFS, role), notiPrefs); }, [notiPrefs, role]);
  useEffect(() => { writeLocalJson(keyWithRole(LS_KEYS.MEAL_SLOTS, role), mealSlots); }, [mealSlots, role]);

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
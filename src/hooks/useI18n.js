// ============================================================
// useI18n.js — Hook đa ngôn ngữ (V6 - FINAL)
// ============================================================
// V5 (2026-10):
//   - ✅ FIX CRITICAL: thêm tData() — dịch field dữ liệu
//
// V6 (2026-10) - FINAL:
//   - 🔧 FIX CRITICAL: dùng useSyncExternalStore → re-render ĐÚNG
//     khi locale thay đổi (KHÔNG cần F5)
//   - 🔧 Xoá biến setLocale bị trùng tên
// ============================================================

import { useCallback, useSyncExternalStore } from "react";
import {
  getLocale,
  subscribe,
  setLocale as setLocaleGlobal,
  t as tGlobal,
} from "../lib/i18n";

const isDev = import.meta.env.DEV;
const warnedKeys = new Set();

export function useI18n() {
  // 🔧 V6: useSyncExternalStore — React 18+ official way
  const locale = useSyncExternalStore(
    subscribe,
    getLocale,
    getLocale // SSR fallback
  );

  /**
   * t(key, params) — dịch key UI
   * Fallback: dict[key] → dict[trim] → dict[normalize] → key
   */
  const t = useCallback(
    (key, params) => {
      if (key === undefined || key === null) return "";

      const k = String(key);
      let translated = tGlobal(k);

      if (translated === k || !translated) {
        const trimmed = k.trim();
        if (trimmed !== k) {
          const t2 = tGlobal(trimmed);
          if (t2 && t2 !== trimmed) translated = t2;
        }

        const normalized = k.replace(/\s+/g, " ").trim();
        if (translated === k && normalized !== k) {
          const t3 = tGlobal(normalized);
          if (t3 && t3 !== normalized) translated = t3;
        }

        if (isDev && translated === k && !warnedKeys.has(k)) {
          warnedKeys.add(k);
          if (k.length > 0 && k.length < 200 && !k.startsWith("/")) {
            console.warn(`[i18n] Key chưa dịch: "${k}"`);
          }
        }
      }

      if (params && typeof translated === "string") {
        translated = translated.replace(/\{(\w+)\}/g, (match, name) => {
          return params[name] !== undefined ? String(params[name]) : match;
        });
      }

      return translated || k;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale]
  );

  /**
   * tData(obj, field) — dịch field dữ liệu (name, description...)
   */
  const tData = useCallback(
    (obj, field) => {
      if (!obj || !field) return "";

      const lang = locale || "vi";

      if (lang === "vi") return obj[field] || "";

      const translated = obj[`${field}_${lang}`];
      if (typeof translated === "string" && translated.trim()) {
        return translated;
      }

      return obj[field] || "";
    },
    [locale]
  );

  const setLocale = useCallback((newLang) => {
    setLocaleGlobal(newLang);
  }, []);

  return { t, tData, locale, setLocale };
}

export default useI18n;
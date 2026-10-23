// ============================================================
// useI18n.js — Hook đa ngôn ngữ (V8 - PERFORMANCE)
// ============================================================
// V8 (2026-10):
//   - 🔧 FIX: dùng useMemo(new Map(), [locale]) thay vì clear trong
//     render body (vi phạm React rules, có thể sai concurrent render).
//   - 🔧 Safe JSON.stringify(params) — không crash nếu circular/BigInt.
//   - Giữ nguyên V7: cache local cấp hook, không console.warn spam.
// ============================================================

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  getLocale,
  subscribe,
  setLocale as setLocaleGlobal,
  t as tGlobal,
} from "../lib/i18n";

function safeParamsKey(params) {
  if (!params) return "";
  try {
    return JSON.stringify(params);
  } catch {
    // Circular / BigInt / function → không cache
    return "__uncacheable__";
  }
}

export function useI18n() {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);

  // 🔧 Mỗi locale mới → Map mới (không cần clear thủ công)
  const localCache = useMemo(() => new Map(), [locale]);

  const t = useCallback(
    (key, params) => {
      if (key === undefined || key === null) return "";

      const k = String(key);
      const paramsKey = safeParamsKey(params);
      const cacheKey = paramsKey ? `${k}::${paramsKey}` : k;

      if (localCache.has(cacheKey)) return localCache.get(cacheKey);

      let translated = tGlobal(k);

      // Fallback: thử trim / normalize nếu không tìm thấy
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
      }

      // Thay placeholder {name}, {n}, ...
      if (params && typeof translated === "string" && translated.includes("{")) {
        translated = translated.replace(/\{(\w+)\}/g, (match, name) =>
          params[name] !== undefined ? String(params[name]) : match
        );
      }

      const result = translated || k;
      localCache.set(cacheKey, result);
      return result;
    },
    [locale, localCache]
  );

  const tData = useCallback(
    (obj, field) => {
      if (!obj || !field) return "";
      const lang = locale || "vi";
      if (lang === "vi") return obj[field] || "";
      const translated = obj[`${field}_${lang}`];
      if (typeof translated === "string" && translated.trim()) return translated;
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
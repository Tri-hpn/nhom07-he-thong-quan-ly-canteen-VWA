// ============================================================
// useI18n.js — Hook đa ngôn ngữ (V7 - PERFORMANCE)
// ============================================================
// V7 (2026-10):
//   - ✅ Bỏ hoàn toàn console.warn gây spam và chậm.
//   - ✅ Thêm Local Cache trong Hook để tránh xử lý lại chuỗi.
// ============================================================

import { useCallback, useSyncExternalStore, useRef } from "react";
import {
  getLocale,
  subscribe,
  setLocale as setLocaleGlobal,
  t as tGlobal,
} from "../lib/i18n";

export function useI18n() {
  // 🔧 useSyncExternalStore — React 18+ official way
  const locale = useSyncExternalStore(
    subscribe,
    getLocale,
    getLocale // SSR fallback
  );

  // 🔧 Bộ nhớ đệm cấp Hook: Lưu kết quả đã xử lý (bao gồm replace params)
  const localCacheRef = useRef(new Map());
  const lastLocaleRef = useRef(locale);

  // Nếu đổi ngôn ngữ, xoá cache local
  if (lastLocaleRef.current !== locale) {
    localCacheRef.current.clear();
    lastLocaleRef.current = locale;
  }

  const t = useCallback(
    (key, params) => {
      if (key === undefined || key === null) return "";

      const k = String(key);
      // Tạo cache key bao gồm cả params
      const cacheKey = params ? `${k}::${JSON.stringify(params)}` : k;
      
      const localCache = localCacheRef.current;
      if (localCache.has(cacheKey)) {
        return localCache.get(cacheKey);
      }

      let translated = tGlobal(k);

      // Nếu không tìm thấy, thử trim và normalize
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
        
        // 🔧 Đã xoá cục console.warn gây chậm trang ở đây
      }

      // Xử lý tham số (params)
      if (params && typeof translated === "string" && translated.includes("{")) {
        translated = translated.replace(/\{(\w+)\}/g, (match, name) => {
          return params[name] !== undefined ? String(params[name]) : match;
        });
      }

      const result = translated || k;
      
      // Lưu vào cache
      localCache.set(cacheKey, result);
      return result;
    },
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
// ============================================================
// useI18n.js — Hook đa ngôn ngữ (V5 - FINAL)
// ============================================================
// V5 (2026-10):
//   - ✅ FIX CRITICAL: thêm tData() — dịch field dữ liệu
//     (name, description...) của menu items, categories...
//   - ✅ tData fallback: lang=vi → obj[field], thiếu → obj[field]
//   - Giữ V4: fallback thông minh cho t(key)
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { getLocale, subscribe, t as tGlobal } from "../lib/i18n";

const isDev = import.meta.env.DEV;

// Cache cảnh báo để không spam console
const warnedKeys = new Set();

export function useI18n() {
  const [locale, setLocale] = useState(() => getLocale());

  useEffect(() => {
    const unsubscribe = subscribe((newLocale) => {
      setLocale(newLocale);
    });
    return unsubscribe;
  }, []);

  /**
   * t(key, params) — dịch key UI
   * Fallback order:
   *   1. dict[key] chính xác
   *   2. dict[key.trim()]
   *   3. dict[key.normalize()]
   *   4. key (tiếng Việt gốc)
   */
  const t = useCallback(
    (key, params) => {
      if (key === undefined || key === null) return "";

      const k = String(key);
      let translated = tGlobal(k);

      // ✅ FIX: nếu trả về chính key → thử biến thể
      if (translated === k || !translated) {
        // Thử trimmed
        const trimmed = k.trim();
        if (trimmed !== k) {
          const t2 = tGlobal(trimmed);
          if (t2 && t2 !== trimmed) translated = t2;
        }

        // Thử normalize (bỏ space đầu/cuối, gộp space giữa)
        const normalized = k.replace(/\s+/g, " ").trim();
        if (translated === k && normalized !== k) {
          const t3 = tGlobal(normalized);
          if (t3 && t3 !== normalized) translated = t3;
        }

        // Cảnh báo missing key (chỉ 1 lần/key, chỉ dev)
        if (isDev && translated === k && !warnedKeys.has(k)) {
          warnedKeys.add(k);
          if (k.length > 0 && k.length < 200 && !k.startsWith("/")) {
            console.warn(`[i18n] Key chưa dịch: "${k}"`);
          }
        }
      }

      // Thay params
      if (params && typeof translated === "string") {
        translated = translated.replace(/\{(\w+)\}/g, (match, name) => {
          return params[name] !== undefined ? String(params[name]) : match;
        });
      }

      return translated || k;
    },
    [locale]
  );

  /**
   * ✅ FIX CRITICAL: tData(obj, field) — dịch field dữ liệu
   *
   * Cách dùng:
   *   tData(menuItem, "name")        → "Cơm gà" hoặc "Chicken rice"
   *   tData(menuItem, "description") → mô tả tương ứng
   *   tData(category, "name")        → tên danh mục
   *
   * Fallback:
   *   1. lang=vi → obj[field] gốc
   *   2. Có obj[`${field}_${lang}`] và không rỗng → trả bản dịch
   *   3. Fallback → obj[field] (tiếng Việt gốc)
   */
  const tData = useCallback(
    (obj, field) => {
      if (!obj || !field) return "";

      const lang = locale || "vi";

      // 1. Tiếng Việt → trả field gốc
      if (lang === "vi") {
        return obj[field] || "";
      }

      // 2. Ưu tiên bản dịch `field_<lang>`
      const translated = obj[`${field}_${lang}`];
      if (typeof translated === "string" && translated.trim()) {
        return translated;
      }

      // 3. Fallback về tiếng Việt gốc
      return obj[field] || "";
    },
    [locale]
  );

  return { t, tData, locale, setLocale };
}

export default useI18n;
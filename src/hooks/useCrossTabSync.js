// ============================================================
// useCrossTabSync.js - Sync state giua cac tab qua localStorage
// ============================================================
import { useEffect, useRef, useState, useCallback } from "react";

export function useCrossTabSync(key, defaultValue = null) {
  // ✅ FIX BUG-01: giữ defaultValue ổn định qua ref — tránh effect re-run
  // mỗi render khi caller truyền `[]` hoặc `{}` literal.
  const defaultRef = useRef(defaultValue);
  useEffect(() => {
    defaultRef.current = defaultValue;
  }, [defaultValue]);

  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : defaultRef.current;
    } catch {
      return defaultRef.current;
    }
  });

  // Sync khi tab khác đổi localStorage
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== key) return;
      try {
        const next = e.newValue ? JSON.parse(e.newValue) : defaultRef.current;
        setValue(next);
      } catch {
        setValue(defaultRef.current);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [key]);

  // Reset khi auth-expired / logout
  useEffect(() => {
    const reset = () => {
      try {
        localStorage.removeItem(key);
      } catch {}
      setValue(defaultRef.current);
    };
    window.addEventListener("auth-expired", reset);
    window.addEventListener("logout", reset);
    return () => {
      window.removeEventListener("auth-expired", reset);
      window.removeEventListener("logout", reset);
    };
  }, [key]);

  // ✅ FIX BUG-01: set dùng functional update — KHÔNG phụ thuộc `value`
  // → gọi set(prev => prev+1) 2 lần trong cùng tick vẫn đúng
  const set = useCallback(
    (next) => {
      setValue((prev) => {
        const v = typeof next === "function" ? next(prev) : next;
        try {
          if (v === null || v === undefined) {
            localStorage.removeItem(key);
          } else {
            localStorage.setItem(key, JSON.stringify(v));
          }
        } catch (err) {
          console.error("[useCrossTabSync] " + key + ":", err);
        }
        return v;
      });
    },
    [key]   // ✅ chỉ dep key
  );

  return [value, set];
}
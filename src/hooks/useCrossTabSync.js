// ============================================================
// useCrossTabSync.js — Sync state giữa các tab qua localStorage
// ============================================================
// V2 (2026-10):
//   - 🔧 FIX L15: guard SSR — không crash khi
//     `typeof window === "undefined"` (Next.js / pre-render).
//   - Giữ nguyên BUG-01 fix: defaultValue qua ref, functional set.
// ============================================================

import { useEffect, useRef, useState, useCallback } from "react";

const isBrowser =
  typeof window !== "undefined" && typeof localStorage !== "undefined";

function readInitial(key, fallback) {
  if (!isBrowser) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function useCrossTabSync(key, defaultValue = null) {
  // 🔧 BUG-01: giữ defaultValue ổn định qua ref — tránh effect re-run
  // mỗi render khi caller truyền `[]` hoặc `{}` literal.
  const defaultRef = useRef(defaultValue);
  useEffect(() => {
    defaultRef.current = defaultValue;
  }, [defaultValue]);

  const [value, setValue] = useState(() =>
    readInitial(key, defaultRef.current)
  );

  // Sync khi tab khác đổi localStorage
  useEffect(() => {
    if (!isBrowser) return;

    const handler = (e) => {
      if (e.key !== key) return;
      try {
        const next = e.newValue
          ? JSON.parse(e.newValue)
          : defaultRef.current;
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
    if (!isBrowser) return;

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

  // 🔧 BUG-01: set dùng functional update — KHÔNG phụ thuộc `value`
  const set = useCallback(
    (next) => {
      setValue((prev) => {
        const v = typeof next === "function" ? next(prev) : next;
        if (isBrowser) {
          try {
            if (v === null || v === undefined) {
              localStorage.removeItem(key);
            } else {
              localStorage.setItem(key, JSON.stringify(v));
            }
          } catch (err) {
            console.error("[useCrossTabSync] " + key + ":", err);
          }
        }
        return v;
      });
    },
    [key]
  );

  return [value, set];
}

export default useCrossTabSync;
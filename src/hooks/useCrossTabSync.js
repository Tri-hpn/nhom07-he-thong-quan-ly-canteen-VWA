// ============================================================
// useCrossTabSync.js — Sync state giữa các tab qua localStorage
// ============================================================
// V3 (2026-10):
//   - 🔧 FIX: bỏ side-effect localStorage khỏi updater của setValue
//     (StrictMode gọi updater 2 lần → ghi 2 lần). Chuyển sang
//     useEffect persist, có skip flag cho lần mount + storage event.
//   - Giữ guard SSR + defaultValue ổn định qua ref.
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
  // Giữ defaultValue ổn định qua ref — tránh effect re-run khi caller
  // truyền `[]` hoặc `{}` literal mỗi render.
  const defaultRef = useRef(defaultValue);
  useEffect(() => {
    defaultRef.current = defaultValue;
  }, [defaultValue]);

  const [value, setValue] = useState(() => readInitial(key, defaultRef.current));

  // Cờ: bỏ qua persist ngay sau mount (value đã có trong localStorage)
  const didMountRef = useRef(false);
  // Cờ: bỏ qua persist ngay sau khi nhận storage event (tránh echo)
  const skipPersistRef = useRef(false);

  // Sync khi tab khác đổi localStorage
  useEffect(() => {
    if (!isBrowser) return;

    const handler = (e) => {
      if (e.key !== key) return;
      let next;
      try {
        next = e.newValue ? JSON.parse(e.newValue) : defaultRef.current;
      } catch {
        next = defaultRef.current;
      }
      skipPersistRef.current = true;
      setValue(next);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [key]);

  // Reset khi auth-expired / logout
  useEffect(() => {
    if (!isBrowser) return;

    const reset = () => {
      try { localStorage.removeItem(key); } catch {}
      skipPersistRef.current = true; // không cần ghi lại default
      setValue(defaultRef.current);
    };
    window.addEventListener("auth-expired", reset);
    window.addEventListener("logout", reset);
    return () => {
      window.removeEventListener("auth-expired", reset);
      window.removeEventListener("logout", reset);
    };
  }, [key]);

  // 🔧 FIX: persist bằng useEffect — không nằm trong updater
  useEffect(() => {
    if (!isBrowser) return;

    // Lần mount đầu: value đã đọc từ localStorage rồi → skip
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    // Vừa nhận storage event / reset → skip để tránh echo
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }

    try {
      if (value === null || value === undefined) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (err) {
      console.error("[useCrossTabSync] " + key + ":", err);
    }
  }, [key, value]);

  const set = useCallback((next) => {
    setValue((prev) => (typeof next === "function" ? next(prev) : next));
  }, []);

  return [value, set];
}

export default useCrossTabSync;
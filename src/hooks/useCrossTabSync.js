// src/hooks/useCrossTabSync.js
// ============================================================
// Sync state giữa các tab qua localStorage (Đã tắt Sync để test Multi-Tab)
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
  const defaultRef = useRef(defaultValue);
  useEffect(() => {
    defaultRef.current = defaultValue;
  }, [defaultValue]);

  const [value, setValue] = useState(() =>
    readInitial(key, defaultRef.current)
  );

  const didMountRef = useRef(false);
  const skipPersistRef = useRef(false);

  // Reset khi auth-expired / logout (chỉ trong tab hiện tại)
  useEffect(() => {
    if (!isBrowser) return;
    const reset = () => {
      try {
        localStorage.removeItem(key);
      } catch {}
      skipPersistRef.current = true;
      setValue(defaultRef.current);
    };
    window.addEventListener("auth-expired", reset);
    window.addEventListener("logout", reset);
    return () => {
      window.removeEventListener("auth-expired", reset);
      window.removeEventListener("logout", reset);
    };
  }, [key]);

  // Vẫn ghi vào localStorage (để F5 không mất data)
  useEffect(() => {
    if (!isBrowser) return;
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
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
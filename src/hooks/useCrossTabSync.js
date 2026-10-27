// src/hooks/useCrossTabSync.js
// ============================================================
// Cross-tab sync — BroadcastChannel (chính) + storage event (fallback)
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
  const skipNextSyncRef = useRef(false);
  const channelRef = useRef(null);

  // Reset khi auth-expired / logout
  useEffect(() => {
    if (!isBrowser) return;
    const reset = () => {
      try {
        localStorage.removeItem(key);
      } catch {}
      skipNextSyncRef.current = true;
      setValue(defaultRef.current);
    };
    window.addEventListener("auth-expired", reset);
    window.addEventListener("logout", reset);
    return () => {
      window.removeEventListener("auth-expired", reset);
      window.removeEventListener("logout", reset);
    };
  }, [key]);

  // BroadcastChannel
  useEffect(() => {
    if (!isBrowser || typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(`vwa-crosstab:${key}`);
    channelRef.current = ch;
    ch.onmessage = (ev) => {
      if (ev.data?.key !== key) return;
      skipNextSyncRef.current = true;
      setValue(ev.data.value);
    };
    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, [key]);

  // storage event fallback (trình duyệt cũ / cross-origin iframe)
  useEffect(() => {
    if (!isBrowser) return;
    const onStorage = (e) => {
      if (e.key !== key) return;
      if (e.storageArea !== localStorage) return;
      try {
        skipNextSyncRef.current = true;
        setValue(e.newValue === null ? defaultRef.current : JSON.parse(e.newValue));
      } catch {}
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  // Persist + broadcast khi value thay đổi (chỉ khi THAY ĐỔI TỪ TAB NÀY)
  useEffect(() => {
    if (!isBrowser) return;
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
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

    try {
      channelRef.current?.postMessage({ key, value });
    } catch {}
  }, [key, value]);

  const set = useCallback((next) => {
    setValue((prev) => (typeof next === "function" ? next(prev) : next));
  }, []);

  return [value, set];
}

export default useCrossTabSync;
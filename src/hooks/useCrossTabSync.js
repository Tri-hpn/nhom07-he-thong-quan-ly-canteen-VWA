// src/hooks/useCrossTabSync.js
// ============================================================
// Sync state giữa các tab qua BroadcastChannel + localStorage fallback
// ============================================================

import { useEffect, useRef, useState, useCallback } from "react";

const isBrowser =
  typeof window !== "undefined" && typeof localStorage !== "undefined";

const CHANNEL_PREFIX = "vwa_crosstab:";
const tabId = (() => {
  try {
    return crypto.randomUUID();
  } catch {
    return "tab_" + Math.random().toString(36).slice(2);
  }
})();

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
  const channelRef = useRef(null);

  // BroadcastChannel — realtime
  useEffect(() => {
    if (!isBrowser || !("BroadcastChannel" in window)) return;
    try {
      const ch = new BroadcastChannel(CHANNEL_PREFIX + key);
      ch.onmessage = (e) => {
        const msg = e.data || {};
        if (msg.tabId === tabId) return;
        skipPersistRef.current = true;
        setValue(msg.value === undefined ? defaultRef.current : msg.value);
      };
      channelRef.current = ch;
      return () => {
        try {
          ch.close();
        } catch {}
        channelRef.current = null;
      };
    } catch {
      /* no-op */
    }
  }, [key]);

  // localStorage event — fallback Safari cũ / tab không subscribe
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
      try {
        localStorage.removeItem(key);
      } catch {}
      skipPersistRef.current = true;
      setValue(defaultRef.current);
      try {
        channelRef.current?.postMessage({
          type: "update",
          value: defaultRef.current,
          tabId,
        });
      } catch {}
    };
    window.addEventListener("auth-expired", reset);
    window.addEventListener("logout", reset);
    return () => {
      window.removeEventListener("auth-expired", reset);
      window.removeEventListener("logout", reset);
    };
  }, [key]);

  // Persist + broadcast khi value đổi
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
      try {
        channelRef.current?.postMessage({ type: "update", value, tabId });
      } catch {}
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
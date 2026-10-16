// src/hooks/usePointsConfig.js
// ============================================================
// Hook dùng chung — cache config points toàn cục
// ============================================================
import { useEffect, useState } from "react";
import { api } from "../api";

const DEFAULTS = {
  earn: {
    rate_amount: 10000, rate_points: 1,
    green_enabled: true, green_points: 10, green_require_approval: true,
    review_enabled: true, review_points: 5,
  },
  redeem: {
    rate_points: 100, rate_value: 10000,
    min_points: 100, max_unused_vouchers: 50,
    tiers: [
      { points: 100, value: 10000 },
      { points: 200, value: 20000 },
      { points: 500, value: 50000 },
      { points: 1000, value: 100000 },
    ],
  },
};

let CACHE = null;
let FETCHING = null;
const LISTENERS = new Set();

function notify() { LISTENERS.forEach((fn) => { try { fn(CACHE); } catch {} }); }

function deepMerge(base, override) {
  if (!override || typeof override !== "object") return base;
  const out = { ...base };
  for (const k of Object.keys(override)) {
    if (override[k] && typeof override[k] === "object" && !Array.isArray(override[k])) {
      out[k] = deepMerge(base[k] || {}, override[k]);
    } else {
      out[k] = override[k];
    }
  }
  return out;
}

export async function fetchPointsConfig() {
  if (FETCHING) return FETCHING;
  FETCHING = api.points.config()
    .then((cfg) => {
      CACHE = deepMerge(DEFAULTS, cfg || {});
      notify();
      return CACHE;
    })
    .catch(() => {
      if (!CACHE) CACHE = DEFAULTS;
      return CACHE;
    })
    .finally(() => { FETCHING = null; });
  return FETCHING;
}

export function getPointsConfig() {
  return CACHE || DEFAULTS;
}

export function usePointsConfig() {
  const [cfg, setCfg] = useState(CACHE || DEFAULTS);

  useEffect(() => {
    let mounted = true;
    if (CACHE) { setCfg(CACHE); }
    else {
      fetchPointsConfig().then((c) => { if (mounted) setCfg(c); });
    }
    const listener = (c) => { if (mounted) setCfg(c); };
    LISTENERS.add(listener);
    return () => { mounted = false; LISTENERS.delete(listener); };
  }, []);

  return cfg;
}

export const POINTS_DEFAULTS = DEFAULTS;

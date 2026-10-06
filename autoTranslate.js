// ============================================================
// AUTOTRANSLATE.JS — Dịch tự động (Google + MyMemory fallback)
// ============================================================
// V3 (2026-10):
//   - 🔧 FIX #25: Bỏ node-fetch (deprecated) → dùng native fetch
//                 (Node 22+ đã có fetch built-in)
//   - Giữ nguyên toàn bộ logic còn lại
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, "translate-cache.json");

const memoryCache = new Map();
let saveTimer = null;

// ---------- Concurrency limiter ----------
const MAX_CONCURRENT = 2;
const REQUEST_TIMEOUT_MS = 8000;

let running = 0;
const waitQueue = [];

function acquire() {
  return new Promise((resolve) => {
    if (running < MAX_CONCURRENT) {
      running++;
      resolve();
    } else {
      waitQueue.push(resolve);
    }
  });
}

function release() {
  running--;
  if (waitQueue.length > 0) {
    running++;
    const next = waitQueue.shift();
    next();
  }
}

// ---------- Cache ----------
function loadCacheFromFile() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, "utf-8");
      const obj = JSON.parse(raw);
      for (const [k, v] of Object.entries(obj)) memoryCache.set(k, v);
      console.log("[translate] Loaded " + memoryCache.size + " cached entries");
    }
  } catch (e) {
    console.warn("[translate] Cannot load cache:", e.message);
  }
}

function scheduleSaveCache() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const obj = {};
      for (const [k, v] of memoryCache.entries()) obj[k] = v;
      fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), "utf-8");
    } catch (e) {
      console.warn("[translate] Cannot save cache:", e.message);
    }
    saveTimer = null;
  }, 3000);
}

loadCacheFromFile();

function cacheKey(text, lang) {
  return text + "||" + lang;
}

// ---------- Google Translate (primary) ----------
const GOOGLE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";

async function tryGoogle(text, targetLang) {
  const url =
    `${GOOGLE_ENDPOINT}?client=gtx` +
    `&sl=vi` +
    `&tl=${encodeURIComponent(targetLang)}` +
    `&dt=t` +
    `&q=${encodeURIComponent(text)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();
    const translated =
      data?.[0]?.map((seg) => seg?.[0]).filter(Boolean).join("") || "";
    return translated || null;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ---------- MyMemory (fallback) ----------
async function tryMyMemory(text, targetLang) {
  const url =
    "https://api.mymemory.translated.net/get" +
    "?q=" + encodeURIComponent(text) +
    "&langpair=vi|" + encodeURIComponent(targetLang);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();
    if (data?.responseStatus === 429 || data?.responseStatus === 403) {
      throw new Error("MyMemory rate limit");
    }
    const translated = data?.responseData?.translatedText || "";
    return translated || null;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ---------- Cleanup HTML entities ----------
function cleanupEntities(text) {
  return String(text)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// ---------- Translate 1 đoạn ----------
export async function translateOne(text, targetLang) {
  if (!text || !String(text).trim()) return "";
  if (targetLang === "vi") return text;

  const key = cacheKey(text, targetLang);
  if (memoryCache.has(key)) return memoryCache.get(key);

  if (String(text).length > 500) {
    console.warn("[translate] skip: text > 500 chars");
    return text;
  }

  await acquire();

  try {
    // Primary: Google
    let translated = null;
    let usedEngine = "google";

    try {
      translated = await tryGoogle(text, targetLang);
    } catch (e) {
      console.warn("[translate] Google fail:", e.message, "→ MyMemory");
      usedEngine = "mymemory";
    }

    // Fallback: MyMemory
    if (!translated) {
      try {
        translated = await tryMyMemory(text, targetLang);
      } catch (e) {
        console.warn("[translate] MyMemory fail:", e.message);
      }
    }

    if (!translated || translated === text) {
      memoryCache.set(key, text);
      scheduleSaveCache();
      return text;
    }

    translated = cleanupEntities(translated);

    memoryCache.set(key, translated);
    scheduleSaveCache();
    return translated;
  } catch (err) {
    const isTimeout = err.name === "AbortError" || err.type === "aborted";
    if (!isTimeout) {
      console.warn(
        "[translate] fail " +
          String(text).slice(0, 30) +
          " -> " +
          targetLang +
          ": " +
          err.message
      );
    }
    return text;
  } finally {
    release();
  }
}

// ---------- Batch ----------
export async function translateFields(obj, fields, targetLangs) {
  if (!obj) return obj;
  const plain = obj.toObject ? obj.toObject() : { ...obj };
  const tasks = [];

  for (const lang of targetLangs) {
    for (const field of fields) {
      const text = plain[field];
      if (!text || plain[field + "_" + lang]) continue;
      tasks.push(
        translateOne(text, lang).then((translated) => {
          plain[field + "_" + lang] = translated;
        })
      );
    }
  }

  await Promise.all(tasks);
  return plain;
}

export async function translateList(items, fields, targetLangs) {
  if (!Array.isArray(items)) return items;
  return Promise.all(items.map((it) => translateFields(it, fields, targetLangs)));
}

export function getCacheSize() {
  return memoryCache.size;
}
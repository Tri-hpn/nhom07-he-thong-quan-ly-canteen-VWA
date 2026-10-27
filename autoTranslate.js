// ============================================================
// AUTOTRANSLATE.JS — Dịch tự động (Google + MyMemory fallback)
// V5 (2026-11):
//   ✅ cleanupEntities chạy TRƯỚC check equality (fix cache bẩn)
//   ✅ Cache cap 20k entries, LRU eviction
//   ✅ Flush cache khi SIGINT/SIGTERM
//   ✅ Log engine đã dùng
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, "translate-cache.json");

const memoryCache = new Map();
let saveTimer = null;

const MAX_CONCURRENT = 2;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_TEXT_LEN = 2000;
const MAX_CACHE_ENTRIES = 20_000;
const EVICT_RATIO = 0.1; // xoá 10% cũ nhất khi overflow

let running = 0;
const waitQueue = [];

function acquire() {
  return new Promise((resolve) => {
    if (running < MAX_CONCURRENT) { running++; resolve(); }
    else waitQueue.push(resolve);
  });
}

function release() {
  running--;
  if (waitQueue.length > 0) {
    running++;
    waitQueue.shift()();
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

function saveCacheNow() {
  try {
    const obj = {};
    for (const [k, v] of memoryCache.entries()) obj[k] = v;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), "utf-8");
  } catch (e) {
    console.warn("[translate] Cannot save cache:", e.message);
  }
}

function scheduleSaveCache() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveCacheNow();
    saveTimer = null;
  }, 3000);
}

// Cap LRU: khi vượt MAX_CACHE_ENTRIES → xoá ~10% cũ nhất
function evictIfNeeded() {
  if (memoryCache.size <= MAX_CACHE_ENTRIES) return;
  const toEvict = Math.floor(MAX_CACHE_ENTRIES * EVICT_RATIO);
  const keysIter = memoryCache.keys();
  for (let i = 0; i < toEvict; i++) {
    const { value: k } = keysIter.next();
    if (k === undefined) break;
    memoryCache.delete(k);
  }
  console.warn(`[translate] Cache overflow — evicted ${toEvict} oldest entries`);
}

loadCacheFromFile();

// Flush cache khi thoát (dev Ctrl+C, prod SIGTERM từ Vercel)
process.once("SIGINT", () => { if (saveTimer) { saveCacheNow(); saveTimer = null; } process.exit(0); });
process.once("SIGTERM", () => { if (saveTimer) { saveCacheNow(); saveTimer = null; process.exit(0); } });

function cacheKey(text, lang) { return text + "||" + lang; }

// ---------- Google Translate (unofficial free endpoint) ----------
const GOOGLE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";

async function tryGoogle(text, targetLang) {
  const url =
    `${GOOGLE_ENDPOINT}?client=gtx&sl=vi&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Canteen-VWA Translator)" },
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const translated = data?.[0]?.map((seg) => seg?.[0]).filter(Boolean).join("") || "";
    return translated || null;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ---------- MyMemory fallback ----------
async function tryMyMemory(text, targetLang) {
  const url =
    "https://api.mymemory.translated.net/get?q=" +
    encodeURIComponent(text) + "&langpair=vi|" + encodeURIComponent(targetLang);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    const status = Number(data?.responseStatus);
    if (status === 429 || status === 403) throw new Error("MyMemory rate limit");

    const translated = data?.responseData?.translatedText || "";
    if (translated && /MYMEMORY WARNING/i.test(translated)) {
      throw new Error("MyMemory warning");
    }
    return translated || null;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

function cleanupEntities(text) {
  return String(text)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// ---------- translateOne ----------
export async function translateOne(text, targetLang) {
  if (!text || !String(text).trim()) return "";
  if (targetLang === "vi") return text;

  const key = cacheKey(text, targetLang);
  if (memoryCache.has(key)) return memoryCache.get(key);

  if (String(text).length > MAX_TEXT_LEN) {
    console.warn("[translate] skip: text > " + MAX_TEXT_LEN + " chars");
    return text;
  }

  await acquire();
  try {
    let translated = null;
    let engineUsed = "";

    try {
      translated = await tryGoogle(text, targetLang);
      if (translated) engineUsed = "google";
    } catch (e) {
      console.warn("[translate] Google fail:", e.message, "→ MyMemory");
    }

    if (!translated) {
      try {
        translated = await tryMyMemory(text, targetLang);
        if (translated) engineUsed = "mymemory";
      } catch (e) {
        console.warn("[translate] MyMemory fail:", e.message);
      }
    }

    // 🔧 FIX CRITICAL: cleanup TRƯỚC khi check equality
    if (translated) {
      translated = cleanupEntities(translated).trim();
    }

    // Nếu dịch thất bại hoặc kết quả trùng source → KHÔNG cache
    if (!translated || translated === text || translated.trim() === text.trim()) {
      return text;
    }

    memoryCache.set(key, translated);
    evictIfNeeded();
    scheduleSaveCache();
    if (engineUsed) {
      // Silent log — chỉ log khi debug cần bật TRANSLATE_DEBUG=1
      if (process.env.TRANSLATE_DEBUG === "1") {
        console.log(`[translate] ✓ ${engineUsed} ${String(text).slice(0, 20)}... → ${targetLang}`);
      }
    }
    return translated;
  } catch (err) {
    const isTimeout = err.name === "AbortError" || err.type === "aborted";
    if (!isTimeout) {
      console.warn("[translate] fail " + String(text).slice(0, 30) + " -> " + targetLang + ": " + err.message);
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
      const existing = plain[field + "_" + lang];
      if (!text || (existing && String(existing).trim())) continue;
      tasks.push(translateOne(text, lang).then((translated) => {
        if (translated && translated !== text) plain[field + "_" + lang] = translated;
      }));
    }
  }
  await Promise.all(tasks);
  return plain;
}

export async function translateList(items, fields, targetLangs) {
  if (!Array.isArray(items)) return items;
  return Promise.all(items.map((it) => translateFields(it, fields, targetLangs)));
}

export function getCacheSize() { return memoryCache.size; }
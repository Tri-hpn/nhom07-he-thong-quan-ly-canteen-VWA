// ============================================================
// AUTOTRANSLATE.JS — Dịch tự động (Google + MyMemory fallback)
// V4 (2026-10):
//   - 🔧 FIX CRITICAL: KHÔNG cache / KHÔNG trả source text khi
//     dịch thất bại. Trước đây cache "source = translation" khiến
//     lần sau coi như đã dịch → data bẩn vĩnh viễn.
//   - 🔧 MyMemory: ép Number(responseStatus) để bắt rate limit
//     dù API trả string "429" hay number 429.
//   - 🔧 Nâng limit 500 → 2000 ký tự (description dài).
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

function cacheKey(text, lang) { return text + "||" + lang; }

// ---------- Google Translate ----------
const GOOGLE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";

async function tryGoogle(text, targetLang) {
  const url =
    `${GOOGLE_ENDPOINT}?client=gtx&sl=vi&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
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

// ---------- MyMemory ----------
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

    // 🔧 FIX: responseStatus có thể là string "429" hoặc number 429
    const status = Number(data?.responseStatus);
    if (status === 429 || status === 403) throw new Error("MyMemory rate limit");

    const translated = data?.responseData?.translatedText || "";
    // MyMemory đôi khi trả warning dưới dạng text — bỏ qua nếu có
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
    let usedEngine = "google";

    try {
      translated = await tryGoogle(text, targetLang);
    } catch (e) {
      console.warn("[translate] Google fail:", e.message, "→ MyMemory");
      usedEngine = "mymemory";
    }

    if (!translated) {
      try {
        translated = await tryMyMemory(text, targetLang);
      } catch (e) {
        console.warn("[translate] MyMemory fail:", e.message);
      }
    }

    // 🔧 FIX CRITICAL: KHÔNG cache failure — để lần sau retry
    if (!translated || translated === text) {
      return text;
    }

    translated = cleanupEntities(translated);
    memoryCache.set(key, translated);
    scheduleSaveCache();
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
      if (!text || plain[field + "_" + lang]) continue;
      tasks.push(translateOne(text, lang).then((translated) => {
        // 🔧 Chỉ gán nếu dịch thực sự khác source (tránh "translation = source")
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
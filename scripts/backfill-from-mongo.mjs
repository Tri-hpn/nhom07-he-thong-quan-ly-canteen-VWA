#!/usr/bin/env node
// ============================================================
// BACKFILL-FROM-MONGO.MJS (V5.1 — SMART FINAL + PURGE)
// ============================================================
// Đặc điểm:
//   ✅ Tự dịch — món/danh mục thiếu bản dịch
//   ✅ Tự nhớ — cache trong translate-cache.json (không dịch lại)
//   ✅ Tự xoá — file rác > 7 ngày (mọi thư mục)
//   ✅ Tự xoá — backfill-failed-*.json khi dùng --purge
//   ✅ Chạy local + deploy (Vercel/Render) đều dùng chung logic
//   ✅ Idempotent — chạy nhiều lần không sinh rác mới
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { translateWithRetry, sleep } from "./lib/google-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
dotenv.config({ path: path.join(ROOT_DIR, ".env") });

// ============================================================
// CONFIG
// ============================================================
const CLEANUP_MAX_AGE_DAYS = 7;
const CACHE_FILE = path.join(__dirname, "translate-cache.json");

/**
 * Thư mục cần quét dọn — bao gồm cả ROOT để xoá backfill-failed-*.json cũ.
 */
const CLEANUP_DIRS = [
  ROOT_DIR,
  path.join(ROOT_DIR, ".backup"),
  path.join(ROOT_DIR, ".backup-quickfix"),
  path.join(ROOT_DIR, ".backup-locales"),
];

/**
 * Pattern file rác — an toàn: chỉ xoá khi filename khớp.
 */
const CLEANUP_FILE_PATTERNS = [
  /\.bak$/i,
  /backup/i,
  /migration/i,
  /-failed.*\.json$/i,
  /^backfill-failed-.*\.json$/i,
  /^canteen-db\.backup-.*\.json$/i,
  /^translate-cache\.backup.*/i,
];

// ============================================================
// CLI args
// ============================================================
const args = process.argv.slice(2);
const FLAGS = {
  lang: (() => {
    const i = args.indexOf("--lang");
    return i >= 0 && args[i + 1] ? args[i + 1] : null;
  })(),
  force: args.includes("--force"),
  dryRun: args.includes("--dry-run"),
  noCleanup: args.includes("--no-cleanup"),
  purge: args.includes("--purge"),
  quiet: args.includes("--quiet"),
  delayMs: (() => {
    const i = args.indexOf("--delay");
    return i >= 0 && args[i + 1] ? parseInt(args[i + 1], 10) : 600;
  })(),
};

// ============================================================
// Constants
// ============================================================
const MAIN_COLLECTION = "canteen_db";
const MAIN_DOC_ID = "main";
const ALL_LANGS = ["en", "ja", "ko", "zh"];
const LANGS = FLAGS.lang ? [FLAGS.lang] : ALL_LANGS;

const MENU_FIELDS = ["name", "description"];
const CATEGORY_FIELDS = ["name"];

// ============================================================
// 🧠 CACHE — tự nhớ key đã dịch (không dịch lại)
// ============================================================
let memoryCache = null;

function loadCache() {
  if (memoryCache) return memoryCache;
  memoryCache = new Map();
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, "utf-8");
      const obj = JSON.parse(raw);
      for (const [k, v] of Object.entries(obj)) {
        memoryCache.set(k, v);
      }
      if (!FLAGS.quiet) {
        console.log(`💾 Cache: ${memoryCache.size} bản dịch đã nhớ`);
      }
    }
  } catch (e) {
    console.warn(`⚠️  Không đọc được cache: ${e.message}`);
  }
  return memoryCache;
}

function saveCache() {
  if (!memoryCache) return;
  try {
    const obj = {};
    for (const [k, v] of memoryCache.entries()) obj[k] = v;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), "utf-8");
  } catch (e) {
    console.warn(`⚠️  Không ghi được cache: ${e.message}`);
  }
}

// ============================================================
// 🔄 MONGO CONNECT
// ============================================================
async function ensureMongoConnected(MONGO_URI) {
  const state = mongoose.connection.readyState;
  if (state === 1) return true;

  if (!FLAGS.quiet) console.log("🔄 Reconnect Mongo...");
  try {
    if (state !== 0) await mongoose.disconnect().catch(() => {});
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    return true;
  } catch (e) {
    console.error("❌ Reconnect fail:", e.message);
    return false;
  }
}

// ============================================================
// 🧹 AUTO-CLEANUP V5.1 — Xoá file rác + (tuỳ chọn) thư mục cũ
// ============================================================
function cleanupOldFiles() {
  if (FLAGS.noCleanup) {
    if (!FLAGS.quiet) console.log("🧹 Cleanup: SKIP (--no-cleanup)\n");
    return { removed: 0, scanned: 0 };
  }

  if (!FLAGS.quiet) {
    console.log("");
    console.log("🧹 AUTO-CLEANUP — Quét file rác...");
    console.log("─".repeat(70));
  }

  const now = Date.now();
  const maxAgeMs = CLEANUP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const isDryRun = FLAGS.dryRun;
  let removed = 0;
  let scanned = 0;
  let skippedRecent = 0;

  // ============================================================
  // BƯỚC 1: --purge → xoá toàn bộ thư mục backup cũ
  // ============================================================
  if (FLAGS.purge) {
    const purgeDirs = [
      path.join(ROOT_DIR, ".backup"),
      path.join(ROOT_DIR, ".backup-quickfix"),
      path.join(ROOT_DIR, ".backup-locales"),
    ];
    for (const dir of purgeDirs) {
      if (!fs.existsSync(dir)) continue;

      if (isDryRun) {
        if (!FLAGS.quiet) console.log(`   🔍 SẼ XOÁ thư mục: ${path.relative(ROOT_DIR, dir)}/`);
        removed++;
      } else {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
          if (!FLAGS.quiet) console.log(`   🗑️  Xoá thư mục: ${path.relative(ROOT_DIR, dir)}/`);
          removed++;
        } catch (e) {
          if (!FLAGS.quiet) console.warn(`   ⚠️  ${e.message}`);
        }
      }
    }
  }

  // ============================================================
  // 🔧 V5.1: Khi --purge, xoá luôn file backfill-failed-*.json ở ROOT
  //   (không cần chờ 7 ngày)
  // ============================================================
  if (FLAGS.purge) {
    try {
      const rootFiles = fs.readdirSync(ROOT_DIR);
      for (const f of rootFiles) {
        if (!/^backfill-failed-.*\.json$/i.test(f)) continue;
        const full = path.join(ROOT_DIR, f);
        let stat;
        try {
          stat = fs.statSync(full);
        } catch {
          continue;
        }
        if (!stat.isFile()) continue;

        if (isDryRun) {
          if (!FLAGS.quiet) console.log(`   🔍 SẼ XOÁ: ${f}`);
          removed++;
        } else {
          try {
            fs.unlinkSync(full);
            removed++;
            if (!FLAGS.quiet) console.log(`   🗑️  Xoá: ${f}`);
          } catch (e) {
            if (!FLAGS.quiet) console.warn(`   ⚠️  Không xoá được ${f}: ${e.message}`);
          }
        }
      }
    } catch (e) {
      if (!FLAGS.quiet) console.warn(`   ⚠️  Không đọc được thư mục gốc: ${e.message}`);
    }
  }

  // ============================================================
  // BƯỚC 2: Quét từng thư mục, xoá file rác > N ngày
  // ============================================================
  for (const dir of CLEANUP_DIRS) {
    if (!fs.existsSync(dir)) continue;

    let files;
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }

    for (const f of files) {
      const full = path.join(dir, f);

      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }

      // Chỉ xử lý file — bỏ qua thư mục con
      if (!stat.isFile()) continue;

      scanned++;

      // Phải khớp ít nhất 1 pattern mới coi là rác
      const matchesPattern = CLEANUP_FILE_PATTERNS.some((re) => re.test(f));
      if (!matchesPattern) continue;

      const age = now - stat.mtimeMs;

      if (age > maxAgeMs) {
        const daysOld = Math.floor(age / (24 * 60 * 60 * 1000));
        const rel = path.relative(ROOT_DIR, full);

        if (isDryRun) {
          if (!FLAGS.quiet) console.log(`   🔍 SẼ XOÁ: ${rel} (${daysOld} ngày tuổi)`);
          removed++;
        } else {
          try {
            fs.unlinkSync(full);
            removed++;
            if (!FLAGS.quiet) console.log(`   🗑️  Xoá: ${rel} (${daysOld} ngày tuổi)`);
          } catch (e) {
            if (!FLAGS.quiet) console.warn(`   ⚠️  Không xoá được: ${f} — ${e.message}`);
          }
        }
      } else {
        skippedRecent++;
      }
    }
  }

  if (!FLAGS.quiet) {
    console.log("─".repeat(70));
    console.log(`   📊 Đã quét:   ${scanned} file`);
    console.log(`   🗑️  Đã xoá:   ${removed} mục (>${CLEANUP_MAX_AGE_DAYS} ngày)`);
    console.log(`   ⏭️  Bỏ qua:  ${skippedRecent} file còn mới`);
    console.log(`   📁 Đã quét:  ${CLEANUP_DIRS.map((d) => path.relative(ROOT_DIR, d) || ".").join(", ")}`);
    console.log("");
  }

  return { removed, scanned };
}

// ============================================================
// 💾 AUTO-BACKUP
// ============================================================
function writeAutoBackup(db, reason = "pre-backfill") {
  try {
    const backupDir = path.join(ROOT_DIR, ".backup");
    fs.mkdirSync(backupDir, { recursive: true });

    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `canteen-db_${reason}_${dateStr}.json`;
    const filePath = path.join(backupDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(db, null, 2), "utf-8");
    if (!FLAGS.quiet) console.log(`💾 Backup: ${path.relative(ROOT_DIR, filePath)}`);
    return filePath;
  } catch (e) {
    if (!FLAGS.quiet) console.warn(`⚠️  Không ghi được backup: ${e.message}`);
    return null;
  }
}

// ============================================================
// UTILS
// ============================================================
function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function progressBar(done, total, prefix = "") {
  if (FLAGS.quiet) return;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const barLen = 30;
  const filled = Math.round((pct / 100) * barLen);
  const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
  process.stdout.write(`\r${prefix} [${bar}] ${pct}% (${done}/${total})    `);
}

// ============================================================
// 🧠 TRANSLATE WITH CACHE
// ============================================================
async function translateCached(text, lang) {
  const cache = loadCache();
  const cacheKey = `${text}||${lang}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    const translated = await translateWithRetry(text, lang, "vi", 5);
    const final = translated && translated !== text ? translated : text;
    cache.set(cacheKey, final);
    return final;
  } catch (err) {
    throw err;
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const MONGO_URI = process.env.MONGO_URI;

  if (!FLAGS.quiet) {
    console.log("═".repeat(70));
    console.log("🌐 BACKFILL TRANSLATIONS (V5.1 — smart cache + purge)");
    console.log("═".repeat(70));
    console.log("");
  }

  // ---- BƯỚC 1: CLEANUP ----
  const cleanupResult = cleanupOldFiles();

  // ---- BƯỚC 2: CHECK MONGO_URI ----
  if (!MONGO_URI) {
    if (!FLAGS.quiet) {
      console.error("❌ Thiếu MONGO_URI trong .env");
      console.error("   Thêm dòng: MONGO_URI=mongodb+srv://...");
    }
    process.exit(0);
  }

  // ---- BƯỚC 3: CONNECT MONGO ----
  if (!FLAGS.quiet) console.log(`📡 Kết nối MongoDB...`);
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    if (!FLAGS.quiet) {
      console.log(`✅ Đã kết nối: ${mongoose.connection.db.databaseName}\n`);
    }
  } catch (e) {
    console.error(`❌ Không kết nối được MongoDB: ${e.message}`);
    process.exit(0);
  }

  // ---- BƯỚC 4: LOAD DOC ----
  const coll = mongoose.connection.db.collection(MAIN_COLLECTION);
  const doc = await coll.findOne({ _id: MAIN_DOC_ID });
  if (!doc || !doc.data) {
    console.error("❌ Không tìm thấy document chính (canteen_db.main)");
    await mongoose.disconnect();
    process.exit(0);
  }

  const db = doc.data;
  const menuItems = Array.isArray(db.menu_items) ? db.menu_items : [];
  const categories = Array.isArray(db.categories) ? db.categories : [];

  if (!FLAGS.quiet) {
    console.log(`📦 Đã tải:`);
    console.log(`   • ${menuItems.length} món ăn`);
    console.log(`   • ${categories.length} danh mục`);
    console.log(`   • Ngôn ngữ đích: ${LANGS.join(", ")}`);
    console.log(`   • Delay: ${FLAGS.delayMs}ms/req`);
    if (FLAGS.force) console.log(`   • Force mode: BẬT`);
    if (FLAGS.dryRun) console.log(`   • Dry-run: BẬT`);
    console.log("");
  }

  // ---- BƯỚC 5: COUNT TASKS ----
  let totalTasks = 0;
  const allTasks = [];

  for (const m of menuItems) {
    for (const field of MENU_FIELDS) {
      const text = m[field];
      if (!text || !String(text).trim()) continue;
      for (const lang of LANGS) {
        const key = `${field}_${lang}`;
        const hasTranslation = m[key] && m[key] !== text;
        if (FLAGS.force || !hasTranslation) {
          totalTasks++;
          allTasks.push({ item: m, field, lang, text, type: "menu" });
        }
      }
    }
  }

  for (const c of categories) {
    for (const field of CATEGORY_FIELDS) {
      const text = c[field];
      if (!text || !String(text).trim()) continue;
      for (const lang of LANGS) {
        const key = `${field}_${lang}`;
        const hasTranslation = c[key] && c[key] !== text;
        if (FLAGS.force || !hasTranslation) {
          totalTasks++;
          allTasks.push({ item: c, field, lang, text, type: "category" });
        }
      }
    }
  }

  if (!FLAGS.quiet) {
    console.log(`🎯 Tổng task cần dịch: ${totalTasks}`);
    const etaMs = totalTasks * FLAGS.delayMs;
    console.log(`   • ETA: ~${fmtDuration(etaMs)}`);
    console.log("");
  }

  if (totalTasks === 0) {
    if (!FLAGS.quiet) console.log("✨ Không có gì cần dịch. Done!");
    await mongoose.disconnect();
    process.exit(0);
  }

  if (FLAGS.dryRun) {
    if (!FLAGS.quiet) {
      console.log("🧪 Dry-run — 20 task đầu tiên:");
      allTasks.slice(0, 20).forEach((t) => {
        console.log(`   [${t.type}] ${t.field}_${t.lang}: "${String(t.text).slice(0, 50)}"`);
      });
      if (allTasks.length > 20) {
        console.log(`   ... và ${allTasks.length - 20} task khác`);
      }
    }
    await mongoose.disconnect();
    process.exit(0);
  }

  // ---- BƯỚC 6: BACKUP ----
  writeAutoBackup(db, "pre-backfill");

  // ---- BƯỚC 7: DỊCH ----
  if (!FLAGS.quiet) {
    console.log("");
    console.log("─".repeat(70));
    console.log("🚀 Bắt đầu dịch...");
    console.log("─".repeat(70));
    console.log("");
  }

  const startTime = Date.now();
  let done = 0;
  let failed = 0;
  let skipped = 0;
  let cacheHits = 0;
  const failedList = [];

  for (const task of allTasks) {
    const { item, field, lang, text } = task;
    const key = `${field}_${lang}`;
    const cache = loadCache();
    const cacheKey = `${text}||${lang}`;
    const wasCached = cache.has(cacheKey);

    try {
      const translated = await translateCached(text, lang);

      if (!translated || translated === text) {
        item[key] = text;
        skipped++;
      } else {
        item[key] = translated;
      }
      done++;
      if (wasCached) cacheHits++;

      progressBar(done + failed, totalTasks, "🌐");
    } catch (err) {
      failed++;
      failedList.push({
        field,
        lang,
        text: String(text).slice(0, 60),
        error: err.message,
      });
    }

    if (!wasCached && FLAGS.delayMs > 0 && done + failed < totalTasks) {
      await sleep(FLAGS.delayMs);
    }

    if ((done + failed) % 50 === 0 && done > 0) {
      const stillOk = await ensureMongoConnected(MONGO_URI);
      if (stillOk) {
        try {
          await coll.updateOne({ _id: MAIN_DOC_ID }, { $set: { data: db } });
        } catch (e) {
          if (!FLAGS.quiet) console.error("\n⚠️  Batch write fail:", e.message);
        }
      }
    }
  }

  saveCache();

  if (!FLAGS.quiet) process.stdout.write("\n\n");

  // ---- BƯỚC 8: SAVE FINAL ----
  if (!FLAGS.quiet) console.log("💾 Ghi Mongo...");
  const stillOk = await ensureMongoConnected(MONGO_URI);
  if (stillOk) {
    await coll.updateOne({ _id: MAIN_DOC_ID }, { $set: { data: db } });
    if (!FLAGS.quiet) console.log("✅ Đã ghi.\n");
  } else {
    console.error("❌ Không thể ghi kết quả cuối cùng.");
    await mongoose.disconnect().catch(() => {});
    process.exit(0);
  }

  // ---- BƯỚC 9: REPORT ----
  const elapsed = Date.now() - startTime;
  if (!FLAGS.quiet) {
    console.log("═".repeat(70));
    console.log("📊 KẾT QUẢ");
    console.log("═".repeat(70));
    console.log(`   Đã dịch:           ${done - skipped}/${totalTasks}`);
    console.log(`   Giữ nguyên (skip): ${skipped}`);
    console.log(`   Cache hits:        ${cacheHits} (không gọi API)`);
    console.log(`   Thất bại:          ${failed}`);
    console.log(`   Thời gian:         ${fmtDuration(elapsed)}`);
    if (done > 0) {
      const rate = (done / (elapsed / 1000)).toFixed(1);
      console.log(`   Tốc độ:            ${rate} task/s`);
    }
    if (cleanupResult.removed > 0) {
      console.log(`   🧹 Đã dọn:          ${cleanupResult.removed} file rác`);
    }
    console.log("");

    if (failedList.length > 0) {
      console.log("⚠️  Chi tiết lỗi (20 đầu tiên):");
      failedList.slice(0, 20).forEach((f) => {
        console.log(`   [${f.lang}] ${f.field}: "${f.text}" — ${f.error}`);
      });
    } else {
      console.log("🎉 Không có task nào thất bại!");
    }
    console.log("");
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("\n❌ Fatal:", err.message);
  console.error(err.stack);
  try {
    await mongoose.disconnect();
  } catch {}
  try {
    cleanupOldFiles();
  } catch {}
  process.exit(0);
});
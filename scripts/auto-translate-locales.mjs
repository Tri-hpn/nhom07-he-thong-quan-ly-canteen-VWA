#!/usr/bin/env node
// ============================================================
// AUTO-TRANSLATE-LOCALES.MJS — Dịch file locale JSON (V4 - FINAL)
// ============================================================
// V4 (2026-10):
//   - ✅ FIX #14: KHÔNG connect Mongo (chỉ xử lý file locale)
//   - ✅ FIX: retry key bị skip (Google trả text gốc)
//   - ✅ Log chi tiết hơn: coverage %
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { translateWithRetry, sleep } from "./lib/google-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const LOCALES_DIR = path.join(ROOT_DIR, "src", "lib", "i18n", "locales");

// ---------- CLI args ----------
const args = process.argv.slice(2);
const FLAGS = {
  lang: (() => {
    const i = args.indexOf("--lang");
    return i >= 0 && args[i + 1] ? args[i + 1] : null;
  })(),
  force: args.includes("--force"),
  dryRun: args.includes("--dry-run"),
  untilDone: args.includes("--until-done"),
  maxRounds: (() => {
    const i = args.indexOf("--max-rounds");
    return i >= 0 && args[i + 1] ? parseInt(args[i + 1], 10) : 5;
  })(),
  delayMs: (() => {
    const i = args.indexOf("--delay");
    return i >= 0 && args[i + 1] ? parseInt(args[i + 1], 10) : 400;
  })(),
};

const ALL_LANGS = ["en", "ja", "ko", "zh"];
const LANGS = FLAGS.lang ? [FLAGS.lang] : ALL_LANGS;

// ---------- Helpers ----------
function progressBar(done, total, prefix = "") {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const barLen = 30;
  const filled = Math.round((pct / 100) * barLen);
  const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
  process.stdout.write(`\r${prefix} [${bar}] ${pct}% (${done}/${total})    `);
}

async function translateLangOnce(lang) {
  const sourceFile = path.join(LOCALES_DIR, "_source.json");
  const dictFile = path.join(LOCALES_DIR, `${lang}.json`);

  if (!fs.existsSync(sourceFile)) {
    console.error(`❌ Không tìm thấy _source.json tại ${sourceFile}`);
    return { lang, ok: false, error: "no-source" };
  }

  const source = JSON.parse(fs.readFileSync(sourceFile, "utf-8"));
  const sourceKeys = Object.keys(source);

  let dict = {};
  if (fs.existsSync(dictFile)) {
    dict = JSON.parse(fs.readFileSync(dictFile, "utf-8"));
  }

  // Tìm key cần dịch: chưa có HOẶC value = key (chưa dịch)
  const todo = sourceKeys.filter((k) => {
    const v = dict[k];
    if (!v) return true;                    // chưa có
    if (v === k) return true;               // giống key = chưa dịch
    if (!String(v).trim()) return true;     // rỗng
    return false;
  });

  if (todo.length === 0) {
    console.log(`✅ [${lang}] Đã dịch đủ ${sourceKeys.length} keys`);
    return { lang, ok: true, done: 0, total: 0 };
  }

  console.log(`\n🌐 [${lang}] Cần dịch ${todo.length}/${sourceKeys.length} keys`);

  if (FLAGS.dryRun) {
    console.log(`🧪 [${lang}] Dry-run — 10 key đầu:`);
    todo.slice(0, 10).forEach((k) => {
      console.log(`   • "${k.slice(0, 60)}"`);
    });
    return { lang, ok: true, done: 0, total: todo.length, dryRun: true };
  }

  let done = 0;
  let failed = 0;

  for (const key of todo) {
    try {
      const translated = await translateWithRetry(key, lang, "vi", 3);

      // ✅ FIX: nếu Google trả về text gốc → vẫn lưu (để không retry nữa)
      // Nhưng đánh dấu là "unchanged"
      dict[key] = translated || key;
      done++;
      progressBar(done + failed, todo.length, `🌐 ${lang}`);
    } catch (err) {
      failed++;
      dict[key] = key; // fallback
      if (failed <= 5) {
        console.log(`\n  [FAIL] ${key.slice(0, 40)}: ${err.message}`);
      }
    }

    if (FLAGS.delayMs > 0) {
      await sleep(FLAGS.delayMs);
    }

    // Lưu tạm mỗi 20 key
    if ((done + failed) % 20 === 0) {
      const sorted = {};
      Object.keys(dict).sort().forEach((k) => { sorted[k] = dict[k]; });
      fs.writeFileSync(dictFile, JSON.stringify(sorted, null, 2) + "\n", "utf-8");
    }
  }

  process.stdout.write("\n");

  // Sắp xếp theo thứ tự _source
  const finalDict = {};
  for (const k of sourceKeys) {
    if (dict[k] !== undefined) finalDict[k] = dict[k];
  }
  fs.writeFileSync(dictFile, JSON.stringify(finalDict, null, 2) + "\n", "utf-8");

  const translated = Object.entries(finalDict).filter(
    ([k, v]) => v && v !== k
  ).length;
  const pct = Math.round((translated / sourceKeys.length) * 1000) / 10;

  console.log(`✅ [${lang}] ${translated}/${sourceKeys.length} (${pct}%) — failed: ${failed}`);

  return { lang, ok: true, done, failed, total: todo.length, pct };
}

// ---------- Main ----------
async function main() {
  console.log("═".repeat(70));
  console.log("🌐 AUTO-TRANSLATE LOCALES (V4 — không cần Mongo)");
  console.log("═".repeat(70));
  console.log("");

  if (FLAGS.dryRun) console.log("🧪 Dry-run: BẬT\n");

  let round = 0;
  const maxRounds = FLAGS.untilDone ? FLAGS.maxRounds : 1;

  while (round < maxRounds) {
    round++;
    if (maxRounds > 1) {
      console.log(`\n🔁 Round ${round}/${maxRounds}`);
    }

    let allDone = true;
    const results = [];

    for (const lang of LANGS) {
      const r = await translateLangOnce(lang);
      results.push(r);
      if (r.total > 0) allDone = false;
    }

    if (allDone || FLAGS.dryRun) break;
    if (round < maxRounds) {
      console.log("\n⏳ Chờ 5s trước round tiếp theo...");
      await sleep(5000);
    }
  }

  console.log("\n" + "═".repeat(70));
  console.log("📊 HOÀN TẤT");
  console.log("═".repeat(70));
  console.log("");

  // In coverage cuối
  const sourceFile = path.join(LOCALES_DIR, "_source.json");
  if (fs.existsSync(sourceFile)) {
    const source = JSON.parse(fs.readFileSync(sourceFile, "utf-8"));
    const sourceKeys = Object.keys(source);
    console.log(`📖 Source: ${sourceKeys.length} keys\n`);

    for (const lang of ALL_LANGS) {
      const dictFile = path.join(LOCALES_DIR, `${lang}.json`);
      if (!fs.existsSync(dictFile)) {
        console.log(`❌ [${lang}] File không tồn tại`);
        continue;
      }
      const dict = JSON.parse(fs.readFileSync(dictFile, "utf-8"));
      const translated = sourceKeys.filter(
        (k) => dict[k] && dict[k] !== k
      ).length;
      const pct = Math.round((translated / sourceKeys.length) * 1000) / 10;
      const icon = pct >= 90 ? "✅" : pct >= 50 ? "⚠️" : "❌";
      console.log(`${icon} [${lang}] ${translated}/${sourceKeys.length} (${pct}%)`);
    }
  }
}

main().catch((err) => {
  console.error("\n❌ Fatal:", err.message);
  console.error(err.stack);
  process.exit(1);
});
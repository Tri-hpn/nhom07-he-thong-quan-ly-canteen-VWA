#!/usr/bin/env node
// ============================================================
// AUTO-TRANSLATE-UI.MJS — Tự động quét JSX và dịch text UI
// ============================================================
// Quy trình:
//   1. Scan tất cả file .jsx trong src/
//   2. Extract mọi chuỗi trong t("...") và tData(obj, "...")
//   3. So sánh với _source.json → tìm key thiếu
//   4. Tự động dịch key thiếu sang 4 lang (en/ja/ko/zh)
//   5. Ghi vào file locale tương ứng
//
// Dùng:
//   node scripts/auto-translate-ui.mjs                    # chạy 1 lần
//   node scripts/auto-translate-ui.mjs --lang=en          # chỉ 1 lang
//   node scripts/auto-translate-ui.mjs --dry              # chỉ xem
//   node scripts/auto-translate-ui.mjs --delay=1500       # chậm hơn (tránh 429)
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { translateWithRetry, sleep } from "./lib/google-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SRC_DIR = path.join(ROOT, "src");
const LOCALES_DIR = path.join(SRC_DIR, "lib", "i18n", "locales");
const SOURCE_FILE = path.join(LOCALES_DIR, "_source.json");

const ALL_LANGS = ["en", "ja", "ko", "zh"];

// ---------- CLI args ----------
const args = process.argv.slice(2);
const FLAGS = {
  lang: (() => {
    const i = args.indexOf("--lang");
    return i >= 0 && args[i + 1] ? args[i + 1] : null;
  })(),
  dry: args.includes("--dry"),
  delay: (() => {
    const i = args.findIndex((a) => a.startsWith("--delay"));
    if (i < 0) return 400;
    const eq = args[i].indexOf("=");
    if (eq > 0) return parseInt(args[i].slice(eq + 1), 10) || 400;
    return parseInt(args[i + 1], 10) || 400;
  })(),
};

const LANGS = FLAGS.lang ? [FLAGS.lang] : ALL_LANGS;

// ---------- 1. Scan JSX ----------
function walk(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name.startsWith(".") ||
        entry.name === "dist"
      )
        continue;
      files.push(...walk(full));
    } else if (/\.(jsx?|mjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

// Match t("..."), t('...'), t(`...`)
// và tData(obj, "field")
function extractKeys(content) {
  const keys = new Set();

  // t("string") — không chứa ${ } (template literal động)
  const tRegex = /\bt\(\s*["'`]([^"'`$]+)["'`]/g;
  let m;
  while ((m = tRegex.exec(content)) !== null) {
    const key = m[1];
    if (isValidKey(key)) keys.add(key);
  }

  return [...keys];
}

function isValidKey(key) {
  if (!key || typeof key !== "string") return false;
  if (key.length < 2 || key.length > 500) return false;
  if (/^\d+$/.test(key)) return false;
  if (/^https?:\/\//.test(key)) return false;
  if (/^[A-Z_]+$/.test(key)) return false;
  if (key.includes("${")) return false;
  if (/^[a-z]+\.[a-z]+$/i.test(key) && key.length < 30) return false; // common.close
  return true;
}

// ---------- 2. Chạy ----------
async function main() {
  console.log("═".repeat(70));
  console.log("🌐 AUTO-TRANSLATE UI (scan JSX → dịch thiếu)");
  console.log("═".repeat(70));
  console.log("");

  // Đọc _source.json hiện có
  if (!fs.existsSync(SOURCE_FILE)) {
    console.error("❌ Không tìm thấy _source.json");
    process.exit(1);
  }
  const source = JSON.parse(fs.readFileSync(SOURCE_FILE, "utf-8"));

  // Scan JSX để tìm key mới
  console.log("🔍 Đang scan file .jsx trong src/...");
  const files = walk(SRC_DIR);
  console.log(`   Tìm thấy ${files.length} file\n`);

  const foundKeys = new Set();
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const keys = extractKeys(content);
      keys.forEach((k) => foundKeys.add(k));
    } catch (e) {
      // ignore
    }
  }

  console.log(`📦 Tổng key tìm thấy trong code: ${foundKeys.size}`);
  console.log(`📖 Tổng key trong _source.json: ${Object.keys(source).length}`);

  // Key có trong code nhưng chưa có trong _source.json
  const newKeys = [...foundKeys].filter((k) => source[k] === undefined);
  console.log(`✨ Key MỚI chưa có trong _source.json: ${newKeys.length}\n`);

  if (newKeys.length === 0) {
    console.log("✅ Không có key mới. Kiểm tra coverage các lang...\n");
  } else {
    if (FLAGS.dry) {
      console.log("🧪 Dry-run — 30 key đầu tiên:");
      newKeys.slice(0, 30).forEach((k) => console.log(`   • "${k}"`));
      if (newKeys.length > 30) {
        console.log(`   ... và ${newKeys.length - 30} key khác`);
      }
      process.exit(0);
    }

    // Thêm key mới vào _source.json (value = key cho VI)
    for (const k of newKeys) {
      source[k] = k;
    }
    // Sắp xếp theo alphabet để dễ diff
    const sorted = {};
    Object.keys(source)
      .sort()
      .forEach((k) => {
        sorted[k] = source[k];
      });
    fs.writeFileSync(
      SOURCE_FILE,
      JSON.stringify(sorted, null, 2) + "\n",
      "utf-8"
    );
    console.log(`💾 Đã thêm ${newKeys.length} key vào _source.json\n`);
  }

  // ---------- 3. Dịch từng lang ----------
  const sourceKeys = Object.keys(source);

  for (const lang of LANGS) {
    const dictFile = path.join(LOCALES_DIR, `${lang}.json`);
    let dict = {};
    if (fs.existsSync(dictFile)) {
      try {
        dict = JSON.parse(fs.readFileSync(dictFile, "utf-8"));
      } catch {
        console.warn(`⚠️  Không parse được ${lang}.json — reset`);
        dict = {};
      }
    }

    // Key cần dịch: thiếu trong dict HOẶC value = key (chưa dịch)
    const todo = sourceKeys.filter((k) => {
      const v = dict[k];
      if (!v) return true;
      if (v === k) return true;
      if (!String(v).trim()) return true;
      return false;
    });

    if (todo.length === 0) {
      console.log(`✅ [${lang}] Đủ ${sourceKeys.length} keys`);
      continue;
    }

    console.log(`\n🌐 [${lang}] Cần dịch ${todo.length}/${sourceKeys.length}`);
    console.log(`   Delay: ${FLAGS.delay}ms/req\n`);

    let done = 0;
    let failed = 0;
    const startTime = Date.now();

    for (const key of todo) {
      try {
        const translated = await translateWithRetry(key, lang, "vi", 3);
        dict[key] = translated || key;
        done++;
      } catch (err) {
        failed++;
        dict[key] = key;
        if (failed <= 3) {
          console.log(`   [FAIL] "${key.slice(0, 50)}": ${err.message}`);
        }
      }

      // Progress
      const total = todo.length;
      const processed = done + failed;
      if (processed % 5 === 0 || processed === total) {
        const pct = Math.round((processed / total) * 100);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        process.stdout.write(
          `\r   [${lang}] ${pct}% (${processed}/${total}) — ${elapsed}s`
        );
      }

      if (FLAGS.delay > 0) await sleep(FLAGS.delay);

      // Lưu tạm mỗi 30 key
      if (processed % 30 === 0) {
        saveDict(dictFile, dict, sourceKeys);
      }
    }

    process.stdout.write("\n");

    // Lưu cuối
    saveDict(dictFile, dict, sourceKeys);

    const translated = sourceKeys.filter(
      (k) => dict[k] && dict[k] !== k
    ).length;
    const pct = Math.round((translated / sourceKeys.length) * 1000) / 10;
    console.log(
      `✅ [${lang}] ${translated}/${sourceKeys.length} (${pct}%) — failed: ${failed}\n`
    );
  }

  // ---------- 4. Báo cáo coverage ----------
  console.log("─".repeat(70));
  console.log("📊 COVERAGE:");
  console.log("─".repeat(70));
  for (const lang of ALL_LANGS) {
    const f = path.join(LOCALES_DIR, `${lang}.json`);
    if (!fs.existsSync(f)) {
      console.log(`❌ [${lang}] Không tồn tại`);
      continue;
    }
    const dict = JSON.parse(fs.readFileSync(f, "utf-8"));
    const translated = sourceKeys.filter(
      (k) => dict[k] && dict[k] !== k
    ).length;
    const pct = Math.round((translated / sourceKeys.length) * 1000) / 10;
    const icon = pct >= 90 ? "✅" : pct >= 50 ? "⚠️ " : "❌";
    console.log(`${icon} [${lang}] ${translated}/${sourceKeys.length} (${pct}%)`);
  }
  console.log("");
}

function saveDict(filePath, dict, sourceKeys) {
  const final = {};
  for (const k of sourceKeys) {
    if (dict[k] !== undefined) final[k] = dict[k];
  }
  fs.writeFileSync(filePath, JSON.stringify(final, null, 2) + "\n", "utf-8");
}

main().catch((err) => {
  console.error("\n❌ Fatal:", err.message);
  console.error(err.stack);
  process.exit(1);
});
#!/usr/bin/env node
// ============================================================
// CHECK-LOCALE-COVERAGE.MJS — Verify translation coverage
// ============================================================
// So sánh số key của từng locale với `_source.json` (nguồn VI).
// Nếu coverage < 90% → cảnh báo, không nên enable lang đó.
//
// Usage:
//   node scripts/check-locale-coverage.mjs
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, "..", "src", "lib", "i18n", "locales");

const SOURCE_FILE = path.join(LOCALES_DIR, "_source.json");
if (!fs.existsSync(SOURCE_FILE)) {
  console.error("❌ Không tìm thấy _source.json");
  console.error("   Chạy 'npm run dev' 1 lần để Vite plugin tự sinh file này.");
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(SOURCE_FILE, "utf-8"));
const sourceKeys = Object.keys(source);

console.log("═".repeat(70));
console.log("🔍 KIỂM TRA TRANSLATION COVERAGE");
console.log("═".repeat(70));
console.log(`📖 Source (VI): ${sourceKeys.length} keys\n`);

const LOCALES = ["en", "ja", "ko", "zh"];
const COVERAGE_THRESHOLD = 90;

const results = [];

for (const lang of LOCALES) {
  const filePath = path.join(LOCALES_DIR, `${lang}.json`);

  if (!fs.existsSync(filePath)) {
    results.push({
      lang,
      total: sourceKeys.length,
      translated: 0,
      coverage: 0,
      missing: sourceKeys,
    });
    continue;
  }

  const dict = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const dictKeys = new Set(Object.keys(dict));

  let translated = 0;
  const missing = [];

  for (const key of sourceKeys) {
    if (dictKeys.has(key) && dict[key] && dict[key] !== key) {
      translated++;
    } else {
      missing.push(key);
    }
  }

  const coverage =
    sourceKeys.length > 0
      ? Math.round((translated / sourceKeys.length) * 1000) / 10
      : 0;

  results.push({ lang, total: sourceKeys.length, translated, coverage, missing });
}

console.log("─".repeat(70));
console.log("KẾT QUẢ:");
console.log("─".repeat(70));

results.sort((a, b) => b.coverage - a.coverage);

for (const r of results) {
  const icon = r.coverage >= COVERAGE_THRESHOLD ? "✅" : "⚠️ ";
  const status = r.coverage >= COVERAGE_THRESHOLD ? "SẴN SÀNG" : "CHƯA ĐỦ";

  console.log(
    `${icon} ${r.lang.toUpperCase().padEnd(3)} — ${String(r.coverage).padStart(5)}% ` +
      `(${r.translated}/${r.total} keys) [${status}]`
  );
}

console.log("─".repeat(70));

console.log("\n📋 HƯỚNG DẪN:\n");

for (const r of results) {
  if (r.coverage >= COVERAGE_THRESHOLD) {
    console.log(`   ✅ "${r.lang}" đủ điều kiện — có thể bật trong config.js`);
  } else {
    console.log(
      `   ⏸️  "${r.lang}" thiếu ${r.missing.length} keys — cần dịch thêm`
    );

    if (r.missing.length <= 10) {
      r.missing.forEach((k) => console.log(`      • "${k}"`));
    } else {
      r.missing.slice(0, 5).forEach((k) => console.log(`      • "${k}"`));
      console.log(`      ... và ${r.missing.length - 5} keys khác`);
    }
  }
  console.log("");
}

const hasReady = results.some((r) => r.coverage >= COVERAGE_THRESHOLD);
if (!hasReady) {
  console.log("⚠️  Không có locale nào đủ coverage 90%");
  process.exit(1);
}

console.log("═".repeat(70));
console.log("✨ Hoàn tất kiểm tra");
console.log("═".repeat(70));

process.exit(0);
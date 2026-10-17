#!/usr/bin/env node
// ============================================================
// CHECK I18N DUPLICATE KEYS — V2
// ============================================================
// V2 (2026-10):
//   - 🔧 FIX #74: regex cũ `^\s*"..."` bỏ sót key nằm cùng dòng với `{`
//     → dùng regex match mọi vị trí key top-level, không chỉ đầu dòng
// ============================================================

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCALES_DIR = join(__dirname, "..", "src", "lib", "i18n", "locales");

// 🔧 FIX #74: match mọi key top-level (không chỉ đầu dòng)
// Pattern: string trong ngoặc kép theo sau là dấu `:`
// Chấp nhận cả khi key nằm cùng dòng với `{` (JSON minified)
function findDuplicateKeys(rawText) {
  const keyCounts = new Map();
  const keyLines = new Map();

  // Match: "key":  (bất kỳ vị trí nào, không cần đầu dòng)
  // Dùng negative lookbehind để tránh match key nằm trong value string
  // (đơn giản: chỉ match key có `"` trước và `:` sau — JSON hợp lệ)
  const regex = /"((?:[^"\\]|\\.)*)"\s*:/g;

  let match;
  while ((match = regex.exec(rawText)) !== null) {
    const key = match[1];
    const beforeMatch = rawText.slice(0, match.index);
    const line = beforeMatch.split("\n").length;

    // Bỏ qua nếu key chứa \n (có thể là string value dài)
    if (key.includes("\n")) continue;

    keyCounts.set(key, (keyCounts.get(key) || 0) + 1);

    if (!keyLines.has(key)) {
      keyLines.set(key, []);
    }
    keyLines.get(key).push(line);
  }

  const duplicates = [];
  for (const [key, count] of keyCounts.entries()) {
    if (count > 1) {
      duplicates.push({
        key,
        count,
        lines: keyLines.get(key),
      });
    }
  }

  return duplicates;
}

function shortenKey(key, max = 80) {
  const clean = key.replace(/\n/g, "\\n");
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 3) + "...";
}

function main() {
  let files;
  try {
    files = readdirSync(LOCALES_DIR).filter(
      (f) => f.endsWith(".json") && !f.endsWith(".bak")
    );
  } catch (err) {
    console.error(`❌ Không đọc được thư mục: ${LOCALES_DIR}`);
    console.error(err.message);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log("ℹ️  Không có file .json nào trong locales/");
    return;
  }

  console.log("🔍 Checking duplicate i18n keys...\n");

  let totalDupes = 0;
  let hasError = false;

  for (const file of files) {
    const filePath = join(LOCALES_DIR, file);
    const raw = readFileSync(filePath, "utf8");

    const dupes = findDuplicateKeys(raw);

    if (dupes.length === 0) {
      console.log(`✅ ${file} — OK (không trùng key)`);
      continue;
    }

    hasError = true;
    totalDupes += dupes.length;
    console.log(`\n⚠️  ${file} — ${dupes.length} key bị TRÙNG:\n`);

    dupes.sort((a, b) => b.count - a.count);

    for (const d of dupes) {
      console.log(`   🔸 "${shortenKey(d.key)}"`);
      console.log(`      → xuất hiện ${d.count} lần (dòng: ${d.lines.join(", ")})`);
    }
    console.log("");
  }

  console.log("\n" + "─".repeat(60));
  if (hasError) {
    console.log(`❌ Tổng cộng: ${totalDupes} key trùng trong các file locale`);
    console.log("💡 Chạy `node scripts/fix-i18n-duplicate.mjs` để tự động sửa.\n");
    process.exit(1);
  } else {
    console.log("✨ Tất cả file locale đều sạch, không có key trùng!\n");
    process.exit(0);
  }
}

main();
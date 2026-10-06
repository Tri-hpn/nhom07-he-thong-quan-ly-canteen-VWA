#!/usr/bin/env node
// ============================================================
// FIX I18N DUPLICATE KEYS — V2
// ============================================================
// V2 (2026-10):
//   - 🔧 FIX #75: parseTopLevelEntries dùng JSON.parse để validate
//                 từng value (thay vì custom parser dễ lỗi với nested)
//   - Đơn giản hóa: dùng JSON.parse + đếm duplicate qua raw regex
// ============================================================

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCALES_DIR = join(__dirname, "..", "src", "lib", "i18n", "locales");
const BACKUP_SUFFIX = ".bak";

// 🔧 FIX #75: Parse raw text, extract key theo regex, để phát hiện duplicate
function extractKeys(rawText) {
  const keys = [];
  const regex = /"((?:[^"\\]|\\.)*)"\s*:/g;

  let match;
  while ((match = regex.exec(rawText)) !== null) {
    const key = match[1];
    if (key.includes("\n")) continue;
    keys.push(key);
  }
  return keys;
}

function processFile(filePath) {
  const raw = readFileSync(filePath, "utf8");

  // Parse JSON (last-wins theo spec)
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    return { changed: false, error: `JSON parse error: ${e.message}` };
  }

  // Đếm key trùng qua raw text
  const rawKeys = extractKeys(raw);
  const counts = new Map();
  for (const k of rawKeys) {
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const dupes = [...counts.entries()].filter(([, c]) => c > 1);

  if (dupes.length === 0) {
    return { changed: false, removed: 0, dupes: 0, keptKeys: rawKeys.length };
  }

  // JSON.parse đã tự giữ last-wins
  // Sắp xếp lại A-Z cho stable output
  const sorted = {};
  Object.keys(obj).sort().forEach((k) => {
    sorted[k] = obj[k];
  });

  const output = JSON.stringify(sorted, null, 2) + "\n";

  // Backup (chỉ 1 lần)
  const backupPath = filePath + BACKUP_SUFFIX;
  if (!existsSync(backupPath)) {
    writeFileSync(backupPath, raw, "utf8");
  }

  writeFileSync(filePath, output, "utf8");

  const removedCount = rawKeys.length - Object.keys(sorted).length;

  return {
    changed: true,
    removed: removedCount,
    dupes: dupes.length,
    keptKeys: Object.keys(sorted).length,
  };
}

function main() {
  let files;
  try {
    files = readdirSync(LOCALES_DIR).filter(
      (f) => f.endsWith(".json") && !f.endsWith(BACKUP_SUFFIX)
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

  console.log("🔧 Fixing duplicate i18n keys...\n");

  let totalRemoved = 0;
  let totalFiles = 0;

  for (const file of files) {
    const filePath = join(LOCALES_DIR, file);

    try {
      const result = processFile(filePath);

      if (result.error) {
        console.error(`❌ ${file} — ${result.error}`);
        continue;
      }

      if (result.changed) {
        totalFiles++;
        totalRemoved += result.removed;
        console.log(
          `✅ ${file} — xoá ${result.removed} key trùng (${result.dupes} key bị trùng), còn lại ${result.keptKeys} key`
        );
        console.log(`   💾 Backup: ${file}${BACKUP_SUFFIX}`);
      } else {
        console.log(`⚪ ${file} — không có key trùng, bỏ qua`);
      }
    } catch (err) {
      console.error(`❌ ${file} — lỗi: ${err.message}`);
    }
  }

  console.log("\n" + "─".repeat(60));
  if (totalFiles === 0) {
    console.log("✨ Không có gì cần sửa.\n");
  } else {
    console.log(
      `✨ Đã sửa ${totalFiles} file, xoá tổng cộng ${totalRemoved} key trùng.\n`
    );
    console.log("👉 Chạy lại `node scripts/check-i18n-duplicate.mjs` để xác nhận.\n");
  }
}

main();
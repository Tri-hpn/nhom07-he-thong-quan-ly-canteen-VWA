#!/usr/bin/env node
// ============================================================
// CLEANUP-I18N-SOURCE.MJS — Xoá key rác + fix mojibake (V3 - FINAL)
// ============================================================
// V3 (2026-10):
//   - ✅ FIX: phát hiện + fix mojibake ("khuyáº¿n mÃ£i" → "khuyến mãi")
//   - ✅ FIX: xoá key viết tắt (MSSV, NV, KH, STT, PTTT, ID)
//   - ✅ FIX: xoá số điện thoại, số thuần
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_FILE = path.join(__dirname, "..", "src", "lib", "i18n", "locales", "_source.json");
const BACKUP_DIR = path.join(__dirname, "..", ".backup-quickfix");

if (!fs.existsSync(SOURCE_FILE)) {
  console.error("[X] Khong tim thay _source.json");
  process.exit(1);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupFile = path.join(BACKUP_DIR, "_source.backup-" + Date.now() + ".json");
fs.copyFileSync(SOURCE_FILE, backupFile);
console.log("[Backup] " + path.basename(backupFile));

const source = JSON.parse(fs.readFileSync(SOURCE_FILE, "utf-8"));
const before = Object.keys(source).length;

// ============================================================
// 1. Fix mojibake — chuyển Latin-1 → UTF-8
// ============================================================
function fixMojibake(str) {
  // Dấu hiệu mojibake: có ký tự Ã, Â, áº, á», Æ, ¢...
  const mojibakePattern = /[ÃÂ][\u0080-\u00BF]|á[º»¼½]|Æ|¢|£|¥|§|©/;

  if (!mojibakePattern.test(str)) return str;

  try {
    // Latin-1 → byte → UTF-8
    const fixed = Buffer.from(str, "latin1").toString("utf-8");
    // Nếu fix xong vẫn còn mojibake → thử cách khác
    if (mojibakePattern.test(fixed)) {
      const fixed2 = Buffer.from(str, "binary").toString("utf-8");
      if (!mojibakePattern.test(fixed2)) return fixed2;
    }
    return fixed;
  } catch {
    return str;
  }
}

const KEY_BLACKLIST = new Set([
  "ID", "KH", "MSSV", "NV", "PTTT", "STT", "VND", "USD", "CNY", "JPY", "KRW",
  "OK", "X", "→", "←", "↑", "↓", "→", "←",
]);

const cleaned = {};
const removed = [];
const fixedKeys = [];
const fixedValues = [];

for (const [k, v] of Object.entries(source)) {
  // Bỏ qua nếu là blacklist
  if (KEY_BLACKLIST.has(k)) {
    removed.push(k);
    continue;
  }

  // Bỏ qua nếu là số thuần
  if (/^\d+$/.test(k)) {
    removed.push(k);
    continue;
  }

  // Bỏ qua nếu là SĐT (10-11 số)
  if (/^0\d{9,10}$/.test(k)) {
    removed.push(k);
    continue;
  }

  // Bỏ qua nếu là key chỉ có dấu chấm câu
  if (/^[\s.!?,;:…\-–—]+$/.test(k)) {
    removed.push(k);
    continue;
  }

  // Bỏ qua nếu quá ngắn (< 2 ký tự) trừ khi là emoji
  if (k.length < 2 && !/[\u{1F300}-\u{1FAFF}]/u.test(k)) {
    removed.push(k);
    continue;
  }

  // Fix mojibake cho key
  let newKey = fixMojibake(k);
  if (newKey !== k) {
    fixedKeys.push({ from: k, to: newKey });
  }

  // Fix mojibake cho value
  let newValue = fixMojibake(v);
  if (newValue !== v) {
    fixedValues.push({ from: v, to: newValue });
  }

  cleaned[newKey] = newValue;
}

// ============================================================
// 2. Ghi file
// ============================================================
fs.writeFileSync(SOURCE_FILE, JSON.stringify(cleaned, null, 2) + "\n", "utf-8");

console.log("");
console.log("[OK] Da xoa " + removed.length + " key rac");
console.log("     Truoc: " + before + " keys");
console.log("     Sau:   " + Object.keys(cleaned).length + " keys");
console.log("");

if (removed.length > 0 && removed.length <= 30) {
  console.log("[Da xoa]:");
  removed.forEach((k) => console.log("   - " + k));
} else if (removed.length > 30) {
  console.log("[Da xoa " + removed.length + " key, 30 key dau]:");
  removed.slice(0, 30).forEach((k) => console.log("   - " + k));
}

if (fixedKeys.length > 0) {
  console.log("");
  console.log("[Fix mojibake KEY]: " + fixedKeys.length);
  fixedKeys.slice(0, 10).forEach((f) => {
    console.log("   - \"" + f.from + "\"");
    console.log("     → \"" + f.to + "\"");
  });
}

if (fixedValues.length > 0) {
  console.log("");
  console.log("[Fix mojibake VALUE]: " + fixedValues.length);
  fixedValues.slice(0, 5).forEach((f) => {
    console.log("   - \"" + String(f.from).slice(0, 50) + "\"");
    console.log("     → \"" + String(f.to).slice(0, 50) + "\"");
  });
}

console.log("");
console.log("Buoc tiep theo:");
console.log("   1. npm run i18n:report");
console.log("   2. npm run i18n:translate:force");
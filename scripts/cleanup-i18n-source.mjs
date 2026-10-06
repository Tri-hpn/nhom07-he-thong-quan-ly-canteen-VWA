#!/usr/bin/env node
// ============================================================
// CLEANUP-I18N-SOURCE.MJS — Xóa key rác trong _source.json
// ============================================================
// V2 (2026-10):
//   - 🔧 FIX #76: tạo thư mục backup trước khi copy
//   - 🔧 FIX BOM: file không có BOM ở đầu
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

// 🔧 FIX #76: tạo thư mục backup trước khi copy
fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupFile = path.join(
  BACKUP_DIR,
  "_source.backup-" + Date.now() + ".json"
);
fs.copyFileSync(SOURCE_FILE, backupFile);
console.log("[Backup] " + path.basename(backupFile));

const source = JSON.parse(fs.readFileSync(SOURCE_FILE, "utf-8"));
const before = Object.keys(source).length;

const cleaned = {};
const removed = [];

for (const [k, v] of Object.entries(source)) {
  const isDotKey = k.includes(".") && !k.includes(" ");
  const isSelfRef = k === v;
  if (isDotKey && isSelfRef) { removed.push(k); continue; }
  cleaned[k] = v;
}

fs.writeFileSync(SOURCE_FILE, JSON.stringify(cleaned, null, 2) + "\n", "utf-8");

console.log("");
console.log("[OK] Da xoa " + removed.length + " key rac");
console.log("   Truoc: " + before + " keys");
console.log("   Sau:   " + Object.keys(cleaned).length + " keys");
console.log("");

if (removed.length > 0 && removed.length <= 30) {
  removed.forEach((k) => console.log("   - " + k));
} else if (removed.length > 30) {
  removed.slice(0, 30).forEach((k) => console.log("   - " + k));
  console.log("   ... va " + (removed.length - 30) + " key khac");
}
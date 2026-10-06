#!/usr/bin/env node
// ============================================================
// I18N-DIAGNOSTIC.MJS — Fix duplicate + report coverage
// ============================================================
// V2 (2026-10):
//   - 🔧 FIX #78: tự xóa .dupfix.bak sau khi thành công
//   - 🔧 FIX BOM: file không có BOM ở đầu
// ============================================================

import fs from "node:fs";
import path from "node:path";

const LOCALES_DIR = path.join(process.cwd(), "src", "lib", "i18n", "locales");

// ---------- Tim duplicate key trong raw text ----------
function findDupes(raw) {
  const counts = new Map();
  // Match mọi key top-level (không chỉ đầu dòng)
  const regex = /"((?:[^"\\]|\\.)*)"\s*:/g;
  let m;
  while ((m = regex.exec(raw)) !== null) {
    const k = m[1];
    if (k.includes("\n")) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const dupes = [];
  for (const [k, c] of counts.entries()) {
    if (c > 1) dupes.push({ key: k, count: c });
  }
  return dupes;
}

// ---------- Fix duplicate: giữ lần xuất hiện cuối cùng ----------
function fixDupes(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const dupes = findDupes(raw);
  if (dupes.length === 0) return { fixed: false, dupes: [] };

  const backupPath = filePath + ".dupfix.bak";

  // Backup (chỉ nếu chưa có)
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, raw, "utf-8");
  }

  // JSON.parse (last-wins)
  const obj = JSON.parse(raw);

  // Sắp xếp A-Z
  const sorted = {};
  Object.keys(obj).sort().forEach((k) => { sorted[k] = obj[k]; });
  fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + "\n", "utf-8");

  return { fixed: true, dupes, backupPath };
}

// ---------- Check coverage ----------
function checkCoverage(sourceKeys, dict) {
  let translated = 0;
  const missing = [];
  for (const k of sourceKeys) {
    const v = dict[k];
    if (v && v !== k) translated++;
    else missing.push(k);
  }
  return { translated, missing };
}

const files = fs
  .readdirSync(LOCALES_DIR)
  .filter(
    (f) =>
      f.endsWith(".json") &&
      !f.includes(".bak") &&
      !f.includes(".dupfix")
  );

console.log("[1] Fix duplicate keys...\n");
const bakFiles = [];

for (const f of files) {
  const filePath = path.join(LOCALES_DIR, f);
  const result = fixDupes(filePath);
  if (result.fixed) {
    console.log("  [FIXED] " + f + " - " + result.dupes.length + " key trung");
    result.dupes.slice(0, 10).forEach((d) => console.log("     - " + d.key + " (x" + d.count + ")"));
    if (result.dupes.length > 10) console.log("     ... va " + (result.dupes.length - 10) + " key khac");
    bakFiles.push(result.backupPath);
  } else {
    console.log("  [OK]    " + f + " - khong co duplicate");
  }
}

// 🔧 FIX #78: tự xóa .dupfix.bak sau khi thành công
if (bakFiles.length > 0) {
  console.log("\n  [CLEANUP] Xoa file .dupfix.bak tam...");
  for (const b of bakFiles) {
    try {
      fs.unlinkSync(b);
      console.log("     [DELETED] " + path.basename(b));
    } catch (e) {
      console.log("     [SKIP] " + path.basename(b) + " — " + e.message);
    }
  }
}

console.log("\n[2] Coverage sau khi fix:\n");

const sourcePath = path.join(LOCALES_DIR, "_source.json");
const source = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));
const sourceKeys = Object.keys(source);
console.log("  Source: " + sourceKeys.length + " keys\n");

for (const lang of ["en", "ja", "ko", "zh"]) {
  const p = path.join(LOCALES_DIR, lang + ".json");
  if (!fs.existsSync(p)) { console.log("  [" + lang + "] KHONG TON TAI"); continue; }
  const dict = JSON.parse(fs.readFileSync(p, "utf-8"));
  const cov = checkCoverage(sourceKeys, dict);
  const pct = sourceKeys.length > 0
    ? Math.round((cov.translated / sourceKeys.length) * 1000) / 10
    : 0;
  const status = pct >= 90 ? "SAN SANG" : pct >= 50 ? "TRUNG BINH" : "YEU";
  console.log("  [" + lang + "] " + cov.translated + " / " + sourceKeys.length + " (" + pct + "%) [" + status + "]");
}

console.log("\n[3] Locale nao co key thua (khong co trong _source):\n");
const sourceSet = new Set(sourceKeys);
for (const lang of ["en", "ja", "ko", "zh"]) {
  const p = path.join(LOCALES_DIR, lang + ".json");
  if (!fs.existsSync(p)) continue;
  const dict = JSON.parse(fs.readFileSync(p, "utf-8"));
  const extra = Object.keys(dict).filter((k) => !sourceSet.has(k));
  console.log("  [" + lang + "] " + extra.length + " key thua");
  if (extra.length <= 5) {
    extra.forEach((k) => console.log("     - " + k));
  } else {
    extra.slice(0, 5).forEach((k) => console.log("     - " + k));
    console.log("     ... va " + (extra.length - 5) + " key khac");
  }
}
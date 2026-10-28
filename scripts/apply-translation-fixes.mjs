// scripts/apply-translation-fixes.mjs
// Apply bản dịch từ garbage-<locale>.csv (cột new_value) vào locale file
// Chạy: node scripts/apply-translation-fixes.mjs en

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const LOCALE = process.argv[2] || "en";
const csvFile = path.join(root, `garbage-${LOCALE}.csv`);
const localeFile = path.join(root, "src", "lib", "i18n", "locales", `${LOCALE}.json`);

if (!fs.existsSync(csvFile)) {
  console.error(`❌ Không tìm thấy ${csvFile}`);
  process.exit(1);
}

// Strip BOM nếu có
let raw = fs.readFileSync(csvFile, "utf8");
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);

const lines = raw.split(/\r?\n/).slice(1).filter(Boolean);
const locale = JSON.parse(fs.readFileSync(localeFile, "utf8"));

let applied = 0;
let skipped = 0;
let noNewValue = 0;

for (const line of lines) {
  // Match 4 cột CSV có escape ""
  const m = line.match(
    /^"((?:[^"]|"")*)","((?:[^"]|"")*)","((?:[^"]|"")*)","((?:[^"]|"")*)"$/
  );
  if (!m) continue;

  const [, rawKey, , , rawNew] = m;
  const key = rawKey.replace(/""/g, '"');
  const newValue = rawNew.replace(/""/g, '"').trim();

  if (!newValue) {
    noNewValue++;
    continue;
  }

  if (locale[key] === newValue) {
    skipped++;
    continue;
  }

  locale[key] = newValue;
  applied++;
  console.log(`[fix] ${key}  →  ${newValue}`);
}

fs.writeFileSync(localeFile, JSON.stringify(locale, null, 2) + "\n", "utf8");
console.log(`\n✅ Applied: ${applied} | Skipped: ${skipped} | Chưa điền new_value: ${noNewValue}`);
console.log(`📄 File: ${localeFile}`);
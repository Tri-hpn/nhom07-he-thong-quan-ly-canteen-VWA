// scripts/detect-garbage-translations.mjs
// Detect key rác trong locale files (dùng vi.json làm source — không cần _source.json)
// Chạy: node scripts/detect-garbage-translations.mjs en

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const LOCALE = process.argv[2] || "en";
const localesDir = path.join(root, "src", "lib", "i18n", "locales");
const viFile = path.join(localesDir, "vi.json");
const localeFile = path.join(localesDir, `${LOCALE}.json`);

if (!fs.existsSync(viFile)) {
  console.error(`❌ Không tìm thấy ${viFile}`);
  console.error(`   → Kiểm tra lại cấu trúc thư mục`);
  process.exit(1);
}
if (!fs.existsSync(localeFile)) {
  console.error(`❌ Không tìm thấy ${localeFile}`);
  process.exit(1);
}

// Source = vi.json (vì vi là source language, key = value identity)
const source = JSON.parse(fs.readFileSync(viFile, "utf8"));
const locale = JSON.parse(fs.readFileSync(localeFile, "utf8"));

console.log(`📂 Source: ${viFile} (${Object.keys(source).length} keys)`);
console.log(`📂 Target: ${localeFile} (${Object.keys(locale).length} keys)\n`);

const SUSPICIOUS_PATTERNS = [
  /ĐÂ|Ã¢|Ã©|Ã¨|Ã¬|Ã²|Ã¹|á»|áº|â€|Å“|Æ°/i,
  /\\u[0-9a-f]{4}/i,
  /what'?s wrong\?/i,
];

const EXACT_BAD_VALUES = new Set([
  "What's wrong?",
  "Sign in",
  "Price of the product",
  "The course becomes the same. Downloading",
  "Here's the explanation:",
  "Check out these vouchers",
  "What do you need in your life?",
]);

const SKIP_KEY_PATTERN = /^[\d\s\-.,%:]+$|^[a-zA-Z]{1,3}$|^[A-Z_0-9]+$/;

const issues = [];

for (const key of Object.keys(source)) {
  const value = locale[key];
  if (value === undefined) {
    issues.push({ key, reason: "MISSING", value: null });
    continue;
  }
  if (SKIP_KEY_PATTERN.test(key)) continue;

  if (value === key) {
    issues.push({ key, reason: "SAME_AS_KEY", value });
    continue;
  }
  if (!value || String(value).trim() === "") {
    issues.push({ key, reason: "EMPTY", value });
    continue;
  }
  let matched = false;
  for (const pat of SUSPICIOUS_PATTERNS) {
    if (pat.test(value)) {
      issues.push({ key, reason: "MOJIBAKE_OR_ESCAPE", value });
      matched = true;
      break;
    }
  }
  if (matched) continue;
  if (EXACT_BAD_VALUES.has(value)) {
    issues.push({ key, reason: "KNOWN_BAD", value });
    continue;
  }
  if (key.length > 20 && String(value).length < key.length * 0.25) {
    issues.push({ key, reason: "TOO_SHORT", value });
  }
}

if (issues.length === 0) {
  console.log(`✅ ${LOCALE}.json: không phát hiện key rác.`);
  process.exit(0);
}

console.log(`⚠️  ${LOCALE}.json: ${issues.length} key đáng ngờ\n`);
console.log("─".repeat(80));

const byReason = {};
for (const i of issues) byReason[i.reason] = (byReason[i.reason] || 0) + 1;
for (const [r, n] of Object.entries(byReason)) {
  console.log(`  ${r}: ${n}`);
}
console.log("─".repeat(80) + "\n");

for (const { key, reason, value } of issues.slice(0, 30)) {
  console.log(`[${reason}]`);
  console.log(`  KEY:   ${key}`);
  console.log(`  VALUE: ${value === null ? "(missing)" : JSON.stringify(value)}`);
  console.log();
}
if (issues.length > 30) {
  console.log(`... và ${issues.length - 30} key khác (xem CSV)\n`);
}

const csvFile = path.join(root, `garbage-${LOCALE}.csv`);
const header = "key,current_value,reason,new_value\n";
const rows = issues
  .map(({ key, reason, value }) => {
    const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    return `${esc(key)},${esc(value)},${esc(reason)},`;
  })
  .join("\n");

fs.writeFileSync(csvFile, "\uFEFF" + header + rows, "utf8");
console.log(`📄 CSV: ${csvFile}`);
console.log(`\n💡 Sửa cột "new_value" trong CSV (Excel), rồi chạy:`);
console.log(`   node scripts/apply-translation-fixes.mjs ${LOCALE}`);
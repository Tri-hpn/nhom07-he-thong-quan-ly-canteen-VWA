// scripts/verify-locales.mjs
// Verify không còn key bị escape unicode dạng \\uXXXX trong tên key
// Chạy: node scripts/verify-locales.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const files = [
  "src/lib/i18n/locales/vi.json",
  "src/lib/i18n/locales/en.json",
  "src/lib/i18n/locales/ja.json",
  "src/lib/i18n/locales/ko.json",
  "src/lib/i18n/locales/zh.json",
  "_source.json",
  "src/lib/i18n/_source.json",
];

// Phát hiện key còn chứa literal "\uXXXX" (2 backslash + u + 4 hex)
const BAD_KEY = /"([^"]*\\\\u[0-9a-fA-F]{4}[^"]*)"/g;

let hasIssues = false;

for (const rel of files) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) continue;

  const text = fs.readFileSync(full, "utf8");
  const matches = [...text.matchAll(BAD_KEY)];

  if (matches.length > 0) {
    hasIssues = true;
    console.log(`\n⚠️  ${rel}: ${matches.length} bad keys`);
    for (const m of matches.slice(0, 10)) {
      console.log(`    ${m[1]}`);
    }
    if (matches.length > 10) {
      console.log(`    ... và ${matches.length - 10} key khác`);
    }
  } else {
    console.log(`✅ ${rel}: clean`);
  }
}

if (hasIssues) {
  console.log("\n❌ Còn key bị escape. Chạy fix-locale-escapes.mjs trước.");
  process.exit(1);
} else {
  console.log("\n✅ All clean.");
}
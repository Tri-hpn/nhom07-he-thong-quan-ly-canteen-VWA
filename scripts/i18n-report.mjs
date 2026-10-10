#!/usr/bin/env node
// ============================================================
// I18N-REPORT.MJS — Báo cáo chi tiết tình trạng dịch
// ============================================================
// Chạy: node scripts/i18n-report.mjs
//
// In ra:
//   - Tổng số key trong _source.json
//   - Mỗi lang đã dịch bao nhiêu
//   - Liệt kê key CHƯA dịch (để bạn biết cần fix gì)
//   - Cảnh báo key có vẻ là code rác (dấu chấm, số...)
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, "..", "src", "lib", "i18n", "locales");
const SOURCE_FILE = path.join(LOCALES_DIR, "_source.json");

if (!fs.existsSync(SOURCE_FILE)) {
  console.error("❌ Không tìm thấy _source.json");
  console.error("   Chạy 'npm run dev' 1 lần để plugin tự sinh file này.");
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(SOURCE_FILE, "utf-8"));
const sourceKeys = Object.keys(source);

console.log("═".repeat(70));
console.log("📊 BÁO CÁO TÌNH TRẠNG DỊCH");
console.log("═".repeat(70));
console.log(`📖 Source (VI): ${sourceKeys.length} keys\n`);

const LANGS = ["en", "ja", "ko", "zh"];

for (const lang of LANGS) {
  const file = path.join(LOCALES_DIR, `${lang}.json`);
  if (!fs.existsSync(file)) {
    console.log(`❌ [${lang}] File không tồn tại`);
    continue;
  }

  const dict = JSON.parse(fs.readFileSync(file, "utf-8"));
  const dictKeys = new Set(Object.keys(dict));

  const translated = [];
  const missing = [];
  const unchanged = [];

  for (const k of sourceKeys) {
    if (!dictKeys.has(k)) {
      missing.push(k);
    } else if (dict[k] === k) {
      unchanged.push(k); // Có key nhưng value = key (chưa dịch)
    } else if (!dict[k] || !String(dict[k]).trim()) {
      missing.push(k);
    } else {
      translated.push(k);
    }
  }

  const pct = Math.round((translated.length / sourceKeys.length) * 1000) / 10;
  const icon = pct >= 90 ? "✅" : pct >= 50 ? "⚠️ " : "❌";

  console.log(`${icon} [${lang.toUpperCase()}] ${translated.length}/${sourceKeys.length} (${pct}%)`);
  console.log(`   • Đã dịch   : ${translated.length}`);
  console.log(`   • Chưa dịch : ${missing.length}`);
  console.log(`   • Giữ nguyên: ${unchanged.length} (value = key)`);

  if (missing.length > 0) {
    console.log(`\n   🚨 ${missing.length} key CHƯA có trong ${lang}.json:`);
    missing.slice(0, 15).forEach((k) => {
      console.log(`      • "${k.slice(0, 70)}"`);
    });
    if (missing.length > 15) {
      console.log(`      ... và ${missing.length - 15} keys khác`);
    }
  }

  if (unchanged.length > 0) {
    console.log(`\n   ⚠️  ${unchanged.length} key value = key (cần kiểm tra):`);
    unchanged.slice(0, 10).forEach((k) => {
      console.log(`      • "${k.slice(0, 70)}"`);
    });
    if (unchanged.length > 10) {
      console.log(`      ... và ${unchanged.length - 10} keys khác`);
    }
  }

  console.log("");
}

// ---------- Cảnh báo key rác ----------
console.log("─".repeat(70));
console.log("🔍 KIỂM TRA KEY RÁC (có thể gây lỗi dịch):");
console.log("─".repeat(70));

const suspiciousKeys = sourceKeys.filter((k) => {
  if (k.length < 2) return true;
  if (/^\d+$/.test(k)) return true;
  if (/^https?:\/\//.test(k)) return true;
  if (/^\//.test(k)) return true; // route path
  if (/^[A-Z_]+$/.test(k)) return true; // hằng số
  if (k.includes("${")) return true; // dynamic
  return false;
});

if (suspiciousKeys.length === 0) {
  console.log("✅ Không có key rác");
} else {
  console.log(`⚠️  ${suspiciousKeys.length} key có vẻ là rác:`);
  suspiciousKeys.slice(0, 20).forEach((k) => {
    console.log(`   • "${k.slice(0, 70)}"`);
  });
  if (suspiciousKeys.length > 20) {
    console.log(`   ... và ${suspiciousKeys.length - 20} keys khác`);
  }
  console.log("\n💡 Chạy: node scripts/cleanup-i18n-source.mjs để xóa key rác");
}

console.log("");
console.log("═".repeat(70));
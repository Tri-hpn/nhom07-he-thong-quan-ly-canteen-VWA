#!/usr/bin/env node
// ============================================================
// CLEANUP-I18N-SOURCE.MJS — Xoá key rác + fix mojibake (V4 - FINAL)
// ============================================================
// V3 (2026-10):
//   - ✅ FIX: phát hiện + fix mojibake ("khuyáº¿n mÃ£i" → "khuyến mãi")
//   - ✅ FIX: xoá key viết tắt (MSSV, NV, KH, STT, PTTT, ID)
//   - ✅ FIX: xoá số điện thoại, số thuần
//
// V4 (2026-10) - FINAL:
//   - 🔧 FIX: KHÔNG tích lũy backup — xoá tất cả backup cũ TRƯỚC khi tạo mới
//   - 🔧 Chỉ giữ 1 file backup duy nhất trong .backup-quickfix/
//   - 🔧 Log rõ ràng: số backup đã xoá, số key đã xử lý
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_FILE = path.join(__dirname, "..", "src", "lib", "i18n", "locales", "_source.json");
const BACKUP_DIR = path.join(__dirname, "..", ".backup-quickfix");

// ============================================================
// 🧹 BƯỚC 0: DỌN BACKUP CŨ TRƯỚC KHI TẠO MỚI
// ============================================================
function cleanOldBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return { removed: 0 };

  let removed = 0;

  try {
    const files = fs.readdirSync(BACKUP_DIR);

    for (const f of files) {
      // Chỉ xoá các file backup của _source
      if (
        f.startsWith("_source.backup-") ||
        f.startsWith("_source-v2.backup-") ||
        f.startsWith("_source-v3.backup-") ||
        f.startsWith("_source-v4.backup-")
      ) {
        const full = path.join(BACKUP_DIR, f);
        try {
          const stat = fs.statSync(full);
          if (stat.isFile()) {
            fs.unlinkSync(full);
            removed++;
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (e) {
    console.warn(`[Warn] Không đọc được thư mục backup: ${e.message}`);
  }

  return { removed };
}

// ============================================================
// MAIN
// ============================================================
if (!fs.existsSync(SOURCE_FILE)) {
  console.error("[X] Khong tim thay _source.json");
  console.error("   Đường dẫn:", SOURCE_FILE);
  process.exit(1);
}

// ---- BƯỚC 1: DỌN BACKUP CŨ ----
console.log("");
console.log("🧹 Dọn backup cũ trong .backup-quickfix/...");
const cleanResult = cleanOldBackups();
if (cleanResult.removed > 0) {
  console.log(`   🗑️  Đã xoá ${cleanResult.removed} file backup cũ`);
} else {
  console.log(`   ✨ Không có backup cũ cần xoá`);
}
console.log("");

// ---- BƯỚC 2: TẠO BACKUP MỚI (CHỈ 1 FILE) ----
fs.mkdirSync(BACKUP_DIR, { recursive: true });
const backupFile = path.join(
  BACKUP_DIR,
  `_source.backup-${Date.now()}.json`
);
fs.copyFileSync(SOURCE_FILE, backupFile);
console.log(`💾 Backup mới: ${path.basename(backupFile)}`);
console.log("");

// ---- BƯỚC 3: ĐỌC _source.json ----
const source = JSON.parse(fs.readFileSync(SOURCE_FILE, "utf-8"));
const before = Object.keys(source).length;

// ============================================================
// 1. Fix mojibake — chuyển Latin-1 → UTF-8
// ============================================================
function fixMojibake(str) {
  const mojibakePattern = /[ÃÂ][\u0080-\u00BF]|á[º»¼½]|Æ|¢|£|¥|§|©/;
  if (!mojibakePattern.test(str)) return str;

  try {
    const fixed = Buffer.from(str, "latin1").toString("utf-8");
    if (mojibakePattern.test(fixed)) {
      const fixed2 = Buffer.from(str, "binary").toString("utf-8");
      if (!mojibakePattern.test(fixed2)) return fixed2;
    }
    return fixed;
  } catch {
    return str;
  }
}

// ============================================================
// 2. Blacklist key rác
// ============================================================
const KEY_BLACKLIST = new Set([
  "ID", "KH", "MSSV", "NV", "PTTT", "STT", "VND", "USD", "CNY", "JPY", "KRW",
  "OK", "X", "→", "←", "↑", "↓",
]);

// ============================================================
// 3. Duyệt và làm sạch
// ============================================================
const cleaned = {};
const removed = [];
const fixedKeys = [];
const fixedValues = [];

for (const [k, v] of Object.entries(source)) {
  // ---- Blacklist ----
  if (KEY_BLACKLIST.has(k)) {
    removed.push(k);
    continue;
  }

  // ---- Số thuần ----
  if (/^\d+$/.test(k)) {
    removed.push(k);
    continue;
  }

  // ---- SĐT (10-11 số) ----
  if (/^0\d{9,10}$/.test(k)) {
    removed.push(k);
    continue;
  }

  // ---- Chỉ có dấu chấm câu ----
  if (/^[\s.!?,;:…\-–—]+$/.test(k)) {
    removed.push(k);
    continue;
  }

  // ---- Quá ngắn (< 2 ký tự), trừ emoji ----
  if (k.length < 2 && !/[\u{1F300}-\u{1FAFF}]/u.test(k)) {
    removed.push(k);
    continue;
  }

  // ---- Fix mojibake cho key ----
  let newKey = fixMojibake(k);
  if (newKey !== k) {
    fixedKeys.push({ from: k, to: newKey });
  }

  // ---- Fix mojibake cho value ----
  let newValue = fixMojibake(v);
  if (newValue !== v) {
    fixedValues.push({ from: v, to: newValue });
  }

  cleaned[newKey] = newValue;
}

// ============================================================
// 4. Ghi file _source.json
// ============================================================
fs.writeFileSync(SOURCE_FILE, JSON.stringify(cleaned, null, 2) + "\n", "utf-8");

// ============================================================
// 5. Report
// ============================================================
console.log("─".repeat(60));
console.log("📊 KẾT QUẢ CLEANUP");
console.log("─".repeat(60));
console.log(`   Trước:           ${before} keys`);
console.log(`   Sau:             ${Object.keys(cleaned).length} keys`);
console.log(`   Đã xoá:          ${removed.length} key rác`);
console.log(`   Fix mojibake KEY:   ${fixedKeys.length}`);
console.log(`   Fix mojibake VALUE: ${fixedValues.length}`);
console.log("");

// ---- Chi tiết key đã xoá ----
if (removed.length > 0) {
  if (removed.length <= 30) {
    console.log("🗑️  Đã xoá:");
    removed.forEach((k) => console.log(`   • ${k}`));
  } else {
    console.log(`🗑️  Đã xoá ${removed.length} key (30 key đầu):`);
    removed.slice(0, 30).forEach((k) => console.log(`   • ${k}`));
    console.log(`   ... và ${removed.length - 30} key khác`);
  }
  console.log("");
}

// ---- Chi tiết mojibake KEY ----
if (fixedKeys.length > 0) {
  console.log(`🔧 Fix mojibake KEY (${fixedKeys.length} key, 10 đầu):`);
  fixedKeys.slice(0, 10).forEach((f) => {
    console.log(`   "${f.from}"`);
    console.log(`   → "${f.to}"`);
  });
  if (fixedKeys.length > 10) {
    console.log(`   ... và ${fixedKeys.length - 10} key khác`);
  }
  console.log("");
}

// ---- Chi tiết mojibake VALUE ----
if (fixedValues.length > 0) {
  console.log(`🔧 Fix mojibake VALUE (${fixedValues.length} value, 5 đầu):`);
  fixedValues.slice(0, 5).forEach((f) => {
    console.log(`   "${String(f.from).slice(0, 50)}"`);
    console.log(`   → "${String(f.to).slice(0, 50)}"`);
  });
  if (fixedValues.length > 5) {
    console.log(`   ... và ${fixedValues.length - 5} value khác`);
  }
  console.log("");
}

// ============================================================
// 6. Bước tiếp theo
// ============================================================
console.log("═".repeat(60));
console.log("✨ CLEANUP HOÀN TẤT");
console.log("═".repeat(60));
console.log("");
console.log("📝 Bước tiếp theo:");
console.log("   1. npm run i18n:report       ← xem coverage");
console.log("   2. npm run translate:db      ← dịch lại các key mới");
console.log("");
console.log(`💾 Backup giữ lại: ${path.basename(backupFile)}`);
console.log(`   (chỉ 1 file — tự xoá backup cũ mỗi lần chạy)`);
console.log("");
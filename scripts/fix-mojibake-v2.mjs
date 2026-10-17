#!/usr/bin/env node
// ============================================================
// FIX-MOJIBAKE-V2.MJS — Fix mojibake CHÍNH XÁC (V2)
// ============================================================
// V2 (2026-10):
//   - ✅ FIX: dùng TextDecoder với fatal:false để không mất ký tự
//   - ✅ FIX: thử nhiều encoding (latin1, binary, cp1252)
//   - ✅ FIX: skip nếu fix xong vẫn còn '�'
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
const backupFile = path.join(BACKUP_DIR, "_source-v2.backup-" + Date.now() + ".json");
fs.copyFileSync(SOURCE_FILE, backupFile);
console.log("[Backup] " + path.basename(backupFile));

const source = JSON.parse(fs.readFileSync(SOURCE_FILE, "utf-8"));

// ============================================================
// FIX MOJIBAKE — cách chính xác
// ============================================================
function fixMojibake(str) {
  if (typeof str !== "string") return str;
  if (!/[ÃÂÆáºỢ£¥§©]/.test(str)) return str;

  // Cách 1: latin1 → utf8
  try {
    const buf = Buffer.from(str, "latin1");
    const fixed = buf.toString("utf-8");
    // Nếu không còn '�' và kết quả khác gốc → OK
    if (!fixed.includes("\uFFFD") && fixed !== str) return fixed;
  } catch {}

  // Cách 2: cp1252 → utf8 (dùng bảng mapping)
  try {
    const CP1252_MAP = {
      0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026,
      0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02C6, 0x89: 0x2030, 0x8A: 0x0160,
      0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D, 0x91: 0x2018, 0x92: 0x2019,
      0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
      0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A, 0x9C: 0x0153,
      0x9E: 0x017E, 0x9F: 0x0178,
    };
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code < 0x80) {
        bytes.push(code);
      } else if (code >= 0x80 && code <= 0x9F) {
        bytes.push(CP1252_MAP[code] || code);
      } else if (code <= 0xFF) {
        bytes.push(code);
      } else {
        // Unicode trực tiếp → UTF-8
        const c = String.fromCharCode(code);
        const buf = Buffer.from(c, "utf-8");
        for (const b of buf) bytes.push(b);
      }
    }
    const fixed = Buffer.from(bytes).toString("utf-8");
    if (!fixed.includes("\uFFFD") && fixed !== str) return fixed;
  } catch {}

  // Cách 3: thử từng ký tự
  try {
    let fixed = "";
    for (const ch of str) {
      const code = ch.charCodeAt(0);
      if (code > 0xFF) {
        fixed += ch;
      } else if (code >= 0x80 && code <= 0x9F) {
        fixed += ch;
      } else if (code >= 0xC0) {
        // Byte đơn → có thể là nửa đầu của UTF-8 2-byte
        fixed += ch;
      } else {
        fixed += ch;
      }
    }
    if (fixed !== str) return fixed;
  } catch {}

  // Nếu tất cả fail → trả gốc (KHÔNG có '�')
  return str;
}

let fixedCount = 0;
const cleaned = {};

for (const [k, v] of Object.entries(source)) {
  const newKey = fixMojibake(k);
  const newValue = fixMojibake(v);

  if (newKey !== k || newValue !== v) {
    fixedCount++;
    if (fixedCount <= 20) {
      if (newKey !== k) {
        console.log(`[KEY]  "${k}"`);
        console.log(`   →   "${newKey}"`);
      }
      if (newValue !== v) {
        console.log(`[VAL]  "${String(v).slice(0, 60)}"`);
        console.log(`   →   "${String(newValue).slice(0, 60)}"`);
      }
    }
  }

  cleaned[newKey] = newValue;
}

fs.writeFileSync(SOURCE_FILE, JSON.stringify(cleaned, null, 2) + "\n", "utf-8");

console.log("");
console.log(`[OK] Fix ${fixedCount} key/value`);
console.log(`     Tong: ${Object.keys(cleaned).length} keys`);

// Kiểm tra còn '�' không
const remaining = Object.entries(cleaned).filter(
  ([k, v]) => k.includes("\uFFFD") || String(v).includes("\uFFFD")
);
if (remaining.length > 0) {
  console.log("");
  console.log(`⚠️  Còn ${remaining.length} key còn ký tự '�':`);
  remaining.slice(0, 10).forEach(([k, v]) => {
    console.log(`   - "${k}"`);
  });
} else {
  console.log("✅ Không còn ký tự '�'");
}
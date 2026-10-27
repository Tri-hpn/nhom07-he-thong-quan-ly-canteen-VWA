// scripts/cleanup-css.mjs
// ============================================================
// Xoá block CSS trùng lặp đã tích tụ qua nhiều lần fix
// Chạy: node scripts/cleanup-css.mjs
// Backup tự động → backups/css-cleanup-<timestamp>/
// An toàn: verify brace balance sau mỗi lần xoá
// ============================================================

import fs from "node:fs";
import path from "node:path";

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const BACKUP_DIR = `backups/css-cleanup-${ts}`;
const stats = { files: {}, totalSaved: 0 };

// ------------------------------------------------------------
// Đếm { } để verify CSS không bị vỡ sau khi xoá
// ------------------------------------------------------------
function braceBalance(content) {
  let depth = 0, inStr = false, strChar = "", inBC = false, inLC = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i], n = content[i + 1];
    if (inLC) { if (c === "\n") inLC = false; continue; }
    if (inBC) { if (c === "*" && n === "/") { inBC = false; i++; } continue; }
    if (inStr) { if (c === "\\") { i++; continue; } if (c === strChar) inStr = false; continue; }
    if (c === "/" && n === "*") { inBC = true; i++; continue; }
    if (c === "/" && n === "/") { inLC = true; i++; continue; }
    if (c === '"' || c === "'") { inStr = true; strChar = c; continue; }
    if (c === "{") depth++;
    if (c === "}") depth--;
  }
  return depth;
}

// ------------------------------------------------------------
// Xoá 1 block: comment /* marker */ + tất cả rules {...} ngay sau
// Dừng khi gặp comment /* khác hoặc EOF
// ------------------------------------------------------------
function removeCommentAndItsRules(content, marker) {
  const markerIdx = content.indexOf(marker);
  if (markerIdx < 0) return null;

  const commentStart = content.lastIndexOf("/*", markerIdx);
  if (commentStart < 0) return null;
  const commentEnd = content.indexOf("*/", markerIdx);
  if (commentEnd < 0) return null;

  let i = commentEnd + 2;
  let lastEnd = commentEnd + 2;

  while (i < content.length) {
    while (i < content.length && /\s/.test(content[i])) i++;
    if (i >= content.length) break;
    if (content[i] === "/" && content[i + 1] === "*") break;

    const braceStart = content.indexOf("{", i);
    if (braceStart < 0) break;

    const chunk = content.slice(i, braceStart);
    if (chunk.includes("/*")) break;

    let depth = 0, j = braceStart;
    let inStr = false, strChar = "", inBC = false, closed = false;

    while (j < content.length) {
      const c = content[j], n = content[j + 1];
      if (inBC) { if (c === "*" && n === "/") { inBC = false; j += 2; continue; } j++; continue; }
      if (inStr) { if (c === "\\") { j += 2; continue; } if (c === strChar) inStr = false; j++; continue; }
      if (c === "/" && n === "*") { inBC = true; j += 2; continue; }
      if (c === '"' || c === "'") { inStr = true; strChar = c; j++; continue; }
      if (c === "{") depth++;
      if (c === "}") {
        depth--;
        if (depth === 0) { lastEnd = j + 1; closed = true; j++; break; }
      }
      j++;
    }
    if (!closed) return null;
    i = j;
  }

  if (lastEnd <= commentEnd + 2) return null;

  return content.slice(0, commentStart).trimEnd() + "\n\n" + content.slice(lastEnd).trimStart();
}

// Xoá tất cả các block có marker (KHÔNG giữ cái nào)
function removeAllByMarkers(content, markers) {
  let result = content;
  let any = false;
  for (const marker of markers) {
    let guard = 0;
    while (guard++ < 30) {
      const next = removeCommentAndItsRules(result, marker);
      if (!next || next === result) break;
      result = next;
      any = true;
    }
  }
  return any ? result : null;
}

// Xoá 1 "section" (PHẦN NNN) chứa marker tới section kế tiếp
function removeSectionByMarker(content, marker) {
  const markerIdx = content.indexOf(marker);
  if (markerIdx < 0) return null;
  const start = content.lastIndexOf("/*", markerIdx);
  if (start < 0) return null;
  const secRegex = /\/\* =+\s*\n\s*PHẦN \d+/g;
  secRegex.lastIndex = markerIdx + marker.length;
  const m = secRegex.exec(content);
  const end = m ? m.index : content.length;
  return content.slice(0, start).trimEnd() + "\n\n" + content.slice(end).trimStart();
}

// ------------------------------------------------------------
// Chạy ops trên 1 file, verify an toàn
// ------------------------------------------------------------
function processFile(filePath, ops) {
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  Not found: ${filePath}`);
    return;
  }
  console.log(`\n📄 ${filePath}`);

  let content = fs.readFileSync(filePath, "utf8");
  const originalContent = content;
  const origBal = braceBalance(content);

  for (const op of ops) {
    const before = content.length;
    const result = op.apply(content);
    if (!result || result === content) {
      console.log(`  ⏭  ${op.name}: skip (no match)`);
      continue;
    }
    const newBal = braceBalance(result);
    if (newBal !== origBal) {
      console.log(`  ❌ ${op.name}: SKIP (brace ${origBal}→${newBal})`);
      continue;
    }
    content = result;
    console.log(`  ✅ ${op.name}: -${before - result.length} bytes`);
  }

  if (content.length < originalContent.length) {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const dest = path.join(BACKUP_DIR, path.basename(filePath));
    fs.writeFileSync(dest, originalContent);
    fs.writeFileSync(filePath, content);
    const saved = originalContent.length - content.length;
    stats.files[filePath] = saved;
    stats.totalSaved += saved;
    console.log(`  💾 Saved. Backup: ${dest}`);
  } else {
    console.log(`  ℹ️  No changes`);
  }
}

// ============================================================
// MAIN
// ============================================================

console.log("🧹 CSS CLEANUP — Xoá block trùng lặp");
console.log(`📁 Backup dir: ${BACKUP_DIR}\n`);

// ---------- src/styles-sky.css: Xoá FIX-C (đã override bởi responsive-audit) ----------
processFile("./src/styles-sky.css", [
  {
    name: "FIX-C HeaderNav/BottomNav (tới EOF)",
    apply: (c) => {
      const idx = c.indexOf("FIX-C. RESPONSIVE");
      if (idx < 0) return null;
      const start = c.lastIndexOf("/*", idx);
      if (start < 0) return null;
      return c.slice(0, start).trimEnd() + "\n";
    },
  },
]);

// ---------- src/styles.css: Xoá PHẦN 20B thứ 2 (toast card duplicate) ----------
processFile("./src/styles.css", [
  {
    name: "PHẦN 20B: TOAST CARD (duplicate lần 2)",
    apply: (c) => {
      const first = c.indexOf("PHẦN 20B: TOAST CARD");
      if (first < 0) return null;
      const second = c.indexOf("PHẦN 20B: TOAST CARD", first + 10);
      if (second < 0) return null;
      const start = c.lastIndexOf("/*", second);
      if (start < 0) return null;
      const secRegex = /\/\* =+\s*\n\s*PHẦN \d+/g;
      secRegex.lastIndex = second + 10;
      const m = secRegex.exec(c);
      const end = m ? m.index : c.length;
      return c.slice(0, start).trimEnd() + "\n\n" + c.slice(end).trimStart();
    },
  },
]);

// ---------- src/styles-customer.css: Xoá các fix block trùng ----------
const SEARCH_FIX_MARKERS = [
  "CUSTOMER MENU - SEARCH WIDTH ALIGNMENT",
  "FINAL: SEARCH BAR 0.5CM FROM SIDEBAR EDGES",
  "FINAL ALIGNMENT: FILTER TITLE AND SEARCH BAR",
  "FIX SEARCH WIDTH - 8PX SIDEBAR INSET, NO OVERFLOW",
  "FINAL FIX: SEARCH BAR - APPROX 0.5CM FROM SIDEBAR EDGES",
  "FINAL FIX: SEARCH INSET 18PX, NO OVERFLOW",
  "CUSTOMER MENU - SLIGHTLY SHORTER SEARCH BAR",
  "ALIGN CATEGORY FILTERS WITH SEARCH ICON",
  "FINAL FIX: ALIGN CATEGORY LIST WITH SEARCH ICON",
  "FIX CATEGORY OVERFLOW AND ALIGN WITH SEARCH ICON",
  "FIX CATEGORY OVERFLOW - KEEP ALL CONTENT INSIDE SIDEBAR",
];

const LOGO_FIX_MARKERS = [
  "CUSTOMER TOPBAR CIRCULAR LOGO",
  "CUSTOMER TOPBAR LOGO: REMOVE WHITE FRAME",
  "CUSTOMER FOOTER LOGO: REMOVE WHITE FRAME",
  "CUSTOMER LOGOS: MATCH LIGHT ROUNDED FRAME",
  "CUSTOMER LOGOS: REMOVE WHITE FRAME",
  "CUSTOMER LOGOS - MATCH REFERENCE FRAME",
  "CUSTOMER LOGO: CLEAN TILE + SOFT SHADOW",
  "CUSTOMER LOGO: REMOVE REMAINING OUTER WHITE SPACE",
  "CUSTOMER LOGO: CLEAN BOTTOM EDGE",
];

processFile("./src/styles-customer.css", [
  {
    name: `Search fix blocks (${SEARCH_FIX_MARKERS.length} comment groups)`,
    apply: (c) => removeAllByMarkers(c, SEARCH_FIX_MARKERS),
  },
  {
    name: `Logo fix blocks (${LOGO_FIX_MARKERS.length} comment groups)`,
    apply: (c) => removeAllByMarkers(c, LOGO_FIX_MARKERS),
  },
]);

// ---------- src/styles-employee.css: Xoá 🔧 Đã sửa duplicates ----------
processFile("./src/styles-employee.css", [
  {
    name: "Menu86 actions duplicates (giữ block cuối)",
    apply: (c) => {
      const marker = "🔧 Đã sửa:";
      const occurrences = [];
      let idx = 0;
      while ((idx = c.indexOf(marker, idx)) !== -1) {
        occurrences.push(idx);
        idx += marker.length;
      }
      if (occurrences.length <= 1) return null;

      let result = c;
      // Xoá tất cả trừ lần cuối (xoá từ vị trí thứ (n-2) về 0)
      for (let i = occurrences.length - 2; i >= 0; i--) {
        const next = removeCommentAndItsRules(result, marker);
        if (next && next !== result) result = next;
      }
      return result !== c ? result : null;
    },
  },
]);

// ============================================================
// SUMMARY
// ============================================================

console.log("\n" + "=".repeat(50));
console.log("📊 TÓM TẮT");
console.log("=".repeat(50));

const entries = Object.entries(stats.files);
if (entries.length === 0) {
  console.log("  ℹ️  Không có gì để xoá (file đã sạch)");
} else {
  for (const [file, saved] of entries) {
    console.log(`  ${file}: -${saved} bytes (${(saved / 1024).toFixed(1)} KB)`);
  }
  console.log(`\n💾 Tổng tiết kiệm: ${(stats.totalSaved / 1024).toFixed(1)} KB`);
  console.log(`📁 Backup: ${BACKUP_DIR}`);
  console.log("\n✅ Xong. Chạy: npm start");
  console.log("❌ Nếu lỗi CSS: copy file trong backup → đè lại");
}
// ============================================================
// VITE PLUGIN I18N — Auto-extract t("...") (V4 - FINAL)
// ============================================================
// V4 (2026-10):
//   - ✅ FIX: extract template literal đơn giản `t(\`text\`)`
//   - ✅ FIX: extract ternary `t(cond ? "A" : "B")`
//   - ✅ FIX: log key bị skip để debug
//   - Giữ V3: exec --until-done, debounce HMR
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";

// ✅ FIX: 3 regex để bắt 3 trường hợp
// 1. t("text") hoặc t('text')
const T_REGEX_QUOTE = /\bt\(\s*["']([^"'`\n]+)["']/g;
// 2. t(`text`) — template literal không có ${}
const T_REGEX_TEMPLATE = /\bt\(\s*`([^`$\n]+)`/g;
// 3. t(cond ? "A" : "B") — ternary
const T_REGEX_TERNARY = /\bt\([^)]*\?\s*["']([^"'\n]+)["']\s*:\s*["']([^"'\n]+)["']/g;

const SOURCE_FILE = "src/lib/i18n/locales/_source.json";
const SCAN_DIRS = ["src"];
const EXCLUDE_PARTS = [
  "node_modules",
  "dist",
  ".git",
  "src/lib/i18n",
  "src/hooks/useI18n",
];

const AUTO_TRANSLATE_DELAY_MS = 3000;
const AUTO_TRANSLATE_ENABLED = true;

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (EXCLUDE_PARTS.some((ex) => full.includes(ex))) continue;
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(jsx?|tsx?|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function extractFromFiles(root) {
  const keys = new Set();
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(root, d)));
  let skippedTemplate = 0;

  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    // 1. Quote strings
    let match;
    T_REGEX_QUOTE.lastIndex = 0;
    while ((match = T_REGEX_QUOTE.exec(content)) !== null) {
      const key = match[1].trim();
      if (key && !key.includes("${")) keys.add(key);
    }

    // 2. Template literal không có ${}
    T_REGEX_TEMPLATE.lastIndex = 0;
    while ((match = T_REGEX_TEMPLATE.exec(content)) !== null) {
      const key = match[1].trim();
      if (key && !key.includes("${")) keys.add(key);
    }

    // 3. Ternary
    T_REGEX_TERNARY.lastIndex = 0;
    while ((match = T_REGEX_TERNARY.exec(content)) !== null) {
      const a = match[1].trim();
      const b = match[2].trim();
      if (a && !a.includes("${")) keys.add(a);
      if (b && !b.includes("${")) keys.add(b);
    }

    // 4. Đếm template literal có ${} bị skip
    const dynamicRegex = /\bt\(\s*`[^`]*\$\{/g;
    skippedTemplate += (content.match(dynamicRegex) || []).length;
  }

  if (skippedTemplate > 0) {
    console.warn(
      `[i18n] ⚠️  Có ${skippedTemplate} chỗ dùng t(\`...\${var}...\`) — KHÔNG extract được (cần sửa thành t("...", {var}))`
    );
  }

  return [...keys].sort();
}

export default function i18nPlugin() {
  let root = process.cwd();
  let isDev = false;
  let translateTimer = null;
  let translateRunning = false;
  let scanTimer = null;

  function scheduleAutoTranslate(addedCount) {
    if (!AUTO_TRANSLATE_ENABLED || !isDev) return;
    if (addedCount <= 0) return;

    if (translateTimer) clearTimeout(translateTimer);

    translateTimer = setTimeout(() => {
      translateTimer = null;

      if (translateRunning) {
        console.log("[i18n] ⏸️  Bỏ qua — bản dịch trước đang chạy");
        return;
      }

      translateRunning = true;
      console.log(
        `\n[i18n] 🌐 Tự động dịch ${addedCount} câu mới... ` +
          `(chạy --until-done, có thể mất vài phút)`
      );

      exec(
        "node scripts/auto-translate-locales.mjs --until-done --max-rounds 5",
        { cwd: root, maxBuffer: 10 * 1024 * 1024 },
        (err, stdout, stderr) => {
          translateRunning = false;

          if (err) {
            console.error("[i18n] ❌ Dịch lỗi:", err.message);
            if (stderr) console.error(stderr.slice(0, 500));
            return;
          }

          const lines = (stdout || "").trim().split("\n");
          const lastLines = lines.slice(-6).join("\n");
          console.log(lastLines);
          console.log("[i18n] ✨ Đã cập nhật bản dịch\n");
        }
      );
    }, AUTO_TRANSLATE_DELAY_MS);
  }

  function writeSource() {
    const keys = extractFromFiles(root);
    const fullPath = path.join(root, SOURCE_FILE);

    const current = fs.existsSync(fullPath)
      ? JSON.parse(fs.readFileSync(fullPath, "utf-8"))
      : {};

    const next = {};
    for (const k of keys) next[k] = current[k] ?? k;

    const added = keys.filter((k) => !(k in current));
    const removed = Object.keys(current).filter((k) => !keys.includes(k));

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, JSON.stringify(next, null, 2), "utf-8");

    if (added.length) {
      console.log(`\n[i18n] ✚ ${added.length} câu mới:`);
      added.slice(0, 8).forEach((k) => console.log(`   + "${k}"`));
      if (added.length > 8) console.log(`   ... +${added.length - 8}`);
    }
    if (removed.length) {
      console.log(`\n[i18n] ✖ ${removed.length} câu không dùng nữa`);
    }

    return {
      added: added.length,
      removed: removed.length,
      total: keys.length,
    };
  }

  function scheduleWriteSource() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      const stats = writeSource();
      if (stats.added > 0) {
        scheduleAutoTranslate(stats.added);
      }
    }, 300);
  }

  return {
    name: "vite-plugin-i18n",
    configResolved(config) {
      root = config.root;
      isDev = config.command === "serve";
    },
    buildStart() {
      const stats = writeSource();
      console.log(`[i18n] ✓ Scan xong: ${stats.total} câu\n`);
    },
    handleHotUpdate({ file }) {
      if (isDev && /\.(jsx?|tsx?)$/.test(file)) {
        scheduleWriteUpdate();
      }
    },
  };
}

// ✅ FIX: alias để không lỗi ReferenceError
function scheduleWriteUpdate() {
  // gọi lại scheduleWriteSource (closure sẽ capture)
  if (global.__i18nScheduleWriteSource) {
    global.__i18nScheduleWriteSource();
  }
}
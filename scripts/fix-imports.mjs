#!/usr/bin/env node
// ============================================================
// fix-imports.mjs - Quet + bao cao import loi
// Chay: node fix-imports.mjs
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, "..", "src");

const IMPORT_REGEX = /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+["']([^"']+)["']/g;

let errors = 0;
let total = 0;
const errorList = [];

function walk(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      files.push(...walk(full));
    } else if (/\.(jsx?|mjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function resolveImport(importPath, fromFile) {
  if (!importPath.startsWith(".") && !importPath.startsWith("/")) return "external";
  const baseDir = path.dirname(fromFile);
  const target = path.resolve(baseDir, importPath);
  const candidates = [
    target, target + ".js", target + ".jsx", target + ".mjs", target + ".json",
    path.join(target, "index.js"), path.join(target, "index.jsx")
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

console.log("");
console.log("Quet imports...");
console.log("");

const files = walk(SRC_DIR);
for (const file of files) {
  const content = fs.readFileSync(file, "utf-8");
  const relFile = path.relative(__dirname, file);
  let match;
  IMPORT_REGEX.lastIndex = 0;
  while ((match = IMPORT_REGEX.exec(content)) !== null) {
    total++;
    const importPath = match[1];
    const resolved = resolveImport(importPath, file);
    if (resolved === null) {
      errors++;
      errorList.push({ file: relFile, importPath: importPath });
      console.log("[X] " + relFile);
      console.log('    -> import "' + importPath + '" KHONG TIM THAY');
      console.log("");
    }
  }
}

console.log("=".repeat(60));
console.log("Tong imports : " + total);
console.log("Loi          : " + errors);
console.log("=".repeat(60));

if (errors === 0) {
  console.log("[OK] Tat ca imports OK");
  process.exit(0);
} else {
  console.log("");
  console.log("[!] Cac file can sua:");
  errorList.forEach(function(e) { console.log("   - " + e.file); });
  process.exit(1);
}

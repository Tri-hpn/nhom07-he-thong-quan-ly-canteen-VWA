import fs from "node:fs";
import path from "node:path";

const dir = "src/lib/i18n/locales";
const backup = ".audit/backup-dedupe-" + Date.now();
fs.mkdirSync(backup, { recursive: true });

for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".json"))) {
  const p = path.join(dir, f);
  const lines = fs.readFileSync(p, "utf8").split("\n");
  const seen = new Map();  // lowercase key -> line index
  const toDelete = new Set();
  let dups = 0;

  lines.forEach((line, i) => {
    const m = line.match(/^\s*"((?:\\.|[^"\\])+)"\s*:/);
    if (!m) return;
    const lower = m[1].toLowerCase();
    if (seen.has(lower)) {
      // Keep the one with more "proper" case (prefer lowercase-first for Vietnamese labels)
      // Simpler: keep FIRST (usually what was there before), delete duplicates
      toDelete.add(i);
      dups++;
    } else {
      seen.set(lower, i);
    }
  });

  if (dups === 0) {
    console.log(`SKIP ${f}: 0 dups`);
    continue;
  }

  fs.copyFileSync(p, path.join(backup, f));
  const out = lines.filter((_, i) => !toDelete.has(i)).join("\n");
  fs.writeFileSync(p, out, "utf8");
  console.log(`FIXED ${f}: removed ${dups} case-insensitive dup lines`);
}

console.log(`\nBackup: ${backup}`);
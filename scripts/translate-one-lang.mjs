import fs from "node:fs";
import path from "node:path";
import { translateWithRetry } from "./lib/google-translate.mjs";

const LOCALES_DIR = path.join(process.cwd(), "src", "lib", "i18n", "locales");
const SOURCE_FILE = path.join(LOCALES_DIR, "_source.json");

const TARGET_LANG = "en";
const DELAY_MS = 150;

const source = JSON.parse(fs.readFileSync(SOURCE_FILE, "utf-8"));
const sourceKeys = Object.keys(source);
const dictPath = path.join(LOCALES_DIR, TARGET_LANG + ".json");
const dict = JSON.parse(fs.readFileSync(dictPath, "utf-8"));

const todo = sourceKeys.filter((k) => !dict[k] || dict[k] === k);

console.log("[i18n] Source: " + sourceKeys.length + " keys");
console.log("[i18n] Target: " + TARGET_LANG);
console.log("[i18n] Need translate: " + todo.length + " keys\n");

if (todo.length === 0) {
  console.log("[i18n] Nothing to translate. Done!");
  process.exit(0);
}

let done = 0;
let failed = 0;
const startTime = Date.now();

for (const key of todo) {
  try {
    const translated = await translateWithRetry(key, TARGET_LANG, "vi", 3);
    dict[key] = translated;
    done++;

    if (done % 20 === 0) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const rate = done / elapsed;
      const remaining = todo.length - done;
      const eta = Math.round(remaining / rate);
      process.stdout.write("  " + done + "/" + todo.length + " (" + Math.round((done/todo.length)*100) + "%) - ETA " + eta + "s\r");
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));

  } catch (err) {
    failed++;
    dict[key] = key;
    console.log("\n  [FAIL] " + key.slice(0, 50) + ": " + err.message);
  }
}

// Sort + ghi file
const sorted = {};
Object.keys(dict).sort().forEach((k) => { sorted[k] = dict[k]; });
fs.writeFileSync(dictPath, JSON.stringify(sorted, null, 2) + "\n", "utf-8");

console.log("\n");
console.log("[i18n] DONE");
console.log("  Translated: " + done);
console.log("  Failed:     " + failed);
console.log("  Total time: " + Math.round((Date.now() - startTime) / 1000) + "s");
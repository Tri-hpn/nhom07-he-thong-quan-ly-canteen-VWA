import fs from "node:fs";
import path from "node:path";
import { translateWithRetry } from "./lib/google-translate.mjs";

const DB_FILE = path.join(process.cwd(), "canteen-db.json");
const BACKUP_FILE = path.join(process.cwd(), ".backup-quickfix", "canteen-db.migration-" + Date.now() + ".json");

if (!fs.existsSync(DB_FILE)) {
  console.error("[X] Khong tim thay canteen-db.json");
  process.exit(1);
}

// Backup
fs.mkdirSync(path.dirname(BACKUP_FILE), { recursive: true });
fs.copyFileSync(DB_FILE, BACKUP_FILE);
console.log("[Backup] " + path.basename(BACKUP_FILE));

const db = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));

const LANGS = ["en", "ja", "ko", "zh"];
const DELAY_MS = 200;

// Dem so viec can lam
let menuTodo = 0;
let catTodo = 0;

for (const m of db.menu_items || []) {
  for (const lang of LANGS) {
    if (!m["name_" + lang]) menuTodo++;
    if (!m["description_" + lang] && m.description) menuTodo++;
  }
}
for (const c of db.categories || []) {
  for (const lang of LANGS) {
    if (!c["name_" + lang]) catTodo++;
  }
}

const totalTodo = menuTodo + catTodo;
console.log("[i18n] Menu fields can dich:  " + menuTodo);
console.log("[i18n] Category fields can dich: " + catTodo);
console.log("[i18n] TONG: " + totalTodo + " fields");
console.log("[i18n] ETA: ~" + Math.round((totalTodo * DELAY_MS) / 1000 / 60) + " phut");
console.log("");

let done = 0;
let failed = 0;
const startTime = Date.now();

async function translateField(obj, field, lang) {
  const text = obj[field];
  if (!text) return;
  if (obj[field + "_" + lang]) return;

  try {
    const translated = await translateWithRetry(text, lang, "vi", 3);
    obj[field + "_" + lang] = translated;
    done++;

    if (done % 10 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = done / elapsed;
      const eta = Math.round((totalTodo - done) / rate);
      process.stdout.write("  " + done + "/" + totalTodo + " (" + Math.round((done/totalTodo)*100) + "%) - ETA " + eta + "s\r");
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));
  } catch (err) {
    failed++;
    console.log("\n  [FAIL] " + field + "=" + text.slice(0,30) + " [" + lang + "]: " + err.message);
  }
}

console.log("Dich menu items...");
for (const m of db.menu_items || []) {
  for (const lang of LANGS) {
    await translateField(m, "name", lang);
    if (m.description) await translateField(m, "description", lang);
  }
}

console.log("\nDich categories...");
for (const c of db.categories || []) {
  for (const lang of LANGS) {
    await translateField(c, "name", lang);
  }
}

console.log("\n");
console.log("[i18n] DONE");
console.log("  Translated: " + done + " fields");
console.log("  Failed:     " + failed);
console.log("  Time:       " + Math.round((Date.now() - startTime) / 1000) + "s");

// Ghi lai DB
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2) + "\n", "utf-8");
console.log("[OK] Da ghi lai canteen-db.json");
console.log("[INFO] Deploy len Render de su dung ban dich moi");
// ============================================================
// split.mjs — Tách canteen-db.json thành các file nhỏ
// ============================================================
// Cách dùng:
//   node split.mjs
//
// Output:
//   data/
//   ├── users.json
//   ├── menu_items.json
//   ├── orders.json
//   ├── notifications.json
//   ├── vouchers.json
//   ├── reviews.json
//   ├── inventory.json
//   ├── toppings.json
//   ├── sizes.json
//   ├── categories.json
//   ├── messages.json
//   ├── attendances.json
//   ├── shifts.json
//   ├── wallets.json
//   ├── wallet_transactions.json
//   ├── price_history.json
//   ├── imports.json
//   └── settings.json
//
// Ngược lại (merge): node split.mjs merge
// ============================================================

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_FILE = path.join(__dirname, "..", "canteen-db.json");
const DATA_DIR = path.join(__dirname, "..", "data");

// ============================================================
// SPLIT
// ============================================================

async function split() {
  console.log("📖 Đọc canteen-db.json...");
  const raw = await fs.readFile(DB_FILE, "utf8");
  const db = JSON.parse(raw);

  // Tạo thư mục data/
  await fs.mkdir(DATA_DIR, { recursive: true });

  const keys = Object.keys(db);
  console.log(`📦 Tìm thấy ${keys.length} collections: ${keys.join(", ")}\n`);

  for (const key of keys) {
    const value = db[key];
    const fileName = `${key}.json`;
    const filePath = path.join(DATA_DIR, fileName);

    // Pretty print với 2 spaces
    const content = JSON.stringify(value, null, 2);
    await fs.writeFile(filePath, content, "utf8");

    // Đếm số item
    const count = Array.isArray(value)
      ? value.length
      : typeof value === "object" && value !== null
      ? Object.keys(value).length
      : 1;

    console.log(`✅ ${fileName.padEnd(28)} ${count} items`);
  }

  console.log("\n✨ Split xong! Data ở thư mục: ./data/");
}

// ============================================================
// MERGE
// ============================================================

async function merge() {
  console.log("📖 Đọc tất cả file trong ./data/...");

  const files = await fs.readdir(DATA_DIR);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  if (jsonFiles.length === 0) {
    console.error("❌ Không có file .json nào trong ./data/");
    process.exit(1);
  }

  const db = {};
  for (const file of jsonFiles) {
    const key = path.basename(file, ".json");
    const content = await fs.readFile(path.join(DATA_DIR, file), "utf8");
    db[key] = JSON.parse(content);
    console.log(`✅ Đã merge: ${file}`);
  }

  // Backup file cũ trước khi ghi
  try {
    await fs.copyFile(DB_FILE, DB_FILE + ".backup");
    console.log("\n💾 Đã backup file cũ → canteen-db.json.backup");
  } catch {
    /* Không có file cũ → OK */
  }

  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
  console.log("\n✨ Merge xong! → canteen-db.json");
}

// ============================================================
// MAIN
// ============================================================

const command = process.argv[2] || "split";

(async () => {
  try {
    if (command === "merge") {
      await merge();
    } else if (command === "split") {
      await split();
    } else {
      console.error(`❌ Command không hợp lệ: "${command}"`);
      console.error("   Dùng: node split.mjs [split|merge]");
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ Lỗi:", err.message);
    process.exit(1);
  }
})();
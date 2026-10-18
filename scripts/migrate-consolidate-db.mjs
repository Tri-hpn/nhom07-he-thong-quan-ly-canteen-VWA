// ============================================================
// MIGRATE-CONSOLIDATE-DB.MJS
// ------------------------------------------------------------
// Gộp cấu trúc DB Mongo nhưng GIỮ TOÀN BỘ DỮ LIỆU:
//   1. Backup tất cả collections ra file JSON (an toàn)
//   2. menu_items_backup → menu_items (nếu menu_items rỗng)
//   3. others.categories → categories
//      others.toppings   → toppings
//      others.settings + others.timeSlots → settings
//   4. Drop: canteen_db, data, others
//   5. Drop: tất cả *_backup
// ------------------------------------------------------------
// Chạy:
//   node scripts/migrate-consolidate-db.mjs
//   node scripts/migrate-consolidate-db.mjs --dry-run   (chỉ xem)
// ============================================================

import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const MONGO_URI = process.env.MONGO_URI;
const DRY_RUN = process.argv.includes("--dry-run");

if (!MONGO_URI) {
  console.error("❌ Thiếu MONGO_URI trong .env");
  process.exit(1);
}

const BACKUP_DIR = path.join(ROOT, "backups");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");

// ============================================================
// HELPERS
// ============================================================

function log(msg) {
  console.log(msg);
}

async function listCollections(db) {
  const arr = await db.listCollections().toArray();
  return arr.map((c) => c.name);
}

async function dumpAll(db, names) {
  const backup = {};
  for (const name of names) {
    const docs = await db.collection(name).find({}).toArray();
    backup[name] = docs;
    log(`   📦 ${name}: ${docs.length} docs`);
  }
  return backup;
}

async function insertManyClean(coll, docs, label) {
  if (!Array.isArray(docs) || docs.length === 0) return 0;
  const cleaned = docs.map((d) => {
    const { _id, ...rest } = d;
    return rest;
  });
  if (DRY_RUN) {
    log(`   [DRY] sẽ chèn ${cleaned.length} doc vào ${label}`);
    return cleaned.length;
  }
  await coll.insertMany(cleaned);
  log(`   ✅ ${label}: +${cleaned.length} doc`);
  return cleaned.length;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  log("🔌 Đang kết nối MongoDB...");
  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 20000,
    socketTimeoutMS: 45000,
  });
  const db = mongoose.connection.db;
  log("✅ Đã kết nối\n");

  const names = await listCollections(db);
  log(`📊 Có ${names.length} collections:`);
  log("   " + names.join(", ") + "\n");

  // ---------- 1. BACKUP ----------
  log("🛡  Bước 1: Backup toàn bộ dữ liệu...");
  const backup = await dumpAll(db, names);
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(BACKUP_DIR, `backup-${STAMP}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  log(`\n✅ Backup: ${backupFile} (${fs.statSync(backupFile).size} bytes)\n`);

  if (DRY_RUN) log("⚠️  ĐANG Ở CHẾ ĐỘ DRY-RUN — không ghi gì cả\n");

  // ---------- 2. menu_items ----------
  log("🍽  Bước 2: Gộp menu_items_backup → menu_items");
  const currentMenu = backup.menu_items || [];
  const backupMenu = backup.menu_items_backup || [];
  if (backupMenu.length === 0) {
    log("   ⏭  Không có menu_items_backup");
  } else if (currentMenu.length > 0) {
    log(`   ⏭  menu_items đã có ${currentMenu.length} món — giữ nguyên (backup sẽ bị xoá ở bước sau)`);
  } else {
    await insertManyClean(db.collection("menu_items"), backupMenu, "menu_items");
  }
  log("");

  // ---------- 3. others ----------
  log("🗂  Bước 3: Gộp others → categories / toppings / settings");
  const others = backup.others?.[0];

  if (!others) {
    log("   ⏭  Không có collection others");
  } else {
    // 3.1 categories
    const currentCats = backup.categories || [];
    const othersCats = others.categories || [];
    if (Array.isArray(othersCats) && othersCats.length > 0) {
      if (currentCats.length > 0) {
        log(`   ⏭  categories đã có ${currentCats.length} — bỏ qua (giữ data chính)`);
      } else {
        await insertManyClean(db.collection("categories"), othersCats, "categories");
      }
    }

    // 3.2 toppings
    const currentToppings = backup.toppings || [];
    const othersToppings = others.toppings || [];
    if (Array.isArray(othersToppings) && othersToppings.length > 0) {
      if (currentToppings.length > 0) {
        log(`   ⏭  toppings đã có ${currentToppings.length} — bỏ qua`);
      } else {
        await insertManyClean(db.collection("toppings"), othersToppings, "toppings");
      }
    }

    // 3.3 settings (merge)
    const currentSettings = backup.settings?.[0] || {};
    const othersSettings = others.settings || {};
    const othersSlots = Array.isArray(others.timeSlots) ? others.timeSlots : [];

    const merged = { ...currentSettings, ...othersSettings };
    delete merged._id;

    if (othersSlots.length > 0) {
      const curSlots = Array.isArray(merged.timeSlots) ? merged.timeSlots : [];
      if (curSlots.length === 0) merged.timeSlots = othersSlots;
    }

    const hasSomething = Object.keys(merged).length > 0;
    if (hasSomething) {
      if (DRY_RUN) {
        log(`   [DRY] sẽ ghi đè settings với ${Object.keys(merged).length} field`);
      } else {
        await db.collection("settings").deleteMany({});
        await db.collection("settings").insertOne(merged);
        log(`   ✅ settings: ghi đè (${Object.keys(merged).length} field)`);
      }
    }
  }
  log("");

  // ---------- 4. DROP legacy ----------
  log("🗑  Bước 4: Xoá collection legacy");
  const LEGACY = ["canteen_db", "data", "others"];
  for (const name of LEGACY) {
    if (!names.includes(name)) continue;
    if (DRY_RUN) {
      log(`   [DRY] sẽ xoá ${name}`);
      continue;
    }
    await db.collection(name).drop();
    log(`   🗑  Đã xoá ${name}`);
  }
  log("");

  // ---------- 5. DROP *_backup ----------
  log("🗑  Bước 5: Xoá tất cả collection *_backup");
  const backupNames = names.filter((n) => n.endsWith("_backup"));
  if (backupNames.length === 0) {
    log("   ⏭  Không có collection *_backup");
  } else {
    for (const name of backupNames) {
      if (DRY_RUN) {
        log(`   [DRY] sẽ xoá ${name}`);
        continue;
      }
      await db.collection(name).drop();
      log(`   🗑  Đã xoá ${name}`);
    }
  }
  log("");

  // ---------- 6. VERIFY ----------
  log("🔍 Bước 6: Kiểm tra sau migration");
  const afterNames = await listCollections(db);
  for (const key of ["menu_items", "categories", "toppings", "settings"]) {
    if (afterNames.includes(key)) {
      const count = await db.collection(key).countDocuments();
      log(`   ✔ ${key}: ${count} doc`);
    } else {
      log(`   ⚠ ${key}: KHÔNG TỒN TẠI`);
    }
  }

  await mongoose.disconnect();
  log("\n🎉 Migration hoàn tất!");
  if (DRY_RUN) log("💡 Chạy lại không có --dry-run để thực sự áp dụng.");
}

main().catch((err) => {
  console.error("\n❌ Migration lỗi:", err);
  process.exit(1);
});

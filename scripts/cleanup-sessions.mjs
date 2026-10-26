// scripts/cleanup-sessions.mjs
// ============================================================
// Script dọn dẹp collection `sessions`:
//   1. Xóa toàn bộ documents sessions cũ
//   2. Drop mọi unique index trên user_id (gây conflict multi-device)
//   3. Tạo lại index đúng: jti unique, user_id non-unique, expires_at TTL
//
// Cách dùng:
//   node scripts/cleanup-sessions.mjs
//   node scripts/cleanup-sessions.mjs --dry-run   (chỉ xem, không xóa)
//   node scripts/cleanup-sessions.mjs --keep-docs (chỉ drop index, không xóa docs)
// ============================================================

import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI chưa set trong .env");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");
const KEEP_DOCS = process.argv.includes("--keep-docs");

console.log("============================================================");
console.log("🔧 SCRIPT DỌN DẸP SESSIONS");
console.log("============================================================");
console.log("  Mode:", DRY_RUN ? "DRY-RUN (chỉ xem)" : "THỰC THI");
console.log("  Keep docs:", KEEP_DOCS ? "CÓ (chỉ drop index)" : "KHÔNG (xóa hết docs)");
console.log("  URI:", MONGO_URI.replace(/\/\/([^:]+):([^@]+)@/, "//***:***@"));
console.log("============================================================\n");

const client = new MongoClient(MONGO_URI, {
  serverSelectionTimeoutMS: 10000,
});

async function main() {
  await client.connect();
  const dbName = client.options.dbName || extractDbName(MONGO_URI);
  console.log(`✅ Đã kết nối Mongo. Database: ${dbName}\n`);

  const db = client.db(dbName);
  const sessionsColl = db.collection("sessions");

  // ────────────────────────────────────────────────────────────
  // 1. Đếm documents hiện tại
  // ────────────────────────────────────────────────────────────
  const beforeCount = await sessionsColl.countDocuments();
  console.log(`📊 Tổng số sessions hiện tại: ${beforeCount}`);

  if (beforeCount > 0) {
    const sample = await sessionsColl.find({}).limit(3).toArray();
    console.log("   Mẫu 3 doc đầu:");
    sample.forEach((d, i) => {
      console.log(`   [${i + 1}] jti=${d.jti || "?"} user_id=${d.user_id} revoked_at=${d.revoked_at || "null"}`);
    });
  }
  console.log("");

  // ────────────────────────────────────────────────────────────
  // 2. Liệt kê indexes hiện tại
  // ────────────────────────────────────────────────────────────
  let indexes = [];
  try {
    indexes = await sessionsColl.indexes();
  } catch (e) {
    console.log("⚠️  Không đọc được indexes:", e.message);
  }

  console.log(`📋 Số index hiện có: ${indexes.length}`);
  const uniqueOnUserId = indexes.filter(
    (idx) => idx.unique && idx.key && Object.prototype.hasOwnProperty.call(idx.key, "user_id")
  );

  indexes.forEach((idx) => {
    const keys = Object.keys(idx.key).join(", ");
    const isBad = uniqueOnUserId.some((u) => u.name === idx.name);
    console.log(
      `   ${isBad ? "🔴" : "🟢"} ${idx.name || "(default)"} → key={${keys}}${idx.unique ? " UNIQUE" : ""}${idx.expireAfterSeconds !== undefined ? ` TTL=${idx.expireAfterSeconds}s` : ""}`
    );
  });
  console.log("");

  // ────────────────────────────────────────────────────────────
  // 3. Xóa toàn bộ docs (nếu không --keep-docs)
  // ────────────────────────────────────────────────────────────
  if (!KEEP_DOCS) {
    if (DRY_RUN) {
      console.log(`🔍 [DRY-RUN] Sẽ xóa ${beforeCount} documents trong sessions\n`);
    } else {
      const delRes = await sessionsColl.deleteMany({});
      console.log(`🗑  Đã xóa ${delRes.deletedCount} documents trong sessions\n`);
    }
  } else {
    console.log("⏭  Bỏ qua xóa docs (--keep-docs)\n");
  }

  // ────────────────────────────────────────────────────────────
  // 4. Drop các unique index trên user_id
  // ────────────────────────────────────────────────────────────
  if (uniqueOnUserId.length === 0) {
    console.log("✅ Không có unique index nào trên user_id — OK\n");
  } else {
    console.log(`🔴 Tìm thấy ${uniqueOnUserId.length} unique index trên user_id cần drop:`);
    for (const idx of uniqueOnUserId) {
      if (DRY_RUN) {
        console.log(`   🔍 [DRY-RUN] Sẽ drop index: ${idx.name}`);
      } else {
        try {
          await sessionsColl.dropIndex(idx.name);
          console.log(`   🗑  Đã drop index: ${idx.name}`);
        } catch (e) {
          console.log(`   ❌ Không drop được ${idx.name}: ${e.message}`);
        }
      }
    }
    console.log("");
  }

  // ────────────────────────────────────────────────────────────
  // 5. Tạo lại index đúng
  // ────────────────────────────────────────────────────────────
  console.log("🔨 Tạo lại index chuẩn:");
  const desiredIndexes = [
    { key: { jti: 1 }, options: { unique: true, name: "jti_unique" } },
    { key: { user_id: 1 }, options: { name: "user_id_idx" } },
    { key: { expires_at: 1 }, options: { name: "expires_at_ttl", expireAfterSeconds: 0 } },
  ];

  for (const { key, options } of desiredIndexes) {
    if (DRY_RUN) {
      console.log(`   🔍 [DRY-RUN] Sẽ tạo: ${options.name}`);
      continue;
    }
    try {
      // Xóa index cũ nếu tồn tại (ngoài default _id)
      try {
        const exists = await sessionsColl.indexExists(options.name);
        if (exists) {
          await sessionsColl.dropIndex(options.name);
          console.log(`   ⚠️  Đã xóa index cũ: ${options.name}`);
        }
      } catch {}
      await sessionsColl.createIndex(key, options);
      console.log(`   ✅ Đã tạo: ${options.name}`);
    } catch (e) {
      // Nếu tạo fail vì đã tồn tại → OK
      if (e.code === 85 || /already exists/i.test(e.message)) {
        console.log(`   ⏭  Đã tồn tại: ${options.name}`);
      } else {
        console.log(`   ❌ Lỗi tạo ${options.name}: ${e.message}`);
      }
    }
  }
  console.log("");

  // ────────────────────────────────────────────────────────────
  // 6. Kiểm tra lại
  // ────────────────────────────────────────────────────────────
  if (!DRY_RUN) {
    const afterCount = await sessionsColl.countDocuments();
    const afterIndexes = await sessionsColl.indexes();
    console.log("============================================================");
    console.log("✅ HOÀN TẤT");
    console.log("============================================================");
    console.log(`   Sessions: ${beforeCount} → ${afterCount}`);
    console.log(`   Indexes: ${afterIndexes.length}`);
    afterIndexes.forEach((idx) => {
      const keys = Object.keys(idx.key).join(", ");
      console.log(`     - ${idx.name || "(default)"} → {${keys}}${idx.unique ? " UNIQUE" : ""}`);
    });
    console.log("============================================================");
  }
}

function extractDbName(uri) {
  try {
    const match = uri.match(/\/([^/?]+)(\?|$)/);
    return match ? match[1] : "canteen";
  } catch {
    return "canteen";
  }
}

main()
  .catch((e) => {
    console.error("❌ LỖI:", e);
    process.exit(1);
  })
  .finally(async () => {
    await client.close();
    console.log("\n👋 Đã đóng kết nối Mongo.");
  });
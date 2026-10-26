import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

async function restore() {
  const backupPath = ".backup/canteen-db_pre-backfill_2026-10-13.json";
  console.log("⏳ Đang đọc file backup gốc...");
  const data = JSON.parse(fs.readFileSync(backupPath, "utf-8"));

  console.log("🔌 Đang kết nối MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  for (const key of Object.keys(data)) {
    if (Array.isArray(data[key]) && data[key].length > 0) {
      await db.collection(key).deleteMany({});
      const docs = data[key].map(d => { const {_id, ...r} = d; return r; });
      await db.collection(key).insertMany(docs);
      console.log(`✅ Phục hồi thành công ${docs.length} bản ghi vào bảng [${key}]`);
    }
  }
  console.log("🎉 ĐÃ CỨU LẠI TOÀN BỘ DỮ LIỆU GỐC!");
  process.exit(0);
}
restore();

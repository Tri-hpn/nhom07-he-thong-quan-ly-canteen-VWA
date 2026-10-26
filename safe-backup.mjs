import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
dotenv.config();
async function backup() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  if (!fs.existsSync(".backup")) fs.mkdirSync(".backup");
  const collections = await db.listCollections().toArray();
  const backupData = {};
  for (const coll of collections) backupData[coll.name] = await db.collection(coll.name).find({}).toArray();
  const p = path.join(".backup", `safe_sync_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(p, JSON.stringify(backupData, null, 2));
  console.log(`✅ Đã backup DB an toàn tại: ${p}`);
  process.exit(0);
}
backup();

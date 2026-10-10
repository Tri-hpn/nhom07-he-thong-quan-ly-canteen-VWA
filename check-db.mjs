// check-db.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ Không có MONGO_URI trong .env");
  process.exit(1);
}

await mongoose.connect(MONGO_URI);

const coll = mongoose.connection.db.collection("canteen_db");
const doc = await coll.findOne({ _id: "main" });
const items = doc?.data?.menu_items || [];

const check = items.filter(m =>
  m.name && (
    m.name.includes("Cơm gà sốt tiêu") ||
    m.name.includes("Trà đào cam sả") ||
    m.name.includes("Đậu hũ sốt cà")
  )
);

console.log("");
console.log("=== Kiểm tra 3 món trên web ===");

if (check.length === 0) {
  console.log("");
  console.log("❌ KHÔNG tìm thấy 3 món này trong DB!");
  console.log("   Danh sách 15 món đầu tiên:");
  items.slice(0, 15).forEach(m => console.log("   -", m.name));
} else {
  check.forEach(m => {
    console.log("");
    console.log("Món:", m.name);
    console.log("  name_en:", m.name_en || "(CHƯA CÓ)");
    console.log("  name_ja:", m.name_ja || "(CHƯA CÓ)");
    console.log("  name_ko:", m.name_ko || "(CHƯA CÓ)");
    console.log("  name_zh:", m.name_zh || "(CHƯA CÓ)");
  });
}

console.log("");
console.log("=== Tổng quan ===");
console.log("Tổng món:", items.length);
const withEn = items.filter(m => m.name_en && m.name_en !== m.name).length;
const withJa = items.filter(m => m.name_ja && m.name_ja !== m.name).length;
const withKo = items.filter(m => m.name_ko && m.name_ko !== m.name).length;
const withZh = items.filter(m => m.name_zh && m.name_zh !== m.name).length;
console.log("Có name_en:", withEn, "/", items.length);
console.log("Có name_ja:", withJa, "/", items.length);
console.log("Có name_ko:", withKo, "/", items.length);
console.log("Có name_zh:", withZh, "/", items.length);

await mongoose.disconnect();
process.exit(0);
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const EXPECTED = [
  "users", "orders", "menu_items", "categories", "toppings", "settings",
  "sizes", "vouchers", "reviews", "points_config", "points_history",
  "wallets", "wallet_transactions", "messages", "notifications",
  "attendances", "shifts", "tasks", "inventory", "imports",
  "price_history", "eco_rewards", "orderReminders",
  "chat_conversations", "chat_transfer_requests",
];

const LEGACY_SHOULD_BE_GONE = [
  "canteen_db", "data", "others",
];

const BACKUP_SUFFIX = "_backup";

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const all = (await db.listCollections().toArray()).map(c => c.name);
  console.log("📊 Collections hiện tại:", all.length);
  console.log("");

  let pass = true;

  console.log("✅ Collection CHÍNH phải tồn tại:");
  for (const name of EXPECTED) {
    if (all.includes(name)) {
      const count = await db.collection(name).countDocuments();
      console.log(`   ✔ ${name.padEnd(28)} ${count} doc`);
    } else {
      console.log(`   ⚠ ${name.padEnd(28)} KHÔNG TỒN TẠI`);
      pass = false;
    }
  }
  console.log("");

  console.log("❌ Collection LEGACY phải bị xoá:");
  for (const name of LEGACY_SHOULD_BE_GONE) {
    if (all.includes(name)) {
      console.log(`   ✗ ${name} VẪN CÒN`);
      pass = false;
    } else {
      console.log(`   ✔ ${name} đã xoá`);
    }
  }
  console.log("");

  console.log("❌ Các cặp *_backup phải bị xoá:");
  const remaining = all.filter(n => n.endsWith(BACKUP_SUFFIX));
  if (remaining.length === 0) {
    console.log(`   ✔ Tất cả *_backup đã xoá`);
  } else {
    console.log(`   ✗ Còn: ${remaining.join(", ")}`);
    pass = false;
  }
  console.log("");

  // Đặc biệt: menu_items phải có data
  const menuCount = await db.collection("menu_items").countDocuments();
  if (menuCount === 0) {
    console.log("   ❌ menu_items RỖNG — migration thất bại!");
    pass = false;
  } else {
    console.log(`   ✅ menu_items có ${menuCount} món → /api/menu sẽ hiển thị`);
  }

  await mongoose.disconnect();

  console.log("");
  if (pass) console.log("🎉 TẤT CẢ PASS — DB đã gộp đúng!");
  else console.log("⚠️  CÓ LỖI — xem log phía trên");
  process.exit(pass ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
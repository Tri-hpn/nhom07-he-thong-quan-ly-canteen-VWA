import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const vCount = await db.collection("vouchers").countDocuments();
  const mCount = await db.collection("menu_items").countDocuments();
  const oCount = await db.collection("orders").countDocuments();
  console.log(`=> VOUCHERS: ${vCount}`);
  console.log(`=> MENU ITEMS: ${mCount}`);
  console.log(`=> ORDERS: ${oCount}`);
  process.exit(0);
}
check();

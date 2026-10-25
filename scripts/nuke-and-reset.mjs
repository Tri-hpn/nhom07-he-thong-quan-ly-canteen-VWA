// scripts/nuke-and-reset.mjs
// Script xóa sạch sessions + reset mật khẩu toàn bộ user về mặc định
// CẢNH BÁO: Sẽ đá văng TẤT CẢ user đang đăng nhập trên mọi thiết bị.

import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

// 🔴 NẾU .env LOCAL KHÁC VỚI VERCEL, HÃY DÁN URI VERCEL VÀO ĐÂY:
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ Thiếu MONGO_URI trong .env");
  process.exit(1);
}

const ADMIN_EMAIL = "admin@vwa.vn";
const ADMIN_PASSWORD = "123456";

async function run() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const dbName = MONGO_URI.split("/").pop().split("?")[0];
    console.log(`✅ Đã kết nối MongoDB: ${dbName}`);

    const db = client.db();
    const sessions = db.collection("sessions");
    const users = db.collection("users");

    // 1. Xóa sạch toàn bộ sessions
    const delResult = await sessions.deleteMany({});
    console.log(`🗑  Đã xóa ${delResult.deletedCount} sessions cũ.`);

    // 2. Đảm bảo index đúng (jti unique, user_id non-unique)
    try {
      const idxs = await sessions.indexes();
      for (const idx of idxs) {
        if (idx.unique && idx.key?.user_id !== undefined) {
          await sessions.dropIndex(idx.name);
          console.log(`   🔧 Đã drop unique index: ${idx.name}`);
        }
      }
      await sessions.createIndex({ jti: 1 }, { unique: true });
      await sessions.createIndex({ user_id: 1 });
      await sessions.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
    } catch (e) {
      console.log("   ⚠️  Index warning:", e.message);
    }

    // 3. Reset mật khẩu admin & đảm bảo role ADMIN
    const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    const adminDoc = await users.findOne({ email: ADMIN_EMAIL });

    if (adminDoc) {
      await users.updateOne(
        { email: ADMIN_EMAIL },
        { $set: { password: hash, role: "ADMIN", status: "Hoạt động", must_change_password: false } }
      );
      console.log(`✅ Đã reset mật khẩu admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
    } else {
      const maxIdDoc = await users.find({}).sort({ id: -1 }).limit(1).toArray();
      const newId = (maxIdDoc[0]?.id || 0) + 1;
      await users.insertOne({
        id: newId,
        name: "Quản trị viên",
        email: ADMIN_EMAIL,
        password: hash,
        role: "ADMIN",
        status: "Hoạt động",
        phone: "0900000001",
        points: 0,
        must_change_password: false,
        created_at: new Date().toISOString()
      });
      console.log(`✅ Đã TẠO MỚI admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
    }

    console.log("\n🎉 HOÀN TẤT. Giờ bạn có thể login lại.");
  } catch (e) {
    console.error("❌ LỖI:", e);
  } finally {
    await client.close();
  }
}

run();
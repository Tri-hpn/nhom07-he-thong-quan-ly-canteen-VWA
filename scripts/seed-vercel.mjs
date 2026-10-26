// scripts/seed-vercel.mjs
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

// 🔴 DÁN URI PRODUCTION CỦA VERCEL VÀO ĐÂY (thay thế cả chuỗi)
const MONGO_URI = "mongodb+srv://USER:PASS@CLUSTER.mongodb.net/DB?retryWrites=true&w=majority";

const DEMO_USERS = [
  { name: "Quản trị viên", email: "admin@vwa.vn",   role: "ADMIN",    phone: "0900000001", points: 0 },
  { name: "Trần Văn Trí",  email: "nhanvien@vwa.vn", role: "EMPLOYEE", phone: "", points: 50, chat_enabled: true },
  { name: "Trần Văn Trí",  email: "sinhvien@vwa.vn", role: "CUSTOMER", phone: "", points: 1959 },
];

async function seed() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const dbName = MONGO_URI.split("/").pop().split("?")[0];
    console.log(`✅ Đã kết nối: ${dbName}`);

    const db = client.db();
    const users = db.collection("users");
    const hash = bcrypt.hashSync("123456", 10);

    for (const u of DEMO_USERS) {
      const existing = await users.findOne({ email: u.email });
      if (existing) {
        await users.updateOne(
          { email: u.email },
          { $set: { password: hash, role: u.role, status: "Hoạt động", must_change_password: false, ...u } }
        );
        console.log(`🔄 Cập nhật: ${u.email} / 123456 (${u.role})`);
      } else {
        const maxDoc = await users.find({}).sort({ id: -1 }).limit(1).toArray();
        const newId = (maxDoc[0]?.id || 0) + 1;
        await users.insertOne({
          id: newId,
          ...u,
          password: hash,
          status: "Hoạt động",
          must_change_password: false,
          created_at: new Date().toISOString(),
        });
        console.log(`🆕 Tạo mới: ${u.email} / 123456 (${u.role})`);
      }
    }

    console.log("\n🎉 XONG! Giờ có thể login 3 tài khoản demo trên Vercel.");
  } catch (e) {
    console.error("❌ LỖI:", e.message);
  } finally {
    await client.close();
  }
}

seed();
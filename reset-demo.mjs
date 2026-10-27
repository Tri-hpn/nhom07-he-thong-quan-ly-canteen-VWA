import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

// ⚠️ QUAN TRỌNG: Sửa lại chuỗi kết nối DB thật của bạn vào đây
// (Copy y hệt chuỗi MONGO_URI bạn đang cấu hình trên Vercel)
const MONGO_URI = process.env.MONGO_URI; 

if (!MONGO_URI) {
  console.error("❌ Thiếu MONGO_URI trong file .env");
  process.exit(1);
}

const hash = bcrypt.hashSync("123456", 10);

const demoUsers = [
  { id: 1, name: "Quản trị viên", email: "admin@vwa.vn", password: hash, role: "ADMIN", status: "Hoạt động", phone: "0900000001", points: 0, created_at: new Date().toISOString() },
  { id: 2, name: "Trần Văn Trí", email: "nhanvien@vwa.vn", password: hash, role: "EMPLOYEE", status: "Hoạt động", phone: "", points: 50, chat_enabled: true, created_at: new Date().toISOString() },
  { id: 3, name: "Trần Văn Trí", email: "sinhvien@vwa.vn", password: hash, role: "CUSTOMER", status: "Hoạt động", phone: "", points: 1959, created_at: new Date().toISOString() },
];

async function reset() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db();
    const usersCollection = db.collection("users");

    console.log("🧹 Đang dọn dẹp 3 tài khoản demo cũ...");
    await usersCollection.deleteMany({ 
      email: { $in: ["admin@vwa.vn", "nhanvien@vwa.vn", "sinhvien@vwa.vn"] } 
    });

    console.log("🚀 Đang tạo lại 3 tài khoản demo...");
    await usersCollection.insertMany(demoUsers);

    console.log("✅ THÀNH CÔNG! Đã tạo lại 3 tài khoản với mật khẩu: 123456");
  } catch (err) {
    console.error("❌ Lỗi:", err.message);
  } finally {
    await client.close();
  }
}
reset();
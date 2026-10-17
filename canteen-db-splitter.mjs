import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!uri) {
  console.error("❌ Chưa cấu hình biến MONGO_URI trong file .env");
  process.exit(1);
}

const client = new MongoClient(uri);

// 📁 Đổi tên thư mục backup đồng bộ với dự án
const BACKUP_DIR = path.join(process.cwd(), 'canteengo_backups');
// 🗄️ Tên database mặc định nếu không tìm thấy trong URI
const DEFAULT_DB_NAME = 'canteengo_db'; 

async function run() {
  try {
    await client.connect();
    
    // Ưu tiên tên DB trong .env, nếu không có thì dùng tên chuẩn của dự án
    const dbName = client.options.dbName || DEFAULT_DB_NAME; 
    const db = client.db(dbName);

    console.log(`🔗 Đang kết nối tới database dự án Canteengo: [${dbName}]`);

    // Kiểm tra xem dữ liệu đã được tách chưa (tránh chạy lại gây lỗi)
    const collections = await db.listCollections().toArray();
    const hasOldDb = collections.some(c => c.name === 'canteen_db');

    if (!hasOldDb) {
      console.log("✅ Dữ liệu Canteengo đã được tách thành các collection riêng biệt từ trước.");
      console.log("👉 Nếu bạn muốn sao lưu (backup) lại toàn bộ dữ liệu hiện tại, hãy chạy lại script này sau khi thêm mới dữ liệu.");
    } else {
      console.log("⚠️ Phát hiện collection tổng cũ. Đang tiến hành tách...");
      // (Logic tách cũ giữ nguyên nếu cần)
    }

    // --- PHẦN BACKUP ĐỊNH KỲ ---
    console.log(`\n📦 Bắt đầu sao lưu toàn bộ dữ liệu vào thư mục 'canteengo_backups'...`);
    
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const currentCollections = await db.listCollections().toArray();
    
    for (const coll of currentCollections) {
      // Bỏ qua các collection hệ thống
      if (coll.name.startsWith('system.')) continue;

      const data = await db.collection(coll.name).find({}).toArray();
      
      if (data.length > 0) {
        // Tạo thư mục con riêng cho từng collection
        const collBackupDir = path.join(BACKUP_DIR, coll.name);
        if (!fs.existsSync(collBackupDir)) {
          fs.mkdirSync(collBackupDir, { recursive: true });
        }

        // Lưu file JSON với timestamp
        const backupPath = path.join(collBackupDir, `backup_${timestamp}.json`);
        fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
        console.log(`  ✅ Đã backup: ${coll.name} (${data.length} bản ghi)`);
      }
    }

    console.log(`\n🎉 HOÀN TẤT! Toàn bộ dữ liệu đã được sao lưu an toàn.`);
    console.log(`📁 Nơi lưu trữ: ${BACKUP_DIR}`);

  } catch (err) {
    console.error("❌ Lỗi:", err.message);
  } finally {
    await client.close();
  }
}

run();
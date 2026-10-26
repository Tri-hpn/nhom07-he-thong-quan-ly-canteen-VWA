const fs = require('fs');
const path = 'server-json.js';
let content = fs.readFileSync(path, 'utf8');

// Tìm chính xác đoạn code xóa DB nguy hiểm
const regex = /if\s*\(keys\.length\s*>\s*0\)\s*\{\s*await\s*coll\.deleteMany\(\{\s*\[uniqueField\]:\s*\{\s*\$nin:\s*keys\s*\}\s*\}\);\s*\}\s*else\s*\{\s*await\s*coll\.deleteMany\(\{\}\);\s*\}/g;

// Đoạn code an toàn thay thế
const newBlock = `if (keys.length > 0) {
          await coll.deleteMany({ [uniqueField]: { $nin: keys } });
        } else {
          const PROTECTED_COLLECTIONS = new Set(["users", "orders", "vouchers", "wallets", "menu_items", "points_history", "points_config", "settings", "reviews", "attendances"]);
          if (PROTECTED_COLLECTIONS.has(key)) {
            console.warn(\`[SAFETY] TỪ CHỐI XOÁ SẠCH bảng \${key} vì mảng dữ liệu tải lên bị rỗng!\`);
          } else {
            await coll.deleteMany({});
          }
        }`;

if (regex.test(content)) {
    content = content.replace(regex, newBlock);
    fs.writeFileSync(path, content, 'utf8');
    console.log('✅ ĐÃ CHÈN ÁO GIÁP THÀNH CÔNG!');
} else {
    console.log('❌ LỖI: Không tìm thấy đoạn code gốc để thay thế. Hãy báo lại cho tôi.');
}

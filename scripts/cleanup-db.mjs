#!/usr/bin/env node
// ============================================================
// CLEANUP-DB.MJS — Auto-clean canteen-db.json
// ============================================================
// Fix các bug data:
//   - #3  : Encoding hỏng "Ch? x�c nh?n" → "Chờ xác nhận"
//   - #16 : Orphan user_id (notifications, shifts, attendances, ...)
//   - #17 : attendances[].employee_name không khớp employee_id
//   - #21 : vouchers[] skip id (re-sequence)
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const DB_FILE = path.join(ROOT_DIR, "canteen-db.json");

// ✅ FIX (LỖI #11): backup ngay cạnh DB — KHÔNG dùng path.join("..", __dirname, ...)
// trước đây tạo path lai `../full/path/file` gây ghi sai chỗ.
const BACKUP_FILE = path.join(
  ROOT_DIR,
  `canteen-db.backup-${Date.now()}.json`
);

// ---------- Load ----------
if (!fs.existsSync(DB_FILE)) {
  console.error("❌ Không tìm thấy canteen-db.json tại:", DB_FILE);
  process.exit(1);
}

const raw = fs.readFileSync(DB_FILE, "utf-8");

// Backup trước khi sửa
fs.writeFileSync(BACKUP_FILE, raw, "utf-8");
console.log(`💾 Backup: ${path.basename(BACKUP_FILE)}`);

const db = JSON.parse(raw);

// ---------- Helper ----------
const VALID_STATUSES = [
  "Chờ xác nhận",
  "Đã xác nhận",
  "Đang chuẩn bị",
  "Sẵn sàng nhận",
  "Hoàn thành",
  "Đã hủy",
];

const report = {
  encodingFixed: 0,
  orphanUsers: [],
  orphanRefsRemoved: 0,
  nameFixed: 0,
  voucherReseq: 0,
};

// ============================================================
// #3: Fix encoding order status
// ============================================================
console.log("\n🔧 Fix #3: Encoding order status...");

(db.orders || []).forEach((o) => {
  if (o.status && !VALID_STATUSES.includes(o.status)) {
    const original = o.status;
    // Đoán trạng thái gần nhất dựa vào ký tự còn lại
    const norm = original
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    if (norm.includes("x") && norm.includes("nh")) o.status = "Chờ xác nhận";
    else if (norm.includes("h") && norm.includes("y")) o.status = "Đã hủy";
    else if (norm.includes("hoan")) o.status = "Hoàn thành";
    else if (norm.includes("xac") && norm.includes("nhan"))
      o.status = "Đã xác nhận";
    else if (norm.includes("chuan")) o.status = "Đang chuẩn bị";
    else if (norm.includes("san")) o.status = "Sẵn sàng nhận";

    if (o.status !== original) {
      report.encodingFixed++;
      console.log(
        `   ✅ Order #${o.id} (${o.code}): "${original}" → "${o.status}"`
      );
    } else {
      console.log(
        `   ⚠️  Order #${o.id} (${o.code}): "${original}" — không match → giữ nguyên`
      );
    }
  }
});

// ============================================================
// #16: Orphan user_id
// ============================================================
console.log("\n🔧 Fix #16: Orphan user_id...");

const validUserIds = new Set((db.users || []).map((u) => Number(u.id)));

// Tìm orphan refs (để báo cáo, KHÔNG xóa — giữ lịch sử)
const COLLECTIONS_WITH_USER_REF = [
  { name: "notifications", field: "user_id" },
  { name: "messages", field: "user_id" },
  { name: "attendances", field: "employee_id" },
  { name: "shifts", field: "employee_id" },
  { name: "wallets", field: "user_id" },
  { name: "wallet_transactions", field: "user_id" },
  { name: "vouchers", field: "user_id" },
  { name: "reviews", field: "user_id" },
];

COLLECTIONS_WITH_USER_REF.forEach(({ name, field }) => {
  (db[name] || []).forEach((item) => {
    const refId = item[field];
    if (refId === null || refId === undefined) return;
    if (!validUserIds.has(Number(refId))) {
      const key = `${name}#${item.id || item.code}(${field}=${refId})`;
      if (!report.orphanUsers.includes(key)) {
        report.orphanUsers.push(key);
      }
    }
  });
});

if (report.orphanUsers.length === 0) {
  console.log("   ✅ Không có orphan user_id");
} else {
  console.log(
    `   ⚠️  ${report.orphanUsers.length} orphan refs (GIỮ NGUYÊN — đây là lịch sử):`
  );
  report.orphanUsers.slice(0, 10).forEach((k) => console.log(`      • ${k}`));
  if (report.orphanUsers.length > 10) {
    console.log(
      `      ... và ${report.orphanUsers.length - 10} refs khác`
    );
  }
  console.log(
    "   💡 Khuyến nghị: thêm user id 4, 5 vào DB hoặc xóa thủ công"
  );
}

// ============================================================
// #17: attendances employee_name không khớp employee_id
// ============================================================
console.log("\n🔧 Fix #17: Attendance employee_name...");

const userMap = new Map(
  (db.users || []).map((u) => [Number(u.id), u.name])
);

(db.attendances || []).forEach((a) => {
  const correctName = userMap.get(Number(a.employee_id));
  if (correctName && a.employee_name !== correctName) {
    const original = a.employee_name;
    a.employee_name = correctName;
    report.nameFixed++;
    console.log(
      `   ✅ Attendance #${a.id}: "${original}" → "${correctName}"`
    );
  }
});

if (report.nameFixed === 0) {
  console.log("   ✅ Tất cả attendance name đã đúng");
}

// ============================================================
// #17 (extra): shifts employee_name cũng cần check
// ============================================================
(db.shifts || []).forEach((s) => {
  const correctName = userMap.get(Number(s.employee_id));
  if (correctName && s.employee_name && s.employee_name !== correctName) {
    s.employee_name = correctName;
    report.nameFixed++;
  }
});

// ============================================================
// #21: Vouchers skip id — chỉ báo cáo, KHÔNG re-sequence
// ============================================================
console.log("\n🔧 Fix #21: Vouchers id sequence...");

const voucherIds = (db.vouchers || [])
  .map((v) => Number(v.id))
  .filter((n) => !isNaN(n))
  .sort((a, b) => a - b);

const maxId = voucherIds[voucherIds.length - 1] || 0;
const gaps = [];
for (let i = 1; i <= maxId; i++) {
  if (!voucherIds.includes(i)) gaps.push(i);
}

if (gaps.length === 0) {
  console.log("   ✅ Không có gap trong voucher id");
} else {
  console.log(`   ⚠️  ${gaps.length} gap: [${gaps.join(", ")}]`);
  console.log(
    "   💡 KHÔNG re-sequence vì có thể làm hỏng FK (claimed_from, order_code)"
  );
  console.log("   💡 Gap là bình thường — voucher có thể bị xóa");
}

// ============================================================
// SAVE
// ============================================================
console.log("\n💾 Ghi file...");
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");

console.log("\n" + "═".repeat(60));
console.log("✨ CLEANUP HOÀN TẤT");
console.log("═".repeat(60));
console.log(`   Encoding status fixed : ${report.encodingFixed}`);
console.log(`   Attendance name fixed : ${report.nameFixed}`);
console.log(`   Orphan refs detected  : ${report.orphanUsers.length}`);
console.log(`   Voucher gaps          : ${gaps.length}`);
console.log(`\n💾 Backup lưu tại: ${path.basename(BACKUP_FILE)}`);
console.log("\n📝 Restart server để load DB mới:");
console.log("   npm run server");
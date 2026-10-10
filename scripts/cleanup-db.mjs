#!/usr/bin/env node
// ============================================================
// CLEANUP-DB.MJS — Auto-clean canteen-db.json (V2 - FINAL)
// ============================================================
// V2 (2026-10):
//   - ✅ FIX #13: Mapping status rõ ràng hơn (thay vì heuristic)
//     + cảnh báo warning khi không match được
//   - Giữ V1: encoding, orphan user_id, employee_name, voucher id
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const DB_FILE = path.join(ROOT_DIR, "canteen-db.json");

const BACKUP_FILE = path.join(
  ROOT_DIR,
  `canteen-db.backup-${Date.now()}.json`
);

if (!fs.existsSync(DB_FILE)) {
  console.error("❌ Không tìm thấy canteen-db.json tại:", DB_FILE);
  process.exit(1);
}

const raw = fs.readFileSync(DB_FILE, "utf-8");
fs.writeFileSync(BACKUP_FILE, raw, "utf-8");
console.log(`💾 Backup: ${path.basename(BACKUP_FILE)}`);

const db = JSON.parse(raw);

// ============================================================
// HELPERS
// ============================================================
const VALID_STATUSES = [
  "Chờ xác nhận",
  "Đã xác nhận",
  "Đang chuẩn bị",
  "Sẵn sàng nhận",
  "Hoàn thành",
  "Đã hủy",
];

// ✅ FIX #13: Mapping rõ ràng — key là chuỗi normalized,
// value là status chuẩn. Không đoán mò.
const STATUS_REPAIR_MAP = {
  // "cho xac nhan" và các biến thể
  "cho xac nhan": "Chờ xác nhận",
  "choxacnhan": "Chờ xác nhận",
  "cho xac nh?n": "Chờ xác nhận",
  "ch? xac nh?n": "Chờ xác nhận",
  "cho xc nhan": "Chờ xác nhận",
  "ch? x�c nh?n": "Chờ xác nhận",

  // "da xac nhan"
  "da xac nhan": "Đã xác nhận",
  "daxacnhan": "Đã xác nhận",
  "da xac nh?n": "Đã xác nhận",
  "d� x�c nh?n": "Đã xác nhận",

  // "dang chuan bi"
  "dang chuan bi": "Đang chuẩn bị",
  "dangchuanbi": "Đang chuẩn bị",
  "dang chu?n b?": "Đang chuẩn bị",
  "dang chu?n bi": "Đang chuẩn bị",

  // "san sang nhan"
  "san sang nhan": "Sẵn sàng nhận",
  "sansangnhan": "Sẵn sàng nhận",
  "s?n s�ng nh?n": "Sẵn sàng nhận",

  // "hoan thanh"
  "hoan thanh": "Hoàn thành",
  "hoanthanh": "Hoàn thành",
  "ho�n th�nh": "Hoàn thành",

  // "da huy"
  "da huy": "Đã hủy",
  "dahuy": "Đã hủy",
  "d� h?y": "Đã hủy",
  "da hu?": "Đã hủy",
};

// ✅ FIX #13: normalize giữ nguyên dấu tiếng Việt, chỉ lower + trim
function normalizeStatus(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const report = {
  encodingFixed: 0,
  encodingUnmatched: 0,
  orphanUsers: [],
  nameFixed: 0,
};

// ============================================================
// #3: Fix encoding order status
// ============================================================
console.log("\n🔧 Fix #3: Encoding order status...");

(db.orders || []).forEach((o) => {
  if (o.status && !VALID_STATUSES.includes(o.status)) {
    const original = o.status;
    const norm = normalizeStatus(original);

    // ✅ FIX #13: thử map trực tiếp
    let fixed = STATUS_REPAIR_MAP[norm];

    // ✅ FIX #13: nếu không match, thử normalize NFD để bỏ dấu
    if (!fixed) {
      const nfd = norm
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d");
      fixed = STATUS_REPAIR_MAP[nfd];
    }

    if (fixed) {
      o.status = fixed;
      report.encodingFixed++;
      console.log(
        `   ✅ Order #${o.id} (${o.code}): "${original}" → "${fixed}"`
      );
    } else {
      report.encodingUnmatched++;
      console.log(
        `   ⚠️  Order #${o.id} (${o.code}): "${original}" — KHÔNG match mapping, giữ nguyên`
      );
    }
  }
});

// ============================================================
// #16: Orphan user_id
// ============================================================
console.log("\n🔧 Fix #16: Orphan user_id...");

const validUserIds = new Set((db.users || []).map((u) => Number(u.id)));

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
    console.log(`      ... và ${report.orphanUsers.length - 10} refs khác`);
  }
  console.log("   💡 Khuyến nghị: thêm user id 4, 5 vào DB hoặc xóa thủ công");
}

// ============================================================
// #17: attendances employee_name
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

(db.shifts || []).forEach((s) => {
  const correctName = userMap.get(Number(s.employee_id));
  if (correctName && s.employee_name && s.employee_name !== correctName) {
    s.employee_name = correctName;
    report.nameFixed++;
  }
});

// ============================================================
// #21: Vouchers skip id
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
  console.log("   💡 KHÔNG re-sequence vì có thể làm hỏng FK (claimed_from, order_code)");
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
console.log(`   Encoding UNMATCHED    : ${report.encodingUnmatched}`);
console.log(`   Attendance name fixed : ${report.nameFixed}`);
console.log(`   Orphan refs detected  : ${report.orphanUsers.length}`);
console.log(`   Voucher gaps          : ${gaps.length}`);
console.log(`\n💾 Backup lưu tại: ${path.basename(BACKUP_FILE)}`);
console.log("\n📝 Restart server để load DB mới:");
console.log("   npm run server");
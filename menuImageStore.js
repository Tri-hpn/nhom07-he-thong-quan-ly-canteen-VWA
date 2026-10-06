// ============================================================
// MENUIMAGESTORE.JS — Tách ảnh món ăn ra khỏi document chính
// ============================================================
// VÌ SAO CẦN FILE NÀY?
// Trước đây ảnh món ăn được lưu THẲNG vào document chính:
//   canteen_db.main.data.menu_items[].image = "data:image/jpeg;base64,..."
// Đo thực tế: 36 ảnh ≈ 15.33 MB, tổng document ≈ 15.47 MB.
// Hệ quả:
//   • Mỗi lần khởi động server phải tải 15.5 MB từ Atlas. Đường
//     truyền tới Atlas chỉ ~90 KB/s → hàng phút, thường là treo hẳn
//     ở "Đang tải DB từ MongoDB..." (đúng lỗi localhost:3000 không lên).
//   • Mỗi lần lưu DB (đặt món, đổi giá, điểm danh...) phải upload
//     lại toàn bộ 15.5 MB.
//
// SAU KHI SỬA:
//   • Mỗi ảnh là 1 document riêng trong collection `menu_images`.
//   • Document chính chỉ giữ đường dẫn ngắn:
//         /api/uploads/menu/<id>?v=<rev>
//     → cả DB còn ≈ 200 KB: khởi động và lưu trong vài giây.
//   • Ảnh được phục vụ lazy qua GET /api/uploads/menu/:id
//     (có cache RAM + cache trình duyệt theo ?v=<rev>).
//
// Việc di trú chạy HOÀN TOÀN trên server bằng aggregation + $merge
// nên KHÔNG phải tải 15 MB ảnh về máy bao giờ.
// ============================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

export const MAIN_COLLECTION = "canteen_db";
export const MAIN_DOC_ID = "main";
export const MENU_IMAGES_COLLECTION = "menu_images";
export const MENU_IMAGE_PREFIX = "/api/uploads/menu/";
export const IMAGE_BACKUP_COLLECTION = "canteen_db_backup_main";

// ============================================================
// HELPERS
// ============================================================

/** Ảnh base64 nhúng thẳng (data URL)? */
export function isInlineImage(value) {
  return typeof value === "string" && value.startsWith("data:image");
}

/** Đường dẫn ảnh do server quản lý? (vd "/api/uploads/menu/12?v=1") */
export function isMenuImagePath(value) {
  return typeof value === "string" && value.startsWith(MENU_IMAGE_PREFIX);
}

/**
 * URL ảnh của 1 món. `rev` đổi mỗi lần ảnh được cập nhật nên có thể
 * cache vĩnh viễn ở trình duyệt mà vẫn luôn thấy ảnh mới.
 */
export function menuImageUrl(id, rev = 1) {
  return MENU_IMAGE_PREFIX + encodeURIComponent(String(id)) + "?v=" + rev;
}

/**
 * Phân loại giá trị ảnh do client gửi lên.
 * @returns {{kind:"empty"|"inline"|"path"|"external", value?:string}}
 *  - ""                                  → empty     (xoá ảnh)
 *  - "data:image/..."                    → inline    (ảnh mới upload)
 *  - "/api/uploads/menu/12?v=1"          → path      (đường dẫn của mình)
 *  - "http://host/api/uploads/menu/12"   → path      (URL tuyệt đối của mình, FE gửi lại)
 *  - "https://khac.com/a.jpg"            → external  (URL ngoài)
 */
export function classifyImageValue(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { kind: "empty" };
  if (isInlineImage(raw)) return { kind: "inline", value: raw };
  if (isMenuImagePath(raw)) return { kind: "path", value: raw };
  if (/^https?:\/\//i.test(raw)) {
    const i = raw.indexOf(MENU_IMAGE_PREFIX);
    if (i > 0) return { kind: "path", value: raw.slice(i) };
  }
  return { kind: "external", value: raw };
}

/** Tách data URL → { contentType, buffer } (null nếu không hợp lệ) */
export function decodeDataUrl(dataUrl) {
  const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(String(dataUrl || ""));
  if (!m) return null;
  try {
    const buffer = m[2]
      ? Buffer.from(m[3], "base64")
      : Buffer.from(decodeURIComponent(m[3]), "binary");
    if (!buffer.length) return null;
    return { contentType: m[1] || "image/jpeg", buffer };
  } catch {
    return null;
  }
}

/** Có ảnh base64 nào trong danh sách món không? */
export function countInlineMenuImages(data) {
  return (data?.menu_items || []).reduce(
    (n, m) => n + (isInlineImage(m?.image) ? 1 : 0),
    0
  );
}

// ============================================================
// MODEL — collection menu_images (1 document = 1 ảnh)
// ============================================================
const menuImageSchema = new mongoose.Schema(
  {
    _id: { type: String }, // String(id) của món ăn
    image: { type: String, default: "" }, // data URL base64
    contentType: { type: String, default: "" }, // image/jpeg, image/png...
    rev: { type: Number, default: 1 }, // đổi mỗi lần cập nhật ảnh
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: MENU_IMAGES_COLLECTION, versionKey: false, minimize: false }
);

export const MenuImageModel =
  mongoose.models.MenuImage || mongoose.model("MenuImage", menuImageSchema);

// ============================================================
// CACHE RAM — ảnh giải mã sẵn (tránh đọc lại Atlas liên tục)
// ============================================================
const IMAGE_CACHE_LIMIT_BYTES = 64 * 1024 * 1024; // 64 MB
const imageCache = new Map(); // id → { buffer, contentType, rev, bytes }
let imageCacheBytes = 0;

export function clearMenuImageCache() {
  imageCache.clear();
  imageCacheBytes = 0;
}

export function menuImageCacheStats() {
  return { entries: imageCache.size, bytes: imageCacheBytes };
}

function cacheGet(key) {
  const hit = imageCache.get(key);
  if (!hit) return null;
  imageCache.delete(key); // LRU: vừa dùng → đẩy xuống cuối
  imageCache.set(key, hit);
  return hit;
}

function cacheSet(key, entry) {
  const old = imageCache.get(key);
  if (old) {
    imageCache.delete(key);
    imageCacheBytes -= old.bytes;
  }
  imageCache.set(key, entry);
  imageCacheBytes += entry.bytes;

  while (imageCacheBytes > IMAGE_CACHE_LIMIT_BYTES && imageCache.size > 1) {
    const oldestKey = imageCache.keys().next().value;
    const oldest = imageCache.get(oldestKey);
    imageCache.delete(oldestKey);
    imageCacheBytes -= oldest?.bytes || 0;
  }
}

// ============================================================
// ĐỌC / GHI / XOÁ ẢNH
// ============================================================

/**
 * Lấy ảnh của 1 món.
 * @returns {Promise<{buffer:Buffer,contentType:string,rev:number}|{redirectTo:string}|null>}
 */
export async function getMenuImage(id) {
  const key = String(id ?? "");
  if (!key) return null;

  const cached = cacheGet(key);
  if (cached) return cached;

  if (!mongoose.connection?.db) return null;

  const doc = await MenuImageModel.findById(key).lean();
  if (!doc) return null;

  // Ảnh ngoài (http/https) → để trình duyệt tự tải, không proxy qua server
  if (!isInlineImage(doc.image)) {
    const url = typeof doc.image === "string" ? doc.image.trim() : "";
    return url ? { redirectTo: url } : null;
  }

  const decoded = decodeDataUrl(doc.image);
  if (!decoded) return null;

  const entry = {
    buffer: decoded.buffer,
    contentType: doc.contentType || decoded.contentType,
    rev: doc.rev || 1,
    bytes: decoded.buffer.length,
  };
  cacheSet(key, entry);
  return entry;
}

/**
 * Lưu ảnh mới cho 1 món.
 * @returns {Promise<string|null>} đường dẫn ảnh hoặc null nếu data URL lỗi
 */
export async function putMenuImage(id, dataUrl) {
  const key = String(id ?? "");
  const decoded = decodeDataUrl(dataUrl);
  if (!key || !decoded) return null;

  const rev = Date.now();
  await MenuImageModel.updateOne(
    { _id: key },
    {
      $set: {
        image: dataUrl,
        contentType: decoded.contentType,
        rev,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  cacheSet(key, {
    buffer: decoded.buffer,
    contentType: decoded.contentType,
    rev,
    bytes: decoded.buffer.length,
  });

  return menuImageUrl(key, rev);
}

/** Xoá ảnh của 1 món (không ném lỗi). */
export async function deleteMenuImage(id) {
  const key = String(id ?? "");
  if (!key) return;
  imageCache.delete(key);
  try {
    await MenuImageModel.deleteOne({ _id: key });
  } catch (e) {
    console.error("Không xoá được ảnh món " + key + ":", e.message);
  }
}

/**
 * Áp giá trị ảnh client gửi lên vào 1 món (sửa trực tiếp field `image`).
 * @param {object} item món ăn
 * @param {*} incomingImage giá trị `image` trong body request
 * @param {{persist?:boolean}} options persist=false → chế độ file JSON local:
 *        giữ nguyên base64 như hành vi cũ (file local không tốn băng thông).
 * @returns {Promise<string>} giá trị `image` sau khi xử lý
 */
export async function applyMenuImageToItem(item, incomingImage, { persist = true } = {}) {
  if (!item) return "";
  const c = classifyImageValue(incomingImage);

  if (c.kind === "inline") {
    if (!persist) {
      item.image = c.value;
      return item.image;
    }
    const url = await putMenuImage(item.id, c.value);
    item.image = url || "";
    return item.image;
  }

  if (c.kind === "path" || c.kind === "external") {
    item.image = c.value;
    return item.image;
  }

  item.image = ""; // xoá ảnh
  if (persist) await deleteMenuImage(item.id);
  return "";
}

/**
 * Tách ảnh base64 ĐANG NẰM TRONG BỘ NHỚ sang collection menu_images.
 * Dùng cho /api/backup/import (dữ liệu đã nằm trong RAM).
 * @returns {Promise<number>} số ảnh đã tách
 */
export async function extractInlineImagesFromData(data, { log = () => {} } = {}) {
  const items = Array.isArray(data?.menu_items) ? data.menu_items : [];
  let moved = 0;
  for (const item of items) {
    if (!isInlineImage(item?.image)) continue;
    const url = await putMenuImage(item.id, item.image);
    if (url) {
      item.image = url;
      moved++;
    }
  }
  if (moved) log(`🖼️ Đã tách ${moved} ảnh base64 sang ${MENU_IMAGES_COLLECTION}`);
  return moved;
}

// ============================================================
// DI TRÚ — đưa ảnh base64 từ document chính sang menu_images
// ============================================================
// Chạy HOÀN TOÀN trên server bằng aggregation + $merge, KHÔNG tải
// document 15 MB về máy. Idempotent: chạy lại khi đã sạch = no-op.
// ============================================================

// Đếm số ảnh base64 + kích thước document (chạy trên server)
const INLINE_STATS_PIPELINE = [
  { $match: { _id: MAIN_DOC_ID } },
  {
    $project: {
      n: {
        $size: {
          $filter: {
            input: { $ifNull: ["$data.menu_items", []] },
            as: "m",
            cond: { $eq: [{ $substrCP: [{ $ifNull: ["$$m.image", ""] }, 0, 5] }, "data:"] },
          },
        },
      },
      size: { $bsonSize: "$$ROOT" },
    },
  },
];

async function readInlineStats(coll) {
  const row = (await coll.aggregate(INLINE_STATS_PIPELINE).toArray())[0] || {};
  return { inline: row.n || 0, bytes: row.size || 0 };
}

/**
 * Tách mọi ảnh base64 trong canteen_db.main.data.menu_items[].image
 * sang collection menu_images và thay bằng đường dẫn /api/uploads/menu/<id>?v=1
 *
 * @param {{log?:Function, backup?:boolean}} options
 * @returns {Promise<{ok:boolean, needed:boolean, inline:number, stored:number,
 *   moved:number, beforeBytes:number, afterBytes:number, remaining?:number,
 *   backupCollection?:string, error?:string}>}
 */
export async function migrateInlineMenuImages({ log = () => {}, backup = true } = {}) {
  const db = mongoose.connection?.db;
  if (!db) throw new Error("Chưa kết nối MongoDB");

  const coll = db.collection(MAIN_COLLECTION);
  const { inline, bytes: beforeBytes } = await readInlineStats(coll);

  if (!inline) {
    return { ok: true, needed: false, inline: 0, stored: 0, moved: 0, beforeBytes, afterBytes: beforeBytes };
  }

  const mb = (b) => (b / 1048576).toFixed(2) + " MB";
  log(`🖼️ Phát hiện ${inline} ảnh base64 trong document chính (${mb(beforeBytes)})`);

  // (0) Sao lưu document gốc — server-side, không tải dữ liệu về máy
  let backupCollection = "";
  if (backup) {
    try {
      await coll.aggregate([
        { $match: { _id: MAIN_DOC_ID } },
        { $addFields: { backup_of: MAIN_DOC_ID, backed_up_at: "$$NOW" } },
        {
          $merge: {
            into: IMAGE_BACKUP_COLLECTION,
            on: "_id",
            whenMatched: "replace",
            whenNotMatched: "insert",
          },
        },
      ]).toArray();
      backupCollection = IMAGE_BACKUP_COLLECTION;
      log(`💾 Đã sao lưu document gốc → ${IMAGE_BACKUP_COLLECTION} (server-side)`);
    } catch (e) {
      log(`⚠️ Không sao lưu được (${e.message}) — vẫn tiếp tục vì ảnh được copy trước khi sửa`);
    }
  }

  // (1) Copy ảnh sang menu_images (chạy trên server)
  await coll.aggregate([
    { $match: { _id: MAIN_DOC_ID } },
    { $project: { items: { $ifNull: ["$data.menu_items", []] } } },
    { $unwind: "$items" },
    { $match: { "items.image": { $regex: "^data:" } } },
    {
      $project: {
        _id: { $toString: "$items.id" },
        image: "$items.image",
        rev: { $literal: 1 },
        updatedAt: "$$NOW",
      },
    },
    {
      $merge: {
        into: MENU_IMAGES_COLLECTION,
        on: "_id",
        whenMatched: "replace",
        whenNotMatched: "insert",
      },
    },
  ]).toArray();

    // (2) Kiểm tra đã copy đủ chưa — thiếu thì DỪNG để không mất ảnh
  // ✅ FIX (LỖI #20): countDocuments({}) đếm TOÀN BỘ collection, kể cả ảnh cũ
  // → nếu collection đã có sẵn ảnh từ trước thì `stored` > `inline` → pass check
  // dù copy mới thất bại. Sửa: so khớp chính xác _id các món cần copy.
  const expectedIds = await coll
    .aggregate([
      { $match: { _id: MAIN_DOC_ID } },
      { $project: { items: { $ifNull: ["$data.menu_items", []] } } },
      { $unwind: "$items" },
      { $match: { "items.image": { $regex: "^data:" } } },
      { $project: { _id: { $toString: "$items.id" } } },
    ])
    .toArray();

  const expectedIdSet = new Set(expectedIds.map((r) => r._id));

  if (expectedIdSet.size > 0) {
    const storedDocs = await db
      .collection(MENU_IMAGES_COLLECTION)
      .find({ _id: { $in: [...expectedIdSet] } })
      .project({ _id: 1 })
      .toArray();

    const storedIdSet = new Set(storedDocs.map((d) => d._id));
    const missingIds = [...expectedIdSet].filter(
      (id) => !storedIdSet.has(id)
    );

    if (missingIds.length > 0) {
      const error = `Chỉ copy được ${storedIdSet.size}/${expectedIdSet.size} ảnh (thiếu ${missingIds.length}) → dừng để tránh mất ảnh`;
      log("❌ " + error);
      return {
        ok: false,
        needed: true,
        inline,
        stored: storedIdSet.size,
        moved: 0,
        beforeBytes,
        error,
      };
    }

    log(
      `📦 Đã copy ${storedIdSet.size} ảnh sang ${MENU_IMAGES_COLLECTION}`
    );
  }

  // (3) Thay ảnh base64 bằng đường dẫn (server-side, không tải dữ liệu về máy)
  await coll.aggregate([
    { $match: { _id: MAIN_DOC_ID } },
    {
      $set: {
        "data.menu_items": {
          $map: {
            input: { $ifNull: ["$data.menu_items", []] },
            as: "m",
            in: {
              $cond: [
                { $eq: [{ $substrCP: [{ $ifNull: ["$$m.image", ""] }, 0, 5] }, "data:"] },
                {
                  $mergeObjects: [
                    "$$m",
                    { image: { $concat: [MENU_IMAGE_PREFIX, { $toString: "$$m.id" }, "?v=1"] } },
                  ],
                },
                "$$m",
              ],
            },
          },
        },
      },
    },
    {
      $merge: {
        into: MAIN_COLLECTION,
        on: "_id",
        whenMatched: "merge",
        whenNotMatched: "fail",
      },
    },
  ]).toArray();

  // (4) Xác nhận kết quả
  const after = await readInlineStats(coll);
  const ok = after.inline === 0;
  log(
    (ok ? "✅" : "❌") +
      ` Document chính: ${mb(beforeBytes)} → ${mb(after.bytes)}` +
      (ok ? "" : ` (còn ${after.inline} ảnh base64)`)
  );

  return {
    ok,
    needed: true,
    inline,
    stored,
    moved: inline - after.inline,
    beforeBytes,
    afterBytes: after.bytes,
    remaining: after.inline,
    backupCollection,
  };
}

// ============================================================
// CLI — npm run db:migrate-images
// ============================================================
const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const noBackup = process.argv.includes("--no-backup");
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error("❌ Thiếu MONGO_URI trong .env");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log("✅ Đã kết nối MongoDB:", mongoose.connection.db.databaseName);

    const r = await migrateInlineMenuImages({
      log: (m) => console.log(m),
      backup: !noBackup,
    });

    console.log("─".repeat(52));
    if (!r.needed) {
      console.log("✨ Không cần di trú — document chính đã sạch ảnh base64");
    } else if (r.ok) {
      console.log("🎉 Hoàn tất! Ảnh đã nằm riêng trong " + MENU_IMAGES_COLLECTION);
    } else {
      console.log("⚠️ Chưa hoàn tất: " + (r.error || "còn ảnh base64 trong document chính"));
    }
    console.log(`   document chính: ${(r.beforeBytes / 1048576).toFixed(2)} MB → ${(r.afterBytes / 1048576).toFixed(2)} MB`);
    if (r.backupCollection) {
      console.log(`   bản sao lưu: ${r.backupCollection} (xoá bằng db.${r.backupCollection}.drop() khi không cần)`);
    }

    await mongoose.disconnect();
    process.exit(r.ok ? 0 : 1);
  } catch (e) {
    console.error("❌ Lỗi:", e.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

// ============================================================
// MENUIMAGESTORE.JS — Tách ảnh món ăn khỏi document chính
// V4 (2026-10):
//   ✅ Tích hợp Cloudinary cho ảnh MỚI (thay base64 inline)
//   ✅ Fallback menu_images collection nếu Cloudinary chưa config
//   ✅ Xoá ảnh Cloudinary cũ khi update ảnh
//   ✅ Giữ nguyên các hàm migrate/CLI cũ (backward-compat)
// ============================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import dotenv from "dotenv";
import {
  uploadBase64Image,
  isCloudinaryEnabled,
  isCloudinaryUrl,
  deleteCloudinaryImage,
} from "./services/cloudinaryUpload.js";

dotenv.config();

export const MAIN_COLLECTION = "canteen_db";
export const MAIN_DOC_ID = "main";
export const MENU_IMAGES_COLLECTION = "menu_images";
export const MENU_IMAGE_PREFIX = "/api/uploads/menu/";
export const IMAGE_BACKUP_COLLECTION = "canteen_db_backup_main";

// ---------- Helpers ----------
export function isInlineImage(value) {
  return typeof value === "string" && value.startsWith("data:image");
}

export function isMenuImagePath(value) {
  return typeof value === "string" && value.startsWith(MENU_IMAGE_PREFIX);
}

export function menuImageUrl(id, rev = 1) {
  return MENU_IMAGE_PREFIX + encodeURIComponent(String(id)) + "?v=" + rev;
}

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

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB decoded

export function decodeDataUrl(dataUrl) {
  const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(String(dataUrl || ""));
  if (!m) return null;
  try {
    // Ước lượng size TRƯỚC khi decode (tránh OOM)
    const payloadLen = m[3].length;
    const approxBytes = m[2]
      ? Math.floor((payloadLen * 3) / 4)
      : payloadLen;

    if (approxBytes > MAX_IMAGE_BYTES) {
      console.warn(
        `[menuImageStore] ảnh quá lớn (${(approxBytes / 1048576).toFixed(1)}MB > ${MAX_IMAGE_BYTES / 1048576}MB), bỏ qua`
      );
      return null;
    }

    const buffer = m[2]
      ? Buffer.from(m[3], "base64")
      : Buffer.from(decodeURIComponent(m[3]), "binary");
    if (!buffer.length) return null;
    if (buffer.length > MAX_IMAGE_BYTES) {
      console.warn(`[menuImageStore] buffer sau decode vượt giới hạn, bỏ qua`);
      return null;
    }
    return { contentType: m[1] || "image/jpeg", buffer };
  } catch {
    return null;
  }
}

export function countInlineMenuImages(data) {
  return (data?.menu_items || []).reduce(
    (n, m) => n + (isInlineImage(m?.image) ? 1 : 0),
    0
  );
}

// ---------- Model (legacy) ----------
const menuImageSchema = new mongoose.Schema(
  {
    _id: { type: String },
    image: { type: String, default: "" },
    contentType: { type: String, default: "" },
    rev: { type: Number, default: 1 },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: MENU_IMAGES_COLLECTION, versionKey: false, minimize: false }
);

export const MenuImageModel =
  mongoose.models.MenuImage || mongoose.model("MenuImage", menuImageSchema);

// ---------- Cache RAM (legacy cho menu_images) ----------
const IMAGE_CACHE_LIMIT_BYTES = 64 * 1024 * 1024;
const imageCache = new Map();
let imageCacheBytes = 0;

const REDIRECT_TTL_MS = 60 * 1000;
const redirectCache = new Map();

export function clearMenuImageCache() {
  imageCache.clear();
  imageCacheBytes = 0;
  redirectCache.clear();
}

export function menuImageCacheStats() {
  return {
    entries: imageCache.size,
    bytes: imageCacheBytes,
    redirects: redirectCache.size,
  };
}

function cacheGet(key) {
  const hit = imageCache.get(key);
  if (!hit) return null;
  imageCache.delete(key);
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

function redirectGet(key) {
  const hit = redirectCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    redirectCache.delete(key);
    return null;
  }
  return hit.url;
}

function redirectSet(key, url) {
  redirectCache.set(key, { url, expiresAt: Date.now() + REDIRECT_TTL_MS });
}

// ---------- Đọc / ghi / xoá ----------
export async function getMenuImage(id) {
  const key = String(id ?? "");
  if (!key) return null;

  // Ưu tiên redirect cache — vẫn trả được kể cả khi DB tạm mất
  const cachedUrl = redirectGet(key);
  if (cachedUrl) return { redirectTo: cachedUrl };

  // Ưu tiên buffer cache — fallback khi DB disconnect
  const cachedEntries = [...imageCache.keys()].filter(
    (k) => k === key || k.startsWith(`${key}:`)
  );
  if (!mongoose.connection?.db) {
    for (const ck of cachedEntries) {
      const entry = imageCache.get(ck);
      if (entry) return entry;
    }
    return null;
  }

  const doc = await MenuImageModel.findById(key).lean();
  if (!doc) {
    // DB connected nhưng không có doc → thử cache (item có thể đã bị xoá khỏi DB nhưng còn cache)
    for (const ck of cachedEntries) {
      const entry = imageCache.get(ck);
      if (entry) return entry;
    }
    return null;
  }

  if (!isInlineImage(doc.image)) {
    const url = typeof doc.image === "string" ? doc.image.trim() : "";
    if (!url) return null;
    redirectSet(key, url);
    return { redirectTo: url };
  }

  const decoded = decodeDataUrl(doc.image);
  if (!decoded) return null;

  const rev = doc.rev || 1;
  const cacheKey = `${key}:${rev}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const entry = {
    buffer: decoded.buffer,
    contentType: doc.contentType || decoded.contentType,
    rev,
    bytes: decoded.buffer.length,
  };
  cacheSet(cacheKey, entry);
  return entry;
}

export async function putMenuImage(id, dataUrl) {
  const key = String(id ?? "");
  if (!key) {
    console.warn("[menuImageStore.putMenuImage] thiếu id");
    return null;
  }
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) {
    console.warn(
      `[menuImageStore.putMenuImage] decode fail cho id=${key} (size quá lớn hoặc format sai)`
    );
    // KHÔNG xoá ảnh cũ — để admin biết upload thất bại
    return null;
  }

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

  redirectCache.delete(key);
  cacheSet(`${key}:${rev}`, {
    buffer: decoded.buffer,
    contentType: decoded.contentType,
    rev,
    bytes: decoded.buffer.length,
  });

  return menuImageUrl(key, rev);
}

export async function deleteMenuImage(id) {
  const key = String(id ?? "");
  if (!key) return;

  redirectCache.delete(key);
  for (const k of [...imageCache.keys()]) {
    if (k === key || k.startsWith(`${key}:`)) {
      const entry = imageCache.get(k);
      imageCache.delete(k);
      imageCacheBytes -= entry?.bytes || 0;
    }
  }
  try {
    await MenuImageModel.deleteOne({ _id: key });
  } catch (e) {
    console.error("Không xoá được ảnh món " + key + ":", e.message);
  }
}

// ============================================================
// 🔴 PATCH CHÍNH — Tích hợp Cloudinary
// ============================================================
export async function applyMenuImageToItem(item, incomingImage, { persist = true } = {}) {
  if (!item) return "";
  const c = classifyImageValue(incomingImage);

  // 1. Ảnh mới base64 inline → upload Cloudinary (ưu tiên) hoặc fallback
  if (c.kind === "inline") {
    if (!persist) {
      item.image = c.value;
      return item.image;
    }

    if (isCloudinaryEnabled()) {
      try {
        const uploaded = await uploadBase64Image(c.value, {
          folder: "canteen-vwa/menu",
          publicId: `item_${item.id}`,
        });
        // Chỉ xoá ảnh Cloudinary cũ SAU KHI upload mới thành công
        if (item.image && isCloudinaryUrl(item.image) && item.image !== uploaded.url) {
          await deleteCloudinaryImage(item.image).catch((delErr) => {
            console.warn(
              `[applyMenuImageToItem] Không xoá được Cloudinary cũ (${item.image}): ${delErr.message} — orphan`
            );
          });
        }
        item.image = uploaded.url;
        return item.image;
      } catch (e) {
        console.warn(
          `[applyMenuImageToItem] Cloudinary fail (${e.message}) — fallback lưu menu_images collection (dev/local)`
        );
        // Nếu item.image là Cloudinary URL CŨ → giữ nguyên, KHÔNG xoá
        // → admin có thể tự cleanup sau nếu muốn
      }
    }

    // Fallback: lưu vào menu_images collection (legacy path — dev / chưa config Cloudinary)
    const url = await putMenuImage(item.id, c.value);
    item.image = url || "";
    return item.image;
  }

  // 2. URL ngoài / path nội bộ / Cloudinary URL → lưu nguyên
  if (c.kind === "path" || c.kind === "external") {
    // Nếu thay thế ảnh Cloudinary cũ bằng ảnh khác → xoá ảnh cũ
    if (persist && item.image && isCloudinaryUrl(item.image) && item.image !== c.value) {
      await deleteCloudinaryImage(item.image).catch(() => {});
    }
    item.image = c.value;
    return item.image;
  }

  // 3. Xoá ảnh
  if (persist && item.image && isCloudinaryUrl(item.image)) {
    await deleteCloudinaryImage(item.image).catch(() => {});
  }
  item.image = "";
  if (persist) await deleteMenuImage(item.id);
  return "";
}

// ============================================================
// Migration helpers (giữ nguyên)
// ============================================================
export async function extractInlineImagesFromData(data, { log = () => {} } = {}) {
  const items = Array.isArray(data?.menu_items) ? data.menu_items : [];
  let moved = 0;
  for (const item of items) {
    if (!isInlineImage(item?.image)) continue;

    // Ưu tiên Cloudinary
    if (isCloudinaryEnabled()) {
      try {
        const uploaded = await uploadBase64Image(item.image, {
          folder: "canteen-vwa/menu",
          publicId: `item_${item.id}`,
        });
        item.image = uploaded.url;
        moved++;
        continue;
      } catch (e) {
        log(`⚠️ Cloudinary fail item ${item.id}: ${e.message} → fallback local`);
      }
    }

    // Fallback local
    const url = await putMenuImage(item.id, item.image);
    if (url) {
      item.image = url;
      moved++;
    }
  }
  if (moved) log(`🖼️ Đã tách ${moved} ảnh base64 khỏi menu_items`);
  return moved;
}

// ---------- Migration document chính (giữ nguyên) ----------
const INLINE_STATS_PIPELINE = [
  { $match: { _id: MAIN_DOC_ID } },
  {
    $project: {
      n: {
        $size: {
          $filter: {
            input: { $ifNull: ["$data.menu_items", []] },
            as: "m",
            cond: {
              $eq: [
                { $substrCP: [{ $ifNull: ["$$m.image", ""] }, 0, 5] },
                "data:",
              ],
            },
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

export async function migrateInlineMenuImages({ log = () => {}, backup = true } = {}) {
  const db = mongoose.connection?.db;
  if (!db) throw new Error("Chưa kết nối MongoDB");

  const coll = db.collection(MAIN_COLLECTION);
  const { inline, bytes: beforeBytes } = await readInlineStats(coll);

  if (!inline) {
    return {
      ok: true,
      needed: false,
      inline: 0,
      stored: 0,
      moved: 0,
      beforeBytes,
      afterBytes: beforeBytes,
    };
  }

  const mb = (b) => (b / 1048576).toFixed(2) + " MB";
  log(`🖼️ Phát hiện ${inline} ảnh base64 trong document chính (${mb(beforeBytes)})`);

  let backupCollection = "";
  if (backup) {
    try {
      await coll
        .aggregate([
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
        ])
        .toArray();
      backupCollection = IMAGE_BACKUP_COLLECTION;
      log(`💾 Đã sao lưu document gốc → ${IMAGE_BACKUP_COLLECTION} (server-side)`);
    } catch (e) {
      log(`⚠️ Không sao lưu được (${e.message}) — vẫn tiếp tục`);
    }
  }

  await coll
    .aggregate([
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
    ])
    .toArray();

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

  let stored = 0;
  if (expectedIdSet.size > 0) {
    const storedDocs = await db
      .collection(MENU_IMAGES_COLLECTION)
      .find({ _id: { $in: [...expectedIdSet] } })
      .project({ _id: 1 })
      .toArray();

    const storedIdSet = new Set(storedDocs.map((d) => d._id));
    stored = storedIdSet.size;
    const missingIds = [...expectedIdSet].filter((id) => !storedIdSet.has(id));

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
    log(`📦 Đã copy ${storedIdSet.size} ảnh sang ${MENU_IMAGES_COLLECTION}`);
  }

  await coll
    .aggregate([
      { $match: { _id: MAIN_DOC_ID } },
      {
        $set: {
          "data.menu_items": {
            $map: {
              input: { $ifNull: ["$data.menu_items", []] },
              as: "m",
              in: {
                $cond: [
                  {
                    $eq: [
                      { $substrCP: [{ $ifNull: ["$$m.image", ""] }, 0, 5] },
                      "data:",
                    ],
                  },
                  {
                    $mergeObjects: [
                      "$$m",
                      {
                        image: {
                          $concat: [
                            MENU_IMAGE_PREFIX,
                            { $toString: "$$m.id" },
                            "?v=1",
                          ],
                        },
                      },
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
    ])
    .toArray();

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

// ---------- CLI ----------
const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

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
    if (!r.needed) console.log("✨ Không cần di trú");
    else if (r.ok)
      console.log("🎉 Hoàn tất! Ảnh đã nằm riêng trong " + MENU_IMAGES_COLLECTION);
    else console.log("⚠️ Chưa hoàn tất: " + (r.error || "còn ảnh base64"));
    console.log(
      `   document chính: ${(r.beforeBytes / 1048576).toFixed(2)} MB → ${(r.afterBytes / 1048576).toFixed(2)} MB`
    );
    if (r.backupCollection) console.log(`   bản sao lưu: ${r.backupCollection}`);
    await mongoose.disconnect();
    process.exit(r.ok ? 0 : 1);
  } catch (e) {
    console.error("❌ Lỗi:", e.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}
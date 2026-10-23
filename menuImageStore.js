// ============================================================
// MENUIMAGESTORE.JS — Tách ảnh món ăn ra khỏi document chính
// V3 (2026-10):
//   - ✅ Cache CẢ redirectTo (URL ngoài) trong 60s — tránh hit DB
//     mỗi request khi user dán link ngoài.
//   - ✅ Thêm clearRedirectCache() để gọi khi update/delete.
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

export function countInlineMenuImages(data) {
  return (data?.menu_items || []).reduce(
    (n, m) => n + (isInlineImage(m?.image) ? 1 : 0),
    0
  );
}

// ---------- Model ----------
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

// ---------- Cache RAM ----------
const IMAGE_CACHE_LIMIT_BYTES = 64 * 1024 * 1024;
const imageCache = new Map();
let imageCacheBytes = 0;

// ✅ Cache URL ngoài 60s
const REDIRECT_TTL_MS = 60 * 1000;
const redirectCache = new Map(); // key -> { url, expiresAt }

export function clearMenuImageCache() {
  imageCache.clear();
  imageCacheBytes = 0;
  redirectCache.clear();
}

export function menuImageCacheStats() {
  return { entries: imageCache.size, bytes: imageCacheBytes, redirects: redirectCache.size };
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
  if (hit.expiresAt < Date.now()) { redirectCache.delete(key); return null; }
  return hit.url;
}

function redirectSet(key, url) {
  redirectCache.set(key, { url, expiresAt: Date.now() + REDIRECT_TTL_MS });
}

// ---------- Đọc / ghi / xoá ----------
export async function getMenuImage(id) {
  const key = String(id ?? "");
  if (!key) return null;
  if (!mongoose.connection?.db) return null;

  // Check redirect cache trước (không cần hit DB)
  const cachedUrl = redirectGet(key);
  if (cachedUrl) return { redirectTo: cachedUrl };

  const doc = await MenuImageModel.findById(key).lean();
  if (!doc) return null;

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
  const decoded = decodeDataUrl(dataUrl);
  if (!key || !decoded) return null;

  const rev = Date.now();
  await MenuImageModel.updateOne(
    { _id: key },
    { $set: { image: dataUrl, contentType: decoded.contentType, rev, updatedAt: new Date() } },
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

export async function applyMenuImageToItem(item, incomingImage, { persist = true } = {}) {
  if (!item) return "";
  const c = classifyImageValue(incomingImage);

  if (c.kind === "inline") {
    if (!persist) { item.image = c.value; return item.image; }
    const url = await putMenuImage(item.id, c.value);
    item.image = url || "";
    return item.image;
  }

  if (c.kind === "path" || c.kind === "external") {
    item.image = c.value;
    return item.image;
  }

  item.image = "";
  if (persist) await deleteMenuImage(item.id);
  return "";
}

export async function extractInlineImagesFromData(data, { log = () => {} } = {}) {
  const items = Array.isArray(data?.menu_items) ? data.menu_items : [];
  let moved = 0;
  for (const item of items) {
    if (!isInlineImage(item?.image)) continue;
    const url = await putMenuImage(item.id, item.image);
    if (url) { item.image = url; moved++; }
  }
  if (moved) log(`🖼️ Đã tách ${moved} ảnh base64 sang ${MENU_IMAGES_COLLECTION}`);
  return moved;
}

// ---------- Migration ----------
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

  let backupCollection = "";
  if (backup) {
    try {
      await coll.aggregate([
        { $match: { _id: MAIN_DOC_ID } },
        { $addFields: { backup_of: MAIN_DOC_ID, backed_up_at: "$$NOW" } },
        { $merge: { into: IMAGE_BACKUP_COLLECTION, on: "_id", whenMatched: "replace", whenNotMatched: "insert" } },
      ]).toArray();
      backupCollection = IMAGE_BACKUP_COLLECTION;
      log(`💾 Đã sao lưu document gốc → ${IMAGE_BACKUP_COLLECTION} (server-side)`);
    } catch (e) {
      log(`⚠️ Không sao lưu được (${e.message}) — vẫn tiếp tục vì ảnh được copy trước khi sửa`);
    }
  }

  await coll.aggregate([
    { $match: { _id: MAIN_DOC_ID } },
    { $project: { items: { $ifNull: ["$data.menu_items", []] } } },
    { $unwind: "$items" },
    { $match: { "items.image": { $regex: "^data:" } } },
    { $project: { _id: { $toString: "$items.id" }, image: "$items.image", rev: { $literal: 1 }, updatedAt: "$$NOW" } },
    { $merge: { into: MENU_IMAGES_COLLECTION, on: "_id", whenMatched: "replace", whenNotMatched: "insert" } },
  ]).toArray();

  const expectedIds = await coll.aggregate([
    { $match: { _id: MAIN_DOC_ID } },
    { $project: { items: { $ifNull: ["$data.menu_items", []] } } },
    { $unwind: "$items" },
    { $match: { "items.image": { $regex: "^data:" } } },
    { $project: { _id: { $toString: "$items.id" } } },
  ]).toArray();

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
      return { ok: false, needed: true, inline, stored: storedIdSet.size, moved: 0, beforeBytes, error };
    }
    log(`📦 Đã copy ${storedIdSet.size} ảnh sang ${MENU_IMAGES_COLLECTION}`);
  }

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
                { $mergeObjects: ["$$m", { image: { $concat: [MENU_IMAGE_PREFIX, { $toString: "$$m.id" }, "?v=1"] } }] },
                "$$m",
              ],
            },
          },
        },
      },
    },
    { $merge: { into: MAIN_COLLECTION, on: "_id", whenMatched: "merge", whenNotMatched: "fail" } },
  ]).toArray();

  const after = await readInlineStats(coll);
  const ok = after.inline === 0;
  log((ok ? "✅" : "❌") + ` Document chính: ${mb(beforeBytes)} → ${mb(after.bytes)}` + (ok ? "" : ` (còn ${after.inline} ảnh base64)`));

  return { ok, needed: true, inline, stored, moved: inline - after.inline, beforeBytes, afterBytes: after.bytes, remaining: after.inline, backupCollection };
}

// ---------- CLI ----------
const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const noBackup = process.argv.includes("--no-backup");
  const uri = process.env.MONGO_URI;
  if (!uri) { console.error("❌ Thiếu MONGO_URI trong .env"); process.exit(1); }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log("✅ Đã kết nối MongoDB:", mongoose.connection.db.databaseName);
    const r = await migrateInlineMenuImages({ log: (m) => console.log(m), backup: !noBackup });
    console.log("─".repeat(52));
    if (!r.needed) console.log("✨ Không cần di trú");
    else if (r.ok) console.log("🎉 Hoàn tất! Ảnh đã nằm riêng trong " + MENU_IMAGES_COLLECTION);
    else console.log("⚠️ Chưa hoàn tất: " + (r.error || "còn ảnh base64"));
    console.log(`   document chính: ${(r.beforeBytes / 1048576).toFixed(2)} MB → ${(r.afterBytes / 1048576).toFixed(2)} MB`);
    if (r.backupCollection) console.log(`   bản sao lưu: ${r.backupCollection}`);
    await mongoose.disconnect();
    process.exit(r.ok ? 0 : 1);
  } catch (e) {
    console.error("❌ Lỗi:", e.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}
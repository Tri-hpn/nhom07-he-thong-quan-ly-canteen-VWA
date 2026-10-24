// middleware/normalizeId.js
// ============================================================
// MODULE 6 — Chuẩn hoá ID (id vs _id vs code) cho migration
// ============================================================
// Vấn đề: hệ thống migrate từ JSON Server có legacy `id` (Number),
// giờ Mongo có thêm `_id` (ObjectId). Frontend cũ gọi /api/orders/123,
// frontend mới gọi /api/orders/65a... -> phải match cả 2.
// ============================================================

import mongoose from "mongoose";

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

/**
 * Phân loại param thành { id, mongoId, raw }
 * @param {string|number} raw
 * @returns {{ raw: string, id: number|null, mongoId: any|null, isObjectId: boolean, isNumber: boolean }}
 */
export function parseId(raw) {
  const s = String(raw ?? "").trim();
  if (!s) {
    return { raw: "", id: null, mongoId: null, isObjectId: false, isNumber: false };
  }

  const isObjectId = OBJECT_ID_RE.test(s);
  const mongoId = isObjectId ? new mongoose.Types.ObjectId(s) : null;

  // id (Number) chỉ khi là chuỗi toàn số VÀ trong giới hạn an toàn
  const asNum = Number(s);
  const isNumber = /^\d+$/.test(s) && Number.isSafeInteger(asNum);
  const id = isNumber ? asNum : null;

  return { raw: s, id, mongoId, isObjectId, isNumber };
}

/**
 * Middleware: attach req.params.<key> đã parse vào req.legacyIds
 * Dùng: router.get("/orders/:id", normalizeId("id"), handler)
 * Handler truy cập: req.legacyIds.id = { raw, id, mongoId, ... }
 */
export function normalizeId(paramKey = "id") {
  return (req, _res, next) => {
    if (!req.legacyIds) req.legacyIds = {};
    req.legacyIds[paramKey] = parseId(req.params?.[paramKey]);
    next();
  };
}

/**
 * Tìm phần tử trong mảng (in-memory cache) theo raw id.
 * Match: id (Number) | _id (ObjectId or string) | code (string) | email
 */
export function findByIdOrMongo(arr, raw) {
  if (!Array.isArray(arr) || !raw) return null;
  const parsed = parseId(raw);
  const target = parsed.raw;

  return (
    arr.find((item) => {
      if (!item || typeof item !== "object") return false;
      // 1. id (Number)
      if (parsed.isNumber && Number(item.id) === parsed.id) return true;
      // 2. _id (ObjectId hoặc string)
      if (item._id !== undefined && item._id !== null) {
        const itemIdStr = String(item._id);
        if (itemIdStr === target) return true;
      }
      // 3. code (VWA-xxx, PAY-xxx, DEP-xxx, ...)
      if (item.code && String(item.code) === target) return true;
      // 4. email (dùng cho user lookup)
      if (item.email && String(item.email).toLowerCase() === target.toLowerCase()) return true;
      return false;
    }) || null
  );
}

/**
 * Build query MongoDB filter tương thích cả id (Number) + _id (ObjectId).
 * Dùng với mongoose.connection.db.collection(...).findOne()
 *
 * @example
 *   const filter = buildMongoFilter("65a1b2c3d4e5f6a7b8c9d0e1");
 *   await coll.findOne(filter);
 *   // → { $or: [{ _id: ObjectId("...") }, { id: 123 }, { code: "..." }] }
 */
export function buildMongoFilter(raw) {
  const parsed = parseId(raw);
  if (!parsed.raw) return {};
  const or = [];
  if (parsed.isObjectId) or.push({ _id: parsed.mongoId });
  if (parsed.isNumber) or.push({ id: parsed.id });
  // Fallback: dùng _id dạng string (một số collection dùng string _id)
  or.push({ _id: parsed.raw });
  // Code dùng cho order (VWA-xxx) / voucher / transaction
  or.push({ code: parsed.raw });
  return or.length === 1 ? or[0] : { $or: or };
}
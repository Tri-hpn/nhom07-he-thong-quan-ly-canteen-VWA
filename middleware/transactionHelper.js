// middleware/transactionHelper.js
// ============================================================
// MODULE 1 — MongoDB Transaction Helper
// ============================================================
// - withTransaction(fn) : chạy fn trong 1 transaction, tự retry
// - supportsTransactions : check 1 lần cluster có hỗ trợ không
// - atomicDecrement : $inc có điều kiện (chống âm kho / âm ví)
// ============================================================

import mongoose from "mongoose";

let _supportsTx = null; // null = chưa check

/**
 * Check cluster có hỗ trợ transaction không (cần replica set).
 * Gọi 1 lần rồi cache kết quả.
 */
export async function supportsTransactions() {
  if (_supportsTx !== null) return _supportsTx;
  try {
    const admin = mongoose.connection.db.admin();
    const info = await admin.command({ hello: 1 });
    // setName có → replica set → hỗ trợ transaction
    _supportsTx = !!info.setName;
  } catch {
    _supportsTx = false;
  }
  return _supportsTx;
}

/**
 * Wrapper chuẩn: chạy fn trong transaction, tự retry transient error.
 * Nếu cluster không hỗ trợ → chạy fn KHÔNG session (fallback).
 *
 * @param {(session: any|null) => Promise<T>} fn
 * @returns {Promise<T>}
 *
 * @example
 *   const order = await withTransaction(async (session) => {
 *     await ordersColl.insertOne(order, { session });
 *     await walletsColl.updateOne(filter, update, { session });
 *     return order;
 *   });
 */
export async function withTransaction(fn) {
  const canTx = await supportsTransactions();
  if (!canTx) {
    console.warn("[transaction] ⚠️  Cluster không hỗ trợ transaction — fallback không session");
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      {
        readPreference: "primary",
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      }
    );
    return result;
  } finally {
    await session.endSession();
  }
}

/**
 * Atomic decrement có điều kiện — CHỐNG ÂM KHO.
 * Chỉ update nếu stock hiện tại >= qty. Trả true nếu update thành công.
 *
 * @param {Collection} coll
 * @param {object} filter  — { _id } hoặc { id }
 * @param {string} field   — "stock" | "balance"
 * @param {number} amount  — số dương, sẽ trừ đi
 * @param {object|null} session
 */
export async function atomicDecrement(coll, filter, field, amount, session) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("atomicDecrement: amount phải > 0");
  }

  // Query: chỉ update nếu field >= amount  → không cần read trước
  const update = {
    $inc: { [field]: -amount },
  };
  const guardedFilter = {
    ...filter,
    [field]: { $gte: amount },
  };

  const res = await coll.updateOne(guardedFilter, update, { session });
  return res.modifiedCount === 1;
}

/**
 * Atomic increment (dùng cho rollback / refund).
 */
export async function atomicIncrement(coll, filter, field, amount, session) {
  const res = await coll.updateOne(
    filter,
    { $inc: { [field]: amount } },
    { session }
  );
  return res.modifiedCount === 1;
}
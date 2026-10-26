// middleware/cookieAuth.js
// ============================================================
// BEARER-ONLY AUTH — Không dùng HttpOnly Cookie nữa
// Vercel cross-site cookie không ổn định → chỉ dùng Bearer token
// ============================================================

import jwt from "jsonwebtoken";
import crypto from "crypto";
import mongoose from "mongoose";

const ACCESS_TOKEN_TTL = "7d"; // Demo: cho phép 7 ngày để sinh viên không phải login lại
const SESSION_COLLECTION = "sessions";

function sha256(str) {
  return crypto.createHash("sha256").update(String(str)).digest("hex");
}

function getSessionsColl() {
  if (!mongoose.connection?.db) return null;
  return mongoose.connection.db.collection(SESSION_COLLECTION);
}

export async function issueTokens(res, userPayload, jwtSecret, { req } = {}) {
  if (!jwtSecret) throw new Error("JWT_SECRET missing");

  const base = { id: userPayload.id, email: userPayload.email, role: userPayload.role, name: userPayload.name };
  const jti = crypto.randomUUID();
  const sid = jti;

  const accessToken = jwt.sign({ ...base, typ: "access", sid }, jwtSecret, { expiresIn: ACCESS_TOKEN_TTL });

  const coll = getSessionsColl();
  if (coll) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Dọn session hết hạn của user (nhưng KHÔNG dọn session khác đang active)
    try {
      await coll.deleteMany({
        user_id: userPayload.id,
        expires_at: { $lt: now.toISOString() },
      });
    } catch {}

    // Tạo session mới — throw nếu fail để endpoint biết
    try {
      await coll.insertOne({
        jti,
        user_id: userPayload.id,
        refresh_hash: null, // không dùng nữa
        ua: req?.headers?.["user-agent"] || "",
        ip: req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || req?.ip || "",
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        revoked_at: null,
        last_used_at: now.toISOString(),
      });
    } catch (e) {
      throw new Error(`[issueTokens] Không tạo được session: ${e.message}`);
    }
  }

  // 🔴 KHÔNG set cookie nữa
  return { accessToken, jti, sid };
}

// Giữ để tương thích ngược — không làm gì
export function clearAuthCookies(res) {
  res.clearCookie("vwa_access", { path: "/" });
  res.clearCookie("vwa_refresh", { path: "/" });
}

export async function verifySession(jti) {
  if (!jti) return { ok: false, error: "no-jti" };
  const coll = getSessionsColl();
  if (!coll) return { ok: true };
  try {
    const doc = await coll.findOne({ jti });
    if (!doc) return { ok: false, error: "not-found" };
    if (doc.revoked_at) return { ok: false, error: "revoked" };
    if (new Date(doc.expires_at || 0).getTime() < Date.now()) return { ok: false, error: "expired" };
    return { ok: true, session: doc };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function revokeSession(jti) {
  if (!jti) return false;
  const coll = getSessionsColl();
  if (!coll) return true;
  try {
    const r = await coll.updateOne({ jti, revoked_at: null }, { $set: { revoked_at: new Date().toISOString() } });
    return r.modifiedCount > 0;
  } catch { return false; }
}

export async function revokeAllSessions(userId, exceptJti = null) {
  const coll = getSessionsColl();
  if (!coll) return 0;
  try {
    const filter = { user_id: userId, revoked_at: null };
    if (exceptJti) filter.jti = { $ne: exceptJti };
    const r = await coll.updateMany(filter, { $set: { revoked_at: new Date().toISOString() } });
    return r.modifiedCount || 0;
  } catch { return 0; }
}

// 🔴 Chỉ đọc từ Authorization header (Bearer), KHÔNG đọc cookie
export function verifyAnyToken(req, jwtSecret, expectedType = "access") {
  if (!jwtSecret) return { ok: false, error: "JWT_SECRET missing" };

  const header = req.headers?.authorization || "";
  if (!header.startsWith("Bearer ")) return { ok: false, error: "no-token" };

  const raw = header.slice(7);
  try {
    const payload = jwt.verify(raw, jwtSecret);
    if (payload.typ && payload.typ !== expectedType) return { ok: false, error: "wrong-token-type" };
    return { ok: true, payload, source: "header" };
  } catch (e) {
    return { ok: false, error: e.name || "invalid" };
  }
}

// Không dùng nữa — giữ để tương thích
export async function verifyRefreshAndMatch() {
  return { ok: false, error: "refresh-disabled" };
}

export const COOKIE_NAMES = { ACCESS: "vwa_access", REFRESH: "vwa_refresh", SESSION_COLLECTION };
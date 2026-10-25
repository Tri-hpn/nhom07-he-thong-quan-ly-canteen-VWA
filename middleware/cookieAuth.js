// middleware/cookieAuth.js
// ============================================================
// HttpOnly Cookie + Session DB + Dual Auth (Cookie ưu tiên)
// ============================================================

import jwt from "jsonwebtoken";
import crypto from "crypto";
import mongoose from "mongoose";

const ACCESS_TOKEN_TTL = "30m";
const REFRESH_TOKEN_TTL = "7d";
const ACCESS_COOKIE = "vwa_access";
const REFRESH_COOKIE = "vwa_refresh";
const SESSION_COLLECTION = "sessions";

const REVOKED_CACHE = new Map();
const REVOKED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Hàm kiểm tra xem có phải đang chạy localhost không
function isLocalhost(req) {
  if (!req) return false;
  const host = req.hostname || req.headers?.host || "";
  return host.includes("localhost") || host.includes("127.0.0.1");
}

// Tự động điều chỉnh cookie dựa trên môi trường thực tế
function cookieOpts(req, maxAgeMs) {
  const isLocal = isLocalhost(req);
  // Nếu là localhost -> luôn là false. Nếu không phải localhost -> dựa vào env
  const isProd = !isLocal && (process.env.NODE_ENV === "production" || !!process.env.VERCEL);
  
  const sameSite = isProd ? "none" : "lax";
  return {
    httpOnly: true,
    secure: isProd, 
    sameSite,
    path: "/",
    maxAge: maxAgeMs,
    partitioned: isProd,
  };
}

function clearOpts(req) {
  const isLocal = isLocalhost(req);
  const isProd = !isLocal && (process.env.NODE_ENV === "production" || !!process.env.VERCEL);
  const sameSite = isProd ? "none" : "lax";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite,
    path: "/",
    partitioned: isProd,
  };
}

function sha256(str) {
  return crypto.createHash("sha256").update(String(str)).digest("hex");
}

function getSessionsColl() {
  try {
    if (!mongoose.connection?.db) return null;
    return mongoose.connection.db.collection(SESSION_COLLECTION);
  } catch {
    return null;
  }
}

function cacheRevoked(jti, expiresAtMs) {
  if (!jti) return;
  REVOKED_CACHE.set(jti, expiresAtMs || Date.now() + REVOKED_TTL_MS);
}

function isCachedRevoked(jti) {
  if (!jti) return false;
  const exp = REVOKED_CACHE.get(jti);
  if (!exp) return false;
  if (Date.now() > exp) {
    REVOKED_CACHE.delete(jti);
    return false;
  }
  return true;
}

export async function issueTokens(res, userPayload, jwtSecret, { req, rotateFromJti = null } = {}) {
  if (!jwtSecret) throw new Error("JWT_SECRET missing");

  const base = {
    id: userPayload.id,
    email: userPayload.email,
    role: userPayload.role,
    name: userPayload.name,
  };

  const jti = crypto.randomUUID();
  const sid = jti;

  const accessToken = jwt.sign(
    { ...base, typ: "access", sid },
    jwtSecret,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
  const refreshToken = jwt.sign(
    { ...base, typ: "refresh", jti },
    jwtSecret,
    { expiresIn: REFRESH_TOKEN_TTL }
  );

  const coll = getSessionsColl();
  if (coll) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    try {
      await coll.insertOne({
        jti,
        user_id: userPayload.id,
        refresh_hash: sha256(refreshToken),
        ua: req?.headers?.["user-agent"] || "",
        ip: req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || req?.ip || "",
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        revoked_at: null,
        last_used_at: now.toISOString(),
      });
      if (rotateFromJti) {
        await revokeSession(rotateFromJti);
      }
    } catch (e) {
      console.warn("[cookieAuth] insert session failed:", e.message);
    }
  }

  // 🔴 Đã sửa: Truyền req vào cookieOpts để tự động tắt secure trên localhost
  res.cookie(ACCESS_COOKIE, accessToken, cookieOpts(req, 30 * 60 * 1000));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts(req, 7 * 24 * 60 * 60 * 1000));

  return { accessToken, refreshToken, jti, sid };
}

export function clearAuthCookies(res, req) {
  // 🔴 Đã sửa: Truyền req vào clearOpts
  res.clearCookie(ACCESS_COOKIE, clearOpts(req));
  res.clearCookie(REFRESH_COOKIE, clearOpts(req));
}

export async function verifySession(jti) {
  if (!jti) return { ok: false, error: "no-jti" };
  if (isCachedRevoked(jti)) return { ok: false, error: "revoked" };
  const coll = getSessionsColl();
  if (!coll) return { ok: true };
  try {
    const doc = await coll.findOne({ jti });
    if (!doc) return { ok: false, error: "not-found" };
    if (doc.revoked_at) {
      cacheRevoked(jti);
      return { ok: false, error: "revoked" };
    }
    const exp = new Date(doc.expires_at || 0).getTime();
    if (exp && exp < Date.now()) return { ok: false, error: "expired" };
    return { ok: true, session: doc };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function revokeSession(jti) {
  if (!jti) return false;
  cacheRevoked(jti);
  const coll = getSessionsColl();
  if (!coll) return true;
  try {
    const r = await coll.updateOne(
      { jti, revoked_at: null },
      { $set: { revoked_at: new Date().toISOString() } }
    );
    return r.modifiedCount > 0;
  } catch {
    return false;
  }
}

export async function revokeAllSessions(userId, exceptJti = null) {
  const coll = getSessionsColl();
  if (!coll) return 0;
  try {
    const filter = { user_id: userId, revoked_at: null };
    if (exceptJti) filter.jti = { $ne: exceptJti };
    const r = await coll.updateMany(filter, {
      $set: { revoked_at: new Date().toISOString() },
    });
    return r.modifiedCount || 0;
  } catch {
    return 0;
  }
}

export async function verifyRefreshAndMatch(req, jwtSecret) {
  const v = verifyAnyToken(req, jwtSecret, "refresh");
  if (!v.ok) return { ok: false, error: v.error };
  const jti = v.payload.jti;
  const rawCookie = req.cookies?.[REFRESH_COOKIE];
  if (!jti || !rawCookie) return { ok: false, error: "no-refresh-token" };
  const sv = await verifySession(jti);
  if (!sv.ok) return { ok: false, error: sv.error };
  if (sv.session && sv.session.refresh_hash !== sha256(rawCookie)) {
    await revokeSession(jti);
    return { ok: false, error: "hash-mismatch" };
  }
  return { ok: true, jti, payload: v.payload, session: sv.session };
}

export function verifyAnyToken(req, jwtSecret, expectedType = "access") {
  if (!jwtSecret) return { ok: false, error: "JWT_SECRET missing" };

  let raw = null;
  let source = null;

  if (req.cookies) {
    const cookieName = expectedType === "refresh" ? REFRESH_COOKIE : ACCESS_COOKIE;
    raw = req.cookies[cookieName];
    if (raw) source = "cookie";
  }

  if (!raw) {
    const header = req.headers?.authorization || "";
    if (header.startsWith("Bearer ")) {
      raw = header.slice(7);
      source = "header";
    }
  }

  if (!raw) return { ok: false, error: "no-token" };

  try {
    const payload = jwt.verify(raw, jwtSecret);
    if (payload.typ && payload.typ !== expectedType) {
      return { ok: false, error: "wrong-token-type" };
    }
    return { ok: true, payload, source };
  } catch (e) {
    return { ok: false, error: e.name || "invalid" };
  }
}

export const COOKIE_NAMES = {
  ACCESS: ACCESS_COOKIE,
  REFRESH: REFRESH_COOKIE,
  SESSION_COLLECTION,
};
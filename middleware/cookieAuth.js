// middleware/cookieAuth.js
// ============================================================
// DUAL-TOKEN AUTH — Access (Bearer + Cookie) + Refresh (HttpOnly)
// - Access: JWT 2h, trả về JSON (Bearer) VÀ set cookie vwa_access
// - Refresh: opaque 32-byte, lưu SHA-256 trong sessions.refresh_hash
// - Rotate refresh mỗi lần /api/auth/refresh
// ============================================================

import jwt from "jsonwebtoken";
import crypto from "crypto";
import mongoose from "mongoose";

const ACCESS_TOKEN_TTL = "2h";
const ACCESS_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_COLLECTION = "sessions";
const COOKIE_NAMES = { ACCESS: "vwa_access", REFRESH: "vwa_refresh" };

function sha256(str) {
  return crypto.createHash("sha256").update(String(str)).digest("hex");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function getSessionsColl() {
  if (!mongoose.connection?.db) return null;
  return mongoose.connection.db.collection(SESSION_COLLECTION);
}

function isProdEnv() {
  return (
    process.env.NODE_ENV === "production" ||
    !!process.env.VERCEL_ENV
  );
}

function baseCookieOptions() {
  const prod = isProdEnv();
  return {
    httpOnly: true,
    secure: prod,
    sameSite:"lax",
    path: "/",
  };
}

export function setAuthCookies(res, accessToken, refreshToken) {
  const base = baseCookieOptions();
  try {
    if (accessToken) res.cookie(COOKIE_NAMES.ACCESS, accessToken, { ...base, maxAge: ACCESS_TOKEN_TTL_MS });
    if (refreshToken) res.cookie(COOKIE_NAMES.REFRESH, refreshToken, { ...base, maxAge: REFRESH_TOKEN_TTL_MS });
  } catch (e) {
    console.warn("[setAuthCookies] failed:", e.message);
  }
}

export function clearAuthCookies(res, _req) {
  const base = baseCookieOptions();
  try {
    res.clearCookie(COOKIE_NAMES.ACCESS, base);
    res.clearCookie(COOKIE_NAMES.REFRESH, base);
  } catch {}
}

export async function issueTokens(res, userPayload, jwtSecret, { req } = {}) {
  if (!jwtSecret) throw new Error("JWT_SECRET missing");

  const base = { id: userPayload.id, email: userPayload.email, role: userPayload.role, name: userPayload.name };
  const jti = crypto.randomUUID();
  const sid = jti;

  const accessToken = jwt.sign(
    { ...base, typ: "access", sid },
    jwtSecret,
    { expiresIn: ACCESS_TOKEN_TTL }
  );

  const refreshToken = randomToken(32);
  const refreshHash = sha256(refreshToken);

  const coll = getSessionsColl();
  if (coll) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
    try {
      await coll.deleteMany({ user_id: userPayload.id, expires_at: { $lt: now.toISOString() } });
    } catch {}
    try {
      await coll.insertOne({
        jti,
        user_id: userPayload.id,
        refresh_hash: refreshHash,
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

  setAuthCookies(res, accessToken, refreshToken);
  return { accessToken, refreshToken, jti, sid };
}

export async function rotateRefreshToken(refreshToken, jwtSecret, { req } = {}) {
  if (!refreshToken) return null;
  const coll = getSessionsColl();
  if (!coll) return null;

  const hash = sha256(refreshToken);
  try {
    const session = await coll.findOne({ refresh_hash: hash, revoked_at: null });
    if (!session) return null;
    if (new Date(session.expires_at || 0).getTime() < Date.now()) return null;

    const user = await mongoose.connection.db.collection("users").findOne({ id: Number(session.user_id) });
    if (!user) return null;
    if (user.status === "Bị khóa") return null;

    const newRefresh = randomToken(32);
    const newHash = sha256(newRefresh);
    const newExpires = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    const upd = await coll.updateOne(
      { jti: session.jti, refresh_hash: hash, revoked_at: null },
      {
        $set: {
          refresh_hash: newHash,
          expires_at: newExpires.toISOString(),
          last_used_at: new Date().toISOString(),
        },
      }
    );
    if (upd.modifiedCount !== 1) return null;

    const base = { id: user.id, email: user.email, role: user.role, name: user.name };
    const accessToken = jwt.sign(
      { ...base, typ: "access", sid: session.jti },
      jwtSecret,
      { expiresIn: ACCESS_TOKEN_TTL }
    );

    return { accessToken, refreshToken: newRefresh, jti: session.jti, sid: session.jti, user };
  } catch (e) {
    console.error("[rotateRefreshToken] error:", e.message);
    return null;
  }
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

export async function revokeByRefreshToken(refreshToken) {
  if (!refreshToken) return false;
  const coll = getSessionsColl();
  if (!coll) return true;
  try {
    const hash = sha256(refreshToken);
    const r = await coll.updateOne({ refresh_hash: hash, revoked_at: null }, { $set: { revoked_at: new Date().toISOString() } });
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

// Bearer ưu tiên → fallback cookie vwa_access
export function verifyAnyToken(req, jwtSecret, expectedType = "access") {
  if (!jwtSecret) return { ok: false, error: "JWT_SECRET missing" };

  const header = req.headers?.authorization || "";
  if (header.startsWith("Bearer ")) {
    const raw = header.slice(7);
    try {
      const payload = jwt.verify(raw, jwtSecret);
      if (payload.typ && payload.typ !== expectedType) return { ok: false, error: "wrong-token-type" };
      return { ok: true, payload, source: "header" };
    } catch {
      // fall through to cookie
    }
  }

  try {
    const cookieToken = req.cookies?.[COOKIE_NAMES.ACCESS];
    if (cookieToken) {
      const payload = jwt.verify(cookieToken, jwtSecret);
      if (payload.typ && payload.typ !== expectedType) return { ok: false, error: "wrong-token-type" };
      return { ok: true, payload, source: "cookie" };
    }
  } catch (e) {
    return { ok: false, error: e.name || "invalid" };
  }

  return { ok: false, error: "no-token" };
}

export async function verifyRefreshAndMatch(refreshToken) {
  if (!refreshToken) return { ok: false, error: "no-token" };
  const coll = getSessionsColl();
  if (!coll) return { ok: false, error: "no-db" };
  const hash = sha256(refreshToken);
  try {
    const doc = await coll.findOne({ refresh_hash: hash });
    if (!doc) return { ok: false, error: "not-found" };
    if (doc.revoked_at) return { ok: false, error: "revoked" };
    if (new Date(doc.expires_at || 0).getTime() < Date.now()) return { ok: false, error: "expired" };
    return { ok: true, session: doc };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export { COOKIE_NAMES, SESSION_COLLECTION, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL_MS };
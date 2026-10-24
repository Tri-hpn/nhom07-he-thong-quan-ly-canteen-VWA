// middleware/cookieAuth.js
// ============================================================
// MODULE 4 — HttpOnly Cookie + Dual Auth (Bearer + Cookie)
// ============================================================

import jwt from "jsonwebtoken";

const ACCESS_TOKEN_TTL = "7d"; // Tăng lên 7 ngày để dùng sessionStorage ổn định
const REFRESH_TOKEN_TTL = "7d";
const ACCESS_COOKIE = "vwa_access";
const REFRESH_COOKIE = "vwa_refresh";

function isProd() {
  return process.env.NODE_ENV === "production" || !!process.env.VERCEL;
}

function cookieOpts(maxAgeMs) {
  const sameSite = isProd() ? "none" : "lax";
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite,
    path: "/",
    maxAge: maxAgeMs,
    // 🔴 Thêm partitioned: true để fix lỗi chặn third-party cookie trên Vercel
    partitioned: isProd(),
  };
}

export function issueTokens(res, userPayload, jwtSecret) {
  if (!jwtSecret) throw new Error("JWT_SECRET missing");

  const base = {
    id: userPayload.id,
    email: userPayload.email,
    role: userPayload.role,
    name: userPayload.name,
  };

  const accessToken = jwt.sign(
    { ...base, typ: "access" },
    jwtSecret,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
  const refreshToken = jwt.sign(
    { ...base, typ: "refresh", jti: `${Date.now()}-${Math.random().toString(36).slice(2)}` },
    jwtSecret,
    { expiresIn: REFRESH_TOKEN_TTL }
  );

  res.cookie(ACCESS_COOKIE, accessToken, cookieOpts(7 * 24 * 60 * 60 * 1000));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts(7 * 24 * 60 * 60 * 1000));

  return { accessToken, refreshToken };
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_COOKIE, { path: "/" });
}

export function verifyAnyToken(req, jwtSecret, expectedType = "access") {
  if (!jwtSecret) return { ok: false, error: "JWT_SECRET missing" };

  let raw = null;
  let source = null;

  // 1. Ưu tiên Authorization: Bearer <token> (Dùng cho Multi-Tab)
  const header = req.headers?.authorization || "";
  if (header.startsWith("Bearer ")) {
    raw = header.slice(7);
    source = "header";
  }

  // 2. Fallback HttpOnly Cookie
  if (!raw && req.cookies) {
    const cookieName = expectedType === "refresh" ? REFRESH_COOKIE : ACCESS_COOKIE;
    raw = req.cookies[cookieName];
    source = "cookie";
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

export const COOKIE_NAMES = { ACCESS: ACCESS_COOKIE, REFRESH: REFRESH_COOKIE };
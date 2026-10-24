// middleware/sanitize.js
// ============================================================
// SANITIZE — XSS + NoSQL Injection + Prototype Pollution
// ============================================================

const PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const SKIP_STRIP_KEYS = new Set([
  "password", "oldPassword", "newPassword", "repeatPassword", "confirmPassword",
  "currentPassword", "password_hash", "passwordHash",
  "token", "refresh_token", "access_token", "refreshToken", "accessToken",
  "otp", "code_verifier",
]);

const URL_KEYS = new Set([
  "image", "avatar", "qrCustomImage", "qr_custom_image",
  "menu_image", "logo", "banner", "banner_url",
  "coverImage", "cover_image", "thumbnail", "photo",
  "imageUrl", "image_url", "avatarUrl", "avatar_url",
]);

const MAX_STRING_LENGTH = 100_000;
const MAX_DEPTH = 10;

const SCRIPT_RE = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const HTML_TAG_RE = /<[^>]*>/g;

function stripTags(str) {
  return String(str).replace(SCRIPT_RE, "").replace(HTML_TAG_RE, "");
}

function isValidImageUrl(str) {
  if (typeof str !== "string" || !str) return false;
  if (str.startsWith("data:image/")) return true;
  if (str.startsWith("/") || str.startsWith("./") || str.startsWith("../")) return true;
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isDangerousKey(k) {
  if (typeof k !== "string") return true;
  if (PROTO_KEYS.has(k)) return true;
  if (k.startsWith("$")) return true;
  if (k.includes(".")) return true;
  if (k.includes("\u0000")) return true;
  return false;
}

function sanitizeValue(v, currentKey, depth = 0) {
  if (depth > MAX_DEPTH) return undefined;

  if (typeof v === "string") {
    if (v.length > MAX_STRING_LENGTH) v = v.slice(0, MAX_STRING_LENGTH);
    if (SKIP_STRIP_KEYS.has(currentKey)) return v;
    if (URL_KEYS.has(currentKey)) return isValidImageUrl(v) ? v : "";
    if (v.startsWith("data:image/")) return v;
    return stripTags(v);
  }

  if (Array.isArray(v)) {
    return v.map((item) => sanitizeValue(item, currentKey, depth + 1));
  }

  if (v && typeof v === "object") {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v; // Date/ObjectId/Buffer
    const out = {};
    for (const k of Object.keys(v)) {
      if (isDangerousKey(k)) continue;
      const val = sanitizeValue(v[k], k, depth + 1);
      if (val !== undefined) out[k] = val;
    }
    return out;
  }

  return v;
}

export function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body, "", 0);
  }

  // Query: giữ array dạng ["a","b"] nếu có — chỉ sanitize từng phần tử
  if (req.query && typeof req.query === "object") {
    const cleanQuery = sanitizeValue(req.query, "", 0) || {};
    try {
      Object.defineProperty(req, "query", {
        value: cleanQuery, writable: true, configurable: true, enumerable: true,
      });
    } catch {}
  }

  if (req.params && typeof req.params === "object") {
    req.params = sanitizeValue(req.params, "", 0) || {};
  }

  next();
}

export function sanitize(input) {
  return sanitizeValue(input, "", 0);
}
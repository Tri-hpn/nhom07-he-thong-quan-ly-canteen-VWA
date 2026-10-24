// ============================================================
// SANITIZE — Chống XSS + NoSQL Injection
// V3 (2026-10 - audit):
//   ✅ Fix encoding UTF-8 (file cũ bị mojibake Windows-1252)
//   ✅ Chặn NoSQL operator keys ($gt, $ne, $where, $regex, $function…)
//   ✅ Chặn prototype pollution ở mọi depth
//   ✅ Validate URL cho field ảnh (chỉ http/https/relative/data:image/*)
//   ✅ Sanitize cả body + query + params
//   ✅ Giới hạn depth (10) và length (100KB) chống payload bomb
//   ✅ SKIP_STRIP cho password/token, không skip image/avatar (validate thay vì skip)
// ============================================================

const PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// Field mật khẩu/token: không cần strip HTML (nội dung là binary hash)
const SKIP_STRIP_KEYS = new Set([
  "password",
  "currentPassword",
  "newPassword",
  "password_hash",
  "token",
  "refresh_token",
  "access_token",
]);

// Field chứa URL ảnh — validate thay vì strip
const URL_KEYS = new Set([
  "image",
  "avatar",
  "qrCustomImage",
  "qr_custom_image",
  "menu_image",
  "logo",
  "banner",
]);

const MAX_STRING_LENGTH = 100_000; // 100KB/chuỗi
const MAX_DEPTH = 10;

const SCRIPT_RE = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const HTML_TAG_RE = /<[^>]*>/g;

function stripTags(str) {
  return String(str).replace(SCRIPT_RE, "").replace(HTML_TAG_RE, "");
}

function isValidImageUrl(str) {
  if (typeof str !== "string" || !str) return false;
  if (str.startsWith("data:image/")) return true;
  if (str.startsWith("/") || str.startsWith("./") || str.startsWith("../")) {
    return true;
  }
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
  // Chặn Mongo operator key ($gt, $ne, $where, $regex…)
  if (k.startsWith("$")) return true;
  // Chặn dot-path (có thể dùng để bypass filter: user.name)
  if (k.includes(".")) return true;
  return false;
}

function sanitizeValue(v, currentKey, depth = 0) {
  if (depth > MAX_DEPTH) return undefined;

  if (typeof v === "string") {
    if (v.length > MAX_STRING_LENGTH) v = v.slice(0, MAX_STRING_LENGTH);

    if (SKIP_STRIP_KEYS.has(currentKey)) return v;

    if (URL_KEYS.has(currentKey)) {
      return isValidImageUrl(v) ? v : "";
    }

    // Legacy: cho phép data URI ảnh nhúng (menu items)
    if (v.startsWith("data:image/")) return v;

    return stripTags(v);
  }

  if (Array.isArray(v)) {
    return v
      .map((item) => sanitizeValue(item, currentKey, depth + 1))
      .filter((x) => x !== undefined);
  }

  if (v && typeof v === "object") {
    // Bỏ qua Date, ObjectId, Buffer, RegExp… (không phải input JSON thuần)
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) {
      return v;
    }
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

/**
 * Middleware: sanitize body + query + params.
 * Đặt SAU express.json() và TRƯỚC các route handler.
 */
export function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body, "", 0);
  }

  if (req.query && typeof req.query === "object") {
    const cleanQuery = sanitizeValue(req.query, "", 0) || {};
    try {
      // Express 5: req.query là getter → cần gán qua defineProperty
      Object.defineProperty(req, "query", {
        value: cleanQuery,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } catch {
      // Fallback (một số env) — bỏ qua an toàn, params vẫn được sanitize
    }
  }

  if (req.params && typeof req.params === "object") {
    req.params = sanitizeValue(req.params, "", 0) || {};
  }

  next();
}

/** Dùng thủ công cho các chỗ cần sanitize ngoài middleware */
export function sanitize(input) {
  return sanitizeValue(input, "", 0);
}
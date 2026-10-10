// ============================================================
// SANITIZE — Chống XSS cơ bản (strip HTML tags)
// ============================================================
// Cách dùng:
//   import { sanitizeBody } from "./middleware/sanitize.js";
//   app.use(sanitizeBody);
// ============================================================

const DANGEROUS_KEYS = new Set([
  "__proto__", "constructor", "prototype",
]);

function stripTags(str) {
  return String(str)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]+>/g, "");
}

function sanitizeValue(v, depth = 0) {
  if (depth > 10) return v; // chống đệ quy sâu
  if (typeof v === "string") return stripTags(v);
  if (Array.isArray(v)) return v.map((item) => sanitizeValue(item, depth + 1));
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v)) {
      if (DANGEROUS_KEYS.has(k)) continue;
      out[k] = sanitizeValue(v[k], depth + 1);
    }
    return out;
  }
  return v;
}

export function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }
  next();
}
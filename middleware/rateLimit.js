// ============================================================
// RATE LIMIT — Chống brute force login (in-memory)
// ============================================================
// Cách dùng:
//   import { rateLimit } from "./middleware/rateLimit.js";
//   app.post("/api/auth/login", rateLimit({ windowMs: 60_000, max: 5 }), handler);
//
// ⚠️ Lưu ý: in-memory → không share giữa các instance.
//    Trên production nên dùng Redis.
// ============================================================

const buckets = new Map();

export function rateLimit({ windowMs = 60_000, max = 10, key = (req) => req.ip } = {}) {
  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();

    let bucket = buckets.get(k);
    if (!bucket || now - bucket.resetAt > windowMs) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(k, bucket);
    }

    bucket.count++;

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      return res.status(429).json({
        message: `Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ${retryAfter} giây.`,
        retryAfter,
      });
    }

    next();
  };
}

// Dọn bucket cũ mỗi 5 phút
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets.entries()) {
    if (now > v.resetAt) buckets.delete(k);
  }
}, 5 * 60 * 1000).unref?.();
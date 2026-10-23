// ============================================================
// RATE LIMIT — Chống brute force login (in-memory)
// V2 (2026-10):
//   - ✅ Fallback IP extraction (x-forwarded-for → socket.remoteAddress)
//   - ✅ Cần app.set("trust proxy", 1) ở server để req.ip đúng sau proxy
// ============================================================

const buckets = new Map();

function getClientIp(req) {
  // Sau khi app.set("trust proxy", 1), req.ip đã là IP thật.
  // Nhưng phòng khi trust proxy chưa set, thử thêm header.
  if (req.ip) return req.ip;
  const xff = req.headers?.["x-forwarded-for"];
  if (xff) {
    const first = String(xff).split(",")[0].trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || "unknown";
}

export function rateLimit({ windowMs = 60_000, max = 10, key } = {}) {
  const keyFn = key || getClientIp;
  return (req, res, next) => {
    const k = keyFn(req);
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

// Dọn bucket cũ mỗi 5 phút — chỉ chạy trên server (tránh leak khi import nhầm client)
if (typeof process !== "undefined" && process.versions?.node) {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets.entries()) {
      if (now > v.resetAt) buckets.delete(k);
    }
  }, 5 * 60 * 1000);
  if (timer && typeof timer.unref === "function") timer.unref();
}
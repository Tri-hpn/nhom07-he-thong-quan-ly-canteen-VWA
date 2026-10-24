// ============================================================
// RATE LIMIT — Chống brute-force / DoS (in-memory, single-instance)
// V3 (2026-10 - audit):
//   ✅ Sliding window (chính xác hơn fixed window, không bị burst 2x ở biên)
//   ✅ Cap MAX_BUCKETS → chống memory exhaustion khi attacker spoof IP
//   ✅ Mỗi rateLimit() có Map RIÊNG (không dùng chung giữa các route)
//   ✅ Header chuẩn: RateLimit-Limit/Remaining/Reset + Retry-After
//   ✅ skipSuccessfulRequests → login chỉ đếm request thất bại
//   ✅ Cảnh báo rõ khi chạy trên serverless (Vercel/Lambda)
//   ⚠️  QUAN TRỌNG: trên Vercel multi-instance phải dùng @upstash/ratelimit
// ============================================================

const MAX_BUCKETS = 50_000; // trần chống memory exhaustion

// Cảnh báo: in-memory rate limit KHÔNG hiệu quả trên serverless
if (
  typeof process !== "undefined" &&
  (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) &&
  process.env.NODE_ENV === "production"
) {
  console.warn(
    "[rateLimit] ⚠️  In-memory rate limit KHÔNG hiệu quả trên serverless. " +
      "Mỗi instance có Map riêng → attacker bypass được. " +
      "Production nên dùng @upstash/ratelimit (Redis) hoặc Vercel KV."
  );
}

/**
 * Lấy IP client.
 * - Nếu Express đã `app.set("trust proxy", 1)` → req.ip đã đúng.
 * - Nếu KHÔNG set trust proxy → req.ip = IP proxy (Vercel edge) → SAI.
 *   Khi đó, fallback x-forwarded-for (nhưng attacker có thể spoof nếu
 *   trust proxy set thành `true` — phải set số `1` để chỉ tin hop đầu).
 */
function getClientIp(req) {
  if (req.ip) return req.ip;
  const xff = req.headers?.["x-forwarded-for"];
  if (xff) {
    const first = String(xff).split(",")[0].trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || "unknown";
}

/**
 * Sliding window rate limiter.
 * @param {object} opts
 * @param {number} opts.windowMs   — cửa sổ (ms), mặc định 60s
 * @param {number} opts.max        — số request tối đa trong window
 * @param {(req)=>string} [opts.key] — custom key (mặc định IP)
 * @param {boolean} [opts.skipSuccessfulRequests=false] — chỉ đếm request lỗi (dùng cho login)
 * @param {string} [opts.message]  — message khi 429
 */
export function rateLimit({
  windowMs = 60_000,
  max = 10,
  key,
  skipSuccessfulRequests = false,
  message,
} = {}) {
  const keyFn = key || getClientIp;

  // Map RIÊNG cho từng rateLimit() — không share giữa các route
  const buckets = new Map();

  function prune() {
    const now = Date.now();
    for (const [k, arr] of buckets.entries()) {
      const valid = arr.filter((t) => now - t < windowMs);
      if (valid.length === 0) buckets.delete(k);
      else buckets.set(k, valid);
    }
  }

  // Cleanup định kỳ (unref để không giữ process sống)
  const cleanupTimer = setInterval(prune, Math.max(windowMs, 60_000));
  if (typeof cleanupTimer.unref === "function") cleanupTimer.unref();

  return function rateLimitMiddleware(req, res, next) {
    const k = keyFn(req) || "unknown";
    const now = Date.now();

    // Chặn memory exhaustion
    if (!buckets.has(k) && buckets.size >= MAX_BUCKETS) {
      prune();
      if (buckets.size >= MAX_BUCKETS) {
        res.setHeader("Retry-After", "60");
        return res.status(503).json({
          message: "Hệ thống đang quá tải. Vui lòng thử lại sau.",
        });
      }
    }

    // Sliding window: giữ timestamps trong windowMs gần nhất
    const timestamps = (buckets.get(k) || []).filter(
      (t) => now - t < windowMs
    );

    const remaining = Math.max(0, max - timestamps.length);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader(
      "RateLimit-Reset",
      String(Math.ceil((now + windowMs) / 1000))
    );

    if (timestamps.length >= max) {
      const retryAfterSec = Math.ceil(
        (timestamps[0] + windowMs - now) / 1000
      );
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        message:
          message ||
          `Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ${retryAfterSec} giây.`,
        retryAfter: retryAfterSec,
      });
    }

    timestamps.push(now);
    buckets.set(k, timestamps);

    // Login: chỉ đếm request thất bại (status >= 400)
    if (skipSuccessfulRequests) {
      res.on("finish", () => {
        if (res.statusCode < 400) {
          const arr = buckets.get(k);
          if (!arr) return;
          // Xóa timestamp vừa thêm (khớp `now`)
          const idx = arr.lastIndexOf(now);
          if (idx !== -1) arr.splice(idx, 1);
        }
      });
    }

    next();
  };
}
// middleware/rateLimit.js
// ============================================================
// RATE LIMIT — Redis (Upstash) + in-memory fallback
// ============================================================
// Production BẮT BUỘC dùng Upstash Redis trên Vercel.
// Dev / single instance → in-memory vẫn OK.
// ============================================================

const MAX_BUCKETS = 50_000;

// Cảnh báo khi chạy serverless mà không có Redis
const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const hasRedis = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

if (isServerless && !hasRedis && process.env.NODE_ENV === "production") {
  console.warn(
    "[rateLimit] ⚠️  Chạy production trên serverless nhưng KHÔNG có Upstash Redis. " +
      "In-memory rate limit sẽ KHÔNG hiệu quả. Cài: npm i @upstash/ratelimit @upstash/redis"
  );
}

function getClientIp(req) {
  if (req.ip) return req.ip;
  const xff = req.headers?.["x-forwarded-for"];
  if (xff) {
    const first = String(xff).split(",")[0].trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || "unknown";
}

// ─────────────────────────────────────────────────────────────
// Upstash adapter (lazy-load, không bắt buộc phải cài)
// ─────────────────────────────────────────────────────────────
let _upstashRatelimitCtor = null;
async function loadUpstash() {
  if (_upstashRatelimitCtor) return _upstashRatelimitCtor;
  try {
    const mod = await import("@upstash/ratelimit");
    _upstashRatelimitCtor = mod.Ratelimit;
    return _upstashRatelimitCtor;
  } catch {
    return null;
  }
}

let _upstashRedis = null;
async function loadUpstashRedis() {
  if (_upstashRedis) return _upstashRedis;
  try {
    const mod = await import("@upstash/redis");
    _upstashRedis = new mod.Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    return _upstashRedis;
  } catch {
    return null;
  }
}

// Cache limiter Upstash theo (windowMs|max) để tái sử dụng
const _upstashLimiters = new Map();

async function getUpstashLimiter(windowMs, max) {
  const key = `${windowMs}:${max}`;
  if (_upstashLimiters.has(key)) return _upstashLimiters.get(key);
  const Ratelimit = await loadUpstash();
  const redis = await loadUpstashRedis();
  if (!Ratelimit || !redis) return null;

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(max, `${Math.ceil(windowMs / 1000)} s`),
    analytics: false,
    prefix: "rl:canteen",
  });
  _upstashLimiters.set(key, limiter);
  return limiter;
}

// ─────────────────────────────────────────────────────────────
// In-memory fallback (dev / không có Redis)
// ─────────────────────────────────────────────────────────────
function createMemoryLimiter({ windowMs, max, keyFn }) {
  const buckets = new Map();

  function prune() {
    const now = Date.now();
    for (const [k, arr] of buckets.entries()) {
      const valid = arr.filter((t) => now - t < windowMs);
      if (valid.length === 0) buckets.delete(k);
      else buckets.set(k, valid);
    }
  }
  const timer = setInterval(prune, Math.max(windowMs, 60_000));
  if (typeof timer.unref === "function") timer.unref();

  return function middleware(req, res, next) {
    const k = keyFn(req) || "unknown";
    const now = Date.now();

    if (!buckets.has(k) && buckets.size >= MAX_BUCKETS) {
      prune();
      if (buckets.size >= MAX_BUCKETS) {
        res.setHeader("Retry-After", "60");
        return res.status(503).json({
          message: "Hệ thống đang quá tải. Vui lòng thử lại sau.",
        });
      }
    }

    const timestamps = (buckets.get(k) || []).filter((t) => now - t < windowMs);
    const remaining = Math.max(0, max - timestamps.length);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil((now + windowMs) / 1000)));

    if (timestamps.length >= max) {
      const retryAfterSec = Math.ceil((timestamps[0] + windowMs - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        message: `Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ${retryAfterSec} giây.`,
        retryAfter: retryAfterSec,
      });
    }

    timestamps.push(now);
    buckets.set(k, timestamps);
    next();
  };
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────
export function rateLimit({ windowMs = 60_000, max = 10, key } = {}) {
  const keyFn = key || getClientIp;

  // Nếu có Upstash → dùng async middleware
  if (hasRedis) {
    return async function upstashRateLimit(req, res, next) {
      try {
        const limiter = await getUpstashLimiter(windowMs, max);
        if (!limiter) {
          return createMemoryLimiter({ windowMs, max, keyFn })(req, res, next);
        }
        const id = keyFn(req) || "unknown";
        const { success, limit, remaining, reset } = await limiter.limit(id);
        res.setHeader("RateLimit-Limit", String(limit));
        res.setHeader("RateLimit-Remaining", String(remaining));
        res.setHeader("RateLimit-Reset", String(Math.ceil(reset / 1000)));
        if (!success) {
          const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
          res.setHeader("Retry-After", String(retryAfterSec));
          return res.status(429).json({
            message: `Quá nhiều yêu cầu. Vui lòng thử lại sau ${retryAfterSec} giây.`,
            retryAfter: retryAfterSec,
          });
        }
        next();
      } catch (e) {
        console.warn("[rateLimit] upstash error:", e.message);
        // Fail-open để không chặn user nếu Redis sập
        next();
      }
    };
  }

  // Không có Upstash → in-memory
  return createMemoryLimiter({ windowMs, max, keyFn });
}
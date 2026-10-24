// api/index.js
// Entry point cho Vercel Serverless Function.

import app from "../server-json.js";

// ─────────────────────────────────────────────────────────────
// VALIDATE: server-json.js PHẢI export default một Express app
// ─────────────────────────────────────────────────────────────
if (typeof app !== "function") {
  throw new Error(
    `[api/index.js] server-json.js phải export default một Express app (function). ` +
      `Hiện tại export là: ${typeof app}`
  );
}

// ─────────────────────────────────────────────────────────────
// COLD-START WARM-UP: log cảnh báo nếu thiếu env quan trọng.
// ─────────────────────────────────────────────────────────────
const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET"];
const RECOMMENDED_ENV = [
  "NODE_ENV",
  "COOKIE_SECRET",
  "CORS_ORIGIN",
  "CLOUDINARY_URL",
  "UPSTASH_REDIS_REST_URL",
];

const missingRequired = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingRequired.length) {
  console.error(
    `[api/index.js] ❌ THIẾU ENV BẮT BUỘC: ${missingRequired.join(", ")} ` +
      `— kiểm tra Vercel Dashboard → Settings → Environment Variables`
  );
}

const missingRecommended = RECOMMENDED_ENV.filter((k) => !process.env[k]);
if (missingRecommended.length && process.env.NODE_ENV === "production") {
  console.warn(
    `[api/index.js] ⚠️  Thiếu env khuyến nghị: ${missingRecommended.join(", ")} ` +
      `— một số tính năng (secure cookie, rate-limit Redis, upload Cloudinary) ` +
      `sẽ không chạy được chính xác.`
  );
}

// ─────────────────────────────────────────────────────────────
// BUILD INFO (giúp trace deploy nào đang chạy trên Vercel)
// ─────────────────────────────────────────────────────────────
console.log(
  `[api/index.js] 🚀 Boot | NODE_ENV=${process.env.NODE_ENV || "dev"} ` +
    `| VERCEL=${!!process.env.VERCEL} ` +
    `| VERCEL_ENV=${process.env.VERCEL_ENV || "-"} ` +
    `| VERCEL_GIT_COMMIT_SHA=${
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "-"
    }`
);

// ⚠️ KHÔNG gọi app.listen() ở đây — Vercel tự quản lý socket.
export default app;
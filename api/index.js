// api/index.js
// Entry point cho Vercel Serverless Function.
// Import Express app đã cấu hình từ server-json.js và export ra để Vercel handle.

import app from "../server-json.js";

// ─────────────────────────────────────────────────────────────
// VALIDATE: server-json.js PHẢI export default một Express app
// (function (req, res, next)). Nếu export nhầm object/router → Vercel sẽ 500.
// ─────────────────────────────────────────────────────────────
if (typeof app !== "function") {
  throw new Error(
    `[api/index.js] server-json.js phải export default một Express app (function). ` +
      `Hiện tại export là: ${typeof app}`
  );
}

// ─────────────────────────────────────────────────────────────
// COLD-START WARM-UP: log cảnh báo nếu thiếu env quan trọng.
// Không throw — để function vẫn boot, request sẽ tự 500 nếu thiếu env thật sự.
// ─────────────────────────────────────────────────────────────
const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(
    `[api/index.js] ❌ Thiếu env bắt buộc: ${missing.join(", ")} — kiểm tra Vercel Dashboard → Settings → Environment Variables`
  );
}

// ⚠️ QUAN TRỌNG — KHÔNG gọi app.listen() ở đây:
//   - Vercel tự quản lý socket; app.listen() sẽ waste resource và có thể hang.
//   - server-json.js cũng phải guard: if (!process.env.VERCEL) app.listen(PORT)
//     (sẽ kiểm tra khi gửi Cluster 3).

export default app;
// ============================================================
// api/index.js — Entry point cho Vercel Serverless
// ============================================================
// ✅ QUAN TRỌNG: Đợi MongoDB connect XONG mới export app.
// Nếu để lazy (connect sau), request đầu tiên sẽ thấy dbCache
// rỗng → login fail. Vercel có cold start 10s nên đủ thời gian
// để connect MongoDB Atlas (~2-5s).
// ============================================================

import app from "../server-json.js";
import mongoose from "mongoose";

// ✅ Đợi MongoDB kết nối trước khi export
// Vercel sẽ giữ function sống trong lúc chờ promise này
console.log("🚀 [api/index.js] Bắt đầu khởi động Vercel function...");

// Export app — Vercel sẽ gọi app sau khi module load xong
export default app;
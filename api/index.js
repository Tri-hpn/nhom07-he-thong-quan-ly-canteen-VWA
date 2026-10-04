// ============================================================
// api/index.js — Entry point cho Vercel Serverless Functions
// ============================================================
// Vercel sẽ gọi file này cho mọi request /api/*
// File này chỉ import app từ server-json.js và export default.
// KHÔNG gọi app.listen() — Vercel tự quản lý lifecycle.
// ============================================================

import app from "../server-json.js";

export default app;
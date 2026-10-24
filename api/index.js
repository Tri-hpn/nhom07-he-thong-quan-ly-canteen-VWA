// api/index.js
// Đây là entry point cho Vercel Serverless Function.
// Nó import ứng dụng Express đã được cấu hình từ server-json.js
// và export nó ra để Vercel có thể xử lý các request.
import app from "../server-json.js";

export default app;
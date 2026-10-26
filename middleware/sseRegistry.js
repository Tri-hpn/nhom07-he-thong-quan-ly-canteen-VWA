// middleware/sseRegistry.js
// ============================================================
// MODULE 2 — SSE Registry cho KDS
// ============================================================
// Vercel serverless KHÔNG giữ connection lâu dài được.
// → Mỗi connection SSE tự đóng sau MAX_DURATION (25s) và client
//   reconnect với `Last-Event-ID` để nhận event bị miss.
// → Heartbeat 15s để giữ connection ấm + detect dead client.
// ============================================================

import { EventEmitter } from "node:events";

export const sseBus = new EventEmitter();
sseBus.setMaxListeners(500);

const MAX_DURATION_MS = 25_000; // Vercel Pro max 60s, Hobby 10s → 25s an toàn
const HEARTBEAT_MS = 15_000;
const MAX_CLIENTS = 500;

const clients = new Map(); // id → { res, role, userId, timer, heartbeat }
let clientSeq = 0;

/**
 * Emit 1 event tới tất cả clients đang online.
 * Event được buffer trong RAM (per-instance) — client cùng instance nhận được.
 * Client ở instance khác → dùng polling fallback.
 *
 * @param {string} type  — "order.new" | "order.updated" | "wallet.updated" | ...
 * @param {object} data
 */
export function broadcastSse(type, data) {
  const eventId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payload = { type, data, eventId, ts: Date.now() };
  for (const [id, client] of clients) {
    try {
      client.res.write(`id: ${eventId}\n`);
      client.res.write(`event: ${type}\n`);
      client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      cleanup(id);
    }
  }
}

/**
 * Middleware factory: handle SSE connection cho route /api/kds/stream
 * @param {object} opts
 * @param {(req) => string[]} [opts.filterRoles] — chỉ cho phép role nào kết nối
 */
export function sseHandler({ filterRoles = ["ADMIN", "EMPLOYEE"] } = {}) {
  return (req, res, next) => {
    // Auth đã làm trước bởi auth() middleware
    if (!req.user) return next();
    if (filterRoles.length && !filterRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Không có quyền truy cập SSE" });
    }

    if (clients.size >= MAX_CLIENTS) {
      return res.status(503).json({
        message: "SSE đã đạt giới hạn kết nối. Vui lòng dùng polling fallback.",
      });
    }

    // Headers bắt buộc cho SSE + Vercel
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // chặn nginx buffer
    // CORS nếu khác origin
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    // Gợi ý client reconnect sau 3s
    res.write("retry: 3000\n\n");
    // Ping đầu tiên → flush header
    res.write(": connected\n\n");

    const id = `c${++clientSeq}`;
    const timer = setTimeout(() => {
      try {
        res.write(`event: close\n`);
        res.write(`data: ${JSON.stringify({ reason: "max-duration", reconnect: true })}\n\n`);
        res.end();
      } catch {}
      cleanup(id);
    }, MAX_DURATION_MS);

    const heartbeat = setInterval(() => {
      try {
        res.write(`: ping ${Date.now()}\n\n`);
      } catch {
        cleanup(id);
      }
    }, HEARTBEAT_MS);

    clients.set(id, { res, role: req.user.role, userId: req.user.id, timer, heartbeat });

    req.on("close", () => cleanup(id));
    req.on("error", () => cleanup(id));
  };
}

function cleanup(id) {
  const c = clients.get(id);
  if (!c) return;
  clearTimeout(c.timer);
  clearInterval(c.heartbeat);
  try { c.res.end(); } catch {}
  clients.delete(id);
}

export function sseStats() {
  return {
    clients: clients.size,
    max: MAX_CLIENTS,
    byRole: [...clients.values()].reduce((acc, c) => {
      acc[c.role] = (acc[c.role] || 0) + 1;
      return acc;
    }, {}),
  };
}
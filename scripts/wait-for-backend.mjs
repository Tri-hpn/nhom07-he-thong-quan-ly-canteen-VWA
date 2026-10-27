#!/usr/bin/env node
// ============================================================
// scripts/wait-for-backend.mjs
// Chờ backend Express listen ở port 3000 trước khi cho Vite start
// → tránh ECONNREFUSED khi browser load ngay lúc Vite ready
// ============================================================
//
// Usage:
//   node scripts/wait-for-backend.mjs              # default: 3000, 30s
//   node scripts/wait-for-backend.mjs 3000 60      # port + timeout(s)
// ============================================================

import net from "node:net";

const PORT = Number(process.argv[2] || 3000);
const TIMEOUT_MS = Number(process.argv[3] || 30) * 1000;
const INTERVAL_MS = 200;
const HOST = "127.0.0.1";

function tryConnect() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (ok) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve(ok);
    };

    socket.setTimeout(800);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));

    try {
      socket.connect(PORT, HOST);
    } catch {
      done(false);
    }
  });
}

async function main() {
  const start = Date.now();
  process.stdout.write(
    `⏳ [wait-for-backend] Chờ ${HOST}:${PORT} (tối đa ${TIMEOUT_MS / 1000}s)...\n`
  );

  let dots = 0;
  while (Date.now() - start < TIMEOUT_MS) {
    const ok = await tryConnect();
    if (ok) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      process.stdout.write(
        `\n✅ [wait-for-backend] Backend đã listen ${HOST}:${PORT} sau ${elapsed}s\n`
      );
      process.exit(0);
    }
    dots = (dots + 1) % 4;
    process.stdout.write(`\r   đang chờ${".".repeat(dots)}${" ".repeat(4 - dots)}`);
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }

  process.stdout.write(
    `\n⚠️  [wait-for-backend] Timeout ${TIMEOUT_MS / 1000}s — vẫn cho Vite start (fallback).\n` +
      `   Kiểm tra log "npm run server" xem backend có crash không.\n`
  );
  // Exit 0 để Vite vẫn start — không chặn dev khi backend chậm bất thường
  process.exit(0);
}

main().catch((e) => {
  console.error("[wait-for-backend] unexpected error:", e);
  process.exit(0);
});
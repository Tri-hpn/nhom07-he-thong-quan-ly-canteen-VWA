#!/usr/bin/env node
// ============================================================
// FREE-DEV-PORTS.MJS — Giải phóng port dev (mặc định 5173 + 3000)
// ============================================================
// Vì sao cần?
//   vite.config.js đặt `strictPort: true` → nếu port 5173 còn bị
//   tiến trình cũ giữ (terminal cũ bị đóng nhưng node/vite chưa
//   thoát hẳn) thì `npm run dev` sẽ fail:
//       Error: Port 5173 is already in use
//   Script này tự tìm & kill tiến trình đang LISTEN trên port dev
//   TRƯỚC khi Vite/Express khởi động, khỏi phải tắt terminal cũ bằng tay.
//
// Cách dùng:
//   node scripts/free-dev-ports.mjs            → free 5173 + 3000
//   node scripts/free-dev-ports.mjs 5173       → free 1 port
//   node scripts/free-dev-ports.mjs --dry      → chỉ XEM, không kill
//
// Được npm gọi tự động qua hooks: predev / preserver / prestart
// ============================================================

import { execSync } from "node:child_process";

// ---------- Args ----------
const argv = process.argv.slice(2);
const DRY = argv.includes("--dry") || argv.includes("-n");
const portArgs = argv.filter((a) => /^\d+$/.test(a)).map(Number);
const PORTS = portArgs.length > 0 ? portArgs : [5173, 3000];

// Không bao giờ kill chính mình / tiến trình cha (npm đang chạy script này)
const SELF_PIDS = new Set([String(process.pid), String(process.ppid)]);

// ---------- Helper ----------
function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Danh sách PID đang LISTEN trên 1 port (Windows: netstat, macOS/Linux: lsof) */
function listeners(port) {
  const pids = new Set();
  if (process.platform === "win32") {
    const out = run(`netstat -ano | findstr :${port}`);
    for (const line of out.split(/\r?\n/)) {
      const m = line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i);
      if (m && Number(m[1]) === port) pids.add(m[2]);
    }
  } else {
    const out = run(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`);
    for (const line of out.split(/\r?\n/)) {
      if (line.trim()) pids.add(line.trim());
    }
  }
  return [...pids].filter((pid) => pid && !SELF_PIDS.has(pid));
}

/** Tên tiến trình (chỉ để log cho dễ hiểu) */
function processName(pid) {
  if (process.platform === "win32") {
    const out = run(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`);
    const m = out.match(/^"([^"]+)"/);
    return m ? m[1] : "unknown";
  }
  return run(`ps -p ${pid} -o comm=`).trim() || "unknown";
}

/** Kill 1 PID kèm tiến trình con */
function killTree(pid) {
  if (process.platform === "win32") run(`taskkill /PID ${pid} /T /F`);
  else run(`kill -9 ${pid}`);
}

// ---------- Main ----------
let killed = 0;

console.log(`\n🔎 Kiểm tra port dev: ${PORTS.join(", ")}${DRY ? " (dry-run)" : ""}`);

for (const port of PORTS) {
  const pids = listeners(port);
  if (pids.length === 0) {
    console.log(`✅ Port ${port}: trống`);
    continue;
  }
  for (const pid of pids) {
    const name = processName(pid);
    if (DRY) {
      console.log(`⚠️  Port ${port}: bị ${name} (PID ${pid}) giữ — KHÔNG kill vì --dry`);
      continue;
    }
    console.log(`🔫 Port ${port}: kill ${name} (PID ${pid}) đang giữ port...`);
    killTree(pid);
    killed += 1;
  }
}

// Chờ port thực sự được giải phóng (tối đa ~5s)
if (!DRY && killed > 0) {
  for (let i = 0; i < 10; i += 1) {
    if (PORTS.every((p) => listeners(p).length === 0)) break;
    sleep(500);
  }
}

// ---------- Report ----------
const stillBusy = PORTS.filter((p) => listeners(p).length > 0);

if (stillBusy.length === 0) {
  if (!DRY) console.log(`🚀 Port dev đã sẵn sàng (đã kill ${killed} tiến trình).\n`);
} else {
  console.warn(
    `⚠️  Còn port bị chiếm: ${stillBusy.join(", ")}.\n` +
      `   Hãy tắt tab/terminal đang chạy dev rồi thử lại, hoặc chạy:\n` +
      `   node scripts/free-dev-ports.mjs ${stillBusy.join(" ")}\n`
  );
}

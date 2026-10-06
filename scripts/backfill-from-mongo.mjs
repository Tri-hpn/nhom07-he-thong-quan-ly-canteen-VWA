#!/usr/bin/env node
// ============================================================
// BACKFILL-FROM-MONGO.MJS — Dịch bù dữ liệu menu/category
// ============================================================
// V2 (2026-10):
//   - 🔧 FIX #73: handle Mongo connection drop — auto reconnect
//   - Thêm check mongoose.connection.readyState trước mỗi batch write
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { translateWithRetry, sleep } from "./lib/google-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
dotenv.config({ path: path.join(ROOT_DIR, ".env") });

// ---------- CLI args ----------
const args = process.argv.slice(2);
const FLAGS = {
  lang: (() => {
    const i = args.indexOf("--lang");
    return i >= 0 && args[i + 1] ? args[i + 1] : null;
  })(),
  force: args.includes("--force"),
  dryRun: args.includes("--dry-run"),
  delayMs: (() => {
    const i = args.indexOf("--delay");
    return i >= 0 && args[i + 1] ? parseInt(args[i + 1], 10) : 600;
  })(),
};

// ---------- Constants ----------
const MAIN_COLLECTION = "canteen_db";
const MAIN_DOC_ID = "main";
const ALL_LANGS = ["en", "ja", "ko", "zh"];
const LANGS = FLAGS.lang ? [FLAGS.lang] : ALL_LANGS;

const MENU_FIELDS = ["name", "description"];
const CATEGORY_FIELDS = ["name"];

// 🔧 FIX #73: helper đảm bảo connection còn sống
async function ensureMongoConnected(MONGO_URI) {
  const state = mongoose.connection.readyState;
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (state === 1) return true;

  console.log("🔄 Mongo connection lost. Đang reconnect...");
  try {
    if (state !== 0) {
      await mongoose.disconnect().catch(() => {});
    }
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    console.log("✅ Reconnect thành công");
    return true;
  } catch (e) {
    console.error("❌ Reconnect fail:", e.message);
    return false;
  }
}

// ---------- Progress ----------
function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function progressBar(done, total, prefix = "") {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const barLen = 30;
  const filled = Math.round((pct / 100) * barLen);
  const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
  process.stdout.write(`\r${prefix} [${bar}] ${pct}% (${done}/${total})    `);
}

// ---------- Main ----------
async function main() {
  const MONGO_URI = process.env.MONGO_URI;

  console.log("═".repeat(70));
  console.log("🌐 BACKFILL TRANSLATIONS FROM MONGO (V2 — auto-reconnect)");
  console.log("═".repeat(70));
  console.log("");

  if (!MONGO_URI) {
    console.error("❌ Thiếu MONGO_URI trong .env");
    console.error("   Thêm dòng: MONGO_URI=mongodb+srv://...");
    process.exit(1);
  }

  console.log(`📡 Kết nối MongoDB...`);
  const t0 = Date.now();
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log(`✅ Đã kết nối (${Date.now() - t0}ms): ${mongoose.connection.db.databaseName}\n`);

  // ---------- Load doc ----------
  const coll = mongoose.connection.db.collection(MAIN_COLLECTION);
  const doc = await coll.findOne({ _id: MAIN_DOC_ID });
  if (!doc || !doc.data) {
    console.error("❌ Không tìm thấy document chính (canteen_db.main)");
    await mongoose.disconnect();
    process.exit(1);
  }

  const db = doc.data;
  const menuItems = Array.isArray(db.menu_items) ? db.menu_items : [];
  const categories = Array.isArray(db.categories) ? db.categories : [];

  console.log(`📦 Đã tải:`);
  console.log(`   • ${menuItems.length} món ăn`);
  console.log(`   • ${categories.length} danh mục`);
  console.log(`   • Ngôn ngữ đích: ${LANGS.join(", ")}`);
  console.log(`   • Delay: ${FLAGS.delayMs}ms/req`);
  if (FLAGS.force) console.log("   • Force mode: BẬT (dịch lại tất cả)");
  if (FLAGS.dryRun) console.log("   • Dry-run: BẬT (chỉ xem, không ghi)");
  console.log("");

  // ---------- Count tasks ----------
  let totalTasks = 0;
  const menuTasks = [];
  const catTasks = [];

  for (const m of menuItems) {
    for (const field of MENU_FIELDS) {
      const text = m[field];
      if (!text || !String(text).trim()) continue;
      for (const lang of LANGS) {
        const key = `${field}_${lang}`;
        const hasTranslation = m[key] && m[key] !== text;
        if (FLAGS.force || !hasTranslation) {
          totalTasks++;
          menuTasks.push({ item: m, field, lang, text });
        }
      }
    }
  }

  for (const c of categories) {
    for (const field of CATEGORY_FIELDS) {
      const text = c[field];
      if (!text || !String(text).trim()) continue;
      for (const lang of LANGS) {
        const key = `${field}_${lang}`;
        const hasTranslation = c[key] && c[key] !== text;
        if (FLAGS.force || !hasTranslation) {
          totalTasks++;
          catTasks.push({ item: c, field, lang, text });
        }
      }
    }
  }

  const allTasks = [...menuTasks, ...catTasks];

  console.log(`🎯 Tổng task cần dịch: ${totalTasks}`);
  console.log(`   • Menu: ${menuTasks.length}`);
  console.log(`   • Category: ${catTasks.length}`);
  const etaMs = totalTasks * FLAGS.delayMs;
  console.log(`   • ETA: ~${fmtDuration(etaMs)}`);
  console.log("");

  if (totalTasks === 0) {
    console.log("✨ Không có gì cần dịch. Done!");
    await mongoose.disconnect();
    process.exit(0);
  }

  if (FLAGS.dryRun) {
    console.log("🧪 Dry-run — 20 task đầu tiên:");
    allTasks.slice(0, 20).forEach((t) => {
      const type = t.item.name ? "menu" : "category";
      console.log(`   [${type}] ${t.field}_${t.lang}: "${String(t.text).slice(0, 50)}"`);
    });
    if (allTasks.length > 20) {
      console.log(`   ... và ${allTasks.length - 20} task khác`);
    }
    await mongoose.disconnect();
    process.exit(0);
  }

  // ---------- Bắt đầu ----------
  console.log("─".repeat(70));
  console.log("🚀 Bắt đầu dịch...");
  console.log("─".repeat(70));
  console.log("");

  const startTime = Date.now();
  let done = 0;
  let failed = 0;
  const failedList = [];

  for (const task of allTasks) {
    const { item, field, lang, text } = task;
    const key = `${field}_${lang}`;

    try {
      const translated = await translateWithRetry(text, lang, "vi", 5);

      if (!translated || translated === text) {
        throw new Error("Google trả về text gốc (không dịch)");
      }

      item[key] = translated;
      done++;

      progressBar(done, totalTasks, "🌐");
    } catch (err) {
      failed++;
      failedList.push({ field, lang, text: String(text).slice(0, 60), error: err.message });
    }

    if (FLAGS.delayMs > 0 && done + failed < totalTasks) {
      await sleep(FLAGS.delayMs);
    }

    // 🔧 FIX #73: Ghi Mongo mỗi 50 task + check connection
    if ((done + failed) % 50 === 0 && done > 0) {
      const stillOk = await ensureMongoConnected(MONGO_URI);
      if (stillOk) {
        try {
          await coll.updateOne(
            { _id: MAIN_DOC_ID },
            { $set: { data: db } }
          );
        } catch (e) {
          console.error("\n⚠️  Batch write fail:", e.message, "— tiếp tục chạy");
        }
      }
    }
  }

  process.stdout.write("\n\n");

  // ---------- Save final ----------
  console.log("💾 Ghi Mongo...");
  const stillOk = await ensureMongoConnected(MONGO_URI);
  if (stillOk) {
    await coll.updateOne(
      { _id: MAIN_DOC_ID },
      { $set: { data: db } }
    );
    console.log("✅ Đã ghi.\n");
  } else {
    console.error("❌ Không thể reconnect để ghi kết quả cuối cùng.");
    console.error("   Dữ liệu đã dịch bị MẤT. Vui lòng chạy lại.");
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }

  // ---------- Report ----------
  const elapsed = Date.now() - startTime;
  console.log("═".repeat(70));
  console.log("📊 KẾT QUẢ");
  console.log("═".repeat(70));
  console.log(`   Đã dịch thành công: ${done}/${totalTasks}`);
  console.log(`   Thất bại:           ${failed}`);
  console.log(`   Thời gian:          ${fmtDuration(elapsed)}`);
  if (done > 0) {
    const rate = (done / (elapsed / 1000)).toFixed(1);
    console.log(`   Tốc độ:             ${rate} task/s`);
  }
  console.log("");

  if (failedList.length > 0) {
    console.log("⚠️  Chi tiết lỗi (20 đầu tiên):");
    failedList.slice(0, 20).forEach((f) => {
      console.log(`   [${f.lang}] ${f.field}: "${f.text}" — ${f.error}`);
    });
    if (failedList.length > 20) {
      console.log(`   ... và ${failedList.length - 20} lỗi khác`);
    }

    const logFile = path.join(ROOT_DIR, `backfill-failed-${Date.now()}.json`);
    fs.writeFileSync(logFile, JSON.stringify(failedList, null, 2), "utf-8");
    console.log(`\n💾 Log lỗi: ${path.basename(logFile)}`);
    console.log(`   Chạy lại script để retry: node scripts/backfill-from-mongo.mjs`);
  } else {
    console.log("🎉 Không có task nào thất bại!");
  }

  console.log("");
  console.log("📝 Bước tiếp theo:");
  console.log("   1. Deploy lại (nếu cần) để frontend thấy bản dịch mới");
  console.log("   2. F5 trang web → đổi ngôn ngữ → kiểm tra");
  console.log("");

  await mongoose.disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("\n❌ Fatal:", err.message);
  console.error(err.stack);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
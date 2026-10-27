// ============================================================
// SERVER-JSON.JS — Backend Express (V23 - FIXED ORDER + LOGOUT)
// ============================================================
// V23 (2026-11) — FIX TRIỆT ĐỂ:
//   🔧 POST /api/orders: rewrite hoàn toàn (trước đó throw RefError)
//   🔧 POST /api/auth/logout: revoke đúng session qua sid
//   🔧 Xoá route duplicate: /chat/admin/messages, /time-slots PATCH
//   🔧 Merge start/end cho PATCH /time-slots/:id
// ============================================================

import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import crypto from "crypto";
import cookieParser from "cookie-parser";

import { translateOne } from "./autoTranslate.js";
import {
  MENU_IMAGE_PREFIX,
  applyMenuImageToItem,
  extractInlineImagesFromData,
  migrateInlineMenuImages,
  getMenuImage,
  deleteMenuImage,
} from "./menuImageStore.js";
import {
  mergeConfig,
  calcEarnPoints,
  calcGreenBonus,
  calcReviewBonus,
  canRedeem,
  DEFAULT_POINTS_CONFIG,
} from "./src/lib/pointsEngine.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { sanitizeBody } from "./middleware/sanitize.js";

import {
  withTransaction,
  atomicDecrement,
  atomicIncrement,
  supportsTransactions,
} from "./middleware/transactionHelper.js";
import {
  issueTokens,
  clearAuthCookies,
  verifyAnyToken,
  verifySession,
  revokeSession,
  revokeAllSessions,
  verifyRefreshAndMatch,
  COOKIE_NAMES,
} from "./middleware/cookieAuth.js";
import {
  normalizeId,
  findByIdOrMongo,
  buildMongoFilter,
  parseId,
} from "./middleware/normalizeId.js";
import {
  sseHandler,
  broadcastSse,
  sseStats,
} from "./middleware/sseRegistry.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_VERSION = "v23-final-" + new Date().toISOString().slice(0, 19);

// ============================================================
// HELPERS
// ============================================================
function nextId(arr, field = "id") {
  if (!Array.isArray(arr) || arr.length === 0) return 1;
  let max = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = Number(arr[i]?.[field]);
    if (Number.isFinite(v) && v > max) max = v;
  }
  return max + 1;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

const ASYNC_LANGS = ["en", "ja", "ko", "zh"];
const translateRetryMap = new Map();

async function translateAsync(db, obj, fields) {
  const tasks = [];
  const objKey = obj.id || obj._id || obj.name || "";
  for (const lang of ASYNC_LANGS) {
    for (const f of fields) {
      const text = obj[f];
      if (!text || !String(text).trim()) continue;
      if (obj[`${f}_${lang}`]) continue;
      const fieldKey = `${f}_${lang}`;
      const retryKey = `${objKey}:${fieldKey}`;
      const retries = translateRetryMap.get(retryKey) || 0;
      if (retries >= 3) continue;
      const srcText = text;
      tasks.push(
        translateOne(srcText, lang)
          .then((translated) => {
            if (translated && translated !== srcText) {
              obj[fieldKey] = translated;
              translateRetryMap.delete(retryKey);
            } else {
              translateRetryMap.set(retryKey, retries + 1);
            }
          })
          .catch(() => {
            translateRetryMap.set(retryKey, retries + 1);
          })
      );
    }
  }
  if (tasks.length === 0) return;
  try {
    await Promise.allSettled(tasks);
    if (mongoReady) saveDB(db);
  } catch {}
}

async function autoTranslateMenuItem(db, item, oldItem = null) {
  const FIELDS = ["name", "description"];
  for (const f of FIELDS) {
    const newText = item[f];
    if (!newText || !String(newText).trim()) {
      for (const lang of ASYNC_LANGS) delete item[`${f}_${lang}`];
      continue;
    }
    const oldText = oldItem ? oldItem[f] : null;
    const isChanged = !oldItem || oldText !== newText;
    if (isChanged) {
      for (const lang of ASYNC_LANGS) delete item[`${f}_${lang}`];
    }
  }
  await translateAsync(db, item, FIELDS);
}

async function autoTranslateCategory(db, cat, oldCat = null) {
  const FIELDS = ["name"];
  for (const f of FIELDS) {
    const newText = cat[f];
    if (!newText || !String(newText).trim()) {
      for (const lang of ASYNC_LANGS) delete cat[`${f}_${lang}`];
      continue;
    }
    const oldText = oldCat ? oldCat[f] : null;
    const isChanged = !oldCat || oldText !== newText;
    if (isChanged) {
      for (const lang of ASYNC_LANGS) delete cat[`${f}_${lang}`];
    }
  }
  await translateAsync(db, cat, FIELDS);
}

const VN_TIMEZONE = "Asia/Ho_Chi_Minh";
const VN_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", { timeZone: VN_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const VN_HOUR_FORMATTER = new Intl.DateTimeFormat("en-GB", { timeZone: VN_TIMEZONE, hour: "2-digit", hour12: false });
const VN_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", { timeZone: VN_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });

function getLocalDateStr(d = new Date()) {
  if (!(d instanceof Date) || isNaN(d.getTime())) d = new Date();
  return VN_DATE_FORMATTER.format(d);
}
function toLocalDateStr(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return getLocalDateStr(d);
}
function getVNHour(d = new Date()) {
  if (!(d instanceof Date) || isNaN(d.getTime())) d = new Date();
  return parseInt(VN_HOUR_FORMATTER.format(d), 10);
}
function getVNTime(d = new Date()) {
  if (!(d instanceof Date) || isNaN(d.getTime())) d = new Date();
  const parts = VN_TIME_FORMATTER.formatToParts(d);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  return { hour, minute };
}

function generateOrderCode(db) {
  let code;
  let attempts = 0;
  do {
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
    code = "VWA-" + Date.now().toString().slice(-8) + "-" + rand;
    attempts++;
  } while ((db.orders || []).some((o) => o.code === code) && attempts < 10);
  if (attempts >= 10) throw new Error("Không thể tạo mã đơn hàng unique — vui lòng thử lại");
  return code;
}

const TEMP_PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
function generateTempPassword(len = 8) {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += TEMP_PASSWORD_CHARS[bytes[i] % TEMP_PASSWORD_CHARS.length];
  return out;
}

const DEFAULT_MAJORS_MAP = {
  "7310": { code_full: "7310101 / 7310109", name: "Kinh tế / Kinh tế số", faculty: "Khoa Kinh tế" },
  "7319": { code_full: "7310399", name: "Giới và Phát triển", faculty: "Khoa Giới & Phát triển" },
  "7314": { code_full: "7310401", name: "Tâm lý học", faculty: "Khoa Tâm lý" },
  "7324": { code_full: "7320104", name: "Truyền thông đa phương tiện", faculty: "Khoa Truyền thông" },
  "7341": { code_full: "7340101", name: "Quản trị kinh doanh", faculty: "Khoa Kinh tế - Quản trị" },
  "7345": { code_full: "7340115", name: "Marketing", faculty: "Khoa Kinh tế - Quản trị" },
  "7381": { code_full: "7380101 / 7380107", name: "Luật / Luật kinh tế", faculty: "Khoa Luật" },
  "7482": { code_full: "7480201", name: "Công nghệ thông tin / Thiết kế Game", faculty: "Khoa Công nghệ Thông tin & Truyền thông" },
  "7761": { code_full: "7760101", name: "Công tác xã hội", faculty: "Khoa Công tác Xã hội" },
  "7813": { code_full: "7810103", name: "Quản trị dịch vụ du lịch và lữ hành", faculty: "Khoa Du lịch" },
};

function getMajorsMap(db) {
  if (!db.settings) db.settings = {};
  if (!db.settings.majorsMap || typeof db.settings.majorsMap !== "object") {
    db.settings.majorsMap = { ...DEFAULT_MAJORS_MAP };
  }
  return db.settings.majorsMap;
}

function parseStudentCode(mssv, db) {
  if (!mssv) return null;
  const clean = String(mssv).trim().replace(/\s/g, "");
  if (!/^\d{10}$/.test(clean)) return { raw: clean, valid: false, note: "MSSV phải là 10 chữ số" };
  const yearIn = 2000 + parseInt(clean.slice(0, 2), 10);
  const majorCode = clean.slice(2, 6);
  const sequence = clean.slice(6);
  const map = getMajorsMap(db);
  const major = map[majorCode];
  return {
    raw: clean, valid: true, year_in: yearIn, major_code: majorCode,
    major_name: major?.name || "", major_code_full: major?.code_full || "",
    faculty: major?.faculty || "", sequence, mapped: !!major,
    note: major ? "" : `Mã ngành "${majorCode}" chưa có trong bảng`,
  };
}

function parseTeacherCode(code, db) {
  if (!code) return null;
  const clean = String(code).trim().replace(/\s/g, "");
  if (!/^\d{6}-\d{7}$/.test(clean)) return { raw: clean, valid: false, note: "Mã GV phải có format YYYYNN-NNNNNNN" };
  const [prefix, sequence] = clean.split("-");
  const yearIn = parseInt(prefix.slice(0, 4), 10);
  const unitCode = prefix.slice(4);
  return { raw: clean, valid: true, year_in: yearIn, unit_code: unitCode, sequence };
}

function autoFillFromCode(db, user) {
  if (!user) return false;
  let changed = false;
  if (user.role === "CUSTOMER") {
    let code = user.student_code;
    if (!code && user.email) {
      const match = String(user.email).match(/^(\d{10})@/);
      if (match) { code = match[1]; user.student_code = code; changed = true; }
    }
    if (code && !user.manual_override) {
      const parsed = parseStudentCode(code, db);
      if (parsed?.valid) {
        if (user.year_in !== parsed.year_in) { user.year_in = parsed.year_in; changed = true; }
        if (user.major_code !== parsed.major_code) { user.major_code = parsed.major_code; changed = true; }
        if (parsed.mapped) {
          if (user.major_name !== parsed.major_name) { user.major_name = parsed.major_name; changed = true; }
          if (user.faculty !== parsed.faculty) { user.faculty = parsed.faculty; changed = true; }
          if (user.major_code_full !== parsed.major_code_full) { user.major_code_full = parsed.major_code_full; changed = true; }
        }
        user.mssv_parsed_at = new Date().toISOString();
      }
    }
  }
  if (user.role === "EMPLOYEE" || user.role === "ADMIN") {
    if (user.teacher_code && !user.manual_override) {
      const parsed = parseTeacherCode(user.teacher_code, db);
      if (parsed?.valid) {
        if (user.year_in !== parsed.year_in) { user.year_in = parsed.year_in; changed = true; }
        if (user.unit_code !== parsed.unit_code) { user.unit_code = parsed.unit_code; changed = true; }
        user.mssv_parsed_at = new Date().toISOString();
      }
    }
  }
  return changed;
}

function classifyEmail(email) {
  if (!email) return null;
  const lower = normalizeEmail(email);
  if (lower.endsWith("@hpn.edu.vn")) {
    const local = lower.split("@")[0];
    if (/^\d{10}$/.test(local)) return { role: "CUSTOMER", code_type: "STUDENT", code: local };
    return { role: "CUSTOMER", code_type: "STUDENT", code: "" };
  }
  if (lower.endsWith("@vwa.edu.vn")) {
    const local = lower.split("@")[0];
    if (/^\d{6}-\d{7}$/.test(local)) return { role: "EMPLOYEE", code_type: "TEACHER", code: local };
    return { role: "EMPLOYEE", code_type: "TEACHER", code: "" };
  }
  return { role: "CUSTOMER", code_type: "NONE", code: "" };
}

function maskEmail(email) {
  if (!email) return "";
  const [local, domain] = String(email).split("@");
  if (!domain) return email;
  if (local.length <= 4) return "***@" + domain;
  return local.slice(0, 2) + "***" + local.slice(-2) + "@" + domain;
}

function getPointsConfig(db) {
  if (!db.points_config) {
    db.points_config = {
      ...JSON.parse(JSON.stringify(DEFAULT_POINTS_CONFIG)),
      updated_at: new Date().toISOString(),
    };
  }
  return mergeConfig(db.points_config);
}

// ============================================================
// MONGODB SETUP
// ============================================================
const MONGO_URI = process.env.MONGO_URI;
let dbCache = null;
let mongoReady = false;
let mongoConnecting = null;

mongoose.connection.on("connected",    () => { mongoReady = true;  console.log("🟢 Mongo connected"); });
mongoose.connection.on("reconnected",  () => { mongoReady = true;  console.log("🟢 Mongo reconnected"); });
mongoose.connection.on("disconnected", () => { mongoReady = false; console.log("🔴 Mongo disconnected"); });
mongoose.connection.on("error",        (e) => { console.error("🔴 Mongo error:", e.message); });

const OBJECT_KEYS = ["settings", "chat_conversations", "points_config"];

const DEFAULT_TIME_SLOTS = [
  { id: "07:00-07:30", start: "07:00", end: "07:30", enabled: true, note: "" },
  { id: "07:30-08:00", start: "07:30", end: "08:00", enabled: true, note: "" },
  { id: "08:00-08:30", start: "08:00", end: "08:30", enabled: true, note: "" },
  { id: "08:30-09:00", start: "08:30", end: "09:00", enabled: true, note: "" },
  { id: "09:00-09:30", start: "09:00", end: "09:30", enabled: true, note: "" },
  { id: "09:30-10:00", start: "09:30", end: "10:00", enabled: true, note: "" },
  { id: "10:00-10:30", start: "10:00", end: "10:30", enabled: true, note: "" },
  { id: "10:30-11:00", start: "10:30", end: "11:00", enabled: true, note: "" },
  { id: "11:00-11:30", start: "11:00", end: "11:30", enabled: true, note: "" },
  { id: "11:30-12:00", start: "11:30", end: "12:00", enabled: true, note: "" },
  { id: "12:00-12:30", start: "12:00", end: "12:30", enabled: true, note: "" },
  { id: "12:30-13:00", start: "12:30", end: "13:00", enabled: true, note: "" },
  { id: "13:00-13:30", start: "13:00", end: "13:30", enabled: true, note: "" },
  { id: "13:30-14:00", start: "13:30", end: "14:00", enabled: true, note: "" },
  { id: "14:00-14:30", start: "14:00", end: "14:30", enabled: true, note: "" },
  { id: "14:30-15:00", start: "14:30", end: "15:00", enabled: true, note: "" },
  { id: "15:00-15:30", start: "15:00", end: "15:30", enabled: true, note: "" },
  { id: "15:30-16:00", start: "15:30", end: "16:00", enabled: true, note: "" },
  { id: "16:00-16:30", start: "16:00", end: "16:30", enabled: true, note: "" },
  { id: "16:30-17:00", start: "16:30", end: "17:00", enabled: true, note: "" },
  { id: "17:00-17:30", start: "17:00", end: "17:30", enabled: true, note: "" },
  { id: "17:30-18:00", start: "17:30", end: "18:00", enabled: true, note: "" },
  { id: "18:00-18:30", start: "18:00", end: "18:30", enabled: true, note: "" },
];

function getTimeSlots(db) {
  if (!db.settings) db.settings = {};
  if (!Array.isArray(db.settings.timeSlots) || db.settings.timeSlots.length === 0) {
    db.settings.timeSlots = [...DEFAULT_TIME_SLOTS];
    return db.settings.timeSlots;
  }
  return db.settings.timeSlots;
}

const NUTRITION_BY_CATEGORY = {
  "Cơm": { prep_time: 12, calories: 620, is_cool: false, is_healthy: false, is_spicy: false },
  "Bún - Phở - Cháo": { prep_time: 10, calories: 520, is_cool: false, is_healthy: false, is_spicy: false },
  "Bánh mì - Xôi": { prep_time: 6, calories: 460, is_cool: false, is_healthy: false, is_spicy: false },
  "Đồ ăn nhanh": { prep_time: 8, calories: 640, is_cool: false, is_healthy: false, is_spicy: false },
  "Ăn vặt": { prep_time: 7, calories: 320, is_cool: false, is_healthy: false, is_spicy: false },
  "Đồ chay": { prep_time: 12, calories: 380, is_cool: false, is_healthy: true, is_spicy: false },
  "Món chay": { prep_time: 12, calories: 380, is_cool: false, is_healthy: true, is_spicy: false },
  "Combo 1 người": { prep_time: 15, calories: 780, is_cool: false, is_healthy: false, is_spicy: false },
  "Combo siêu hời": { prep_time: 18, calories: 950, is_cool: false, is_healthy: false, is_spicy: false },
  "Coffee & Tea": { prep_time: 5, calories: 180, is_cool: true, is_healthy: false, is_spicy: false },
  "Nước ép - Sinh tố": { prep_time: 5, calories: 150, is_cool: true, is_healthy: true, is_spicy: false },
  "Đồ uống": { prep_time: 3, calories: 140, is_cool: true, is_healthy: false, is_spicy: false },
};
const NUTRITION_FALLBACK = { prep_time: 10, calories: 500, is_cool: false, is_healthy: false, is_spicy: false };

function normalizeVN(str) {
  return String(str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
}
const COOL_NAME_RE = /\b(da xay|cold brew|nuoc ep|sinh to|smoothie)\b/;
const SPICY_NAME_RE = /\b(cay|sa te|kimchi|tom yum|han quoc|thai|hue)\b/;
const HEALTHY_NAME_RE = /\b(chay|salad|goi cuon|rau|dau hu|dau phu|yen mach|ngu coc|nuoc ep|sinh to)\b/;

function fillMenuNutrition(item) {
  if (!item || typeof item !== "object") return false;
  const base = NUTRITION_BY_CATEGORY[item.category] || NUTRITION_FALLBACK;
  const name = normalizeVN(item.name);
  let changed = false;
  const setIfMissing = (key, value) => {
    const cur = item[key];
    if (cur === undefined || cur === null || cur === "") { item[key] = value; changed = true; }
  };
  setIfMissing("prep_time", base.prep_time);
  setIfMissing("calories", base.calories);
  setIfMissing("is_cool", base.is_cool || COOL_NAME_RE.test(name));
  setIfMissing("is_healthy", base.is_healthy || HEALTHY_NAME_RE.test(name));
  setIfMissing("is_spicy", base.is_spicy || SPICY_NAME_RE.test(name));
  return changed;
}

function migrateMenuNutrition() {
  try {
    if (!mongoReady) return;
    const db = loadDB();
    if (!db || !Array.isArray(db.menu_items) || db.menu_items.length === 0) return;
    let changed = 0;
    for (const item of db.menu_items) if (fillMenuNutrition(item)) changed++;
    if (changed > 0) {
      saveDB(db);
      console.log(`✅ Đã bổ sung dinh dưỡng cho ${changed}/${db.menu_items.length} món`);
    } else {
      console.log("✅ Dinh dưỡng món ăn: đầy đủ");
    }
  } catch (e) { console.error("migrateMenuNutrition lỗi:", e.message); }
}

const SEED_PASSWORD_HASH = bcrypt.hashSync("123456", 10);

function buildSeedData() {
  return {
    users: [
      { id: 1, name: "Quản trị viên", email: "admin@vwa.vn", password: SEED_PASSWORD_HASH, role: "ADMIN", status: "Hoạt động", phone: "0900000001", points: 0, created_at: "2025-01-01T00:00:00.000Z" },
      { id: 2, name: "Trần Văn Trí", email: "nhanvien@vwa.vn", password: SEED_PASSWORD_HASH, role: "EMPLOYEE", status: "Hoạt động", phone: "", points: 50, chat_enabled: true, created_at: "2025-01-01T00:00:00.000Z" },
      { id: 3, name: "Trần Văn Trí", email: "sinhvien@vwa.vn", password: SEED_PASSWORD_HASH, role: "CUSTOMER", status: "Hoạt động", phone: "", points: 1959, created_at: "2025-01-01T00:00:00.000Z" },
    ],
    sizes: [
      { id: "S", name: "Nhỏ", extra_price: 0 },
      { id: "M", name: "Vừa", extra_price: 5000 },
      { id: "L", name: "Lớn", extra_price: 10000 },
    ],
    menu_items: [], categories: [], toppings: [], orders: [], inventory: [],
    notifications: [], vouchers: [], reviews: [], messages: [], attendances: [], imports: [],
    price_history: [], shifts: [], wallets: [], wallet_transactions: [], tasks: [], points_history: [],
    chat_transfer_requests: [], eco_rewards: [], orderReminders: [],
    student_cards: [],
    points_config: { ...JSON.parse(JSON.stringify(DEFAULT_POINTS_CONFIG)), updated_at: new Date().toISOString() },
    chat_conversations: {},
    settings: { bank: "VCB", account: "", accountName: "", hotline: "", email: "", address: "", qrCustomImage: "", chat_enabled_global: true },
  };
}

async function ensureIndexes(db) {
  try {
    try {
      const sessColl = db.collection("sessions");
      const sessIndexes = await sessColl.indexes().catch(() => []);
      for (const idx of sessIndexes) {
        if (idx.unique && idx.key && (idx.key.user_id !== undefined)) {
          console.warn(`[ensureIndexes] Drop unique index ${idx.name} trên sessions.user_id`);
          await sessColl.dropIndex(idx.name).catch(() => {});
        }
      }
      await sessColl.createIndex({ jti: 1 }, { unique: true }).catch(() => {});
      await sessColl.createIndex({ user_id: 1 }).catch(() => {});
      await sessColl.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
    } catch (e) {
      console.warn("[ensureIndexes] sessions index setup:", e.message);
    }

    const idx = [
      ["orders", { customer_id: 1, created_at: -1 }],
      ["orders", { status: 1 }],
      ["orders", { code: 1 }],
      ["notifications", { user_id: 1, read: 1, created_at: -1 }],
      ["messages", { user_id: 1, created_at: -1 }],
      ["wallet_transactions", { user_id: 1, created_at: -1 }],
      ["wallet_transactions", { status: 1 }],
      ["users", { email: 1 }],
      ["users", { role: 1 }],
      ["menu_items", { category: 1, active: 1 }],
      ["reviews", { menu_item_id: 1, user_id: 1 }],
      ["attendances", { employee_id: 1, date: -1 }],
      ["shifts", { employee_id: 1, date: -1 }],
      ["vouchers", { user_id: 1, used: 1 }],
    ];
    for (const [coll, spec] of idx) {
      try { await db.collection(coll).createIndex(spec); } catch (e) {}
    }
  } catch (e) {
    console.warn("ensureIndexes failed:", e.message);
  }
}

async function initMongo() {
  if (mongoConnecting) return mongoConnecting;
  if (mongoReady && dbCache) return true;

  mongoConnecting = (async () => {
    try {
      if (!MONGO_URI) {
        dbCache = buildSeedData();
        mongoReady = false;
        return false;
      }

            console.log("🔌 Đang kết nối MongoDB...");
      await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 30000, // Tăng lên 30s
        socketTimeoutMS: 60000,          // Tăng lên 60s
        connectTimeoutMS: 30000,         // Tăng lên 30s
        maxPoolSize: 5,                  // Giảm xuống 5 để tránh quá tải Atlas
        minPoolSize: 0,
        bufferCommands: false,
        // 🔧 FIX: Đã xóa `family: 4` vì Vercel (AWS) có thể gặp lỗi timeout với IPv4 bị ép buộc
        retryWrites: true,
        retryReads: true,
      });

      console.log("✅ Đã kết nối MongoDB");
      const db = mongoose.connection.db;

      await ensureIndexes(db);

      const seed = buildSeedData();
      const cache = {};
      const collections = await db.listCollections().toArray();
      const collNames = collections.map((c) => c.name);

      const stripId = (d) => {
        if (!d || typeof d !== "object") return d;
        const { _id, ...rest } = d;
        return rest;
      };

      for (const key of Object.keys(seed)) {
        const hasColl = collNames.includes(key);
        let docs = [];
        if (hasColl) docs = await db.collection(key).find({}).toArray();

        if (OBJECT_KEYS.includes(key)) {
          if (docs.length > 0) cache[key] = stripId(docs[0]);
          else {
            cache[key] = seed[key];
            await db.collection(key).insertOne(seed[key]);
          }
        } else {
          if (docs.length > 0) cache[key] = docs.map(stripId);
          else {
            cache[key] = seed[key];
            if (seed[key].length > 0) await db.collection(key).insertMany(seed[key]);
          }
        }
      }

      dbCache = cache;
      mongoReady = true;

      if (!Array.isArray(dbCache.inventory) || dbCache.inventory.length < 20) {
        const extraSeed = [
          { code: "NL001", name: "Gạo", qty: 100, unit: "kg", min: 10 },
          { code: "NL002", name: "Thịt gà", qty: 12, unit: "kg", min: 10 },
          { code: "NL003", name: "Thịt bò", qty: 8, unit: "kg", min: 10 },
          { code: "NL004", name: "Bún", qty: 15, unit: "kg", min: 10 },
          { code: "NL005", name: "Thịt heo", qty: 25, unit: "kg", min: 10 },
          { code: "NL006", name: "Phở", qty: 30, unit: "kg", min: 10 },
          { code: "NL007", name: "Mì", qty: 20, unit: "kg", min: 10 },
          { code: "NL008", name: "Trứng gà", qty: 100, unit: "cái", min: 10 },
          { code: "NL009", name: "Rau sống", qty: 20, unit: "kg", min: 10 },
          { code: "NL010", name: "Cà chua", qty: 15, unit: "kg", min: 10 },
          { code: "NL011", name: "Hành", qty: 10, unit: "kg", min: 10 },
          { code: "NL012", name: "Dầu ăn", qty: 20, unit: "lít", min: 10 },
          { code: "NL013", name: "Nước mắm", qty: 10, unit: "lít", min: 10 },
          { code: "NL014", name: "Cà phê", qty: 8, unit: "kg", min: 10 },
          { code: "NL015", name: "Bánh mì", qty: 100, unit: "cái", min: 10 },
          { code: "NL016", name: "Sữa đặc", qty: 20, unit: "hộp", min: 10 },
          { code: "NL017", name: "Trà", qty: 5, unit: "kg", min: 10 },
          { code: "NL018", name: "Đậu hủ", qty: 15, unit: "kg", min: 10 },
          { code: "NL019", name: "Xúc xích", qty: 100, unit: "cái", min: 10 },
          { code: "NL020", name: "Khoai tây", qty: 30, unit: "kg", min: 10 },
        ];
        dbCache.inventory = extraSeed;
        await saveDBStrict(dbCache);
      }

      if (Array.isArray(dbCache.users)) {
        let usersChanged = false;
        for (const u of dbCache.users) {
          if (u.email && u.email !== normalizeEmail(u.email)) {
            u.email = normalizeEmail(u.email);
            usersChanged = true;
          }
        }
        if (usersChanged) await saveDBStrict(dbCache);
      }

      const chatChanged = ensureChatSchema(dbCache);
      if (chatChanged) await saveDBStrict(dbCache);

      console.log("✅ MONGO READY");

      setImmediate(() => {
        try { migrateMenuNutrition(); }
        catch (e) { console.error("migrateMenuNutrition bg:", e.message); }
      });
      setImmediate(() => {
        migrateInlineMenuImages({ log: (m) => console.log("   " + m) })
          .catch((e) => console.warn("migrateInlineMenuImages bg:", e.message));
      });

      return true;
    } catch (e) {
      console.error("❌ MONGODB LỖI:", e.message);
      mongoReady = false;
      if (!MONGO_URI) dbCache = buildSeedData();
      return false;
    } finally {
      mongoConnecting = null;
    }
  })();

  return mongoConnecting;
}

function loadDB() {
  if (dbCache) return dbCache;
  initMongo().catch(() => {});
  if (!MONGO_URI) {
    dbCache = buildSeedData();
    return dbCache;
  }
  return buildEmptyShape();
}

function buildEmptyShape() {
  return {
    users: [], sizes: [], menu_items: [], categories: [], toppings: [], orders: [], inventory: [],
    notifications: [], vouchers: [], reviews: [], messages: [], attendances: [], imports: [],
    price_history: [], shifts: [], wallets: [], wallet_transactions: [], tasks: [], points_history: [],
    chat_transfer_requests: [], eco_rewards: [], orderReminders: [],
    student_cards: [],
    points_config: { ...JSON.parse(JSON.stringify(DEFAULT_POINTS_CONFIG)) },
    chat_conversations: {},
    settings: { chat_enabled_global: true },
  };
}

// ============================================================
// SAVE DB
// ============================================================
let saveQueue = Promise.resolve();
const UNIQUE_KEY_BY_COLL = { wallets: "user_id", inventory: "code", student_cards: "user_id" };
const lastSavedJson = new Map();

async function _writeCollection(db, key, value) {
  const coll = db.collection(key);

  if (Array.isArray(value)) {
    const uniqueField = UNIQUE_KEY_BY_COLL[key] || "id";
    const keys = [];
    const ops = [];

    for (const raw of value) {
      if (!raw || typeof raw !== "object") continue;
      const { _id, ...rest } = raw;
      const k = rest[uniqueField];
      if (k !== undefined && k !== null) {
        ops.push({
          updateOne: { filter: { [uniqueField]: k }, update: { $set: rest }, upsert: true },
        });
        keys.push(k);
      } else {
        ops.push({ insertOne: { document: rest } });
      }
    }

    if (ops.length > 0) {
      try {
        await coll.bulkWrite(ops, { ordered: false });
      } catch (e) {
        const writeErrors = e.result?.getWriteErrors?.() || e.writeErrors || [];
        if (writeErrors.length > 0) throw e;
        console.warn(`bulkWrite ${key}: ${writeErrors.length}/${ops.length} ops failed`);
      }
    }

    if (keys.length > 0) {
      await coll.deleteMany({ [uniqueField]: { $nin: keys } });
    } else {
      await coll.deleteMany({});
    }
    return;
  }

  if (value && typeof value === "object") {
    const { _id, ...rest } = value;
    await coll.deleteMany({});
    await coll.insertOne(rest);
  }
}

async function _flushChanges(db, data) {
  let hadError = null;
  const tasks = [];

  for (const [key, value] of Object.entries(data)) {
    if (key === "_id" || key === "__v") continue;

    let json;
    try { json = JSON.stringify(value); }
    catch (e) { console.error(`saveDB ${key} serialize error:`, e.message); continue; }

    if (lastSavedJson.get(key) === json) continue;

    tasks.push(
      _writeCollection(db, key, value)
        .then(() => lastSavedJson.set(key, json))
        .catch((e) => { hadError = e; console.error(`saveDB ${key} write error:`, e.message); })
    );
  }

  if (tasks.length > 0) await Promise.all(tasks);
  if (hadError) throw hadError;
}

function enqueueSaveDB(data) {
  dbCache = data;

  if (!mongoReady || !mongoose.connection.db) {
    return Promise.resolve();
  }

  const mongoDb = mongoose.connection.db;

  const operation = saveQueue
    .catch(() => {})
    .then(() => _flushChanges(mongoDb, data));

  saveQueue = operation.catch((e) => {
    console.error("Mongo save error:", e.message);
  });

  return operation;
}

function saveDB(data) {
  return enqueueSaveDB(data).catch((e) => {
    console.error("Mongo save error:", e.message);
  });
}

async function saveDBOrThrow(data) {
  dbCache = data;

  if (!mongoReady || !mongoose.connection.db) {
    throw new Error(
      "MongoDB chưa sẵn sàng; đơn hàng chưa được lưu. Vui lòng thử lại."
    );
  }

  return enqueueSaveDB(data);
}

async function saveDBStrict(data) {
  dbCache = data;
  if (!mongoReady || !mongoose.connection.db) return;
  const mongoDb = mongoose.connection.db;
  await _flushChanges(mongoDb, data);
}

function invalidateMenuCache() {
  menuCache.data = null;
  menuCache.expiresAt = 0;
}
function invalidateStatsCache() {
  statsCache.data = null;
  statsCache.expiresAt = 0;
}

// ============================================================
// NOTIFICATIONS
// ============================================================
function notifyNewOrder(db, order) {
  if (!db.notifications) db.notifications = [];
  const staff = db.users.filter((u) => u.role === "ADMIN" || u.role === "EMPLOYEE");
  staff.forEach((s) => {
    const id = nextId(db.notifications);
    db.notifications.push({
      id, 
      user_id: Number(s.id), // 🔧 Ép kiểu Number
      title: "Đơn hàng mới",
      content: order.customer_name + " vừa đặt đơn " + order.code + " (" + order.total.toLocaleString("vi-VN") + "đ)",
      type: "order", link: s.role === "ADMIN" ? "/owner" : "/employee/orders", read: false, created_at: new Date().toISOString(),
    });
  });
}

function notifyOrderStatus(db, order, newStatus) {
  if (!db.notifications) db.notifications = [];
  const readyReminder = newStatus === "Sẵn sàng nhận" && Array.isArray(db.orderReminders)
    ? db.orderReminders.find((r) => r.active && String(r.order_id) === String(order._id ?? order.id ?? order.code ?? "") && String(r.user_id) === String(order.customer_id))
    : null;

  if (readyReminder) {
    const now = new Date().toISOString();
    readyReminder.active = false;
    readyReminder.notified_at = now;
    db.notifications.push({
      id: nextId(db.notifications), user_id: order.customer_id, title: "Đến giờ nhận món rồi!",
      content: "Nhắc hẹn của bạn: Đơn " + order.code + " đã sẵn sàng nhận. Vui lòng đến quầy để nhận món nhé!",
      type: "reminder", link: "/customer/orders", read: false, created_at: now,
    });
    return;
  }
  const TITLE_BY_STATUS = {
    "Chờ xác nhận": "Đơn hàng " + order.code + " đang chờ xác nhận",
    "Đã xác nhận": "Đơn hàng " + order.code + " đã được xác nhận",
    "Đang chuẩn bị": "Đơn hàng " + order.code + " đang được chuẩn bị",
    "Sẵn sàng nhận": "Đơn hàng " + order.code + " sẵn sàng nhận",
    "Hoàn thành": "Đơn hàng " + order.code + " đã hoàn thành",
    "Đã hủy": "Đơn hàng " + order.code + " đã bị hủy",
  };
  db.notifications.push({
    id: nextId(db.notifications), user_id: order.customer_id,
    title: TITLE_BY_STATUS[newStatus] || ("Đơn hàng " + order.code + " cập nhật: " + newStatus),
    content: "Đơn hàng của bạn đang ở trạng thái: " + newStatus,
    type: "status", link: "/customer/orders", read: false, created_at: new Date().toISOString(),
  });
}

function recordPointsTransaction(db, user, delta, reason, extra = {}) {
  if (!user || !Number.isFinite(Number(delta)) || Number(delta) === 0) return;
  if (!Array.isArray(db.points_history)) db.points_history = [];

  const change = Number(delta);
  const newPoints = Number.isFinite(Number(extra.new_points))
    ? Number(extra.new_points)
    : (Number(user.points) || 0);
  const oldPoints = Number.isFinite(Number(extra.old_points))
    ? Number(extra.old_points)
    : newPoints - change;
  db.points_history.push({
    id: nextId(db.points_history),
    user_id: user.id,
    user_name: user.name || "",
    old_points: oldPoints,
    new_points: newPoints,
    delta: change,
    reason,
    order_code: extra.order_code || "",
    voucher_code: extra.voucher_code || "",
    source: extra.source || "",
    changed_by: extra.changed_by || "Hệ thống",
    changed_by_id: extra.changed_by_id ?? null,
    created_at: extra.created_at || new Date().toISOString(),
  });
}
function rollbackCancelledOrder(db, order) {
  if (!order || order._stock_rolled_back) return;
  (order.items || []).forEach((it) => {
    const m = (db.menu_items || []).find((x) => x.id == it.menu_item_id);
    if (!m) return;
    m.stock = (m.stock || 0) + (it.qty || 0);
    m.sold = Math.max(0, (m.sold || 0) - (it.qty || 0));
  });
  const earned = Math.max(0, Number(order.points_earned) || 0);
  const greenBonus = order.green_status === "approved"
    ? Math.max(0, Number(order.green_points) || 0)
    : 0;
  const baseEarned = Math.max(0, earned - greenBonus);
  const customer = (db.users || []).find(
    (u) => String(u.id) === String(order.customer_id)
  );

  if (customer && baseEarned > 0) {
    const before = Math.max(0, Number(customer.points) || 0);
    customer.points = Math.max(0, before - baseEarned);
    const actualDelta = customer.points - before;
    if (actualDelta !== 0) {
      recordPointsTransaction(
        db, customer, actualDelta,
        `Thu hồi xu tích lũy do hủy đơn ${order.code || order.id}`,
        { order_code: order.code || "", source: "order_cancel_earn" }
      );
    }
  }

  if (customer && greenBonus > 0) {
    const before = Math.max(0, Number(customer.points) || 0);
    customer.points = Math.max(0, before - greenBonus);
    const actualDelta = customer.points - before;
    if (actualDelta !== 0) {
      recordPointsTransaction(
        db, customer, actualDelta,
        `Thu hồi thưởng VWA Green do hủy đơn ${order.code || order.id}`,
        { order_code: order.code || "", source: "order_cancel_green" }
      );
    }
  }

  if (earned > 0) order.points_earned = 0;
  if (order.green_status === "approved" && greenBonus > 0) {
    order.green_status = "cancelled";
    order.green_points = 0;
  }
  const isWalletPay = order.payment === "Ví Canteen" || order.payment === "WALLET";
  if (isWalletPay) {
    const wallet = (db.wallets || []).find((w) => w.user_id === order.customer_id);
    const total = Number(order.total) || 0;
    if (wallet && total > 0) {
      wallet.balance = (wallet.balance || 0) + total;
      wallet.updated_at = new Date().toISOString();
    }
    if (Array.isArray(db.wallet_transactions)) {
      db.wallet_transactions = db.wallet_transactions.filter((tx) => !(tx.order_code === order.code && tx.type === "payment"));
    }
    if (!db.wallet_transactions) db.wallet_transactions = [];
    const refundId = nextId(db.wallet_transactions);
    db.wallet_transactions.push({
      id: refundId, code: "REF" + Date.now().toString().slice(-8) + Math.random().toString(36).slice(2, 5).toUpperCase(),
      user_id: order.customer_id, user_name: order.customer_name,
      type: "deposit", amount: total, method: "WALLET", status: "approved", note: "Hoàn tiền đơn " + order.code + " (bị hủy)",
      order_code: order.code, created_at: new Date().toISOString(), approved_at: new Date().toISOString(),
    });
  }
  if (order.voucher_code && Array.isArray(db.vouchers)) {
    const vc = db.vouchers.find((v) => v.code === order.voucher_code && v.order_code === order.code);
    if (vc) { vc.used = false; delete vc.used_at; delete vc.order_code; }
  }
  order._stock_rolled_back = true;
}

// ============================================================
// EXPRESS APP SETUP
// ============================================================
const app = express();
app.set("trust proxy", 1);

app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://canteenvwa.vercel.app",
    /\.vercel\.app$/,
    /\.onrender\.com$/,
  ],
  credentials: true,
  exposedHeaders: ["set-cookie"],
}));

app.use(express.json({ limit: "25mb" }));
app.use(cookieParser(process.env.COOKIE_SECRET || undefined));
app.use(sanitizeBody);

let initPromise = null;
function getInitPromise() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try { return await initMongo(); }
    catch (e) { return false; }
  })();
  return initPromise;
}

app.use(async (req, res, next) => {
  if (req.path === "/" || req.path === "/api" || req.path === "/api/") return next();
  if (mongoReady) return next();
  await Promise.race([getInitPromise(), new Promise((r) => setTimeout(r, 8000))]);
  next();
});

function requestOrigin(req) {
  const proto = String(req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0].trim() || "http";
  const host = req.get("x-forwarded-host") || req.get("host");
  return host ? proto + "://" + host : "";
}

function makeAbsoluteUrlReplacer(origin) {
  return function replacer(key, value) {
    if (typeof value === "string" && value.startsWith(MENU_IMAGE_PREFIX)) return origin + value;
    return value;
  };
}

app.use((req, res, next) => {
  const origin = requestOrigin(req);
  if (!origin) return next();
  const sendJson = res.json.bind(res);
  res.json = (body) => {
    try {
      const json = JSON.stringify(body, makeAbsoluteUrlReplacer(origin));
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.send(json);
    } catch { return sendJson(body); }
  };
  next();
});

// 🔴 COLD START INTERCEPTOR: Biến 503 GET thành 200 rỗng
app.use((req, res, next) => {
  const origJson = res.json.bind(res);
  res.json = function(body) {
    if ((res.statusCode === 503 || body?.code === "SERVER_WARMING_UP") && req.method === "GET") {
      res.status(200);
      const p = req.path || "";
      if (p.includes("/notifications")) return origJson({ list: [], unread: 0, _cold: true });
      if (p.includes("/wallet/me")) return origJson({ balance: 0, bank_name: "", bank_account: "", bank_account_name: "", linked_at: "", _cold: true });
      if (p.includes("/chat/my-status")) return origJson({ enabled: true, global_enabled: true, assigned_to_admin_users: [], _cold: true });
      if (p.includes("/settings")) return origJson({ _cold: true });
      return origJson([]);
    }
    return origJson(body);
  };
  next();
});

app.get("/api/uploads/menu/:id", async (req, res) => {
  try {
    // Nếu mất kết nối DB tạm thời, chờ tối đa 3s để khởi động lại
    if (!mongoReady) {
      await new Promise((r) => setTimeout(r, 3000));
    }

    const image = await getMenuImage(req.params.id);
    
    // Nếu không tìm thấy ảnh hoặc DB timeout -> Trả về ảnh SVG mặc định thay vì 404
    if (!image) {
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "public, max-age=3600"); // Cache lỗi 1 tiếng để giảm tải
      return res.send(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect fill='#f5f7fb' width='100' height='100'/><text x='50' y='58' font-size='40' text-anchor='middle'>🍽️</text></svg>`
      );
    }
    
    if (image.redirectTo) return res.redirect(302, image.redirectTo);
    
    res.setHeader("Content-Type", image.contentType || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("ETag", '"' + req.params.id + "-" + image.rev + '"');
    res.send(image.buffer);
  } catch (e) {
    console.error(`[Image Error] ID ${req.params.id}:`, e.message);
    // Lỗi 500 cũng fallback về SVG mặc định để không làm gãy UI
    res.setHeader("Content-Type", "image/svg+xml");
    res.send(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect fill='#f5f7fb' width='100' height='100'/><text x='50' y='58' font-size='40' text-anchor='middle'>🍽️</text></svg>`
    );
  }
});

const JWT_SECRET = process.env.JWT_SECRET || "";
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("❌ JWT_SECRET chưa set — bắt buộc ở production");
  } else {
    console.warn("⚠️ JWT_SECRET chưa set — dùng fallback cho DEV");
  }
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || "DEV_ONLY_FALLBACK_SECRET_DO_NOT_USE_IN_PROD";

// ============================================================
// AUTH MIDDLEWARE — Async + Wait for Mongo
// ============================================================

function auth(roles = []) {
  return async (req, res, next) => {
    if (MONGO_URI && !mongoReady) {
      const deadline = Date.now() + 5000;
      while (!mongoReady && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!mongoReady) {
        return res.status(503).json({
          code: "SERVER_WARMING_UP",
          message: "Server đang khởi động, vui lòng thử lại.",
        });
      }
    }

    if (req.query.token && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${req.query.token}`;
    }

    const v = verifyAnyToken(req, EFFECTIVE_JWT_SECRET, "access");
    if (!v.ok) {
      return res.status(401).json({
        message: "Chưa đăng nhập hoặc phiên đã hết hạn",
        code: v.error || "UNAUTHENTICATED",
      });
    }

    const payload = v.payload;

    if (payload.sid) {
      const sv = await verifySession(payload.sid);
      if (!sv.ok) {
        clearAuthCookies(res, req);
        return res.status(401).json({
          message: "Phiên đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.",
          code: "SESSION_REVOKED",
        });
      }
    }

    const db = loadDB();
    // 🔧 FIX: Ép kiểu id về Number để đồng bộ dữ liệu
    const userId = Number(payload.id); 
    const currentUser = findByIdOrMongo(db.users, userId);
    
    if (!currentUser)
      return res.status(401).json({ message: "Tài khoản không còn tồn tại" });
    if (currentUser.status === "Bị khóa")
      return res.status(403).json({ message: "Tài khoản đã bị khóa" });
    if (roles.length && !roles.includes(currentUser.role))
      return res.status(403).json({ message: "Không có quyền" });

    // 🔧 FIX: Gán đè toàn bộ req.user bằng dữ liệu chuẩn từ DB, không dùng payload cũ
    req.user = {
      id: currentUser.id, // Luôn là Number
      role: currentUser.role,
      name: currentUser.name,
      email: currentUser.email,
      sid: payload.sid || null,
    };
    
    req.tokenSource = v.source;
    next();
  };
}

// ============================================================
// AUTH ENDPOINTS
// ============================================================
const loginLimiter = rateLimit({ windowMs: 60_000, max: 5 });

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const emailNorm = normalizeEmail(email);
    if (!emailNorm || !password)
      return res.status(400).json({ message: "Thiếu email/mật khẩu" });

    const db = loadDB();
    const user = db.users.find((u) => normalizeEmail(u.email) === emailNorm);
    if (!user)
      return res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu" });

    const ok = bcrypt.compareSync(password, user.password);
    if (!ok)
      return res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu" });

    const filled = autoFillFromCode(db, user);
    if (filled) await saveDBOrThrow(db);

    const { accessToken } = await issueTokens(res, user, EFFECTIVE_JWT_SECRET, { req });

    res.json({
      token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar || "",
        must_change_password: !!user.must_change_password,
      },
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, name, phone, student_code } = req.body || {};
    const emailNorm = normalizeEmail(email);
    const nameNorm = String(name || "").trim();
    if (!emailNorm || !password || !nameNorm) return res.status(400).json({ message: "Thiếu thông tin" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) return res.status(400).json({ message: "Email không hợp lệ" });
    if (password.length < 6) return res.status(400).json({ message: "Mật khẩu phải từ 6 ký tự" });
    if (phone && !/^[0-9]{10,11}$/.test(String(phone).trim())) return res.status(400).json({ message: "SĐT phải 10-11 số" });
    let parsedMssv = "";
    if (student_code) {
      const clean = String(student_code).trim();
      if (!/^\d{10}$/.test(clean)) return res.status(400).json({ message: "MSSV phải là 10 chữ số" });
      parsedMssv = clean;
    }
    const db = loadDB();
    if (db.users.find((u) => normalizeEmail(u.email) === emailNorm)) return res.status(400).json({ message: "Email đã được sử dụng" });
    if (parsedMssv) {
      const existing = db.users.find((u) => u.student_code === parsedMssv);
      if (existing) return res.status(400).json({ message: "MSSV này đã được liên kết với tài khoản khác.", code: "MSSV_ALREADY_LINKED", linked_email_masked: maskEmail(existing.email) });
    }
    const hash = bcrypt.hashSync(password, 10);
    const id = nextId(db.users);
    const user = { id, email: emailNorm, password: hash, name: nameNorm, phone: String(phone || "").trim(), role: "CUSTOMER", status: "Hoạt động", points: 0, student_code: parsedMssv, created_at: new Date().toISOString() };
    autoFillFromCode(db, user);
    db.users.push(user);
    await saveDBOrThrow(db);

    const { accessToken } = await issueTokens(res, user, EFFECTIVE_JWT_SECRET, { req });
    res.status(201).json({
      token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        student_code: user.student_code || "",
        major_name: user.major_name || "",
        faculty: user.faculty || "",
        year_in: user.year_in || null,
      },
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/auth/refresh", async (req, res) => {
  return res.status(410).json({
    ok: false,
    message: "Refresh endpoint đã tắt. Vui lòng đăng nhập lại.",
    code: "REFRESH_DISABLED",
  });
});

// 🔧 FIX: verify access token và revoke theo sid (trước đó verify "refresh" → luôn fail)
app.post("/api/auth/logout", async (req, res) => {
  try {
    const v = verifyAnyToken(req, EFFECTIVE_JWT_SECRET, "access");
    if (v.ok && v.payload?.sid) {
      await revokeSession(v.payload.sid);
    }
    clearAuthCookies(res, req);
    res.json({ ok: true, message: "Đã đăng xuất" });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.put("/api/auth/password", auth(), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ message: "Thiếu thông tin" });
    if (newPassword.length < 6) return res.status(400).json({ message: "Mật khẩu phải từ 6 ký tự" });
    const db = loadDB();
    const u = findByIdOrMongo(db.users, req.user.id);
    if (!u) return res.status(404).json({ message: "Không tìm thấy user" });
    const ok = bcrypt.compareSync(currentPassword, u.password);
    if (!ok) return res.status(401).json({ message: "Mật khẩu hiện tại không đúng" });
    u.password = bcrypt.hashSync(newPassword, 10);
    u.must_change_password = false;
    u.password_changed_at = new Date().toISOString();
    await saveDBOrThrow(db);

    const currentJti = req.user?.sid || null;
    await revokeAllSessions(u.id, currentJti);

    res.json({ ok: true, message: "Đổi mật khẩu thành công", must_change_password: false });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/auth/me", auth(), async (req, res) => {
  const db = loadDB();
  const u = findByIdOrMongo(db.users, req.user.id);
  if (!u) return res.status(404).json({ message: "Không tìm thấy user" });
  const changed = autoFillFromCode(db, u);
  if (changed) await saveDBOrThrow(db);
  res.json({
    id: u.id, email: u.email, name: u.name, role: u.role, points: u.points || 0, phone: u.phone || "", address: u.address || "", avatar: u.avatar || "",
    student_code: u.student_code || "", teacher_code: u.teacher_code || "", year_in: u.year_in || null, major_code: u.major_code || "",
    major_code_full: u.major_code_full || "", major_name: u.major_name || "", faculty: u.faculty || "", unit_code: u.unit_code || "",
    class_name: u.class_name || "", birth_date: u.birth_date || "", gender: u.gender || "",
    manual_override: !!u.manual_override, must_change_password: !!u.must_change_password,
  });
});

app.put("/api/auth/profile", auth(), async (req, res) => {
  try {
    const db = loadDB();
    const u = findByIdOrMongo(db.users, req.user.id);
    if (!u) return res.status(404).json({ message: "Không tìm thấy user" });
    const { name, phone, avatar, address, email, student_code, class_name, birth_date, gender } = req.body;
    if (student_code !== undefined) {
      const clean = String(student_code || "").trim();
      if (u.student_code && u.student_code !== clean) return res.status(403).json({ message: "MSSV đã liên kết, không thể thay đổi.", code: "MSSV_LOCKED" });
      if (clean) {
        if (!/^\d{10}$/.test(clean)) return res.status(400).json({ message: "MSSV phải là 10 chữ số" });
        const existing = db.users.find((x) => x.id !== u.id && x.student_code === clean);
        if (existing) return res.status(400).json({ message: "MSSV này đã được liên kết với tài khoản khác.", code: "MSSV_ALREADY_LINKED", linked_email_masked: maskEmail(existing.email) });
        u.student_code = clean;
        autoFillFromCode(db, u);
      }
    }
    if (email && normalizeEmail(email) !== normalizeEmail(u.email)) {
      const emailNorm = normalizeEmail(email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) return res.status(400).json({ message: "Email không hợp lệ" });
      if (db.users.find((x) => x.id !== u.id && normalizeEmail(x.email) === emailNorm)) return res.status(400).json({ message: "Email đã được sử dụng" });
      u.email = emailNorm;
    }
    if (name !== undefined && name.trim()) u.name = name.trim();
    if (phone !== undefined) {
      const phoneTrim = String(phone).trim();
      if (phoneTrim && !/^[0-9]{10,11}$/.test(phoneTrim)) return res.status(400).json({ message: "SĐT phải 10-11 số" });
      u.phone = phoneTrim;
    }
    if (avatar !== undefined) u.avatar = avatar;
    if (address !== undefined) u.address = address.trim();
    if (class_name !== undefined) u.class_name = String(class_name || "").trim();
    if (birth_date !== undefined) u.birth_date = String(birth_date || "").trim();
    if (gender !== undefined) u.gender = String(gender || "").trim();
    await saveDBOrThrow(db);
    res.json({ id: u.id, email: u.email, name: u.name, role: u.role, phone: u.phone, avatar: u.avatar, address: u.address, class_name: u.class_name || "", birth_date: u.birth_date || "", gender: u.gender || "", points: u.points, student_code: u.student_code || "", teacher_code: u.teacher_code || "", year_in: u.year_in || null, major_code: u.major_code || "", major_name: u.major_name || "", faculty: u.faculty || "" });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ============================================================
// OAUTH
// ============================================================
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || "";
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";
const GOOGLE_OAUTH_ENABLED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
const FACEBOOK_OAUTH_ENABLED = !!(FACEBOOK_APP_ID && FACEBOOK_APP_SECRET);

app.post("/api/auth/google/callback", async (req, res) => {
  try {
    if (!GOOGLE_OAUTH_ENABLED) return res.status(503).json({ message: "Google OAuth chưa được cấu hình" });
    const { code, redirectUri } = req.body || {};
    if (!code || !redirectUri) return res.status(400).json({ message: "Thiếu code/redirectUri" });
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.status(400).json({ message: tokenData.error_description || "Lỗi Google Auth" });
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: "Bearer " + tokenData.access_token } });
    const profile = await userRes.json();
    if (!profile.email) return res.status(400).json({ message: "Google không trả về email" });
    const db = loadDB();
    const emailNorm = normalizeEmail(profile.email);
    let user = db.users.find((u) => normalizeEmail(u.email) === emailNorm);
     if (!user) {
      const id = nextId(db.users);
      user = { id, email: emailNorm, password: "", name: profile.name || emailNorm.split("@")[0], phone: "", role: "CUSTOMER", status: "Hoạt động", points: 0, provider: "google", avatar: profile.picture || "", created_at: new Date().toISOString() };
      db.users.push(user);
      await saveDB(db); // ✅ FIX: Đổi thành saveDB (chạy ngầm, không chặn login)
    } else if (profile.picture && !user.avatar) {
      user.avatar = profile.picture;
      await saveDB(db); // ✅ FIX
    }
    const { accessToken } = await issueTokens(res, user, EFFECTIVE_JWT_SECRET, { req });
    res.json({
      token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar || "",
        must_change_password: !!user.must_change_password,
      },
    });
  } catch (e) { res.status(500).json({ message: "Lỗi xác thực Google: " + e.message }); }
});

app.post("/api/auth/facebook/callback", async (req, res) => {
  try {
    if (!FACEBOOK_OAUTH_ENABLED) return res.status(503).json({ message: "Facebook OAuth chưa được cấu hình" });
    const { code, redirectUri } = req.body || {};
    if (!code || !redirectUri) return res.status(400).json({ message: "Thiếu code/redirectUri" });
    const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${FACEBOOK_APP_ID}&client_secret=${FACEBOOK_APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.status(400).json({ message: tokenData.error?.message || "Lỗi Facebook Auth" });
    const userRes = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture.width(200)&access_token=${tokenData.access_token}`);
    const profile = await userRes.json();
    if (!profile.email) return res.status(400).json({ message: "Facebook không trả về email" });
    const db = loadDB();
    const emailNorm = normalizeEmail(profile.email);
    let user = db.users.find((u) => normalizeEmail(u.email) === emailNorm);
     if (!user) {
      const id = nextId(db.users);
      user = { id, email: emailNorm, password: "", name: profile.name || "FB User", phone: "", role: "CUSTOMER", status: "Hoạt động", points: 0, provider: "facebook", avatar: profile.picture?.data?.url || "", created_at: new Date().toISOString() };
      db.users.push(user);
      await saveDB(db); // ✅ FIX
    } else if (profile.picture?.data?.url && !user.avatar) {
      user.avatar = profile.picture.data.url;
      await saveDB(db); // ✅ FIX
    }
    const { accessToken } = await issueTokens(res, user, EFFECTIVE_JWT_SECRET, { req });
    res.json({
      token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar || "",
        must_change_password: !!user.must_change_password,
      },
    });
  } catch (e) { res.status(500).json({ message: "Lỗi xác thực Facebook: " + e.message }); }
});

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || "";
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || "";
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || "f1ea4557-ac25-41fe-9da9-089970695a61";
const MICROSOFT_OAUTH_ENABLED = !!(MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET);

async function microsoftCallbackHandler(req, res) {
  try {
    if (!MICROSOFT_OAUTH_ENABLED) return res.status(503).json({ message: "Microsoft OAuth chưa được cấu hình" });
    const code = req.query.code || req.body?.code;
    const proto = String(req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0].trim() || "https";
    const fwdHost = req.get("x-forwarded-host") || req.get("host");
    const defaultRedirect = `${proto}://${fwdHost}/auth/microsoft-entra-id/callback`;
    const redirectUri = req.body?.redirectUri || req.query.redirectUri || defaultRedirect;
    if (!code) return res.status(400).json({ message: "Thiếu code" });

    const tokenRes = await fetch(`https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: MICROSOFT_CLIENT_ID, client_secret: MICROSOFT_CLIENT_SECRET, code, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.status(400).json({ message: tokenData.error_description || "Lỗi Microsoft Auth" });

    const userRes = await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: "Bearer " + tokenData.access_token } });
    const profile = await userRes.json();
    const emailNorm = normalizeEmail(profile.mail || profile.userPrincipalName || "");
    if (!emailNorm) return res.status(400).json({ message: "Microsoft không trả về email" });
    const db = loadDB();
    const classify = classifyEmail(emailNorm);
    let user = db.users.find((u) => normalizeEmail(u.email) === emailNorm);
    let isNewUser = false, autoFilled = false;
    if (user) {
      if (!user.provider) user.provider = "microsoft";
      if (profile.displayName && !user.name) user.name = profile.displayName;
      if (emailNorm.endsWith("@hpn.edu.vn") && classify.code && !user.student_code) user.student_code = classify.code;
      if (emailNorm.endsWith("@vwa.edu.vn") && classify.code && !user.teacher_code) {
        const local = emailNorm.split("@")[0];
        if (/^\d{6}-\d{7}$/.test(local)) user.teacher_code = local;
      }
     autoFilled = autoFillFromCode(db, user);
      await saveDB(db); // ✅ FIX
    } else {
      const id = nextId(db.users);
      // ... (code khởi tạo user)
      db.wallets.push({ user_id: id, balance: 0, bank_name: "", bank_account: "", bank_account_name: "", linked_at: "", created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      autoFilled = autoFillFromCode(db, user);
      await saveDB(db); // ✅ FIX
      isNewUser = true;
    }
    const { accessToken } = await issueTokens(res, user, EFFECTIVE_JWT_SECRET, { req });
    res.json({
      token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar || "",
        must_change_password: !!user.must_change_password,
        student_code: user.student_code || "",
        teacher_code: user.teacher_code || "",
        major_name: user.major_name || "",
        faculty: user.faculty || "",
        year_in: user.year_in || null,
        is_new_user: isNewUser,
        auto_filled: autoFilled,
      },
    });
  } catch (e) {
    res.status(500).json({ message: "Lỗi xác thực Microsoft: " + e.message });
  }
}

app.get("/api/auth/callback/microsoft-entra-id", microsoftCallbackHandler);
app.get("/api/auth/microsoft-entra-id/callback", microsoftCallbackHandler);
app.post("/api/auth/microsoft-entra-id/callback", microsoftCallbackHandler);
app.post("/api/auth/callback/microsoft-entra-id", microsoftCallbackHandler);

// ============================================================
// MENU
// ============================================================
const menuCache = { data: null, expiresAt: 0 };
const MENU_CACHE_TTL_MS = 5000;

function getMenuCached(db) {
  const now = Date.now();
  if (menuCache.data && menuCache.expiresAt > now) return menuCache.data;
  menuCache.data = db.menu_items || [];
  menuCache.expiresAt = now + MENU_CACHE_TTL_MS;
  return menuCache.data;
}

app.get("/api/menu", (req, res) => {
  try {
    const db = loadDB();
    const { q = "", category, active_only, sort } = req.query;
    let items = [...getMenuCached(db)];

    if (active_only === "1" || active_only === "true") items = items.filter((m) => !!m.active);

    if (q) {
      const ql = String(q).toLowerCase();
      items = items.filter((m) => (m.name || "").toLowerCase().includes(ql));
    }

    const categoryNorm = String(category || "").trim();
    const isAll = !categoryNorm || categoryNorm === "Tất cả" || categoryNorm === "all" || categoryNorm === "ALL";
    if (!isAll) items = items.filter((m) => String(m.category || "").trim() === categoryNorm);

    const sortNorm = String(sort || "popular").trim().toLowerCase();
    if (sortNorm === "price_asc") items.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    else if (sortNorm === "price_desc") items.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    else if (sortNorm === "name_asc") items.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi"));
    else if (sortNorm === "name_desc") items.sort((a, b) => String(b.name || "").localeCompare(String(a.name || ""), "vi"));
    else if (sortNorm === "rating") items.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    else if (sortNorm === "newest") items.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    else items.sort((a, b) => (Number(b.sold) || 0) - (Number(a.sold) || 0));

    res.json(items);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/menu", auth(["ADMIN", "EMPLOYEE"]), async (req, res) => {
  try {
    const db = loadDB();
    const body = { ...req.body };
    if (!body.name || !body.name.trim()) return res.status(400).json({ message: "Tên món không được để trống" });
    if (body.price !== undefined && (isNaN(Number(body.price)) || Number(body.price) < 0)) return res.status(400).json({ message: "Giá không được âm" });
    if (body.stock !== undefined && (isNaN(Number(body.stock)) || Number(body.stock) < 0)) return res.status(400).json({ message: "Tồn kho không được âm" });
    if (body.discount_percent !== undefined) {
      const d = Number(body.discount_percent);
      if (isNaN(d) || d < 0 || d > 90) return res.status(400).json({ message: "Giảm giá phải từ 0-90%" });
    }
    if (body.original_price !== undefined && (isNaN(Number(body.original_price)) || Number(body.original_price) < 0)) return res.status(400).json({ message: "Giá gốc không được âm" });
    if (body.original_price && body.discount_percent !== undefined) {
      body.price = body.discount_percent > 0 ? Math.round(body.original_price * (1 - body.discount_percent / 100)) : body.original_price;
    }
    const id = nextId(db.menu_items);
    const item = { active: 1, sold: 0, image: "", ...body, id };
    await applyMenuImageToItem(item, body.image, { persist: mongoReady });
    fillMenuNutrition(item);
    await autoTranslateMenuItem(db, item, null);
    db.menu_items.push(item);
    await saveDBOrThrow(db);
    invalidateMenuCache();
    res.status(201).json(item);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put("/api/menu/:id", auth(["ADMIN", "EMPLOYEE"]), async (req, res) => {
  try {
    const db = loadDB();
    if (req.user.role === "EMPLOYEE") {
      const emp = findByIdOrMongo(db.users, req.user.id);
      const rolePerms = ROLE_PERMISSIONS.EMPLOYEE || [];
      const customPerms = emp?.permissions || [];
      const allPerms = new Set([...rolePerms, ...customPerms]);
      if (!allPerms.has("menu.update")) return res.status(403).json({ message: "Bạn không có quyền sửa món" });
    }
    const target = findByIdOrMongo(db.menu_items, req.params.id);
    if (!target) return res.status(404).json({ message: "Không tìm thấy món" });
    const i = db.menu_items.indexOf(target);
    const oldItem = db.menu_items[i];
    const newData = { ...req.body };
    delete newData.id;
    if (newData.price !== undefined && (isNaN(Number(newData.price)) || Number(newData.price) < 0)) return res.status(400).json({ message: "Giá không được âm" });
    if (newData.stock !== undefined && (isNaN(Number(newData.stock)) || Number(newData.stock) < 0)) return res.status(400).json({ message: "Tồn kho không được âm" });
    if (newData.discount_percent !== undefined) {
      const d = Number(newData.discount_percent);
      if (isNaN(d) || d < 0 || d > 90) return res.status(400).json({ message: "Giảm giá phải từ 0-90%" });
    }
    if (newData.original_price !== undefined && (isNaN(Number(newData.original_price)) || Number(newData.original_price) < 0)) return res.status(400).json({ message: "Giá gốc không được âm" });
    if (newData.original_price && newData.discount_percent !== undefined) {
      newData.price = newData.discount_percent > 0 ? Math.round(newData.original_price * (1 - newData.discount_percent / 100)) : newData.original_price;
    }
    if (newData.price !== undefined && Number(newData.price) !== Number(oldItem.price)) {
      if (!db.price_history) db.price_history = [];
      db.price_history.push({
        id: nextId(db.price_history), menu_item_id: oldItem.id, menu_item_name: oldItem.name,
        old_price: oldItem.price, new_price: Number(newData.price),
        changed_by: req.user.name, changed_by_id: req.user.id, reason: newData.reason || "", created_at: new Date().toISOString(),
      });
    }
    delete newData.reason;
    const updated = { ...oldItem, ...newData };
    if (Object.prototype.hasOwnProperty.call(req.body, "image")) {
      await applyMenuImageToItem(updated, req.body.image, { persist: mongoReady });
    }
    fillMenuNutrition(updated);
    await autoTranslateMenuItem(db, updated, oldItem);
    db.menu_items[i] = updated;
    await saveDBOrThrow(db);
    invalidateMenuCache();
    res.json({ ok: true, item: updated });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/price-history", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  const db = loadDB();
  const { menu_item_id } = req.query;
  let list = db.price_history || [];
  if (menu_item_id) list = list.filter((h) => h.menu_item_id == menu_item_id);
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(list);
});

app.delete("/api/menu/:id", auth(["ADMIN", "EMPLOYEE"]), async (req, res) => {
  try {
    const db = loadDB();
    const target = findByIdOrMongo(db.menu_items, req.params.id);
    if (!target) return res.status(404).json({ message: "Không tìm thấy món" });
    db.menu_items = db.menu_items.filter((m) => m !== target);
    await saveDBOrThrow(db);
    invalidateMenuCache();
    if (mongoReady) await deleteMenuImage(target.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ============================================================
// USERS
// ============================================================
const VALID_ROLES = ["ADMIN", "EMPLOYEE", "CUSTOMER"];

app.get("/api/users", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  const { role } = req.query;
  const list = role ? db.users.filter((u) => u.role === role) : db.users;
  res.json(list.map((u) => ({ ...u, password: undefined })));
});

app.post("/api/users", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB();
    const emailNorm = normalizeEmail(req.body.email);
    if (!emailNorm) return res.status(400).json({ message: "Thiếu email" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) return res.status(400).json({ message: "Email không hợp lệ" });
    if (db.users.find((u) => normalizeEmail(u.email) === emailNorm)) return res.status(400).json({ message: "Email đã được sử dụng" });

    const role = req.body.role || "EMPLOYEE";
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ message: "Role không hợp lệ" });

    let cleanTeacherCode = "";
    if (req.body.teacher_code) {
      const clean = String(req.body.teacher_code).trim();
      if (!/^\d{6}-\d{7}$/.test(clean)) return res.status(400).json({ message: "Mã GV phải có format YYYYNN-NNNNNNN" });
      if (db.users.find((u) => u.teacher_code === clean)) return res.status(400).json({ message: "Mã GV này đã được sử dụng" });
      cleanTeacherCode = clean;
    }

    const id = nextId(db.users);
    const useTempPassword = !req.body.password;
    const tempPassword = useTempPassword ? generateTempPassword() : String(req.body.password);
    const hash = bcrypt.hashSync(tempPassword, 10);
    const mustChange = req.body.must_change_password !== undefined
      ? req.body.must_change_password === true || req.body.must_change_password === "true"
      : role !== "CUSTOMER";

    const user = {
      id, email: emailNorm, password: hash, name: req.body.name, phone: req.body.phone || "",
      role, status: "Hoạt động", points: 0, teacher_code: cleanTeacherCode, must_change_password: mustChange,
      chat_enabled: role === "EMPLOYEE" ? true : undefined, created_at: new Date().toISOString(),
    };

    if (cleanTeacherCode) autoFillFromCode(db, user);
    db.users.push(user);
    await saveDBOrThrow(db);
    res.status(201).json({ ...user, password: undefined, tempPassword: useTempPassword ? tempPassword : undefined, must_change_password: mustChange });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put("/api/users/:id", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB();
    const target = findByIdOrMongo(db.users, req.params.id);
    if (!target) return res.status(404).json({ message: "Không tìm thấy user" });
    const i = db.users.indexOf(target);
    const data = { ...req.body };
    if (data.role !== undefined && data.role !== db.users[i].role) return res.status(400).json({ message: "Không thể đổi role qua endpoint này." });
    delete data.role;
    if (data.email !== undefined) {
      const emailNorm = normalizeEmail(data.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) return res.status(400).json({ message: "Email không hợp lệ" });
      if (db.users.find((u) => u.id != target.id && normalizeEmail(u.email) === emailNorm)) return res.status(400).json({ message: "Email đã được sử dụng" });
      data.email = emailNorm;
    }
    if (data.password) {
      data.password = bcrypt.hashSync(data.password, 10);
      if (data.must_change_password === undefined) data.must_change_password = true;
    } else delete data.password;
    if (data.must_change_password !== undefined) data.must_change_password = data.must_change_password === true || data.must_change_password === "true";
    if (data.teacher_code !== undefined) {
      const clean = String(data.teacher_code || "").trim();
      if (clean && !/^\d{6}-\d{7}$/.test(clean)) return res.status(400).json({ message: "Mã GV phải có format YYYYNN-NNNNNNN" });
      if (clean && db.users.find((u) => u.id != target.id && u.teacher_code === clean)) return res.status(400).json({ message: "Mã GV này đã được sử dụng" });
      data.teacher_code = clean;
    }
    db.users[i] = { ...db.users[i], ...data };
    autoFillFromCode(db, db.users[i]);
    await saveDBOrThrow(db);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete("/api/users/:id", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB();
    const targetId = String(req.params.id).trim();
    const before = db.users.length;

    const found = db.users.find((u) => {
      return (
        String(u.id) === targetId ||
        String(u._id) === targetId ||
        String(u.code) === targetId ||
        String(u.email) === targetId
      );
    });

    if (!found) {
      return res.status(404).json({
        message: `Không tìm thấy user với ID ${targetId}`,
        tried: ["id", "_id", "code", "email"],
      });
    }

    db.users = db.users.filter((u) => u !== found);

    if (mongoReady && mongoose.connection.db) {
      const coll = mongoose.connection.db.collection("users");
      if (found._id) await coll.deleteOne({ _id: found._id });
      else if (found.id !== undefined) await coll.deleteOne({ id: found.id });
      await saveDBOrThrow(db);
    }

    const removed = before - db.users.length;
    console.log(`🗑  Xoá user "${found.name}" (${found.email}) — Đã xoá ${removed} user`);

    res.json({ ok: true, removed, deleted_user: { id: found.id, email: found.email, name: found.name } });
  } catch (e) {
    console.error("DELETE /api/users error:", e);
    res.status(500).json({ message: "Lỗi xoá user: " + e.message });
  }
});

app.post("/api/users/:id/reset-password", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB();
    const u = findByIdOrMongo(db.users, req.params.id);
    if (!u) return res.status(404).json({ message: "Không tìm thấy user" });
    const tempPassword = generateTempPassword();
    u.password = bcrypt.hashSync(tempPassword, 10);
    u.must_change_password = true;
    u.password_reset_at = new Date().toISOString();
    await saveDBOrThrow(db);
    res.json({ ok: true, tempPassword, must_change_password: true, message: "Đã cấp lại mật khẩu tạm" });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ============================================================
// SCHOOL
// ============================================================
app.get("/api/school/parse-student/:code", (req, res) => {
  try { res.json(parseStudentCode(req.params.code, loadDB())); } catch (e) { res.status(500).json({ message: e.message }); }
});
app.get("/api/school/parse-teacher/:code", (req, res) => {
  try { res.json(parseTeacherCode(req.params.code, loadDB())); } catch (e) { res.status(500).json({ message: e.message }); }
});
app.get("/api/school/majors-map", (req, res) => {
  try { res.json(getMajorsMap(loadDB())); } catch (e) { res.status(500).json({ message: e.message }); }
});
app.put("/api/school/majors-map", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB();
    const { map } = req.body;
    if (!map || typeof map !== "object" || Array.isArray(map)) return res.status(400).json({ message: "map phải là object" });
    const clean = {};
    for (const [code, info] of Object.entries(map)) {
      if (!/^\d{3,4}$/.test(code)) continue;
      if (!info || typeof info !== "object") continue;
      clean[code] = { name: String(info.name || "").slice(0, 200), faculty: String(info.faculty || "").slice(0, 200), code_full: String(info.code_full || "").slice(0, 20) };
    }
    if (!db.settings) db.settings = {};
    db.settings.majorsMap = clean;
    await saveDBOrThrow(db);
    res.json({ ok: true, map: clean });
  } catch (e) { res.status(500).json({ message: e.message }); }
});
app.post("/api/school/majors-map/reset", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB();
    if (!db.settings) db.settings = {};
    db.settings.majorsMap = { ...DEFAULT_MAJORS_MAP };
    await saveDBOrThrow(db);
    res.json({ ok: true, map: db.settings.majorsMap });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put("/api/users/:id/points", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB();
    const u = findByIdOrMongo(db.users, req.params.id);
    if (!u) return res.status(404).json({ message: "Không tìm thấy user" });
    const { points, reason } = req.body;
    const p = Number(points);
    if (!Number.isFinite(p) || p < 0) return res.status(400).json({ message: "Điểm phải là số >= 0" });
    const old = u.points || 0;
    u.points = p;
    u.points_updated_at = new Date().toISOString();
    u.points_updated_by = req.user.name;
    if (reason) u.points_reason = String(reason).slice(0, 200);
    if (!db.points_history) db.points_history = [];
    db.points_history.push({ id: nextId(db.points_history), user_id: u.id, user_name: u.name, old_points: old, new_points: p, delta: p - old, reason: reason || "Admin điều chỉnh", changed_by: req.user.name, changed_by_id: req.user.id, created_at: new Date().toISOString() });
    await saveDBOrThrow(db);
    res.json({ ok: true, user: { id: u.id, name: u.name, points: u.points } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put("/api/users/:id/school-info", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB();
    const u = findByIdOrMongo(db.users, req.params.id);
    if (!u) return res.status(404).json({ message: "Không tìm thấy user" });
    const { student_code, teacher_code, major_code, major_name, faculty, year_in, manual_override } = req.body;
    if (student_code !== undefined) {
      const clean = String(student_code || "").trim();
      if (clean && !/^\d{10}$/.test(clean)) return res.status(400).json({ message: "MSSV phải là 10 chữ số" });
      u.student_code = clean;
    }
    if (teacher_code !== undefined) u.teacher_code = String(teacher_code || "").trim();
    if (major_code !== undefined) u.major_code = String(major_code || "").trim();
    if (major_name !== undefined) u.major_name = String(major_name || "").trim();
    if (faculty !== undefined) u.faculty = String(faculty || "").trim();
    if (year_in !== undefined) u.year_in = Number(year_in) || null;
    if (manual_override !== undefined) u.manual_override = !!manual_override;
    if (!u.manual_override) autoFillFromCode(db, u);
    await saveDBOrThrow(db);
    res.json({ ok: true, user: { id: u.id, name: u.name, student_code: u.student_code, teacher_code: u.teacher_code, major_code: u.major_code, major_name: u.major_name, faculty: u.faculty, year_in: u.year_in, manual_override: !!u.manual_override } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete("/api/users/:id/unlink-mssv", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB();
    const u = findByIdOrMongo(db.users, req.params.id);
    if (!u) return res.status(404).json({ message: "Không tìm thấy user" });
    delete u.student_code; delete u.major_code; delete u.major_code_full; delete u.major_name; delete u.faculty; delete u.year_in; delete u.mssv_parsed_at;
    u.manual_override = false;
    await saveDBOrThrow(db);
    res.json({ ok: true, message: `Đã gỡ liên kết MSSV của ${u.name}` });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ============================================================
// 🔧 POST /api/orders — REWRITE HOÀN TOÀN (V23)
// ============================================================
// Fix các lỗi: orderCreated undefined, walletTx null, finalPointsEarned
// undefined, duplicate id/code, cache mutate trước khi tx commit.
// ============================================================
// 🔧 POST /api/orders — CÓ CƠ CHẾ RETRY CHỐNG LỖI 503
// ============================================================
app.post("/api/orders", auth(), async (req, res) => {
  const db = loadDB();
  let retries = 3;
  
  while (retries > 0) {
    try {
      const {
        items,
        payment = "Tiền mặt",
        note = "",
        pickupTime = "",
        discount = 0,
        voucherCode,
        isGreen = false,
        useXu: useXuRaw,
      } = req.body;

      // ─── 0. KIỂM TRA KẾT NỐI DB TRƯỚC KHI LÀM BẤT CỨ GÌ ───
      if (!mongoReady || !mongoose.connection.db) {
        throw new Error("MONGODB_NOT_READY"); // Ném lỗi để kích hoạt retry
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Giỏ hàng trống" });
      }

      // ─── 1. Chuẩn bị danh mục ─────────────────────────────
      const menuById = new Map((db.menu_items || []).map((m) => [String(m.id), m]));
      const sizeList = Array.isArray(db.sizes) && db.sizes.length > 0
        ? db.sizes
        : [
            { id: "S", name: "Nhỏ", extra_price: 0 },
            { id: "M", name: "Vừa", extra_price: 5000 },
            { id: "L", name: "Lớn", extra_price: 10000 },
          ];
      const toppingList = Array.isArray(db.toppings) ? db.toppings : [];

      // ─── 2. Validate từng món + tính subtotal ─────────────
      const qtyByItem = new Map();
      const detailed = [];
      let subtotal = 0;

      for (const it of items) {
        const q = Number(it.qty);
        if (!Number.isFinite(q) || q <= 0 || !Number.isInteger(q)) {
          return res.status(400).json({ message: "Số lượng món không hợp lệ" });
        }
        const mid = String(it.menuItem ?? "");
        const m = menuById.get(mid);
        if (!m) return res.status(400).json({ message: "Món không tồn tại (id=" + mid + ")" });
        if (!m.active) return res.status(400).json({ message: `${m.name} đã tạm ngừng bán` });
        qtyByItem.set(mid, (qtyByItem.get(mid) || 0) + q);

        const requestedSize = String(it.size || "S");
        const selectedSize = sizeList.find((s) => String(s.id) === requestedSize);
        if (!selectedSize) {
          return res.status(400).json({ message: `Size ${requestedSize} không hợp lệ cho món ${m.name}` });
        }

        const requestedToppings = Array.isArray(it.toppings) ? it.toppings : [];
        const selectedToppings = [];
        const seenToppings = new Set();
        for (const toppingId of requestedToppings) {
          const ts = String(toppingId);
          if (seenToppings.has(ts)) continue;
          seenToppings.add(ts);
          const topping = toppingList.find((t) => String(t.id) === ts);
          if (!topping) return res.status(400).json({ message: `Topping không tồn tại (id=${ts})` });
          selectedToppings.push({ id: topping.id, name: topping.name, price: Math.max(0, Number(topping.price) || 0) });
        }

        const basePrice = Math.max(0, Number(m.price) || 0);
        const sizeExtra = Math.max(0, Number(selectedSize.extra_price) || 0);
        const toppingsTotal = selectedToppings.reduce((s, t) => s + t.price, 0);
        const unitPrice = basePrice + sizeExtra + toppingsTotal;
        subtotal += unitPrice * q;

        detailed.push({
          menu_item_id: m.id,
          name: m.name,
          price: unitPrice,
          base_price: basePrice,
          qty: q,
          size: { id: selectedSize.id, name: selectedSize.name || selectedSize.id, extra_price: sizeExtra },
          toppings: selectedToppings,
        });
      }

      // ─── 3. Check tồn kho ─────────────────────────────────
      for (const [mid, qty] of qtyByItem) {
        const m = menuById.get(mid);
        if ((Number(m.stock) || 0) < qty) {
          return res.status(400).json({ message: `${m.name} không đủ hàng (còn ${Number(m.stock) || 0}, cần ${qty})` });
        }
      }

      // ─── 4. Validate khung giờ nhận ───────────────────────
      const pickupSlotId = (() => {
        const direct = String(pickupTime || "").replace(/\s/g, "");
        if (/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(direct)) return direct;
        const match = String(note).match(/Nhận (?:lúc|hàng)\s*:?\s*(\d{2}:\d{2}\s*-\s*\d{2}:\d{2})/);
        return match ? match[1].replace(/\s/g, "") : "";
      })();

      if (pickupSlotId) {
        const slots = getTimeSlots(db);
        const slot = slots.find((s) => s.id === pickupSlotId);
        if (!slot) return res.status(400).json({ message: `Khung giờ ${pickupSlotId} không tồn tại.` });
        if (!slot.enabled) return res.status(400).json({ message: `Khung giờ ${pickupSlotId} đã kín hoặc tạm ngưng.` });
      }

      // ─── 5. Validate voucher ─────────────────────────────
      let computedDiscount = 0;
      let usedVoucher = null;
      if (voucherCode) {
        const vc = (db.vouchers || []).find((v) =>
          v.code.toUpperCase() === String(voucherCode).toUpperCase() && v.user_id === req.user.id && !v.used
        );
        if (!vc) return res.status(400).json({ message: "Voucher không hợp lệ hoặc đã dùng" });
        if (Number(vc.value) > subtotal) return res.status(400).json({ message: "Voucher vượt quá giá trị đơn hàng" });
        computedDiscount = Number(vc.value) || 0;
        usedVoucher = vc;
      }

      const clientDiscount = Number(discount) || 0;
      if (!voucherCode && clientDiscount > 0) return res.status(400).json({ message: "Giảm giá không hợp lệ (không có voucher)" });
      if (voucherCode && Math.abs(clientDiscount - computedDiscount) > 1) return res.status(400).json({ message: "Giảm giá không khớp với voucher" });

      // ─── 6. Xử lý dùng xu (tối đa 30%) ────────────────────
      const customer = db.users.find((u) => u.id === req.user.id);
      if (!customer) return res.status(400).json({ message: "Không tìm thấy tài khoản" });

      let xuDiscount = 0;
      const useXu = useXuRaw === true;
      if (useXu) {
        const pointsConfig = getPointsConfig(db);
        const maxRedeemPercent = Math.max(0, Math.min(100, Number(pointsConfig.redeem?.max_redeem_percent ?? 30)));
        const availableXu = Math.max(0, Number(customer.points) || 0);
        const remainingAfterVoucher = Math.max(0, subtotal - computedDiscount);
        const maxXuAllowed = Math.floor(remainingAfterVoucher * maxRedeemPercent / 100);
        xuDiscount = Math.min(availableXu, maxXuAllowed);
      }

      const total = Math.max(0, subtotal - computedDiscount - xuDiscount);
      if (payment === "CARD") {
  const studentCard = (db.student_cards || []).find(
    (item) => Number(item.user_id) === Number(req.user.id)
  );

  if (studentCard?.locked) {
    return res.status(400).json({
      message: "Thẻ sinh viên đang bị khóa. Vui lòng mở khóa thẻ trước khi thanh toán."
    });
  }
}
const isWalletPay = payment === "Ví Canteen" || payment === "WALLET";

      if (isWalletPay) {
        const w = getOrCreateWallet(db, req.user.id);
        if ((Number(w.balance) || 0) < total) {
          return res.status(400).json({ message: "Số dư ví không đủ." });
        }
      }

      // ─── 7. Tính điểm sẽ cộng ─────────────────────────────
      const __cfg = getPointsConfig(db);
      const __basePointsEarned = calcEarnPoints(total, __cfg);
      const __greenBonus = isGreen ? calcGreenBonus(__cfg) : 0;
      const __greenRequireApproval = isGreen && __cfg.earn.green_require_approval !== false;
      const __greenBonusAwarded = isGreen && !__greenRequireApproval ? __greenBonus : 0;
      const pointsEarned = __basePointsEarned + __greenBonusAwarded;

      // ─── 8. Build order object ─────────────────────────────
      const orderId = nextId(db.orders);
      const orderCode = generateOrderCode(db);
      const now = new Date().toISOString();

      const orderCreated = {
        id: orderId,
        code: orderCode,
        customer_id: req.user.id,
        customer_name: customer.name || req.user.name,
        items: detailed,
        subtotal,
        discount: computedDiscount,
        xu_discount: xuDiscount,
        total,
        payment,
        note: String(note || "").slice(0, 500),
        pickup_time: pickupSlotId || "",
        voucher_code: usedVoucher?.code || "",
        is_green: !!isGreen,
        green_requested: !!isGreen,
        green_status: isGreen ? (__greenRequireApproval ? "pending" : "approved") : null,
        green_points: __greenBonus,
        points_earned: pointsEarned,
        status: "Chờ xác nhận",
        created_at: now,
        updated_at: now,
      };

      // ─── 9. Build wallet transaction ────
      let walletTx = null;
      if (isWalletPay) {
        walletTx = {
          id: nextId(db.wallet_transactions || []),
          code: "PAY" + Date.now().toString().slice(-8) + Math.random().toString(36).slice(2, 5).toUpperCase(),
          user_id: req.user.id,
          user_name: customer.name,
          type: "payment",
          amount: total,
          method: "WALLET",
          status: "approved",
          note: "Thanh toán đơn " + orderCode,
          order_code: orderCode,
          created_at: now,
          approved_at: now,
        };
      }

      // ─── 10. Transaction trên Mongo ───────────────────────
      const useTransaction = mongoReady && supportsTransactions();
      if (useTransaction) {
        try {
          await withTransaction(async (session) => {
            const mongoDb = mongoose.connection.db;

            for (const [mid, qty] of qtyByItem) {
              const m = menuById.get(mid);
              const filter = m._id ? { _id: m._id } : { id: m.id };
              const ok = await atomicDecrement(mongoDb.collection("menu_items"), filter, "stock", qty, session);
              if (!ok) throw new Error(`${m.name} vừa hết hàng. Vui lòng chọn món khác.`);
              await mongoDb.collection("menu_items").updateOne(filter, { $inc: { sold: qty } }, { session });
            }

            if (isWalletPay && walletTx) {
              const walletColl = mongoDb.collection("wallets");
              const ok = await atomicDecrement(walletColl, { user_id: req.user.id }, "balance", total, session);
              if (!ok) throw new Error("Số dư ví không đủ (có thể do giao dịch đồng thời). Vui lòng thử lại.");
              const { _id, ...txDoc } = walletTx;
              await mongoDb.collection("wallet_transactions").insertOne(txDoc, { session });
            }

            if (useXu && xuDiscount > 0) {
              const userFilter = customer._id ? { _id: customer._id } : { id: customer.id };
              const ok = await atomicDecrement(mongoDb.collection("users"), userFilter, "points", xuDiscount, session);
              if (!ok) throw new Error("Điểm Xu không đủ (có thể do giao dịch đồng thời). Vui lòng thử lại.");
            }

            if (pointsEarned > 0) {
              const userFilter = customer._id ? { _id: customer._id } : { id: customer.id };
              await atomicIncrement(mongoDb.collection("users"), userFilter, "points", pointsEarned, session);
            }

            if (usedVoucher) {
              const vcFilter = usedVoucher._id ? { _id: usedVoucher._id } : { id: usedVoucher.id };
              const upd = await mongoDb.collection("vouchers").updateOne(
                { ...vcFilter, used: false },
                { $set: { used: true, used_at: now, order_code: orderCode } },
                { session }
              );
              if (upd.modifiedCount !== 1) throw new Error("Voucher đã được sử dụng bởi giao dịch khác.");
            }

            const { _id, ...orderDoc } = orderCreated;
            await mongoDb.collection("orders").insertOne(orderDoc, { session });
          });
        } catch (txErr) {
          console.error("[POST /api/orders] Transaction failed:", txErr.message);
          // Nếu lỗi transaction (vd: hết hàng, dư nợ) thì return 400 luôn, KHÔNG retry
          return res.status(400).json({ message: txErr.message });
        }
      }

      // ─── 11. Mirror sang dbCache ─────────────────
      try {
        for (const [mid, qty] of qtyByItem) {
          const m = menuById.get(mid);
          if (m) {
            m.stock = Math.max(0, (Number(m.stock) || 0) - qty);
            m.sold = (Number(m.sold) || 0) + qty;
          }
        }

        if (isWalletPay && walletTx) {
          const w = getOrCreateWallet(db, req.user.id);
          w.balance = Math.max(0, (Number(w.balance) || 0) - total);
          w.updated_at = now;
          if (!db.wallet_transactions) db.wallet_transactions = [];
          db.wallet_transactions.push(walletTx);
        }

        if (useXu && xuDiscount > 0) {
          const before = Number(customer.points) || 0;
          customer.points = Math.max(0, before - xuDiscount);
          recordPointsTransaction(
            db, customer, -xuDiscount,
            `Dùng ${xuDiscount} xu giảm giá đơn ${orderCode}`,
            { order_code: orderCode, source: "order_redeem", old_points: before, new_points: customer.points }
          );
        }

        if (pointsEarned > 0) {
          const before = Number(customer.points) || 0;
          customer.points = before + pointsEarned;
          if (__basePointsEarned > 0) {
            recordPointsTransaction(
              db, customer, __basePointsEarned,
              `Tích xu từ đơn hàng ${orderCode}`,
              { order_code: orderCode, source: "order_earn", old_points: before, new_points: before + __basePointsEarned }
            );
          }
          if (__greenBonusAwarded > 0) {
            recordPointsTransaction(
              db, customer, __greenBonusAwarded,
              `Thưởng VWA Green từ đơn hàng ${orderCode}`,
              { order_code: orderCode, source: "green_bonus", old_points: before + __basePointsEarned, new_points: customer.points }
            );
          }
        }

        if (usedVoucher) {
          usedVoucher.used = true;
          usedVoucher.used_at = now;
          usedVoucher.order_code = orderCode;
        }

        db.orders.push(orderCreated);
      } catch (cacheErr) {
        console.warn("[POST /api/orders] dbCache mirror failed:", cacheErr.message);
      }

      invalidateMenuCache();
      invalidateStatsCache();

      notifyNewOrder(db, orderCreated);

      try {
        broadcastSse("order.new", {
          id: orderCreated.id,
          code: orderCreated.code,
          customer_name: orderCreated.customer_name,
          total: orderCreated.total,
          items: orderCreated.items.map((it) => ({ name: it.name, qty: it.qty })),
          status: orderCreated.status,
          created_at: orderCreated.created_at,
        });
      } catch (e) {
        console.warn("[KDS] broadcast order.new fail:", e.message);
      }

      try { await saveDBOrThrow(db); }
      catch (e) { console.warn("[POST /api/orders] save after commit failed:", e.message); }

      // 🔧 THÀNH CÔNG: Trả kết quả và THOÁT VÒNG LẶP
      return res.status(201).json({ ...orderCreated, _id: orderCreated.id });

    } catch (e) {
      // 🔧 BẮT LỖI VÀ RETRY NẾU DB CHƯA SẴN SÀNG
      if (e.message === "MONGODB_NOT_READY" || e.message.includes("buffering timed out")) {
        console.warn(`[POST /api/orders] DB chưa sẵn sàng. Thử lại lần ${4 - retries}/3...`);
        retries--;
        if (retries > 0) {
          await new Promise((r) => setTimeout(r, 1500)); // Chờ 1.5s để Mongo khởi động
          continue; // Chạy lại vòng lặp
        }
      }
      
      // Nếu là lỗi khác (hoặc hết lượt retry)
      console.error("[POST /api/orders] unexpected:", e);
      return res.status(500).json({ message: e.message || "Không thể tạo đơn hàng." });
    }
  }
});

// ============================================================
// KDS — REAL-TIME (SSE + Polling)
// ============================================================
// 🔧 FIX: Vercel Serverless không hỗ trợ SSE tốt, gây lỗi 403/Timeout. 
// Chuyển sang dùng Polling (đã có sẵn ở route /api/kds/poll).
app.get("/api/kds/stream", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  res.status(501).json({ message: "SSE not supported on Vercel. Please use polling." });
});

app.get("/api/kds/poll", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  try {
    const since = Number(req.query.since) || 0;
    const db = loadDB();
    const now = Date.now();

    const changed = (db.orders || []).filter((o) => {
      const t = new Date(o.updated_at || o.created_at || 0).getTime();
      return t > since;
    });

    res.set("Cache-Control", "no-store");
    res.json({
      server_time: now,
      count: changed.length,
      orders: changed.map((o) => ({
        id: o.id,
        code: o.code,
        status: o.status,
        customer_name: o.customer_name,
        total: o.total,
        item_count: (o.items || []).length,
        updated_at: o.updated_at || o.created_at,
      })),
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/kds/stats", auth(["ADMIN"]), (_req, res) => {
  res.json({ ...sseStats(), time: new Date().toISOString() });
});

// ============================================================
// ORDERS — Rest of endpoints
// ============================================================
app.get("/api/orders/me", auth(), (req, res) => {
  const db = loadDB();
  const userId = Number(req.user.id); // 🔧 Ép kiểu
  const enrich = (o) => ({ ...o, items: (o.items || []).map((it) => { const menu = (db.menu_items || []).find((m) => m.id == it.menu_item_id); return { ...it, image: menu?.image || "", category: menu?.category || "" }; }), _id: o.id });
  
  // 🔧 Ép kiểu khi so sánh
  res.json(db.orders.filter((o) => Number(o.customer_id) === userId).map(enrich));
});

app.get("/api/orders", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  const db = loadDB();
  const { status } = req.query;
  let list = db.orders;
  if (status && status !== "Tất cả") list = list.filter((o) => o.status === status);
  res.json(list.map((o) => ({ ...o, _id: o.id })));
});

app.get("/api/orders/public-qr/:code", (req, res) => {
  try {
    const db = loadDB();
    const code = String(req.params.code || "").trim();
    const order = (db.orders || []).find((item) => String(item.code || "").toUpperCase() === code.toUpperCase());
    if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng." });
    const items = (order.items || []).map((item) => ({ name: String(item.name || "Món ăn"), quantity: Math.max(1, Number(item.qty ?? 1) || 1), unitPrice: Number(item.price ?? 0) || 0 }));
    res.set("Cache-Control", "no-store");
    return res.json({ order: { code: order.code, status: order.status || "Chờ xác nhận", created_at: order.created_at || null, updated_at: order.updated_at || null, total: Number(order.total ?? 0) || 0, discount: Number(order.discount || 0) || 0, items } });
  } catch (e) { return res.status(500).json({ message: "Không thể tra cứu đơn hàng." }); }
});

app.post("/api/orders/scan-pickup/lookup", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  try {
    const db = loadDB();
    if (!hasOrderProcessPermission(db, req.user)) return res.status(403).json({ message: "Bạn không có quyền xử lý đơn hàng" });
    const rawCode = String(req.body?.orderCode || "").trim();
    let orderCode = rawCode.replace(/^CANTEEN_VWA_ORDER\|/i, "").trim();
    if (/^https?:\/\//i.test(orderCode)) {
      try { const qrUrl = new URL(orderCode); const match = qrUrl.pathname.match(/\/order-qr\/([^/]+)\/?$/i); if (match) orderCode = decodeURIComponent(match[1]); } catch { }
    }
    if (!orderCode) return res.status(400).json({ message: "Thiếu mã đơn hàng trong QR" });
    const order = (db.orders || []).find((item) => String(item.code || "").toUpperCase() === orderCode.toUpperCase());
    if (!order) return res.status(404).json({ message: `Không tìm thấy đơn hàng ${orderCode}` });
    const customer = findByIdOrMongo(db.users, order.customer_id);
    const items = (order.items || []).map((item) => { const menu = (db.menu_items || []).find((entry) => entry.id == item.menu_item_id); return { ...item, image: item.image || menu?.image || "", category: item.category || menu?.category || "" }; });
    res.json({ order: { ...order, _id: order.id, items, customer_student_code: customer?.student_code || "" } });
  } catch (e) { res.status(500).json({ message: e.message || "Không tra cứu được đơn hàng" }); }
});

app.post("/api/orders/:id/scan-received", auth(["ADMIN", "EMPLOYEE"]), async (req, res) => {
  try {
    const db = loadDB();
    if (!hasOrderProcessPermission(db, req.user)) return res.status(403).json({ message: "Bạn không có quyền xử lý đơn hàng" });
    const order = findByIdOrMongo(db.orders, req.params.id);
    if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    if (order.status !== "Sẵn sàng nhận") return res.status(409).json({ message: order.status === "Hoàn thành" ? "Đơn hàng đã hoàn thành" : "Đơn hàng chưa sẵn sàng nhận" });
    if (order._scanning) return res.status(409).json({ message: "Đơn hàng đang được xử lý bởi nhân viên khác" });
    order._scanning = true;
    try {
      const now = new Date().toISOString();
      order.status = "Hoàn thành";
      order.received_at = now;
      order.updated_at = now;
      order.received_by = req.user.name || "Nhân viên";
      order.received_by_id = req.user.id;
      const pointsAwarded = awardPickupPointsOnce(db, order, req.user);
      notifyOrderStatus(db, order, "Hoàn thành");
      try {
        broadcastSse("order.updated", { id: order.id, code: order.code, status: "Hoàn thành", updated_at: now });
      } catch {}
      await saveDBOrThrow(db);
      invalidateStatsCache();
      delete order._scanning;
      res.json({ ok: true, order, pointsAwarded });
    } catch (e) {
      delete order._scanning;
      throw e;
    }
  } catch (e) { res.status(500).json({ message: e.message || "Không thể xác nhận nhận món" }); }
});

const VALID_ORDER_STATUSES = ["Chờ xác nhận", "Đã xác nhận", "Đang chuẩn bị", "Sẵn sàng nhận", "Hoàn thành", "Đã hủy"];

function hasOrderProcessPermission(db, user) {
  if (user?.role === "ADMIN") return true;
  if (user?.role !== "EMPLOYEE") return false;
  const emp = findByIdOrMongo(db.users, user.id);
  const rolePerms = ROLE_PERMISSIONS.EMPLOYEE || [];
  const customPerms = emp?.permissions || [];
  const allPerms = new Set([...rolePerms, ...customPerms]);
  return allPerms.has("orders.process") || allPerms.has("orders.cancel");
}

function awardPickupPointsOnce(db, order, actor) {
  if (!order || order.pickup_points_awarded) return 0;
  const customer = findByIdOrMongo(db.users, order.customer_id);
  if (!customer) return 0;
  const oldPoints = Number(customer.points) || 0;
  const pointsAwarded = 5;
  const now = new Date().toISOString();
  customer.points = oldPoints + pointsAwarded;
  order.pickup_points_awarded = true;
  order.pickup_points_earned = pointsAwarded;
  order.pickup_points_awarded_at = now;
  if (!db.points_history) db.points_history = [];
  db.points_history.push({ id: nextId(db.points_history), user_id: customer.id, user_name: customer.name, old_points: oldPoints, new_points: customer.points, delta: pointsAwarded, reason: `Thưởng xác nhận nhận món đơn ${order.code}`, order_code: order.code || "", changed_by: actor?.name || "Hệ thống", changed_by_id: actor?.id ?? null, created_at: now });
  return pointsAwarded;
}

app.patch("/api/orders/:id", auth(["ADMIN", "EMPLOYEE"]), async (req, res) => {
  try {
    const db = loadDB();
    const o = findByIdOrMongo(db.orders, req.params.id);
    if (!o) return res.status(404).json({ message: "Không tìm thấy đơn" });
    if (req.user.role === "EMPLOYEE") {
      const emp = findByIdOrMongo(db.users, req.user.id);
      const rolePerms = ROLE_PERMISSIONS.EMPLOYEE || [];
      const customPerms = emp?.permissions || [];
      const allPerms = new Set([...rolePerms, ...customPerms]);
      if (!allPerms.has("orders.process") && !allPerms.has("orders.cancel")) return res.status(403).json({ message: "Bạn không có quyền xử lý đơn hàng" });
    }
    const newStatus = req.body.status;
    if (!VALID_ORDER_STATUSES.includes(newStatus)) return res.status(400).json({ message: "Trạng thái không hợp lệ: " + newStatus });
    const previousStatus = o.status;
    if (newStatus === "Đã hủy" && previousStatus !== "Đã hủy") rollbackCancelledOrder(db, o);
    const now = new Date().toISOString();
    o.status = newStatus; o.updated_at = now;
    let pointsAwarded = 0;
    if (newStatus === "Hoàn thành" && previousStatus === "Sẵn sàng nhận") {
      o.received_at = o.received_at || now;
      o.received_by = req.user.name || "Nhân viên";
      o.received_by_id = req.user.id;
      pointsAwarded = awardPickupPointsOnce(db, o, req.user);
    }
    notifyOrderStatus(db, o, newStatus);

    try {
      broadcastSse("order.updated", {
        id: o.id,
        code: o.code,
        status: newStatus,
        customer_name: o.customer_name,
        total: o.total,
        item_count: (o.items || []).length,
        updated_at: o.updated_at,
      });
    } catch (e) {
      console.warn("[KDS] broadcast order.updated fail:", e.message);
    }

    await saveDBOrThrow(db);
    invalidateStatsCache();
    res.json({ ok: true, pointsAwarded });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/orders/:id/received", auth(), async (req, res) => {
  try {
    const db = loadDB();
    const order = findByIdOrMongo(db.orders, req.params.id);
    if (!order) return res.status(404).json({ message: "Không tìm thấy đơn" });
    if (order.customer_id !== req.user.id) return res.status(403).json({ message: "Không có quyền" });
    if (order.status !== "Sẵn sàng nhận") return res.status(400).json({ message: "Đơn chưa sẵn sàng nhận" });
    const now = new Date().toISOString();
    order.status = "Hoàn thành"; order.received_at = now; order.updated_at = now;
    const pointsAwarded = awardPickupPointsOnce(db, order, req.user);
    notifyOrderStatus(db, order, "Hoàn thành");
    try { broadcastSse("order.updated", { id: order.id, code: order.code, status: "Hoàn thành", updated_at: now }); } catch {}
    await saveDBOrThrow(db);
    invalidateStatsCache();
    res.json({ ok: true, order, pointsAwarded });
  } catch (e) { res.status(500).json({ message: e.message || "Không thể xác nhận nhận món" }); }
});

app.post("/api/orders/:id/cancel", auth(), async (req, res) => {
  const db = loadDB();
  const o = findByIdOrMongo(db.orders, req.params.id);
  if (!o) return res.status(404).json({ message: "Không tìm thấy đơn" });
  if (o.customer_id !== req.user.id) return res.status(403).json({ message: "Không có quyền" });
  if (o.status !== "Chờ xác nhận") return res.status(400).json({ message: "Chỉ hủy được đơn chờ xác nhận" });
  rollbackCancelledOrder(db, o);
  o.status = "Đã hủy"; o.updated_at = new Date().toISOString();
  notifyOrderStatus(db, o, "Đã hủy");
  try { broadcastSse("order.updated", { id: o.id, code: o.code, status: "Đã hủy", updated_at: o.updated_at }); } catch {}
  await saveDBOrThrow(db);
  invalidateStatsCache();
  invalidateMenuCache();
  res.json({ ok: true });
});

app.post("/api/orders/:id/call", auth(["ADMIN", "EMPLOYEE"]), async (req, res) => {
  try {
    const db = loadDB();
    const o = findByIdOrMongo(db.orders, req.params.id);
    if (!o) return res.status(404).json({ message: "Không tìm thấy đơn" });
    const { mode = "name", message = "" } = req.body || {};
    o.call_count = (o.call_count || 0) + 1; o.last_called_at = new Date().toISOString(); o.last_call_mode = mode; o.last_call_by = req.user.name;
    if (!Array.isArray(o.call_history)) o.call_history = [];
    o.call_history.push({ at: o.last_called_at, by: req.user.name, by_id: req.user.id, mode, message: String(message).slice(0, 200) });
    if (o.call_history.length > 20) o.call_history = o.call_history.slice(-20);
    await saveDBOrThrow(db);
    res.json({ ok: true, call_count: o.call_count, last_called_at: o.last_called_at });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/orders/:id/reminder", auth(), async (req, res) => {
  const db = loadDB();
  if (!Array.isArray(db.notifications)) db.notifications = [];
  if (!Array.isArray(db.orderReminders)) db.orderReminders = [];
  const requestedId = String(req.params.id || "");
  const order = (db.orders || []).find((o) => String(o._id ?? "") === requestedId || String(o.id ?? "") === requestedId || String(o.code ?? "") === requestedId);
  if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng." });
  if (String(order.customer_id ?? "") !== String(req.user.id)) return res.status(403).json({ message: "Không có quyền" });
  const orderId = String(order._id ?? order.id ?? order.code ?? "");
  const userId = req.user.id;
  const enabled = req.body?.enabled === true;
  let reminder = db.orderReminders.find((r) => String(r.order_id) === orderId && String(r.user_id) === String(userId));
  if (!enabled) {
    if (reminder) { reminder.active = false; reminder.cancelled_at = new Date().toISOString(); }
    await saveDBOrThrow(db);
    return res.json({ ok: true, active: false });
  }
  if (reminder?.active) return res.json({ ok: true, active: true, already: true });
  const now = new Date().toISOString();
  const alreadyReady = order.status === "Sẵn sàng nhận";
  if (!reminder) {
    reminder = { id: Date.now(), user_id: userId, order_id: orderId, order_code: order.code || orderId, active: !alreadyReady, created_at: now };
    db.orderReminders.push(reminder);
  } else {
    reminder.active = !alreadyReady;
    reminder.created_at = now;
    reminder.notified_at = null;
  }
  db.notifications.push({ id: nextId(db.notifications), user_id: userId, title: "Đã đặt nhắc thành công", content: "Bạn sẽ nhận thông báo khi đơn hàng " + (order.code || orderId) + " sẵn sàng nhận.", type: "reminder", link: "/customer/orders", read: false, created_at: now });
  if (alreadyReady) {
    db.notifications.push({ id: nextId(db.notifications), user_id: userId, title: "Đến giờ nhận món rồi!", content: "Đơn " + (order.code || orderId) + " đã sẵn sàng nhận.", type: "reminder", link: "/customer/orders", read: false, created_at: now });
  }
  await saveDBOrThrow(db);
  res.json({ ok: true, active: !alreadyReady });
});

// ============================================================
// ECO REWARDS
// ============================================================
app.get("/api/eco-rewards/me", auth(), (req, res) => {
  const db = loadDB();
  res.json((db.eco_rewards || []).filter((r) => String(r.customer_id) === String(req.user.id)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

app.post("/api/eco-rewards", auth(), async (req, res) => {
  try {
    const db = loadDB();
    const orderId = String(req.body?.orderId || "").trim();
    const method = String(req.body?.method || "").trim();
    if (!orderId) return res.status(400).json({ message: "Vui lòng chọn đơn hàng" });
    if (!["bottle", "container"].includes(method)) return res.status(400).json({ message: "Loại tham gia không hợp lệ" });
    const order = (db.orders || []).find((o) => String(o.id) === orderId || String(o._id) === orderId);
    if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    if (String(order.customer_id) !== String(req.user.id)) return res.status(403).json({ message: "Bạn không có quyền gửi yêu cầu cho đơn này" });
    if (order.status !== "Sẵn sàng nhận") return res.status(409).json({ message: "Chỉ gửi yêu cầu Sống Xanh khi đơn ở trạng thái Sẵn sàng nhận" });
    if (!db.eco_rewards) db.eco_rewards = [];
    const duplicate = db.eco_rewards.find((r) => String(r.customer_id) === String(req.user.id) && String(r.order_id) === String(order.id || order._id));
    if (duplicate) return res.status(409).json({ message: "Đơn này đã có yêu cầu Sống Xanh", request: duplicate });
    const user = findByIdOrMongo(db.users, req.user.id);
    const request = { id: nextId(db.eco_rewards), order_id: String(order.id || order._id), order_code: order.code || "", customer_id: req.user.id, customer_name: user?.name || order.customer_name || "", method, status: "pending", points_awarded: 0, created_at: new Date().toISOString() };
    db.eco_rewards.push(request);
    await saveDBOrThrow(db);
    return res.status(201).json({ ok: true, request, message: "Đã gửi yêu cầu." });
  } catch (e) { return res.status(500).json({ message: e.message }); }
});

app.get("/api/eco-rewards/pending", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  const db = loadDB();
  if (!hasOrderProcessPermission(db, req.user)) return res.status(403).json({ message: "Bạn không có quyền duyệt yêu cầu Sống Xanh" });
  res.json((db.eco_rewards || []).filter((r) => r.status === "pending").sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
});

app.patch("/api/eco-rewards/:id", auth(["ADMIN", "EMPLOYEE"]), async (req, res) => {
  try {
    const db = loadDB();
    if (!hasOrderProcessPermission(db, req.user)) return res.status(403).json({ message: "Bạn không có quyền duyệt yêu cầu Sống Xanh" });
    const request = findByIdOrMongo(db.eco_rewards, req.params.id);
    if (!request) return res.status(404).json({ message: "Không tìm thấy yêu cầu Sống Xanh" });
    if (request.status !== "pending") return res.status(409).json({ message: "Yêu cầu này đã được xử lý trước đó" });
    const nextStatus = String(req.body?.status || "");
    if (!["approved", "rejected"].includes(nextStatus)) return res.status(400).json({ message: "Trạng thái duyệt không hợp lệ" });
    request.status = nextStatus;
    request.reviewed_at = new Date().toISOString();
    request.reviewed_by = req.user.id;
    request.reviewed_by_name = req.user.name || "";
    let pointsAwarded = 0;
    if (nextStatus === "approved") {
      const customer = findByIdOrMongo(db.users, request.customer_id);
      if (!customer) return res.status(404).json({ message: "Không tìm thấy tài khoản khách hàng" });
      customer.points = (Number(customer.points) || 0) + 10;
      request.points_awarded = 10;
      pointsAwarded = 10;
    } else {
      request.points_awarded = 0;
    }
    await saveDBOrThrow(db);
    return res.json({ ok: true, request, pointsAwarded, message: nextStatus === "approved" ? "Đã duyệt và cộng 10 điểm Sống Xanh" : "Đã từ chối yêu cầu Sống Xanh" });
  } catch (e) { return res.status(500).json({ message: e.message }); }
});

function checkGreenPermission(db, req, res) {
  if (req.user.role === "ADMIN") return true;
  const emp = findByIdOrMongo(db.users, req.user.id);
  const rolePerms = ROLE_PERMISSIONS.EMPLOYEE || [];
  const customPerms = emp?.permissions || [];
  const allPerms = new Set([...rolePerms, ...customPerms]);
  if (!allPerms.has("orders.approve_green")) { res.status(403).json({ message: "Bạn không có quyền duyệt Sống Xanh" }); return false; }
  return true;
}

app.post("/api/orders/:id/green/approve", auth(["ADMIN", "EMPLOYEE"]), async (req, res) => {
  try {
    const db = loadDB();
    if (!checkGreenPermission(db, req, res)) return;
    const o = findByIdOrMongo(db.orders, req.params.id);
    if (!o) return res.status(404).json({ message: "Không tìm thấy đơn" });
    if (!o.green_requested) return res.status(400).json({ message: "Đơn không có yêu cầu Sống Xanh" });
    if (o.green_status === "approved") return res.status(400).json({ message: "Đã duyệt rồi" });
    if (o.green_status === "rejected") return res.status(400).json({ message: "Đã từ chối rồi" });
    if (o.status === "Đã hủy") return res.status(400).json({ message: "Đơn đã hủy" });
    const cfg = getPointsConfig(db);
    const bonus = Number(o.green_points) || calcGreenBonus(cfg);
    const customer = db.users.find((u) => u.id === o.customer_id);
    if (customer) {
      const greenOldPoints = Number(customer.points) || 0;
      customer.points = greenOldPoints + bonus;
      if (bonus > 0) {
        recordPointsTransaction(
          db,
          customer,
          bonus,
          `Thưởng VWA Green từ đơn hàng ${o.code}`,
          {
            order_code: o.code || "",
            source: "green_bonus_approval",
            old_points: greenOldPoints,
            new_points: customer.points,
          }
        );
      }
    }
    o.green_status = "approved"; o.green_approved_by = req.user.id; o.green_approved_by_name = req.user.name; o.green_approved_at = new Date().toISOString(); o.points_earned = (o.points_earned || 0) + bonus;
    if (!db.notifications) db.notifications = [];
    db.notifications.push({ id: nextId(db.notifications), user_id: o.customer_id, title: "Sống Xanh đã được duyệt", content: "Bạn được cộng " + bonus + " điểm từ đơn " + o.code, type: "points", link: "/customer/profile", read: false, created_at: new Date().toISOString() });
    await saveDBOrThrow(db);
    res.json({ ok: true, bonus, customer_points: customer?.points || 0 });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/orders/:id/green/reject", auth(["ADMIN", "EMPLOYEE"]), async (req, res) => {
  try {
    const db = loadDB();
    if (!checkGreenPermission(db, req, res)) return;
    const o = findByIdOrMongo(db.orders, req.params.id);
    if (!o) return res.status(404).json({ message: "Không tìm thấy đơn" });
    if (!o.green_requested) return res.status(400).json({ message: "Đơn không có yêu cầu Sống Xanh" });
    if (o.green_status === "approved") return res.status(400).json({ message: "Đã duyệt rồi" });
    if (o.green_status === "rejected") return res.status(400).json({ message: "Đã từ chối rồi" });
    o.green_status = "rejected";
    o.green_rejected_by = req.user.id;
    o.green_rejected_by_name = req.user.name;
    o.green_rejected_at = new Date().toISOString();
    if (req.body?.reason) o.green_reject_reason = String(req.body.reason).slice(0, 200);
    await saveDBOrThrow(db);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ============================================================
// REVIEWS
// ============================================================
app.get("/api/reviews/can-review/:menuItemId", auth(), (req, res) => {
  const db = loadDB();
  const menuItemId = req.params.menuItemId;
  const orderId = req.query.orderId;
  const userId = String(req.user.id);

  const order = orderId
    ? (db.orders || []).find((o) =>
        String(o.id || o._id) === String(orderId) &&
        String(o.customer_id) === userId
      )
    : null;

  const hasPurchased = orderId
    ? !!order &&
      order.status === "Hoàn thành" &&
      (order.items || []).some((it) => String(it.menu_item_id) === String(menuItemId))
    : (db.orders || []).some((o) =>
        String(o.customer_id) === userId &&
        o.status === "Hoàn thành" &&
        (o.items || []).some((it) => String(it.menu_item_id) === String(menuItemId))
      );

  const hasReviewed = orderId
    ? (db.reviews || []).some((r) =>
        String(r.user_id) === userId &&
        String(r.order_id) === String(orderId) &&
        String(r.menu_item_id) === String(menuItemId)
      )
    : (db.reviews || []).some((r) =>
        String(r.user_id) === userId &&
        String(r.menu_item_id) === String(menuItemId)
      );

  res.json({ canReview: hasPurchased && !hasReviewed, hasPurchased, hasReviewed });
});

app.get("/api/reviews/me", auth(), (req, res) => {
  res.json(
    (loadDB().reviews || []).filter(
      (r) => String(r.user_id) === String(req.user.id)
    )
  );
});

app.get("/api/reviews/:menuItemId", (req, res) => {
  res.json(
    (loadDB().reviews || []).filter(
      (r) => String(r.menu_item_id) === String(req.params.menuItemId)
    )
  );
});

app.post("/api/reviews", auth(), async (req, res) => {
  try {
    const db = loadDB();
    const { menuItemId, rating, comment, orderId, orderCode } = req.body;

    if (!menuItemId || !orderId || rating == null || rating === "") {
      return res.status(400).json({ message: "Thiếu thông tin đánh giá hoặc đơn hàng" });
    }

    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ message: "Đánh giá phải từ 1 đến 5 sao" });
    }

    const userId = String(req.user.id);
    const order = (db.orders || []).find((o) =>
      String(o.id || o._id) === String(orderId) &&
      String(o.customer_id) === userId
    );

    if (!order) {
      return res.status(404).json({ message: "Không tìm thấy đơn hàng của bạn" });
    }

    if (order.status !== "Hoàn thành") {
      return res.status(403).json({ message: "Chỉ có thể đánh giá đơn hàng đã hoàn thành" });
    }

    const purchasedItem = (order.items || []).some(
      (it) => String(it.menu_item_id) === String(menuItemId)
    );

    if (!purchasedItem) {
      return res.status(403).json({ message: "Món ăn không thuộc đơn hàng này" });
    }

    if (!db.reviews) db.reviews = [];

    const duplicate = db.reviews.some((r) =>
      String(r.user_id) === userId &&
      String(r.order_id) === String(order.id || order._id) &&
      String(r.menu_item_id) === String(menuItemId)
    );

    if (duplicate) {
      return res.status(409).json({ message: "Bạn đã đánh giá món này trong đơn hàng này rồi" });
    }

    const id = nextId(db.reviews);
    const review = {
      id,
      order_id: String(order.id || order._id),
      order_code: order.code || orderCode || "",
      menu_item_id: menuItemId,
      user_id: req.user.id,
      user_name: req.user.name,
      rating: numericRating,
      comment: String(comment || "").slice(0, 1000),
      created_at: new Date().toISOString(),
    };

    db.reviews.push(review);

    const itemReviews = db.reviews.filter(
      (r) => String(r.menu_item_id) === String(menuItemId)
    );
    const avgRating =
      itemReviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) /
      itemReviews.length;

    const menuItem = (db.menu_items || []).find(
      (m) => String(m.id) === String(menuItemId)
    );

    if (menuItem) {
      menuItem.rating = Math.round(avgRating * 10) / 10;
      menuItem.review_count = itemReviews.length;
    }

    const config = getPointsConfig(db);
    const reviewBonus = Number(config.earn?.review_points) || 500;
    review.points_earned = reviewBonus;

    const authorUser = (db.users || []).find(
      (u) => String(u.id) === userId
    );

    if (authorUser) {
      const oldPoints = Number(authorUser.points) || 0;
      authorUser.points = oldPoints + reviewBonus;
      recordPointsTransaction(db, authorUser, reviewBonus, "Thưởng đánh giá món ăn", {
        source: "review_bonus",
        old_points: oldPoints,
        new_points: authorUser.points,
      });
    }

    await saveDBOrThrow(db);
    invalidateMenuCache();

    return res.status(201).json({ ...review, pointsEarned: reviewBonus });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});
// ============================================================
// POINTS CONFIG & POINTS
// ============================================================
app.get("/api/points/config", auth(), (req, res) => { try { res.json(getPointsConfig(loadDB())); } catch (e) { res.status(500).json({ message: e.message }); } });

app.get("/api/points/config-history", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    res.json((db.points_config_history || []).slice().sort((a, b) => b.id - a.id));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put("/api/points/config", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const nextConfig = req.body;
    const oldConfig = db.points_config || {};

    if (!db.settings) db.settings = {};
    if (!db.settings.rules_history) db.settings.rules_history = [];

    const ruleLabels = { rate_points: "Hoàn thành đơn hàng", green_points: "Sống Xanh Học Đường", review_points: "Đánh giá món ăn", subsidy_points: "Trợ giá sinh viên" };

    if (oldConfig.earn && nextConfig.earn) {
      Object.keys(ruleLabels).forEach(k => {
        if (nextConfig.earn[k] !== undefined && Number(oldConfig.earn[k] || 0) !== Number(nextConfig.earn[k])) {
          db.settings.rules_history.push({
            id: Date.now() + Math.floor(Math.random() * 1000),
            time: new Date().toISOString(),
            rule: ruleLabels[k],
            old_value: oldConfig.earn[k] || 0,
            new_value: nextConfig.earn[k],
            changed_by: req.user.name || "Admin"
          });
        }
      });
    }

    db.points_config = nextConfig;
    saveDB(db);
    res.json({ ok: true, config: nextConfig });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/points/preview", auth(), (req, res) => {
  try { const db = loadDB(); const cfg = getPointsConfig(db); const total = Number(req.body?.total) || 0; const isGreen = !!req.body?.isGreen; const base = calcEarnPoints(total, cfg); const green = isGreen ? calcGreenBonus(cfg) : 0; res.json({ base, green, total: base + green }); } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/points/history", auth(), (req, res) => {
  const db = loadDB();
  res.json(db.settings?.rules_history || []);
});

app.get("/api/points/me", auth(), (req, res) => {
  const db = loadDB();
  const u = (db.users || []).find(
    (x) => String(x.id) === String(req.user.id)
  );
  if (!u) return res.status(404).json({ message: "Không tìm thấy user" });

  const userId = String(req.user.id);
  const ledger = (db.points_history || []).filter(
    (h) => String(h.user_id) === userId && Number(h.delta) !== 0
  );

  const ledgerOrderCodes = new Set(
    ledger
      .filter((h) =>
        ["order_earn", "order_redeem", "green_bonus", "green_bonus_approval", "order_cancel_earn", "order_cancel_green"]
          .includes(String(h.source || ""))
      )
      .map((h) => String(h.order_code || ""))
      .filter(Boolean)
  );

  const ledgerVoucherCodes = new Set(
    ledger
      .map((h) => String(h.voucher_code || ""))
      .filter(Boolean)
  );

  const ledgerHistory = ledger.map((h) => {
    const delta = Number(h.delta) || 0;
    const reason = String(h.reason || "Điều chỉnh xu");
    const source = String(h.source || "");
    let type = delta < 0 ? "redeem" : "earn";
    let title = reason;

    if (/nhận món/i.test(reason)) {
      type = "pickup";
      title = "Thưởng nhận món";
    } else if (source === "order_redeem") {
      type = "redeem";
      title = "Dùng xu giảm giá đơn hàng";
    } else if (source === "order_earn") {
      type = "earn";
      title = "Tích xu đơn hàng";
    } else if (source === "green_bonus") {
      type = "green";
      title = "Thưởng VWA Green";
    } else if (source === "voucher_redeem") {
      type = "redeem";
      title = "Đổi xu lấy voucher";
    } else if (source === "review_bonus") {
      type = "review";
      title = "Thưởng đánh giá món ăn";
    } else if (source.startsWith("order_cancel_")) {
      type = "reversal";
      title = "Thu hồi xu do hủy đơn";
    }

    return {
      id: h.id,
      code: h.order_code || h.voucher_code || "",
      total: 0,
      points: delta,
      date: h.created_at || "",
      type,
      title,
      detail: reason,
      old_points: Number.isFinite(Number(h.old_points)) ? Number(h.old_points) : null,
      new_points: Number.isFinite(Number(h.new_points)) ? Number(h.new_points) : null,
      source,
    };
  });

  const orderHistory = (db.orders || [])
    .filter((o) =>
      String(o.customer_id) === userId &&
      Number(o.points_earned) > 0 &&
      !/(đã hủy|đã huỷ|cancel)/i.test(String(o.status || "")) &&
      !ledgerOrderCodes.has(String(o.code || ""))
    )
    .map((o) => ({
      code: o.code || "",
      total: Number(o.total) || 0,
      points: Number(o.points_earned) || 0,
      date: o.created_at || "",
      type: "earn",
      title: "Tích xu đơn hàng",
      detail: `Đơn hàng #${o.code || o.id || ""}`,
    }));

  const voucherHistory = (db.vouchers || [])
    .filter((v) =>
      String(v.user_id) === userId &&
      Number(v.points_used) > 0 &&
      !ledgerVoucherCodes.has(String(v.code || "")) &&
      !ledger.some((h) =>
        String(h.source || "") === "voucher_redeem" &&
        String(h.reason || "").includes(String(v.code || ""))
      )
    )
    .map((v) => ({
      code: v.code || "",
      total: Number(v.value) || 0,
      points: -(Number(v.points_used) || 0),
      date: v.created_at || "",
      type: "redeem",
      title: "Đổi xu lấy voucher",
      detail: `Voucher #${v.code || ""}`,
    }));

  const reviewHistory = (db.reviews || [])
    .filter((r) => {
      if (String(r.user_id) !== userId || Number(r.points_earned) <= 0) return false;

      return !ledger.some((h) => {
        if (String(h.source || "") !== "review_bonus") return false;
        if (Number(h.delta) !== Number(r.points_earned)) return false;

        const ledgerTime = new Date(h.created_at || 0).getTime();
        const reviewTime = new Date(r.created_at || 0).getTime();

        return Number.isFinite(ledgerTime) &&
          Number.isFinite(reviewTime) &&
          Math.abs(ledgerTime - reviewTime) <= 60000;
      });
    })
    .map((r) => ({
      code: "",
      total: 0,
      points: Number(r.points_earned) || 0,
      date: r.created_at || "",
      type: "review",
      title: "Thưởng đánh giá món ăn",
      detail: r.comment || "Đánh giá món ăn",
    }));

  const history = [
    ...ledgerHistory,
    ...orderHistory,
    ...voucherHistory,
    ...reviewHistory,
  ].sort((a, b) => {
    const dateA = new Date(a.date || 0).getTime() || 0;
    const dateB = new Date(b.date || 0).getTime() || 0;
    return dateB - dateA;
  });

  res.json({ points: Number(u.points) || 0, history });
});

app.post("/api/points/redeem", auth(), async (req, res) => {
  try {
    const db = loadDB();
    const pointsToRedeem = Number(req.body?.points);
    if (!Number.isSafeInteger(pointsToRedeem) || pointsToRedeem < 10) return res.status(400).json({ message: "Points must be a whole number of at least 10." });
    if (!db.vouchers) db.vouchers = [];
    const u = findByIdOrMongo(db.users, req.user.id);
    if (!u) return res.status(404).json({ message: "User not found." });
    const cfg = getPointsConfig(db);
    const activeCount = db.vouchers.filter((v) => v.user_id === req.user.id && !v.used).length;
    if (activeCount >= 50) return res.status(400).json({ message: `You already have ${activeCount} unused vouchers.` });
    const check = canRedeem(Number(u.points) || 0, pointsToRedeem, activeCount, cfg);
    if (!check.ok) return res.status(400).json({ message: check.reason });
    u.points = (Number(u.points) || 0) - pointsToRedeem;
    const voucherId = nextId(db.vouchers);
    const voucher = { id: voucherId, code: "VOUCHER" + String(voucherId).padStart(4, "0"), user_id: req.user.id, value: check.value, points_used: pointsToRedeem, used: false, created_at: new Date().toISOString(),
      expires_at: req.body.expires_at || null,
      max_claims: +req.body.max_claims || 0,
      is_flash_sale: !!req.body.is_flash_sale
    };
    db.vouchers.push(voucher);
    recordPointsTransaction(
      db,
      u,
      -pointsToRedeem,
      `Đổi ${pointsToRedeem} xu lấy voucher ${voucher.code}`,
      { voucher_code: voucher.code, source: "voucher_redeem" }
    );
    await saveDBOrThrow(db);
    res.status(201).json(voucher);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ============================================================
// VOUCHERS
// ============================================================
app.get("/api/vouchers", auth(["ADMIN"]), (req, res) => { res.json((loadDB().vouchers || []).sort((a, b) => (b.id || 0) - (a.id || 0))); });

app.post("/api/vouchers", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB();
    if (!db.vouchers) db.vouchers = [];
    const { code, value, user_id, points_used, publish_date, is_flash_sale, duration, duration_unit, isFlashSale, max_claims, expires_at } = req.body;
    if (!code || !value) return res.status(400).json({ message: "Thiếu mã hoặc giá trị" });
    const codeNorm = String(code).toUpperCase().trim();
    if (db.vouchers.find((v) => v.code.toUpperCase() === codeNorm)) return res.status(400).json({ message: "Mã voucher đã tồn tại" });
    const id = nextId(db.vouchers);
    const voucher = { id, code: codeNorm, value: +value, user_id: user_id ? +user_id : null, points_used: +points_used || 0, used: false, isFlashSale: !!isFlashSale, is_flash_sale: !!(is_flash_sale || isFlashSale), max_claims: Number(max_claims) || 0, expires_at: expires_at || null, created_at: new Date().toISOString() };
    db.vouchers.push(voucher);

    await saveDBOrThrow(db);
    res.status(201).json(voucher);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put("/api/vouchers/:id", auth(["ADMIN"]), async (req, res) => {
  const db = loadDB();
  const v = findByIdOrMongo(db.vouchers, req.params.id);
  if (!v) return res.status(404).json({ message: "Không tìm thấy" });
  if (req.body.value !== undefined) v.value = +req.body.value;
  if (req.body.publish_date !== undefined) v.publish_date = req.body.publish_date;
  if (req.body.is_flash_sale !== undefined) v.is_flash_sale = !!req.body.is_flash_sale;
  if (req.body.isFlashSale !== undefined) v.isFlashSale = !!req.body.isFlashSale;
  if (req.body.max_claims !== undefined) v.max_claims = Number(req.body.max_claims) || 0;
  if (req.body.expires_at !== undefined) v.expires_at = req.body.expires_at;
  if (req.body.duration !== undefined) v.duration = Number(req.body.duration);
  if (req.body.duration_unit !== undefined) v.duration_unit = req.body.duration_unit;

  if (req.body.used !== undefined) v.used = req.body.used;
  if (req.body.code) {
    const codeNorm = req.body.code.toUpperCase();
    if (db.vouchers.find((x) => x.id != v.id && x.code.toUpperCase() === codeNorm)) return res.status(400).json({ message: "Mã voucher đã tồn tại" });
    v.code = codeNorm;
  }
  await saveDBOrThrow(db);
  res.json({ ok: true, voucher: v });
});

app.delete("/api/vouchers/:id", auth(["ADMIN"]), async (req, res) => {
  const db = loadDB();
  db.vouchers = (db.vouchers || []).filter((x) => x.id != req.params.id);
  await saveDBOrThrow(db);
  res.json({ ok: true });
});

app.get("/api/vouchers/me", auth(), (req, res) => { res.json((loadDB().vouchers || []).filter((v) => v.user_id === req.user.id)); });

app.post("/api/vouchers/validate", auth(), (req, res) => {
  try {
    const db = loadDB();
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: "Thiếu mã voucher" });
    const voucher = (db.vouchers || []).find((v) => v.code.toUpperCase() === code.toUpperCase() && v.user_id === req.user.id && !v.used);
    if (!voucher) return res.status(404).json({ message: "Mã voucher không hợp lệ hoặc đã dùng" });
    res.json({ valid: true, value: voucher.value, code: voucher.code });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/vouchers/public", auth(), (req, res) => {
  const db = loadDB();
  const myVouchers = (db.vouchers || []).filter((v) => v.user_id === req.user.id);
  const claimedIds = myVouchers.map((v) => v.claimed_from).filter(Boolean);
  res.json((db.vouchers || []).filter((v) => !v.user_id && !v.used && !claimedIds.includes(v.id)).sort((a, b) => (b.value || 0) - (a.value || 0)));
});

app.post("/api/vouchers/claim/:id", auth(), async (req, res) => {
  try {
    const db = loadDB();
    const template = findByIdOrMongo((db.vouchers || []).filter((v) => !v.user_id), req.params.id);
    if (!template) return res.status(404).json({ message: "Voucher không tồn tại hoặc đã hết" });
    if ((db.vouchers || []).find((v) => v.user_id === req.user.id && v.claimed_from === template.id)) return res.status(400).json({ message: "Bạn đã nhận voucher này rồi" });
    const claimCode = `${template.code}-U${req.user.id}-${Date.now().toString(36).toUpperCase()}`;
    const newVoucher = { id: nextId(db.vouchers), code: claimCode, value: template.value, user_id: req.user.id, points_used: 0, used: false, claimed_from: template.id, created_at: new Date().toISOString() };
    db.vouchers.push(newVoucher);
    await saveDBOrThrow(db);
    res.status(201).json({ ok: true, voucher: newVoucher });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/vouchers/stats", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  const all = db.vouchers || [];
  const publicTemplates = all.filter((v) => !v.user_id);
  const personal = all.filter((v) => v.user_id);
  const used = all.filter((v) => v.used);
  let totalClaims = 0;
  publicTemplates.forEach((t) => { totalClaims += all.filter((v) => v.claimed_from === t.id).length; });
  res.json({ total: all.length, public: publicTemplates.length, personal: personal.length, used: used.length, available: personal.filter((v) => !v.used).length, totalClaims, totalValue: all.reduce((s, v) => s + (v.value || 0), 0), usedValue: used.reduce((s, v) => s + (v.value || 0), 0) });
});

app.get("/api/vouchers/claims/:templateId", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  res.json((db.vouchers || []).filter((v) => v.claimed_from == req.params.templateId).map((v) => { const user = findByIdOrMongo(db.users, v.user_id); return { id: v.id, code: v.code, user_id: v.user_id, user_name: user?.name || "User #" + v.user_id, user_email: user?.email || "", used: v.used, used_at: v.used_at, created_at: v.created_at }; }));
});

app.get("/api/vouchers/user/:userId", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  const userId = +req.params.userId;
  const user = findByIdOrMongo(db.users, userId);
  if (!user) return res.status(404).json({ message: "Không tìm thấy user" });
  const list = (db.vouchers || []).filter((v) => v.user_id === userId);
  res.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, points: user.points || 0 }, vouchers: list, stats: { total: list.length, used: list.filter((v) => v.used).length, available: list.filter((v) => !v.used).length, totalValue: list.reduce((s, v) => s + (v.value || 0), 0) } });
});

app.delete("/api/vouchers/revoke/:id", auth(["ADMIN"]), async (req, res) => {
  const db = loadDB();
  const v = findByIdOrMongo(db.vouchers, req.params.id);
  if (!v) return res.status(404).json({ message: "Không tìm thấy voucher" });
  if (v.used) return res.status(400).json({ message: "Không thể thu hồi voucher đã dùng" });
  db.vouchers = db.vouchers.filter((x) => x.id != v.id);
  await saveDBOrThrow(db);
  res.json({ ok: true });
});

// ============================================================
// PROMOTIONS & CATEGORIES
// ============================================================
app.get("/api/promotions", (req, res) => {
  const db = loadDB();
  res.json((db.menu_items || []).filter((m) => m.active && m.discount_percent && m.discount_percent > 0).map((m) => ({ id: m.id, name: m.name, image: m.image, category: m.category, description: m.description, original_price: m.original_price || m.price, price: m.price, discount_percent: m.discount_percent, stock: m.stock, sold: m.sold || 0, rating: m.rating || 0 })));
});

const DEFAULT_CATEGORIES = [
  { id: 1, name: "Cơm", icon: "🍚", order: 1 },
  { id: 2, name: "Món mặn", icon: "🍛", order: 2 },
  { id: 3, name: "Món chay", icon: "🥗", order: 3 },
  { id: 4, name: "Món phở", icon: "🍜", order: 4 },
  { id: 5, name: "Đồ ăn nhanh", icon: "🍟", order: 5 },
  { id: 6, name: "Đồ uống", icon: "🥤", order: 6 },
  { id: 7, name: "Combo", icon: "🍱", order: 7 },
];

function ensureCategories(db) {
  if (!db.categories || !Array.isArray(db.categories) || db.categories.length === 0) {
    db.categories = [...DEFAULT_CATEGORIES];
    return { categories: db.categories, changed: true };
  }
  return { categories: db.categories, changed: false };
}

app.get("/api/categories", (req, res) => {
  const db = loadDB();
  const { categories, changed } = ensureCategories(db);
  if (changed) saveDB(db);
  res.json([...categories].sort((a, b) => (a.order || 0) - (b.order || 0)));
});

app.post("/api/categories", auth(["ADMIN", "EMPLOYEE"]), async (req, res) => {
  try {
    const db = loadDB();
    const { categories } = ensureCategories(db);
    const { name, icon, order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: "Thiếu tên danh mục" });
    const trimmed = name.trim();
    if (categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return res.status(400).json({ message: "Danh mục đã tồn tại" });
    let finalOrder;
    if (order !== undefined && order !== null && order !== "") {
      const parsed = Number(order);
      if (!Number.isInteger(parsed) || parsed < 0) return res.status(400).json({ message: "Thứ tự phải là số nguyên >= 0" });
      finalOrder = parsed;
    } else {
      finalOrder = Math.max(0, ...categories.map((c) => c.order || 0)) + 1;
    }
    const id = nextId(categories);
    const cat = { id, name: trimmed, icon: icon || "🍽️", order: finalOrder };
    await autoTranslateCategory(db, cat, null);
    categories.push(cat);
    await saveDBOrThrow(db);
    res.status(201).json(cat);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put("/api/categories/:id", auth(["ADMIN", "EMPLOYEE"]), async (req, res) => {
  try {
    const db = loadDB();
    const { categories } = ensureCategories(db);
    const cat = findByIdOrMongo(categories, req.params.id);
    if (!cat) return res.status(404).json({ message: "Không tìm thấy danh mục" });
    const oldName = cat.name;
    const { name, icon, order } = req.body;
    if (name && name.trim()) {
      const trimmed = name.trim();
      if (categories.find((c) => c.id != cat.id && c.name.toLowerCase() === trimmed.toLowerCase())) return res.status(400).json({ message: "Tên danh mục đã tồn tại" });
      cat.name = trimmed;
      if (trimmed !== oldName) (db.menu_items || []).forEach((m) => { if (m.category === oldName) m.category = trimmed; });
    }
    if (icon !== undefined) cat.icon = icon;
    if (order !== undefined && order !== null && order !== "") {
      const parsed = Number(order);
      if (!Number.isInteger(parsed) || parsed < 0) return res.status(400).json({ message: "Thứ tự phải là số nguyên >= 0" });
      cat.order = parsed;
    }
    await autoTranslateCategory(db, cat, { name: oldName });
    await saveDBOrThrow(db);
    invalidateMenuCache();
    res.json(cat);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete("/api/categories/:id", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB();
    const { categories } = ensureCategories(db);
    const cat = findByIdOrMongo(categories, req.params.id);
    if (!cat) return res.status(404).json({ message: "Không tìm thấy danh mục" });
    const usedCount = (db.menu_items || []).filter((m) => m.category === cat.name).length;
    if (usedCount > 0) return res.status(400).json({ message: "Không thể xóa — có " + usedCount + " món đang dùng danh mục này" });
    db.categories = categories.filter((c) => c.id != cat.id);
    await saveDBOrThrow(db);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ============================================================
// WALLET
// ============================================================
function getOrCreateWallet(db, userId) {
  if (!db.wallets) db.wallets = [];
  const uid = Number(userId);
  if (!uid || isNaN(uid)) throw new Error("Invalid userId for wallet");
  let w = db.wallets.find((x) => Number(x.user_id) === uid);
  if (!w) {
    w = { user_id: uid, balance: 0, bank_name: "", bank_account: "", bank_account_name: "", linked_at: "", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    db.wallets.push(w);
  }
  return w;
}

app.get("/api/student-card/me", auth(), (req, res) => {
  try {
    const db = loadDB();
    const card = (db.student_cards || []).find(
      (item) => Number(item.user_id) === Number(req.user.id)
    );
    res.json({ locked: !!card?.locked });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/student-card/lock", auth(), async (req, res) => {
  try {
    const { pin, locked } = req.body || {};

    if (String(pin || "") !== "123456") {
      return res.status(400).json({ message: "PIN không chính xác." });
    }

    if (typeof locked !== "boolean") {
      return res.status(400).json({ message: "Trạng thái thẻ không hợp lệ." });
    }

    const db = loadDB();
    if (!Array.isArray(db.student_cards)) db.student_cards = [];

    let card = db.student_cards.find(
      (item) => Number(item.user_id) === Number(req.user.id)
    );

    if (!card) {
      card = { user_id: Number(req.user.id), locked: false };
      db.student_cards.push(card);
    }

    card.locked = locked;
    card.updated_at = new Date().toISOString();

    await saveDBOrThrow(db);
    res.json({ locked: card.locked });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});
app.get("/api/wallet/me", auth(), async (req, res) => {
  try {
    const db = loadDB();
    const existed = (db.wallets || []).some((x) => Number(x.user_id) === Number(req.user.id));
    const w = getOrCreateWallet(db, req.user.id);
    if (!existed) await saveDBOrThrow(db);
    res.json({ balance: w.balance || 0, bank_name: w.bank_name || "", bank_account: w.bank_account || "", bank_account_name: w.bank_account_name || "", linked_at: w.linked_at || "" });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/wallet/transactions", auth(), (req, res) => { res.json((loadDB().wallet_transactions || []).filter((t) => t.user_id === req.user.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100)); });

app.post("/api/wallet/deposit", auth(), async (req, res) => {
  try {
    const db = loadDB();
    const { amount, method, note } = req.body;
    const amt = +amount;
    if (!amt || amt < 10000) return res.status(400).json({ message: "Số tiền tối thiểu 10.000đ" });
    if (amt > 50000000) return res.status(400).json({ message: "Số tiền tối đa 50.000.000đ" });
    if (!["QR", "CASH"].includes(method)) return res.status(400).json({ message: "Phương thức không hợp lệ" });
    if (!db.wallet_transactions) db.wallet_transactions = [];
    const tx = { id: nextId(db.wallet_transactions), code: "DEP" + Date.now().toString().slice(-8) + Math.random().toString(36).slice(2, 5).toUpperCase(), user_id: req.user.id, user_name: req.user.name, user_email: req.user.email, type: "deposit", amount: amt, method, status: "pending", note: note || "", admin_note: "", created_at: new Date().toISOString() };
    db.wallet_transactions.push(tx);
    await saveDBOrThrow(db);
    res.status(201).json({ ok: true, transaction: tx });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/wallet/withdraw", auth(), async (req, res) => {
  try {
    const db = loadDB();
    const { amount, note } = req.body;
    const amt = +amount;
    if (!amt || amt < 20000) return res.status(400).json({ message: "Số tiền rút tối thiểu 20.000đ" });
    const w = getOrCreateWallet(db, req.user.id);
    if (w.balance < amt) return res.status(400).json({ message: "Số dư không đủ" });
    if (!w.bank_account) return res.status(400).json({ message: "Chưa liên kết tài khoản ngân hàng" });
    if (!db.wallet_transactions) db.wallet_transactions = [];
    const existingPending = db.wallet_transactions.find((t) => t.user_id === req.user.id && t.type === "withdraw" && t.status === "pending");
    if (existingPending) return res.status(400).json({ message: "Bạn đang có lệnh rút chờ duyệt. Vui lòng chờ admin xử lý." });
    const oldBalance = w.balance;
    w.balance -= amt;
    w.updated_at = new Date().toISOString();
    const tx = { id: nextId(db.wallet_transactions), code: "WDR" + Date.now().toString().slice(-8) + Math.random().toString(36).slice(2, 5).toUpperCase(), user_id: req.user.id, user_name: req.user.name, user_email: req.user.email, type: "withdraw", amount: amt, method: "BANK", status: "pending", note: note || "", admin_note: "", bank_name: w.bank_name, bank_account: w.bank_account, bank_account_name: w.bank_account_name, created_at: new Date().toISOString() };
    db.wallet_transactions.push(tx);
    try {
      await saveDBOrThrow(db);
    } catch (saveErr) {
      w.balance = oldBalance;
      db.wallet_transactions = db.wallet_transactions.filter((t) => t.id !== tx.id);
      throw saveErr;
    }
    res.status(201).json({ ok: true, transaction: tx, newBalance: w.balance });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/wallet/link-bank", auth(), async (req, res) => {
  try {
    const db = loadDB();
    const { bank_name, bank_account, bank_account_name } = req.body;
    if (!bank_name || !bank_account || !bank_account_name) return res.status(400).json({ message: "Thiếu thông tin ngân hàng" });
    const w = getOrCreateWallet(db, req.user.id);
    w.bank_name = bank_name; w.bank_account = String(bank_account).trim(); w.bank_account_name = bank_account_name.toUpperCase().trim(); w.linked_at = new Date().toISOString(); w.updated_at = new Date().toISOString();
    await saveDBOrThrow(db);
    res.json({ ok: true, wallet: w });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/wallet/requests", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  const { status } = req.query;
  let list = db.wallet_transactions || [];
  if (status && status !== "all") list = list.filter((t) => t.status === status);
  else list = list.filter((t) => t.status === "pending");
  res.json(list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
});

app.get("/api/wallet/all", auth(["ADMIN"]), (req, res) => { res.json([...(loadDB().wallet_transactions || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))); });

app.get("/api/wallet/stats", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  const all = db.wallet_transactions || [];
  res.json({
    totalBalance: (db.wallets || []).reduce((s, w) => s + (w.balance || 0), 0), totalUsers: (db.wallets || []).length,
    totalDeposited: all.filter((t) => t.type === "deposit" && t.status === "approved").reduce((s, t) => s + (t.amount || 0), 0),
    totalWithdrawn: all.filter((t) => t.type === "withdraw" && t.status === "approved").reduce((s, t) => s + (t.amount || 0), 0),
    totalPaid: all.filter((t) => t.type === "payment" && t.status === "approved").reduce((s, t) => s + (t.amount || 0), 0),
    pendingCount: all.filter((t) => t.status === "pending").length, pendingDepositCount: all.filter((t) => t.type === "deposit" && t.status === "pending").length, pendingWithdrawCount: all.filter((t) => t.type === "withdraw" && t.status === "pending").length,
  });
});

app.patch("/api/wallet/requests/:id/approve", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB();
    const tx = findByIdOrMongo(db.wallet_transactions, req.params.id);
    if (!tx) return res.status(404).json({ message: "Không tìm thấy giao dịch" });
    if (tx.status !== "pending") return res.status(400).json({ message: "Giao dịch đã xử lý" });
    const w = getOrCreateWallet(db, tx.user_id);
    if (tx.type === "deposit") w.balance += tx.amount;
    w.updated_at = new Date().toISOString();
    tx.status = "approved"; tx.approved_by = req.user.name; tx.approved_at = new Date().toISOString();
    if (req.body.admin_note) tx.admin_note = req.body.admin_note;
    await saveDBOrThrow(db);
    res.json({ ok: true, transaction: tx, newBalance: w.balance });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.patch("/api/wallet/requests/:id/reject", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB();
    const tx = findByIdOrMongo(db.wallet_transactions, req.params.id);
    if (!tx) return res.status(404).json({ message: "Không tìm thấy giao dịch" });
    if (tx.status !== "pending") return res.status(400).json({ message: "Giao dịch đã xử lý" });
    const w = getOrCreateWallet(db, tx.user_id);
    if (tx.type === "withdraw") { w.balance += tx.amount; w.updated_at = new Date().toISOString(); }
    tx.status = "rejected"; tx.approved_by = req.user.name; tx.approved_at = new Date().toISOString();
    if (req.body.admin_note) tx.admin_note = req.body.admin_note;
    await saveDBOrThrow(db);
    res.json({ ok: true, transaction: tx });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/wallet/pay", auth(), async (req, res) => {
  try {
    const db = loadDB();
    const { amount, order_code } = req.body;
    const amt = +amount;
    if (!amt || amt <= 0) return res.status(400).json({ message: "Số tiền không hợp lệ" });
    const w = getOrCreateWallet(db, req.user.id);
    if (w.balance < amt) return res.status(400).json({ message: "Số dư ví không đủ" });
    if (!db.wallet_transactions) db.wallet_transactions = [];
    const tx = { id: nextId(db.wallet_transactions), code: "PAY" + Date.now().toString().slice(-8) + Math.random().toString(36).slice(2, 5).toUpperCase(), user_id: req.user.id, user_name: req.user.name, type: "payment", amount: amt, method: "WALLET", status: "approved", note: "Thanh toán đơn " + (order_code || ""), order_code: order_code || "", created_at: new Date().toISOString(), approved_at: new Date().toISOString() };
    db.wallet_transactions.push(tx);
    w.balance -= amt; w.updated_at = new Date().toISOString();
    await saveDBOrThrow(db);
    res.status(201).json({ ok: true, transaction: tx, newBalance: w.balance });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ============================================================
// CHAT SYSTEM
// ============================================================
let chatTTLRefreshAt = 0;
function cleanupExpiredChatMessages(db) {
  if (!db || !Array.isArray(db.messages) || db.messages.length === 0) return false;
  const now = Date.now();
  if (now - chatTTLRefreshAt < 60_000) return false;
  chatTTLRefreshAt = now;
  const cutoff = now - 48 * 60 * 60 * 1000;
  const initial = db.messages.length;
  db.messages = db.messages.filter((m) => {
    if (!m || !m.created_at) return false;
    const t = new Date(m.created_at).getTime();
    return !isNaN(t) && t >= cutoff;
  });
  return db.messages.length !== initial;
}

function ensureChatSchema(db) {
  if (!db) return false;
  let changed = false;
  if (!db.settings) db.settings = {};
  if (typeof db.settings.chat_enabled_global !== "boolean") { db.settings.chat_enabled_global = true; changed = true; }
  if (Array.isArray(db.users)) {
    for (const u of db.users) if (u.role === "EMPLOYEE" && typeof u.chat_enabled !== "boolean") { u.chat_enabled = true; changed = true; }
  }
  if (!Array.isArray(db.chat_transfer_requests)) { db.chat_transfer_requests = []; changed = true; }
  if (!db.chat_conversations) { db.chat_conversations = {}; changed = true; }
  if (cleanupExpiredChatMessages(db)) changed = true;
  return changed;
}
function getAdminAssignedUserIds(db) {
  if (!db.chat_conversations) return [];
  return Object.entries(db.chat_conversations).filter(([, meta]) => meta && meta.assigned_to === "admin").map(([uid]) => Number(uid)).filter((n) => !isNaN(n));
}
function isStaffAllowedToChat(db, userId) {
  if (!db) return false;
  if (db.settings?.chat_enabled_global === false) return false;
  const u = findByIdOrMongo(db.users, userId);
  if (!u) return false;
  if (u.role !== "EMPLOYEE" && u.role !== "ADMIN") return false;
  if (u.role === "ADMIN") return true;
  return u.chat_enabled !== false;
}
function findPendingTransferForCustomer(db, customerId) {
  if (!Array.isArray(db.chat_transfer_requests)) return null;
  return db.chat_transfer_requests.find((r) => r.customer_id === customerId && r.status === "pending") || null;
}
function buildAdminConversations(db) {
  const convMap = {};
  (db.messages || []).forEach((m) => {
    if (!isRecentMessage(m)) return;
    const uid = normalizeUserId(m.user_id);
    if (uid === null) return;
    if (!convMap[uid]) convMap[uid] = { user_id: uid, user_name: m.user_name || "Khách", last_message: m.content, last_time: m.created_at, unread: 0 };
    if (m.from === "customer" && !m.read) convMap[uid].unread += 1;
    if (new Date(m.created_at) > new Date(convMap[uid].last_time)) { convMap[uid].last_message = m.content; convMap[uid].last_time = m.created_at; convMap[uid].user_name = m.user_name || convMap[uid].user_name; }
  });
  return Object.values(convMap).map((c) => {
    const meta = db.chat_conversations?.[String(c.user_id)] || {};
    const pendingReq = findPendingTransferForCustomer(db, c.user_id);
    return { ...c, assigned_to: meta.assigned_to || null, assigned_admin_id: meta.assigned_admin_id || null, has_pending_transfer: !!pendingReq };
  }).sort((a, b) => new Date(b.last_time) - new Date(a.last_time));
}
const CHAT_TTL_MS = 24 * 60 * 60 * 1000;
function isRecentMessage(m) { if (!m || !m.created_at) return false; const t = new Date(m.created_at).getTime(); if (isNaN(t)) return false; return Date.now() - t <= CHAT_TTL_MS; }
function normalizeUserId(id) { if (id === undefined || id === null) return null; const n = Number(id); return isNaN(n) ? id : n; }

app.get("/api/chat/conversations", auth(["ADMIN", "EMPLOYEE"]), async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    if (mongoReady && mongoose.connection.db) {
      const coll = mongoose.connection.db.collection("messages");
      const pipeline = [
        { $match: { created_at: { $gte: cutoff } } },
        { $sort: { created_at: -1 } },
        { $group: { _id: "$user_id", user_name: { $first: "$user_name" }, last_message: { $first: "$content" }, last_time: { $first: "$created_at" }, unread: { $sum: { $cond: [{ $and: [{ $eq: ["$from", "customer"] }, { $eq: ["$read", false] }] }, 1, 0] } } } },
        { $sort: { last_time: -1 } },
      ];
      const docs = await coll.aggregate(pipeline).toArray();
      return res.json(docs.map((d) => ({ user_id: d._id, user_name: d.user_name || "Khách", last_message: d.last_message, last_time: d.last_time, unread: d.unread || 0 })));
    }
    const db = loadDB(); ensureChatSchema(db); const convMap = {};
    (db.messages || []).forEach((m) => {
      if (!isRecentMessage(m)) return;
      const uid = normalizeUserId(m.user_id); if (uid === null) return;
      if (!convMap[uid]) convMap[uid] = { user_id: uid, user_name: m.user_name || "Khách", last_message: m.content, last_time: m.created_at, unread: 0 };
      if (m.from === "customer" && !m.read) convMap[uid].unread += 1;
      if (new Date(m.created_at) > new Date(convMap[uid].last_time)) { convMap[uid].last_message = m.content; convMap[uid].last_time = m.created_at; convMap[uid].user_name = m.user_name || convMap[uid].user_name; }
    });
    res.json(Object.values(convMap).sort((a, b) => new Date(b.last_time) - new Date(a.last_time)));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/chat/me", auth(), async (req, res) => {
  try {
    const myId = normalizeUserId(req.user.id);
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    if (mongoReady && mongoose.connection.db) {
      const coll = mongoose.connection.db.collection("messages");
      const list = await coll.find({ user_id: myId, created_at: { $gte: cutoff } }).sort({ created_at: 1 }).toArray();
      return res.json(list.map(({ _id, ...rest }) => rest));
    }
    const db = loadDB();
    res.json((db.messages || []).filter((m) => normalizeUserId(m.user_id) === myId && isRecentMessage(m)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/chat/with/:userId", auth(["ADMIN", "EMPLOYEE"]), async (req, res) => {
  try {
    const targetId = normalizeUserId(req.params.userId);
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    if (mongoReady && mongoose.connection.db) {
      const coll = mongoose.connection.db.collection("messages");
      const list = await coll.find({ user_id: targetId, created_at: { $gte: cutoff } }).sort({ created_at: 1 }).toArray();
      await coll.updateMany({ user_id: targetId, from: "customer", read: false }, { $set: { read: true } });
      return res.json(list.map(({ _id, ...rest }) => rest));
    }
    const db = loadDB();
    const list = (db.messages || []).filter((m) => normalizeUserId(m.user_id) === targetId && isRecentMessage(m)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let changed = false;
    (db.messages || []).forEach((m) => { if (normalizeUserId(m.user_id) === targetId && m.from === "customer" && !m.read) { m.read = true; changed = true; } });
    if (changed) await saveDBOrThrow(db);
    res.json(list);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/chat/context/:userId", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  try {
    const db = loadDB(); const userId = normalizeUserId(req.params.userId);
    if (userId === null) return res.status(400).json({ message: "userId không hợp lệ" });
    const user = findByIdOrMongo(db.users, userId);
    if (!user) return res.status(404).json({ message: "Không tìm thấy khách" });
    const wallet = (db.wallets || []).find((w) => Number(w.user_id) === userId);
    const now = new Date();
    const ordersThisMonth = (db.orders || []).filter((o) => { if (o.customer_id !== userId) return false; const d = new Date(o.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    const activeOrders = (db.orders || []).filter((o) => o.customer_id === userId && !["Hoàn thành", "Đã hủy"].includes(o.status)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone || "", avatar: user.avatar || "", points: user.points || 0, faculty: user.faculty || "", tier: user.points >= 1000 ? "Hạng Vàng" : user.points >= 500 ? "Hạng Bạc" : "Hạng Đồng" }, wallet: { balance: wallet?.balance || 0 }, ordersThisMonth: ordersThisMonth.length, currentOrder: activeOrders[0] ? { code: activeOrders[0].code, status: activeOrders[0].status, items: (activeOrders[0].items || []).map((it) => ({ name: it.name, qty: it.qty, price: it.price })), subtotal: activeOrders[0].subtotal || 0, discount: activeOrders[0].discount || 0, total: activeOrders[0].total || 0, payment: activeOrders[0].payment || "" } : null });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/chat/send", auth(), async (req, res) => {
  try {
    const db = loadDB(); ensureChatSchema(db);
    const { content, toUserId } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: "Tin nhắn trống" });
    const isStaff = req.user.role === "ADMIN" || req.user.role === "EMPLOYEE";
    let userId, userName;
    if (isStaff) {
      userId = normalizeUserId(toUserId);
      if (userId === null) return res.status(400).json({ message: "Thiếu ID người nhận" });
      const customer = findByIdOrMongo(db.users, userId);
      userName = customer?.name || "Khách";
      if (req.user.role === "EMPLOYEE") {
        if (!isStaffAllowedToChat(db, req.user.id)) return res.status(403).json({ message: "Admin đã tắt quyền chat của bạn.", code: "CHAT_DISABLED" });
        const meta = db.chat_conversations?.[String(userId)];
        if (meta && meta.assigned_to === "admin") return res.status(403).json({ message: "Admin đang xử lý hội thoại này.", code: "CHAT_HELD_BY_ADMIN" });
      }
    } else { userId = normalizeUserId(req.user.id); userName = req.user.name; }
    
    const message = { id: nextId(db.messages || []), user_id: userId, user_name: userName, from: isStaff ? "staff" : "customer", from_name: req.user.name, from_role: isStaff ? req.user.role : "CUSTOMER", content: content.trim(), read: false, created_at: new Date().toISOString() };
    
    if (mongoReady && mongoose.connection.db) {
      const coll = mongoose.connection.db.collection("messages");
      const maxDoc = await coll.find({}).sort({ id: -1 }).limit(1).toArray();
      message.id = (Number(maxDoc[0]?.id) || 0) + 1;
      const { _id, ...doc } = message;
      await coll.insertOne(doc);
      if (Array.isArray(db.messages)) db.messages.push(message);
    } else {
      if (!db.messages) db.messages = [];
      db.messages.push(message);
      await saveDBOrThrow(db);
    }
    res.status(201).json(message);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/chat/admin/conversations", auth(["ADMIN"]), async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    if (mongoReady && mongoose.connection.db) {
      const coll = mongoose.connection.db.collection("messages");
      const pipeline = [
        { $match: { created_at: { $gte: cutoff } } },
        { $sort: { created_at: -1 } },
        { $group: { _id: "$user_id", user_name: { $first: "$user_name" }, last_message: { $first: "$content" }, last_time: { $first: "$created_at" }, unread: { $sum: { $cond: [{ $and: [{ $eq: ["$from", "customer"] }, { $eq: ["$read", false] }] }, 1, 0] } } } },
        { $sort: { last_time: -1 } },
      ];
      const docs = await coll.aggregate(pipeline).toArray();
      const db = loadDB();
      return res.json(docs.map((d) => {
        const meta = db.chat_conversations?.[String(d._id)] || {};
        const pendingReq = findPendingTransferForCustomer(db, d._id);
        return { user_id: d._id, user_name: d.user_name || "Khách", last_message: d.last_message, last_time: d.last_time, unread: d.unread || 0, assigned_to: meta.assigned_to || null, assigned_admin_id: meta.assigned_admin_id || null, has_pending_transfer: !!pendingReq };
      }));
    }
    const db = loadDB(); ensureChatSchema(db); res.json(buildAdminConversations(db));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// 🔧 FIX: Xoá route duplicate /chat/admin/messages/:userId (chỉ giữ 1 bản duy nhất)
app.get("/api/chat/admin/messages/:userId", auth(["ADMIN"]), async (req, res) => {
  try {
    const targetId = normalizeUserId(req.params.userId);
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    if (mongoReady && mongoose.connection.db) {
      const coll = mongoose.connection.db.collection("messages");
      const list = await coll.find({ user_id: targetId, created_at: { $gte: cutoff } }).sort({ created_at: 1 }).toArray();
      await coll.updateMany({ user_id: targetId, from: "customer", read: false }, { $set: { read: true } });
      return res.json(list.map(({ _id, ...rest }) => rest));
    }
    const db = loadDB();
    res.json((db.messages || []).filter((m) => normalizeUserId(m.user_id) === targetId && isRecentMessage(m)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/chat/admin/staff-status", auth(["ADMIN"]), (req, res) => {
  const db = loadDB(); ensureChatSchema(db);
  res.json({ global_enabled: db.settings?.chat_enabled_global !== false, staff: (db.users || []).filter((u) => u.role === "EMPLOYEE").map((u) => ({ id: u.id, name: u.name, email: u.email, chat_enabled: u.chat_enabled !== false })) });
});

app.patch("/api/chat/admin/staff/:id/chat", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB(); ensureChatSchema(db);
    const u = findByIdOrMongo(db.users, req.params.id);
    if (!u) return res.status(404).json({ message: "Không tìm thấy nhân viên" });
    if (u.role !== "EMPLOYEE") return res.status(400).json({ message: "Chỉ áp dụng cho nhân viên" });
    u.chat_enabled = req.body?.enabled !== false;
    await saveDBOrThrow(db);
    res.json({ ok: true, staff: { id: u.id, name: u.name, chat_enabled: u.chat_enabled } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.patch("/api/chat/admin/global-chat", auth(["ADMIN"]), async (req, res) => {
  try { const db = loadDB(); ensureChatSchema(db); db.settings.chat_enabled_global = req.body?.enabled !== false; await saveDBOrThrow(db); res.json({ ok: true, global_enabled: db.settings.chat_enabled_global }); } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/chat/admin/transfer-requests", auth(["ADMIN"]), (req, res) => {
  const db = loadDB(); ensureChatSchema(db);
  const status = String(req.query.status || "pending").toLowerCase();
  let list = [...(db.chat_transfer_requests || [])];
  if (status !== "all") list = list.filter((r) => r.status === status);
  res.json(list.map((r) => { const customer = findByIdOrMongo(db.users, r.customer_id); const staff = findByIdOrMongo(db.users, r.from_staff_id); return { ...r, customer_name: customer?.name || `Khách #${r.customer_id}`, customer_email: customer?.email || "", from_staff_name: staff?.name || `NV #${r.from_staff_id}` }; }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

app.patch("/api/chat/admin/transfer-requests/:id", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB(); ensureChatSchema(db);
    const r = findByIdOrMongo(db.chat_transfer_requests, req.params.id);
    if (!r) return res.status(404).json({ message: "Không tìm thấy yêu cầu" });
    if (r.status !== "pending") return res.status(400).json({ message: "Yêu cầu đã được xử lý" });
    const newStatus = String(req.body?.status || "").toLowerCase();
    if (!["accepted", "rejected"].includes(newStatus)) return res.status(400).json({ message: "status không hợp lệ" });
    r.status = newStatus; r.resolved_at = new Date().toISOString(); r.resolved_by = req.user.id; r.resolved_by_name = req.user.name;
    if (req.body?.note) r.note = String(req.body.note).slice(0, 500);
    if (newStatus === "accepted") { if (!db.chat_conversations) db.chat_conversations = {}; db.chat_conversations[String(r.customer_id)] = { assigned_to: "admin", assigned_admin_id: req.user.id, assigned_at: new Date().toISOString() }; }
    await saveDBOrThrow(db);
    res.json({ ok: true, request: r });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/chat/transfer-request", auth(["EMPLOYEE", "ADMIN"]), async (req, res) => {
  try {
    const db = loadDB(); ensureChatSchema(db);
    const customerId = normalizeUserId(req.body?.customerId ?? req.body?.user_id);
    if (customerId === null) return res.status(400).json({ message: "Thiếu customerId" });
    const customer = findByIdOrMongo(db.users, customerId);
    if (!customer) return res.status(404).json({ message: "Không tìm thấy khách" });
    if (findPendingTransferForCustomer(db, customerId)) return res.status(400).json({ message: "Đã có yêu cầu chuyển tiếp đang chờ", code: "ALREADY_PENDING" });
    const record = { id: nextId(db.chat_transfer_requests), customer_id: customerId, from_staff_id: req.user.id, from_staff_name: req.user.name, from_staff_role: req.user.role, reason: String(req.body?.reason || "").slice(0, 500), status: "pending", created_at: new Date().toISOString(), resolved_at: null, resolved_by: null };
    db.chat_transfer_requests.push(record);
    if (!db.notifications) db.notifications = [];
    (db.users || []).filter((u) => u.role === "ADMIN").forEach((adm) => { db.notifications.push({ id: nextId(db.notifications), user_id: adm.id, title: "Yêu cầu chuyển tiếp chat", content: `${req.user.name} xin chuyển hội thoại với "${customer.name}" lên Admin`, type: "chat", link: "/owner/chat", read: false, created_at: new Date().toISOString() }); });
    await saveDBOrThrow(db);
    res.status(201).json({ ok: true, request: record });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/chat/admin/takeover/:userId", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB(); ensureChatSchema(db);
    const targetId = normalizeUserId(req.params.userId);
    if (targetId === null) return res.status(400).json({ message: "userId không hợp lệ" });
    if (!db.chat_conversations) db.chat_conversations = {};
    db.chat_conversations[String(targetId)] = { assigned_to: "admin", assigned_admin_id: req.user.id, assigned_at: new Date().toISOString() };
    (db.chat_transfer_requests || []).forEach((r) => { if (r.customer_id === targetId && r.status === "pending") { r.status = "accepted"; r.resolved_at = new Date().toISOString(); r.resolved_by = req.user.id; r.resolved_by_name = req.user.name; } });
    await saveDBOrThrow(db);
    res.json({ ok: true, assigned_to: "admin" });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/chat/admin/release/:userId", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB(); ensureChatSchema(db);
    const targetId = normalizeUserId(req.params.userId);
    if (db.chat_conversations) delete db.chat_conversations[String(targetId)];
    await saveDBOrThrow(db);
    res.json({ ok: true, assigned_to: null });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/chat/my-status", auth(["EMPLOYEE", "ADMIN"]), (req, res) => {
  const db = loadDB(); ensureChatSchema(db);
  res.json({ enabled: isStaffAllowedToChat(db, req.user.id), global_enabled: db.settings?.chat_enabled_global !== false, assigned_to_admin_users: getAdminAssignedUserIds(db) });
});

// ============================================================
// NOTIFICATIONS & SHIFTS & INVENTORY
// ============================================================
app.get("/api/notifications", auth(), (req, res) => {
  const db = loadDB();
  const userId = Number(req.user.id); // 🔧 Ép kiểu
  
  const list = (db.notifications || [])
    .filter((n) => Number(n.user_id) === userId) // 🔧 Ép kiểu khi so sánh
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 50);
    
  res.json({ list, unread: list.filter((n) => !n.read).length });
});
app.post("/api/notifications/:id/read", auth(), async (req, res) => {
  const db = loadDB();
  const n = findByIdOrMongo((db.notifications || []).filter((x) => x.user_id === req.user.id), req.params.id);
  if (n) n.read = true;
  await saveDBOrThrow(db);
  res.json({ ok: true });
});
app.post("/api/notifications/read-all", auth(), async (req, res) => {
  const db = loadDB();
  (db.notifications || []).forEach((n) => { if (n.user_id === req.user.id) n.read = true; });
  await saveDBOrThrow(db);
  res.json({ ok: true });
});

app.get("/api/toppings", (req, res) => {
  const db = loadDB();
  const { category } = req.query;
  let list = db.toppings || [];
  if (category) list = list.filter((t) => t.applies_to?.includes(category));
  res.json(list);
});
// 🔧 THÊM MỚI: API Tạo Topping
app.post("/api/toppings", auth(["ADMIN", "EMPLOYEE"]), async (req, res) => {
  try {
    const db = loadDB();
    const { name, price, applies_to } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ message: "Thiếu tên topping" });
    
    if (!db.toppings) db.toppings = [];
    const id = "tp-" + Date.now(); // Tạo ID ngẫu nhiên
    const newTopping = {
      id,
      name: String(name).trim(),
      price: Math.max(0, Number(price) || 0),
      applies_to: Array.isArray(applies_to) ? applies_to : [],
      created_at: new Date().toISOString()
    };
    
    db.toppings.push(newTopping);
    await saveDBOrThrow(db);
    res.status(201).json(newTopping);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});
app.get("/api/sizes", (req, res) => {
  const db = loadDB();
  const list = Array.isArray(db.sizes) && db.sizes.length > 0
    ? db.sizes
    : [ { id: "S", name: "Nhỏ", extra_price: 0 }, { id: "M", name: "Vừa", extra_price: 5000 }, { id: "L", name: "Lớn", extra_price: 10000 } ];
  res.json(list);
});

// ============================================================
// STATS
// ============================================================
const statsCache = { data: null, expiresAt: 0 };
app.get("/api/stats", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  try {
    const now = Date.now();
    if (statsCache.data && statsCache.expiresAt > now) return res.json(statsCache.data);
    const db = loadDB();
    const today = getLocalDateStr();
    const todayOrders = db.orders.filter((o) => toLocalDateStr(o.created_at) === today);
    const byStatus = {};
    db.orders.forEach((o) => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });
    const data = {
      revenue: todayOrders.reduce((s, o) => s + o.total, 0),
      orderCount: todayOrders.length,
      customerCount: db.users.filter((u) => u.role === "CUSTOMER").length,
      lowStock: (db.inventory || []).filter((i) => i.qty < i.min).length,
      byStatus: Object.entries(byStatus).map(([_id, count]) => ({ _id, count })),
    };
    statsCache.data = data;
    statsCache.expiresAt = now + 10_000;
    res.json(data);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/inventory", auth(["ADMIN", "EMPLOYEE"]), (req, res) => { res.json(loadDB().inventory); });

app.post("/api/inventory", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB(); if (!db.inventory) db.inventory = [];
    const { code, name, qty, unit, min } = req.body;
    if (!code || !name) return res.status(400).json({ message: "Thiếu mã hoặc tên" });
    if (db.inventory.find((x) => x.code === code)) return res.status(400).json({ message: "Mã đã tồn tại" });
    const item = { code, name, qty: +qty || 0, unit: unit || "kg", min: +min || 0 };
    db.inventory.push(item); await saveDBOrThrow(db); res.status(201).json(item);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put("/api/inventory/:code", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB(); const item = db.inventory?.find((x) => x.code === req.params.code);
    if (!item) return res.status(404).json({ message: "Không tìm thấy" });
    Object.assign(item, req.body); await saveDBOrThrow(db); res.json(item);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete("/api/inventory/:code", auth(["ADMIN"]), async (req, res) => {
  const db = loadDB();
  db.inventory = (db.inventory || []).filter((x) => x.code !== req.params.code);
  await saveDBOrThrow(db);
  res.json({ ok: true });
});

app.post("/api/inventory/:code/import", auth(["ADMIN", "EMPLOYEE"]), async (req, res) => {
  try {
    const db = loadDB(); const item = db.inventory?.find((x) => x.code === req.params.code);
    if (!item) return res.status(404).json({ message: "Không tìm thấy" });
    const { qty, note, supplier, unitCost } = req.body;
    if (!qty || +qty <= 0) return res.status(400).json({ message: "Số lượng không hợp lệ" });
    const importQty = +qty; const cost = unitCost ? importQty * +unitCost : 0; const before = item.qty;
    item.qty += importQty; item.last_import = new Date().toISOString();
    if (!db.imports) db.imports = [];
    const record = { id: nextId(db.imports), code: item.code, name: item.name, qty: importQty, before, after: item.qty, unit: item.unit, supplier: supplier || "", note: note || "", unit_cost: +unitCost || 0, cost, imported_by: req.user.name, imported_by_id: req.user.id, created_at: new Date().toISOString() };
    db.imports.push(record);
    if (cost > 0) { if (!db.settings) db.settings = {}; if (!db.settings.expenses) db.settings.expenses = []; db.settings.expenses.push({ id: Date.now(), title: "Nhập " + importQty + item.unit + " " + item.name, amount: cost, category: "Nhập hàng", note: "Mã NL: " + item.code, date: new Date().toISOString(), source: "import", import_id: record.id }); }
    await saveDBOrThrow(db);
    res.status(201).json({ message: "Nhập kho thành công", item, record });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/inventory/imports", auth(["ADMIN", "EMPLOYEE"]), (req, res) => { res.json((loadDB().imports || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))); });

// ============================================================
// ATTENDANCE / SHIFTS
// ============================================================
const SHIFT_START_HOUR = { "Ca sáng": 6, "Ca chiều": 12 };
const SHIFT_START_MIN = { "Ca sáng": 30, "Ca chiều": 30 };
const SHIFT_END_HOUR = { "Ca sáng": 12, "Ca chiều": 18 };
const SHIFT_END_MIN = { "Ca sáng": 30, "Ca chiều": 30 };
function todayStr() { return getLocalDateStr(); }

app.post("/api/attendance/checkin", auth(["EMPLOYEE", "ADMIN"]), async (req, res) => {
  try {
    const db = loadDB(); if (!db.attendances) db.attendances = [];
    const today = todayStr(); const now = new Date(); const { hour, minute } = getVNTime(now); const nowMinutes = hour * 60 + minute;
    let shift = req.body?.shift || "";
    if (!shift) {
      if (nowMinutes >= 6 * 60 + 30 && nowMinutes < 12 * 60 + 30) shift = "Ca sáng";
      else if (nowMinutes >= 12 * 60 + 30 && nowMinutes < 18 * 60 + 30) shift = "Ca chiều";
      else return res.status(400).json({ message: "Ngoài giờ làm việc" });
    }
    if (!SHIFT_START_HOUR[shift]) return res.status(400).json({ message: "Ca không hợp lệ" });
    const approvedShift = (db.shifts || []).find((s) => s.employee_id === req.user.id && s.date === today && s.shift === shift && s.status === "approved");
    if (!approvedShift) return res.status(403).json({ message: `Chưa được duyệt ${shift} hôm nay.`, code: "NO_APPROVED_SHIFT" });
    if (db.attendances.find((a) => a.employee_id === req.user.id && a.date === today && a.shift === shift && a.checkIn)) return res.status(400).json({ message: "Đã check-in rồi" });
    const shiftStartMinutes = SHIFT_START_HOUR[shift] * 60 + SHIFT_START_MIN[shift];
    const late = nowMinutes > shiftStartMinutes + 15;
    const attendance = { id: nextId(db.attendances), employee_id: req.user.id, employee_name: req.user.name, date: today, shift, checkIn: now.toISOString(), checkOut: null, hours: 0, status: late ? "Đi muộn" : "Đúng giờ", note: "", created_at: now.toISOString() };
    db.attendances.push(attendance); await saveDBOrThrow(db);
    res.status(201).json({ message: "Check-in thành công", attendance });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/attendance/checkout", auth(["EMPLOYEE", "ADMIN"]), async (req, res) => {
  try {
    const db = loadDB(); const today = todayStr(); const now = new Date(); const { hour, minute } = getVNTime(now); const nowMinutes = hour * 60 + minute;
    let shift = req.body?.shift || "";
    if (!shift) {
      if (nowMinutes >= 6 * 60 && nowMinutes < 12 * 60 + 30) shift = "Ca sáng";
      else if (nowMinutes >= 12 * 60 && nowMinutes < 18 * 60 + 30) shift = "Ca chiều";
      else shift = "Ngoài giờ";
    }
    const att = db.attendances?.find((a) => a.employee_id === req.user.id && a.date === today && a.shift === shift && a.checkIn && !a.checkOut);
    if (!att) return res.status(400).json({ message: "Chưa check-in" });
    att.checkOut = now.toISOString(); att.hours = Math.round(((now - new Date(att.checkIn)) / 3600000) * 100) / 100;
    const shiftEndMinutes = SHIFT_END_HOUR[shift] * 60 + SHIFT_END_MIN[shift];
    const early = nowMinutes < shiftEndMinutes - 15; const wasLate = att.status === "Đi muộn";
    if (early && wasLate) att.status = "Đi muộn · Về sớm"; else if (early && !wasLate) att.status = "Về sớm";
    await saveDBOrThrow(db); res.json({ message: "Check-out thành công", attendance: att });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/attendance/today", auth(), (req, res) => {
  const db = loadDB();
  const list = (db.attendances || []).filter((a) => a.employee_id === req.user.id && a.date === todayStr());
  if (req.query.all === "1") return res.json(list);
  const shift = String(req.query.shift || "").trim();
  if (shift) return res.json(list.find((a) => a.shift === shift) || null);
  res.json(list[0] || null);
});

app.get("/api/attendance/me", auth(), (req, res) => { res.json((loadDB().attendances || []).filter((a) => a.employee_id === req.user.id).sort((a, b) => b.date.localeCompare(a.date))); });

app.get("/api/attendance", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  const db = loadDB(); let list = db.attendances || [];
  const { from, to, employee_id, month } = req.query;
  if (month) list = list.filter((a) => a.date && a.date.startsWith(month)); else if (from && to) list = list.filter((a) => a.date >= from && a.date <= to);
  if (employee_id) list = list.filter((a) => a.employee_id == employee_id);
  res.json(list.sort((a, b) => b.date.localeCompare(a.date)));
});

app.get("/api/attendance/employees", auth(["ADMIN"]), (req, res) => { res.json(loadDB().users.filter((u) => u.role === "EMPLOYEE").map((u) => ({ id: u.id, name: u.name, role: u.role }))); });

app.get("/api/shifts/me", auth(), (req, res) => { const today = getLocalDateStr(); res.json((loadDB().shifts || []).filter((s) => s.employee_id === req.user.id && s.date >= today && s.status === "approved").sort((a, b) => a.date.localeCompare(b.date))); });

app.get("/api/shifts/approved-today", auth(["EMPLOYEE", "ADMIN"]), (req, res) => { const today = getLocalDateStr(); res.json((loadDB().shifts || []).filter((s) => s.employee_id === req.user.id && s.date === today && s.status === "approved").sort((a, b) => { const order = { "Ca sáng": 1, "Ca chiều": 2 }; return (order[a.shift] || 99) - (order[b.shift] || 99); })); });

app.get("/api/shifts/pending", auth(["ADMIN"]), (req, res) => { res.json((loadDB().shifts || []).filter((s) => s.status === "pending").sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)); });

app.get("/api/shifts", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  let list = loadDB().shifts || []; const { date, employee_id, shift, include_pending } = req.query;
  if (!include_pending) list = list.filter((s) => !s.status || s.status === "approved");
  if (date) list = list.filter((s) => s.date === date); if (employee_id) list = list.filter((s) => s.employee_id == employee_id); if (shift) list = list.filter((s) => s.shift === shift);
  res.json(list);
});

app.post("/api/shifts/register", auth(["EMPLOYEE", "ADMIN"]), async (req, res) => {
  try {
    const db = loadDB(); if (!db.shifts) db.shifts = [];
    const { dates, shifts, note } = req.body;
    if (!dates?.length || !shifts?.length) return res.status(400).json({ message: "Thiếu thông tin" });
    const emp = findByIdOrMongo(db.users, req.user.id);
    let created = 0; let skipped = 0;
    dates.forEach((date) => {
      shifts.forEach((shift) => {
        if (db.shifts.find((s) => s.employee_id === req.user.id && s.date === date && s.shift === shift)) skipped++;
        else { db.shifts.push({ id: nextId(db.shifts) + created, employee_id: req.user.id, employee_name: emp.name, date, shift, note: note || "", status: "pending", source: "employee", created_by: emp.name, created_at: new Date().toISOString() }); created++; }
      });
    });
    await saveDBOrThrow(db); res.status(201).json({ created, skipped });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.patch("/api/shifts/:id/approve", auth(["ADMIN"]), async (req, res) => {
  try { const db = loadDB(); const s = findByIdOrMongo(db.shifts, req.params.id); if (!s) return res.status(404).json({ message: "Không tìm thấy" }); s.status = "approved"; s.approved_by = req.user.name; s.approved_at = new Date().toISOString(); await saveDBOrThrow(db); res.json({ ok: true, shift: s }); } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete("/api/shifts/:id/reject", auth(["ADMIN"]), async (req, res) => { const db = loadDB(); const before = (db.shifts || []).length; db.shifts = (db.shifts || []).filter((x) => x.id != req.params.id); await saveDBOrThrow(db); res.json({ ok: true, removed: before - db.shifts.length }); });

app.post("/api/shifts/bulk", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB(); if (!db.shifts) db.shifts = [];
    const { employee_id, dates, shifts, note } = req.body;
    if (!employee_id || !dates?.length || !shifts?.length) return res.status(400).json({ message: "Thiếu thông tin" });
    const emp = findByIdOrMongo(db.users, employee_id); let created = 0; let skipped = 0;
    dates.forEach((date) => {
      shifts.forEach((shift) => {
        if (db.shifts.find((s) => s.employee_id == employee_id && s.date === date && s.shift === shift)) skipped++;
        else { db.shifts.push({ id: nextId(db.shifts) + created, employee_id: +employee_id, employee_name: emp.name, date, shift, note: note || "", status: "approved", source: "admin", created_by: req.user.name, created_at: new Date().toISOString() }); created++; }
      });
    });
    await saveDBOrThrow(db); res.status(201).json({ created, skipped });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/shifts", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB(); if (!db.shifts) db.shifts = [];
    const { employee_id, date, shift, note } = req.body;
    if (!employee_id || !date || !shift) return res.status(400).json({ message: "Thiếu thông tin" });
    const emp = findByIdOrMongo(db.users, employee_id);
    if (db.shifts.find((s) => s.employee_id == employee_id && s.date === date && s.shift === shift)) return res.status(400).json({ message: "Đã được phân ca này rồi" });
    const record = { id: nextId(db.shifts), employee_id: +employee_id, employee_name: emp.name, date, shift, note: note || "", status: "approved", source: "admin", created_by: req.user.name, created_at: new Date().toISOString() };
    db.shifts.push(record); await saveDBOrThrow(db); res.status(201).json(record);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put("/api/shifts/:id", auth(["ADMIN"]), async (req, res) => {
  const db = loadDB();
  const s = findByIdOrMongo(db.shifts, req.params.id);
  if (!s) return res.status(404).json({ message: "Không tìm thấy" });
  if (req.body.date) s.date = req.body.date;
  if (req.body.shift) s.shift = req.body.shift;
  if (req.body.note !== undefined) s.note = req.body.note;
  await saveDBOrThrow(db); res.json(s);
});

app.delete("/api/shifts/:id", auth(["ADMIN"]), async (req, res) => {
  const db = loadDB();
  db.shifts = (db.shifts || []).filter((x) => x.id != req.params.id);
  await saveDBOrThrow(db);
  res.json({ ok: true });
});

app.get("/api/shifts/current-staff", auth(), (req, res) => {
  const db = loadDB(); const today = getLocalDateStr();
  const active = (db.attendances || []).filter((a) => a.date === today && a.checkIn && !a.checkOut);
  if (active.length > 0) return res.json(active.map((a) => ({ id: a.employee_id, name: a.employee_name, employee_code: "", shift: a.shift, checkIn: a.checkIn, station: "", phone: "" })));
  res.json((db.shifts || []).filter((s) => s.date === today && s.status === "approved").map((s) => ({ id: s.employee_id, name: s.employee_name, employee_code: "", shift: s.shift, checkIn: null, station: s.station || "", phone: "" })));
});

// ============================================================
// TASKS
// ============================================================
app.get("/api/tasks/me", auth(), (req, res) => {
  const db = loadDB(); if (!db.tasks) db.tasks = []; const today = getLocalDateStr();
  res.json(db.tasks.filter((t) => t.assigned_to === req.user.id && t.status !== "cancelled" && (!t.due_date || t.due_date >= today)).sort((a, b) => { if (a.status !== b.status) return a.status === "pending" ? -1 : 1; const pOrder = { urgent: 0, high: 1, normal: 2, low: 3 }; const pa = pOrder[a.priority] ?? 2; const pb = pOrder[b.priority] ?? 2; if (pa !== pb) return pa - pb; return new Date(b.created_at) - new Date(a.created_at); }));
});

app.get("/api/tasks", auth(["ADMIN"]), (req, res) => {
  const db = loadDB(); if (!db.tasks) db.tasks = []; const { assigned_to, status } = req.query;
  let list = [...db.tasks]; if (assigned_to) list = list.filter((t) => t.assigned_to == assigned_to); if (status && status !== "all") list = list.filter((t) => t.status === status);
  res.json(list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

app.post("/api/tasks", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB(); if (!db.tasks) db.tasks = [];
    const { title, description, assigned_to, due_date, shift, priority } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ message: "Thiếu tiêu đề" });
    if (!findByIdOrMongo(db.users, assigned_to)) return res.status(404).json({ message: "Không tìm thấy nhân viên" });
    const task = { id: nextId(db.tasks), title: String(title).trim(), description: String(description || "").trim(), assigned_to: Number(assigned_to), assigned_by: req.user.id, assigned_by_name: req.user.name, due_date: due_date || "", shift: shift || "", status: "pending", priority: ["low", "normal", "high", "urgent"].includes(priority) ? priority : "normal", created_at: new Date().toISOString(), completed_at: null };
    db.tasks.push(task); await saveDBOrThrow(db); res.status(201).json(task);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put("/api/tasks/:id", auth(["ADMIN"]), async (req, res) => {
  const db = loadDB();
  const t = findByIdOrMongo(db.tasks, req.params.id);
  if (!t) return res.status(404).json({ message: "Không tìm thấy task" });
  const { title, description, due_date, shift, priority, status } = req.body || {};
  if (title !== undefined) t.title = String(title).trim();
  if (description !== undefined) t.description = String(description).trim();
  if (due_date !== undefined) t.due_date = due_date;
  if (shift !== undefined) t.shift = shift;
  if (priority !== undefined && ["low", "normal", "high", "urgent"].includes(priority)) t.priority = priority;
  if (status !== undefined && ["pending", "done", "cancelled"].includes(status)) { t.status = status; if (status === "done") t.completed_at = new Date().toISOString(); }
  await saveDBOrThrow(db); res.json(t);
});

app.delete("/api/tasks/:id", auth(["ADMIN"]), async (req, res) => {
  const db = loadDB();
  db.tasks = (db.tasks || []).filter((x) => x.id != req.params.id);
  await saveDBOrThrow(db);
  res.json({ ok: true });
});

app.patch("/api/tasks/:id/complete", auth(), async (req, res) => {
  const db = loadDB();
  const t = findByIdOrMongo(db.tasks, req.params.id);
  if (!t) return res.status(404).json({ message: "Không tìm thấy task" });
  if (t.assigned_to !== req.user.id && req.user.role !== "ADMIN") return res.status(403).json({ message: "Không có quyền" });
  t.status = t.status === "done" ? "pending" : "done";
  t.completed_at = t.status === "done" ? new Date().toISOString() : null;
  await saveDBOrThrow(db); res.json(t);
});

// ============================================================
// PERMISSIONS
// ============================================================
const ALL_PERMISSIONS = [
  { key: "menu.view", label: "Xem thực đơn" }, { key: "menu.create", label: "Thêm món" }, { key: "menu.update", label: "Sửa món" }, { key: "menu.toggle", label: "Tắt / Bật món" }, { key: "menu.delete", label: "Xóa món" },
  { key: "orders.view", label: "Xem đơn hàng" }, { key: "orders.process", label: "Xử lý đơn hàng" }, { key: "orders.cancel", label: "Hủy đơn hàng" }, { key: "orders.approve_green", label: "Duyệt Sống Xanh" },
  { key: "inventory.view", label: "Xem kho" }, { key: "inventory.import", label: "Nhập kho" }, { key: "inventory.manage", label: "Quản lý kho" },
  { key: "customers.view", label: "Xem khách hàng" }, { key: "customers.manage", label: "Quản lý khách hàng" },
  { key: "employees.view", label: "Xem nhân viên" }, { key: "employees.manage", label: "Quản lý nhân viên" },
  { key: "attendance.view", label: "Xem chấm công" }, { key: "attendance.manage", label: "Quản lý chấm công" },
  { key: "reports.view", label: "Xem báo cáo" }, { key: "backup.export", label: "Xuất backup" }, { key: "backup.import", label: "Nhập backup" }, { key: "backup.reset", label: "Reset database" },
  { key: "settings.view", label: "Xem cài đặt" }, { key: "settings.manage", label: "Quản lý cài đặt" },
];
const ROLE_PERMISSIONS = {
  ADMIN: ALL_PERMISSIONS.map((p) => p.key),
  EMPLOYEE: ["menu.view", "menu.update", "orders.view", "orders.process", "orders.approve_green", "inventory.view", "inventory.import", "customers.view", "attendance.view"],
  CUSTOMER: [],
};

app.get("/api/permissions", auth(["ADMIN"]), (req, res) => { res.json({ all: ALL_PERMISSIONS, roles: ROLE_PERMISSIONS }); });

app.get("/api/permissions/me", auth(), (req, res) => {
  const db = loadDB();
  const u = findByIdOrMongo(db.users, req.user.id);
  if (!u) return res.status(404).json({ message: "Không tìm thấy user" });
  const rolePerms = ROLE_PERMISSIONS[u.role] || [];
  const customPerms = u.permissions || [];
  const allPerms = [...new Set([...rolePerms, ...customPerms])];
  res.json({ role: u.role, permissions: allPerms, default: rolePerms, custom: customPerms });
});

app.get("/api/permissions/:userId", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  const u = findByIdOrMongo(db.users, req.params.userId);
  if (!u) return res.status(404).json({ message: "Không tìm thấy user" });
  const rolePerms = ROLE_PERMISSIONS[u.role] || [];
  const customPerms = u.permissions || [];
  const allPerms = [...new Set([...rolePerms, ...customPerms])];
  res.json({ userId: u.id, userName: u.name, role: u.role, permissions: allPerms, default: rolePerms, custom: customPerms });
});

app.put("/api/permissions/:userId", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB();
    const u = findByIdOrMongo(db.users, req.params.userId);
    if (!u) return res.status(404).json({ message: "Không tìm thấy user" });
    if (u.role === "ADMIN") return res.status(400).json({ message: "Không thể sửa quyền ADMIN" });
    const { custom } = req.body;
    if (!Array.isArray(custom)) return res.status(400).json({ message: "custom phải là array" });
    u.permissions = custom.filter((p) => ALL_PERMISSIONS.some((ap) => ap.key === p));
    await saveDBOrThrow(db);
    res.json({ ok: true, user: { id: u.id, permissions: u.permissions } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ============================================================
// SETTINGS / TIME SLOTS / BACKUP / REPORTS / HEALTH
// ============================================================
app.get("/api/settings", auth(), (req, res) => {
  const db = loadDB(); ensureChatSchema(db);
  const empty = { bank: "VCB", account: "", accountName: "", hotline: "", email: "", address: "", qrCustomImage: "" };
  res.json({ ...empty, ...(db.settings || {}) });
});

app.put("/api/settings", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB(); if (!db.settings) db.settings = {};
    const allowed = ["bank", "account", "accountName", "hotline", "email", "address", "qrCustomImage", "timeSlots", "rate_points", "green_points", "review_points", "subsidy_points", "custom_programs", "rate_desc", "green_desc", "review_desc", "subsidy_desc"];
    const ruleLabels = { rate_points: "Hoàn thành đơn hàng", green_points: "Sống Xanh Học Đường", review_points: "Đánh giá món ăn", subsidy_points: "Trợ giá sinh viên" };
    if (!db.settings.rules_history) db.settings.rules_history = [];

    allowed.forEach(k => {
      if (req.body[k] !== undefined) {
        if (ruleLabels[k] && Number(db.settings[k] || 0) !== Number(req.body[k])) {
          db.settings.rules_history.push({
            id: Date.now() + Math.floor(Math.random() * 1000),
            time: new Date().toISOString(),
            rule: ruleLabels[k],
            old_value: db.settings[k] || 0,
            new_value: req.body[k],
            changed_by: req.user.name || "Admin",
          });
        }
        db.settings[k] = req.body[k];
      }
    });
    saveDB(db);
    res.json({ ok: true, settings: db.settings });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/time-slots", (req, res) => { try { const db = loadDB(); const slots = getTimeSlots(db); res.json([...slots].sort((a, b) => String(a.start || "").localeCompare(String(b.start || "")))); } catch (e) { res.status(500).json({ message: e.message }); } });

// 🔧 FIX: Gộp route PATCH /api/time-slots/:id — hỗ trợ cả enabled/note LẪN start/end
// (trước đó có 2 route trùng, bản đầu win, bản sau chết → admin không đổi giờ được)
app.patch("/api/time-slots/:id", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB();
    const slots = getTimeSlots(db);
    const idx = slots.findIndex((s) => s.id === req.params.id);
    if (idx < 0) return res.status(404).json({ message: "Khung giờ không tồn tại" });
    const { enabled, note, start, end } = req.body || {};
    if (start && end) {
      slots[idx].start = start;
      slots[idx].end = end;
      slots[idx].id = `${start}-${end}`;
    }
    if (enabled !== undefined) slots[idx].enabled = !!enabled;
    if (note !== undefined) slots[idx].note = String(note).slice(0, 100).trim();
    db.settings.timeSlots = slots;
    await saveDBOrThrow(db);
    res.json({ ok: true, slot: slots[idx] });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/time-slots/reset", auth(["ADMIN"]), async (req, res) => {
  try { const db = loadDB(); if (!db.settings) db.settings = {}; db.settings.timeSlots = [...DEFAULT_TIME_SLOTS]; await saveDBOrThrow(db); res.json({ ok: true, slots: db.settings.timeSlots }); } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/time-slots", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB();
    const slots = getTimeSlots(db);
    const { start, end } = req.body;
    if (!start || !end) return res.status(400).json({ message: "Thiếu giờ bắt đầu/kết thúc" });
    const id = `${start}-${end}`;
    if (slots.find(x => x.id === id)) return res.status(400).json({ message: "Khung giờ đã tồn tại" });
    slots.push({ id, start, end, enabled: true, note: "" });
    db.settings.timeSlots = slots;
    await saveDBOrThrow(db);
    res.status(201).json({ ok: true, slot: { id, start, end, enabled: true, note: "" } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete("/api/time-slots/:id", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB();
    let slots = getTimeSlots(db);
    slots = slots.filter(s => s.id !== req.params.id);
    db.settings.timeSlots = slots;
    await saveDBOrThrow(db);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/backup/export", auth(["ADMIN"]), (req, res) => { const db = loadDB(); res.json({ version: "1.0", exported_at: new Date().toISOString(), exported_by: req.user.name, data: db }); });

const ALLOWED_BACKUP_COLLECTIONS = [
  "users", "sizes", "menu_items", "categories", "toppings", "orders", "inventory",
  "notifications", "vouchers", "reviews", "messages", "attendances", "imports",
  "price_history", "shifts", "wallets", "wallet_transactions", "tasks", "points_history",
  "chat_transfer_requests", "eco_rewards", "orderReminders",
  "points_config", "chat_conversations", "settings",
];

app.post("/api/backup/import", auth(["ADMIN"]), async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || typeof data !== "object") return res.status(400).json({ message: "File backup không hợp lệ" });
    if (!Array.isArray(data.users)) return res.status(400).json({ message: "Thiếu mảng users" });
    if (!Array.isArray(data.menu_items)) return res.status(400).json({ message: "Thiếu mảng menu_items" });
    for (const u of data.users) if (u.email) u.email = normalizeEmail(u.email);
    for (const u of data.users) if (!u.id || !u.email || !VALID_ROLES.includes(u.role)) return res.status(400).json({ message: "User không hợp lệ" });

    const cleanData = {};
    for (const k of ALLOWED_BACKUP_COLLECTIONS) {
      if (data[k] !== undefined) cleanData[k] = data[k];
    }

    if (mongoReady) await extractInlineImagesFromData(cleanData, { log: (m) => console.log(m) });
    await saveDBOrThrow(cleanData);
    invalidateMenuCache();
    invalidateStatsCache();
    res.json({ message: "Import thành công!", stats: { users: cleanData.users?.length || 0, menu_items: cleanData.menu_items?.length || 0, orders: cleanData.orders?.length || 0, inventory: cleanData.inventory?.length || 0 } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/backup/stats", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  res.json({
    users: db.users?.length || 0, customers: db.users?.filter((u) => u.role === "CUSTOMER").length || 0, employees: db.users?.filter((u) => u.role === "EMPLOYEE").length || 0,
    menu_items: db.menu_items?.length || 0, orders: db.orders?.length || 0, inventory: db.inventory?.length || 0, toppings: db.toppings?.length || 0, sizes: db.sizes?.length || 0,
    reviews: db.reviews?.length || 0, vouchers: db.vouchers?.length || 0, notifications: db.notifications?.length || 0, messages: db.messages?.length || 0,
    attendances: db.attendances?.length || 0, imports: db.imports?.length || 0, price_history: db.price_history?.length || 0, tasks: db.tasks?.length || 0,
    points_history: db.points_history?.length || 0, chat_transfer_requests: db.chat_transfer_requests?.length || 0, db_size_bytes: JSON.stringify(db).length,
  });
});

app.post("/api/backup/reset", auth(["ADMIN"]), async (req, res) => {
  try {
    const { confirm } = req.body; const RESET_TOKEN = process.env.RESET_CONFIRM_TOKEN || "RESET";
    if (confirm !== RESET_TOKEN) return res.status(400).json({ message: `Cần xác nhận '${RESET_TOKEN}'` });
    const db = loadDB();
    db.orders = []; db.wallets = []; db.wallet_transactions = []; db.notifications = []; db.messages = []; db.attendances = []; db.shifts = []; db.imports = []; db.price_history = []; db.reviews = []; db.points_history = []; db.chat_transfer_requests = []; db.chat_conversations = {};
    (db.users || []).forEach((u) => { u.points = 0; });
    (db.menu_items || []).forEach((m) => { if (m.stock !== undefined) m.stock = Math.max(m.stock, 30); m.sold = 0; });
    await saveDBOrThrow(db);
    invalidateMenuCache();
    invalidateStatsCache();
    res.json({ ok: true, message: "Reset thành công", stats: { users: db.users.length, menu_items: db.menu_items.length, orders: 0, wallets: 0 } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/reports/revenue", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  try {
    const db = loadDB(); const { period = "day" } = req.query; const now = new Date(); const completedOrders = (db.orders || []).filter((o) => o.status === "Hoàn thành");
    let result = []; let totalRevenue = 0; let totalOrders = 0;
    if (period === "day") { for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); const dateStr = getLocalDateStr(d); const dayOrders = completedOrders.filter((o) => toLocalDateStr(o.created_at) === dateStr); const revenue = dayOrders.reduce((s, o) => s + (o.total || 0), 0); const dayLabel = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][d.getDay()]; result.push({ label: dayLabel, date: dateStr, revenue, orders: dayOrders.length }); totalRevenue += revenue; totalOrders += dayOrders.length; } }
    else if (period === "week") { for (let i = 3; i >= 0; i--) { const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() - i * 7); const weekStart = new Date(weekEnd); weekStart.setDate(weekStart.getDate() - 6); const weekOrders = completedOrders.filter((o) => { const d = new Date(o.created_at); return d >= weekStart && d <= weekEnd; }); const revenue = weekOrders.reduce((s, o) => s + (o.total || 0), 0); result.push({ label: "Tuần " + (4 - i), date: getLocalDateStr(weekStart) + " - " + getLocalDateStr(weekEnd), revenue, orders: weekOrders.length }); totalRevenue += revenue; totalOrders += weekOrders.length; } }
    else if (period === "month") { for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); const year = d.getFullYear(); const month = d.getMonth(); const monthOrders = completedOrders.filter((o) => { const od = new Date(o.created_at); return od.getFullYear() === year && od.getMonth() === month; }); const revenue = monthOrders.reduce((s, o) => s + (o.total || 0), 0); result.push({ label: "T" + (month + 1), date: year + "-" + String(month + 1).padStart(2, "0"), revenue, orders: monthOrders.length }); totalRevenue += revenue; totalOrders += monthOrders.length; } }
    else if (period === "year") { for (let i = 4; i >= 0; i--) { const year = now.getFullYear() - i; const yearOrders = completedOrders.filter((o) => { const od = new Date(o.created_at); return od.getFullYear() === year; }); const revenue = yearOrders.reduce((s, o) => s + (o.total || 0), 0); result.push({ label: String(year), date: String(year), revenue, orders: yearOrders.length }); totalRevenue += revenue; totalOrders += yearOrders.length; } }
    const menuSold = {};
    (db.orders || []).forEach((o) => { if (o.status !== "Hoàn thành") return; (o.items || []).forEach((it) => { if (!menuSold[it.menu_item_id]) menuSold[it.menu_item_id] = { id: it.menu_item_id, name: it.name, sold: 0, revenue: 0 }; menuSold[it.menu_item_id].sold += it.qty; menuSold[it.menu_item_id].revenue += it.price * it.qty; }); });
    const topItems = Object.values(menuSold).sort((a, b) => b.sold - a.sold).slice(0, 5);
    res.json({ period, data: result, totalRevenue, totalOrders, avgOrder: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0, topItems });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/admin/backfill-translations", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB();
    const FIELDS_MENU = ["name", "description"]; const FIELDS_CAT = ["name"]; const LANGS = ["en", "ja", "ko", "zh"];
    let menuTodo = []; let catTodo = [];
    for (const m of db.menu_items || []) {
      let need = false;
      for (const f of FIELDS_MENU) {
        if (!m[f] || !String(m[f]).trim()) continue;
        for (const l of LANGS) { const tr = m[`${f}_${l}`]; if (!tr || tr === m[f]) { need = true; break; } }
        if (need) break;
      }
      if (need) menuTodo.push(m);
    }
    for (const c of db.categories || []) {
      let need = false;
      for (const f of FIELDS_CAT) {
        if (!c[f] || !String(c[f]).trim()) continue;
        for (const l of LANGS) { const tr = c[`${f}_${l}`]; if (!tr || tr === c[f]) { need = true; break; } }
        if (need) break;
      }
      if (need) catTodo.push(c);
    }
    for (const m of menuTodo) { try { await autoTranslateMenuItem(db, m, null); } catch (e) { console.warn("Backfill menu fail:", m?.name, e.message); } }
    for (const c of catTodo) { try { await autoTranslateCategory(db, c, null); } catch (e) { console.warn("Backfill category fail:", c?.name, e.message); } }
    await saveDBOrThrow(db);
    invalidateMenuCache();
    res.json({ ok: true, queued: { menu: menuTodo.length, category: catTodo.length }, message: `Đã dịch ${menuTodo.length} món và ${catTodo.length} danh mục.` });
  } catch (e) { console.error("BACKFILL ERROR:", e); res.status(500).json({ message: e.message }); }
});

// ============================================================
// ERROR HANDLING & HEALTH
// ============================================================
app.use((err, req, res, next) => {
  console.error("🔥 GLOBAL ERROR:", req.method, req.path, "→", err.message);
  if (res.headersSent) return next(err);
  const isProd = process.env.NODE_ENV === "production";
  res.status(err.status || 500).json({
    message: isProd ? "Đã xảy ra lỗi. Vui lòng thử lại." : err.message,
    ...(isProd ? {} : { stack: err.stack }),
  });
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ message: "Endpoint không tồn tại", path: req.path });
  res.status(404).send("Not Found");
});

const healthHandler = (_, res) =>
  res.json({
    ok: true,
    name: "Canteen VWA API (V23)",
    version: BUILD_VERSION,
    timezone: VN_TIMEZONE,
    autoTranslate: { mode: "sync-on-write", langs: ASYNC_LANGS },
    chat: { ttlHours: 24, admin: true },
    oauth: { google: GOOGLE_OAUTH_ENABLED, facebook: FACEBOOK_OAUTH_ENABLED, microsoft: MICROSOFT_OAUTH_ENABLED },
    mongo: mongoReady ? "connected" : "not-connected",
    auth: { mode: "Bearer-only", refresh: false },
    cloudinary: !!(process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY)),
    kds: { sse: true, polling: true, ...sseStats() },
    vercel: !!process.env.VERCEL,
    timestamp: new Date().toISOString(),
  });

app.get("/", healthHandler);
app.get("/api", healthHandler);
app.get("/api/", healthHandler);

const PORT = process.env.PORT || 3000;
export default app;

const IS_VERCEL = !!process.env.VERCEL;
if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log("🚀 API (V23): http://localhost:" + PORT + " | TZ: " + VN_TIMEZONE);
    console.log("   💬 Chat TTL: 24h | Auth: Bearer token");
    console.log("   🖼️  Cloudinary:", process.env.CLOUDINARY_URL ? "ON" : "OFF (fallback menu_images)");
    console.log("   ⚡ KDS: SSE + Polling");
  });
  getInitPromise().catch((e) => console.error("Init failed:", e.message));
} else {
  console.log("🚀 API V23 chạy trên Vercel Serverless | TZ: " + VN_TIMEZONE);
  getInitPromise().catch((e) => console.error("Init failed:", e.message));
}
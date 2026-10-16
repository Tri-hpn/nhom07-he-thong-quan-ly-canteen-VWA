??import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import crypto from "crypto";
import { translateOne } from "./autoTranslate.js";
import {
  MENU_IMAGE_PREFIX,
  MAIN_DOC_ID,
  countInlineMenuImages,
  applyMenuImageToItem,
  extractInlineImagesFromData,
  migrateInlineMenuImages,
  getMenuImage,
  deleteMenuImage,
} from "./menuImageStore.js";
import { deductStock, refundStock } from "./recipes.mjs";
import {
  mergeConfig,
  calcEarnPoints,
  calcGreenBonus,
  calcReviewBonus,
  canRedeem,
  DEFAULT_POINTS_CONFIG,
} from "./src/lib/pointsEngine.js";
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BUILD_VERSION =
  "v15-chat-admin-" + new Date().toISOString().slice(0, 19);

// ============================================================
// ? FIX #8: nextId() helper — tránh Math.max(...arr) stack overflow
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

// ============================================================
// ? FIX #2: normalizeEmail — dùng m?i nõi
// ============================================================
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// ============================================================
// AUTO-TRANSLATE (V14 — await tri?t ð?)
// ============================================================
const ASYNC_LANGS = ["en", "ja", "ko", "zh"];

async function translateAsync(db, obj, fields) {
  const tasks = [];

  for (const lang of ASYNC_LANGS) {
    for (const f of fields) {
      const text = obj[f];
      if (!text || !String(text).trim()) continue;
      if (obj[`${f}_${lang}`]) continue;

      const fieldKey = `${f}_${lang}`;
      const srcText = text;

      tasks.push(
        translateOne(srcText, lang)
          .then((translated) => {
            if (translated && translated !== srcText) {
              obj[fieldKey] = translated;
            } else if (translated === srcText) {
              obj[fieldKey] = srcText;
            }
          })
          .catch(() => {
            obj[fieldKey] = srcText;
          })
      );
    }
  }

  if (tasks.length === 0) return;

  try {
    await Promise.allSettled(tasks);
    if (mongoReady) saveDB(db);
  } catch {
    /* silent */
  }
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

// ============================================================
// TIMEZONE
// ============================================================
const VN_TIMEZONE = "Asia/Ho_Chi_Minh";

const VN_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: VN_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
const VN_HOUR_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: VN_TIMEZONE, hour: "2-digit", hour12: false,
});
const VN_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: VN_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false,
});

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
  if (attempts >= 10) throw new Error("Không t?o ðý?c m? ðõn unique — vui l?ng th? l?i");
  return code;
}

const TEMP_PASSWORD_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function generateTempPassword(len = 8) {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += TEMP_PASSWORD_CHARS[bytes[i] % TEMP_PASSWORD_CHARS.length];
  }
  return out;
}

// ============================================================
// M? NGÀNH — MSSV / M? GV
// ============================================================
const DEFAULT_MAJORS_MAP = {
  "7310": { code_full: "7310101 / 7310109", name: "Kinh t? / Kinh t? s?", faculty: "Khoa Kinh t?" },
  "7319": { code_full: "7310399", name: "Gi?i và Phát tri?n", faculty: "Khoa Gi?i & Phát tri?n" },
  "7314": { code_full: "7310401", name: "Tâm l? h?c", faculty: "Khoa Tâm l?" },
  "7324": { code_full: "7320104", name: "Truy?n thông ða phýõng ti?n", faculty: "Khoa Truy?n thông" },
  "7341": { code_full: "7340101", name: "Qu?n tr? kinh doanh", faculty: "Khoa Kinh t? - Qu?n tr?" },
  "7345": { code_full: "7340115", name: "Marketing", faculty: "Khoa Kinh t? - Qu?n tr?" },
  "7381": { code_full: "7380101 / 7380107", name: "Lu?t / Lu?t kinh t?", faculty: "Khoa Lu?t" },
  "7482": { code_full: "7480201", name: "Công ngh? thông tin / Thi?t k? Game", faculty: "Khoa Công ngh? Thông tin & Truy?n thông" },
  "7761": { code_full: "7760101", name: "Công tác x? h?i", faculty: "Khoa Công tác X? h?i" },
  "7813": { code_full: "7810103", name: "Qu?n tr? d?ch v? du l?ch và l? hành", faculty: "Khoa Du l?ch" },
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

  if (!/^\d{10}$/.test(clean)) {
    return { raw: clean, valid: false, note: "MSSV ph?i là 10 ch? s?" };
  }

  const yearIn = 2000 + parseInt(clean.slice(0, 2), 10);
  const majorCode = clean.slice(2, 6);
  const sequence = clean.slice(6);

  const map = getMajorsMap(db);
  const major = map[majorCode];

  return {
    raw: clean,
    valid: true,
    year_in: yearIn,
    major_code: majorCode,
    major_name: major?.name || "",
    major_code_full: major?.code_full || "",
    faculty: major?.faculty || "",
    sequence,
    mapped: !!major,
    note: major ? "" : `M? ngành "${majorCode}" chýa có trong b?ng`,
  };
}

function parseTeacherCode(code, db) {
  if (!code) return null;
  const clean = String(code).trim().replace(/\s/g, "");

  if (!/^\d{6}-\d{7}$/.test(clean)) {
    return { raw: clean, valid: false, note: "M? GV ph?i có format YYYYNN-NNNNNNN" };
  }

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
    if (/^\d{10}$/.test(local)) {
      return { role: "CUSTOMER", code_type: "STUDENT", code: local };
    }
    return { role: "CUSTOMER", code_type: "STUDENT", code: "" };
  }

  if (lower.endsWith("@vwa.edu.vn")) {
    const local = lower.split("@")[0];
    if (/^\d{6}-\d{7}$/.test(local)) {
      return { role: "EMPLOYEE", code_type: "TEACHER", code: local };
    }
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

// ============================================================
// ? POINTS CONFIG HELPER
// ============================================================
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
// MONGODB
// ============================================================
const MONGO_URI = process.env.MONGO_URI;
let MongoModel = null;
let dbCache = null;
let mongoReady = false;
let mongoConnecting = null;

if (MONGO_URI) {
  const dbSchema = new mongoose.Schema(
    { _id: { type: String, default: "main" }, data: { type: mongoose.Schema.Types.Mixed } },
    { collection: "canteen_db", minimize: false }
  );
  MongoModel = mongoose.model("CanteenDB", dbSchema);
}

// ============================================================
// DEFAULT TIME SLOTS
// ============================================================
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

// ============================================================
// NUTRITION
// ============================================================
const NUTRITION_BY_CATEGORY = {
  "Cõm":               { prep_time: 12, calories: 620, is_cool: false, is_healthy: false, is_spicy: false },
  "Bún - Ph? - Cháo":  { prep_time: 10, calories: 520, is_cool: false, is_healthy: false, is_spicy: false },
  "Bánh m? - Xôi":     { prep_time: 6,  calories: 460, is_cool: false, is_healthy: false, is_spicy: false },
  "Ð? ãn nhanh":       { prep_time: 8,  calories: 640, is_cool: false, is_healthy: false, is_spicy: false },
  "Ãn v?t":            { prep_time: 7,  calories: 320, is_cool: false, is_healthy: false, is_spicy: false },
  "Ð? chay":           { prep_time: 12, calories: 380, is_cool: false, is_healthy: true,  is_spicy: false },
  "Món chay":          { prep_time: 12, calories: 380, is_cool: false, is_healthy: true,  is_spicy: false },
  "Combo 1 ngý?i":     { prep_time: 15, calories: 780, is_cool: false, is_healthy: false, is_spicy: false },
  "Combo siêu h?i":    { prep_time: 18, calories: 950, is_cool: false, is_healthy: false, is_spicy: false },
  "Coffee & Tea":      { prep_time: 5,  calories: 180, is_cool: true,  is_healthy: false, is_spicy: false },
  "Ný?c ép - Sinh t?": { prep_time: 5,  calories: 150, is_cool: true,  is_healthy: true,  is_spicy: false },
  "Ð? u?ng":           { prep_time: 3,  calories: 140, is_cool: true,  is_healthy: false, is_spicy: false },
};
const NUTRITION_FALLBACK = { prep_time: 10, calories: 500, is_cool: false, is_healthy: false, is_spicy: false };

function normalizeVN(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ð/g, "d");
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
    if (cur === undefined || cur === null || cur === "") {
      item[key] = value;
      changed = true;
    }
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
    if (!mongoReady) {
      console.log("?? B? qua migrate nutrition (MongoDB chýa s?n sàng)");
      return;
    }
    const db = loadDB();
    if (!db || !Array.isArray(db.menu_items) || db.menu_items.length === 0) return;
    let changed = 0;
    for (const item of db.menu_items) {
      if (fillMenuNutrition(item)) changed++;
    }
    if (changed > 0) {
      saveDB(db);
      console.log(`?? Ð? b? sung dinh dý?ng cho ${changed}/${db.menu_items.length} món`);
    } else {
      console.log("?? Dinh dý?ng món ãn: ð?y ð?");
    }
  } catch (e) {
    console.error("migrateMenuNutrition l?i:", e.message);
  }
}

// ============================================================
// SEED DATA
// ============================================================
const SEED_PASSWORD_HASH = bcrypt.hashSync("123456", 10);

function buildSeedData() {
  return {
    users: [
      { id: 1, name: "Qu?n tr? viên", email: "admin@vwa.vn", password: SEED_PASSWORD_HASH, role: "ADMIN", status: "Ho?t ð?ng", phone: "0900000001", points: 0, created_at: "2025-01-01T00:00:00.000Z" },
      { id: 2, name: "Tr?n Vãn Trí", email: "nhanvien@vwa.vn", password: SEED_PASSWORD_HASH, role: "EMPLOYEE", status: "Ho?t ð?ng", phone: "", points: 50, chat_enabled: true, created_at: "2025-01-01T00:00:00.000Z" },
      { id: 3, name: "Tr?n Vãn Trí", email: "sinhvien@vwa.vn", password: SEED_PASSWORD_HASH, role: "CUSTOMER", status: "Ho?t ð?ng", phone: "", points: 1959, created_at: "2025-01-01T00:00:00.000Z" },
    ],
    menu_items: [],
    categories: [
      { id: 1, name: "Cõm", icon: "??", order: 1 },
      { id: 2, name: "Bún", icon: "??", order: 2 },
      { id: 3, name: "Ð? u?ng", icon: "??", order: 3 },
    ],
    sizes: [
      { id: "S", name: "Nh?", extra_price: 0 },
      { id: "M", name: "V?a", extra_price: 5000 },
      { id: "L", name: "L?n", extra_price: 10000 },
    ],
    toppings: [],
    orders: [],
    inventory: [
      { code: "NL001", name: "G?o",       qty: 100, unit: "kg",  min: 10 },
      { code: "NL002", name: "Th?t gà",   qty: 12,  unit: "kg",  min: 10 },
      { code: "NL003", name: "Th?t b?",   qty: 8,   unit: "kg",  min: 10 },
      { code: "NL004", name: "Bún",       qty: 15,  unit: "kg",  min: 10 },
      { code: "NL005", name: "Th?t heo",  qty: 25,  unit: "kg",  min: 10 },
      { code: "NL006", name: "Ph?",       qty: 30,  unit: "kg",  min: 10 },
      { code: "NL007", name: "M?",        qty: 20,  unit: "kg",  min: 10 },
      { code: "NL008", name: "Tr?ng gà",  qty: 100, unit: "cái", min: 10 },
      { code: "NL009", name: "Rau s?ng",  qty: 20,  unit: "kg",  min: 10 },
      { code: "NL010", name: "Cà chua",   qty: 15,  unit: "kg",  min: 10 },
      { code: "NL011", name: "Hành",      qty: 10,  unit: "kg",  min: 10 },
      { code: "NL012", name: "D?u ãn",    qty: 20,  unit: "lít", min: 10 },
      { code: "NL013", name: "Ný?c m?m",  qty: 10,  unit: "lít", min: 10 },
      { code: "NL014", name: "Cà phê",    qty: 8,   unit: "kg",  min: 10 },
      { code: "NL015", name: "Bánh m?",   qty: 100, unit: "cái", min: 10 },
      { code: "NL016", name: "S?a ð?c",   qty: 20,  unit: "h?p", min: 10 },
      { code: "NL017", name: "Trà",       qty: 5,   unit: "kg",  min: 10 },
      { code: "NL018", name: "Ð?u h?",    qty: 15,  unit: "kg",  min: 10 },
      { code: "NL019", name: "Xúc xích",  qty: 100, unit: "cái", min: 10 },
      { code: "NL020", name: "Khoai tây", qty: 30,  unit: "kg",  min: 10 },
    ],
    notifications: [],
    vouchers: [],
    reviews: [],
    messages: [],
    attendances: [],
    imports: [],
    price_history: [],
    shifts: [],
    wallets: [],
    wallet_transactions: [],
    tasks: [],
    points_config: {
      ...JSON.parse(JSON.stringify(DEFAULT_POINTS_CONFIG)),
      updated_at: new Date().toISOString(),
    },
    points_history: [],
    // ? M?I: chat admin
    chat_transfer_requests: [],
    chat_conversations: {},
    settings: {
      bank: "VCB",
      account: "",
      accountName: "",
      hotline: "",
      email: "",
      address: "",
      qrCustomImage: "",
      // ? M?I: công t?c chat toàn h? th?ng
      chat_enabled_global: true,
    },
  };
}

// ============================================================
// INIT MONGO
// ============================================================
async function initMongo() {
  console.log("????????????????????????????????????????");
  console.log("?? INIT MONGO DEBUG:");
  console.log("   process.env.MONGO_URI có?:", !!process.env.MONGO_URI);
  console.log("   MONGO_URI length:", (process.env.MONGO_URI || "").length);
  console.log("   MONGO_URI prefix:", (process.env.MONGO_URI || "").slice(0, 30));
  console.log("   MONGO_URI suffix:", (process.env.MONGO_URI || "").slice(-30));
  console.log("   MongoModel có?:", !!MongoModel);
  console.log("   VERCEL:", process.env.VERCEL);
  console.log("????????????????????????????????????????");

  if (mongoConnecting) {
    console.log("? Ð?i connection ðang ch?y...");
    return mongoConnecting;
  }

  if (mongoReady && dbCache) {
    console.log("? Ð? connected t? trý?c");
    return true;
  }

  mongoConnecting = (async () => {
    try {
      if (!MONGO_URI || !MongoModel) {
        console.log("?? Không có MONGO_URI ? dùng seed r?ng");
        dbCache = buildSeedData();
        mongoReady = false;
        return false;
      }

      console.log("?? Ðang k?t n?i MongoDB...");
      const t0 = Date.now();

      await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 25000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 25000,
        maxPoolSize: 10,
        minPoolSize: 0,
        bufferCommands: false,
        family: 4,
        retryWrites: true,
        retryReads: true,
      });

      console.log("? Ð? k?t n?i MongoDB trong " + (Date.now() - t0) + "ms");

      console.log("???  Ki?m tra ?nh món ãn...");
      let migration;
      try {
        migration = await migrateInlineMenuImages({ log: (m) => console.log("   " + m) });
      } catch (e) {
        migration = { ok: false, error: e.message };
        console.error("? Di trú ?nh l?i:", e.message);
      }

      if (!migration.ok) {
        if (process.env.VERCEL) {
          console.warn("??  Không tách ðý?c ?nh (" + (migration.error || "?") + ") — ti?p t?c");
        } else {
          console.warn("??  Không tách ðý?c ?nh — ch?y: npm run db:migrate-images");
        }
      }

      console.log("? Ðang t?i DB...");
      const t1 = Date.now();
      const doc = await MongoModel.findById(MAIN_DOC_ID).lean();

      if (!doc) {
        console.log("?? DB chýa có ? kh?i t?o seed...");
        const seed = buildSeedData();
        await MongoModel.create({ _id: MAIN_DOC_ID, data: seed });
        dbCache = seed;
        console.log("? Ð? seed DB lên MongoDB");
      } else {
        dbCache = doc.data;

        // ? AUTO-REFILL: N?u inventory < 20 items ? n?p l?i 20 items
        if (!Array.isArray(dbCache.inventory) || dbCache.inventory.length < 20) {
          console.log("??  Inventory thi?u items ? auto-refill 20 nguyên li?u...");
          dbCache.inventory = [
            { code: "NL001", name: "G?o",       qty: 100, unit: "kg",  min: 10 },
            { code: "NL002", name: "Th?t gà",   qty: 12,  unit: "kg",  min: 10 },
            { code: "NL003", name: "Th?t b?",   qty: 8,   unit: "kg",  min: 10 },
            { code: "NL004", name: "Bún",       qty: 15,  unit: "kg",  min: 10 },
            { code: "NL005", name: "Th?t heo",  qty: 25,  unit: "kg",  min: 10 },
            { code: "NL006", name: "Ph?",       qty: 30,  unit: "kg",  min: 10 },
            { code: "NL007", name: "M?",        qty: 20,  unit: "kg",  min: 10 },
            { code: "NL008", name: "Tr?ng gà",  qty: 100, unit: "cái", min: 10 },
            { code: "NL009", name: "Rau s?ng",  qty: 20,  unit: "kg",  min: 10 },
            { code: "NL010", name: "Cà chua",   qty: 15,  unit: "kg",  min: 10 },
            { code: "NL011", name: "Hành",      qty: 10,  unit: "kg",  min: 10 },
            { code: "NL012", name: "D?u ãn",    qty: 20,  unit: "lít", min: 10 },
            { code: "NL013", name: "Ný?c m?m",  qty: 10,  unit: "lít", min: 10 },
            { code: "NL014", name: "Cà phê",    qty: 8,   unit: "kg",  min: 10 },
            { code: "NL015", name: "Bánh m?",   qty: 100, unit: "cái", min: 10 },
            { code: "NL016", name: "S?a ð?c",   qty: 20,  unit: "h?p", min: 10 },
            { code: "NL017", name: "Trà",       qty: 5,   unit: "kg",  min: 10 },
            { code: "NL018", name: "Ð?u h?",    qty: 15,  unit: "kg",  min: 10 },
            { code: "NL019", name: "Xúc xích",  qty: 100, unit: "cái", min: 10 },
            { code: "NL020", name: "Khoai tây", qty: 30,  unit: "kg",  min: 10 },
          ];
          saveDB(dbCache);
          console.log("? Ð? refill 20 nguyên li?u và save vào DB");
        }

        // ? FIX #2: normalize email khi load DB
        if (Array.isArray(dbCache.users)) {
          for (const u of dbCache.users) {
            if (u.email) u.email = normalizeEmail(u.email);
          }
        }

        // ? M?I: ð?m b?o có schema chat
        const chatChanged = ensureChatSchema(dbCache);
        if (chatChanged) {
          console.log("?? Ð? migration chat schema (chat_enabled, transfer_requests)");
          saveDB(dbCache);
        }

        console.log(
          "? Ð? load DB trong " + (Date.now() - t1) + "ms: " +
          (dbCache.menu_items?.length || 0) + " món, " +
          (dbCache.users?.length || 0) + " users"
        );
      }

      mongoReady = true;
      console.log("? MONGO READY = TRUE");
      return true;

    } catch (e) {
      console.error("????????????????????????????????????????");
      console.error("? MONGODB L?I CHI TI?T:");
      console.error("   Error name:", e.name);
      console.error("   Error message:", e.message);
      console.error("   Error code:", e.code);
      if (e.reason) console.error("   Reason:", e.reason?.message || e.reason);
      if (e.stack) console.error("   Stack:", e.stack.split("\n").slice(0, 5).join("\n"));
      console.error("????????????????????????????????????????");

      mongoReady = false;
      dbCache = buildSeedData();
      console.log("?? Fallback: dùng seed r?ng (app v?n ch?y ðý?c)");
      return false;

    } finally {
      mongoConnecting = null;
    }
  })();

  return mongoConnecting;
}

function loadDB() {
  if (dbCache) return dbCache;

  console.log("? loadDB: dbCache null ? trigger lazy init");
  initMongo().catch((e) => {
    console.error("? Lazy init l?i:", e.message);
  });

  dbCache = buildSeedData();
  return dbCache;
}

let saveQueue = Promise.resolve();

function saveDB(data) {
  dbCache = data;

  if (mongoReady && MongoModel) {
    const inlineCount = countInlineMenuImages(data);
    if (inlineCount > 0) {
      console.warn("??  C?n " + inlineCount + " ?nh base64 trong menu_items");
    }

    saveQueue = saveQueue
      .then(() =>
        MongoModel.updateOne(
          { _id: MAIN_DOC_ID },
          { $set: { data: data } },
          { upsert: true }
        )
      )
      .catch((e) => console.error("Mongo save error:", e.message));

    return;
  }

  console.warn("?? saveDB: MongoDB chýa k?t n?i — d? li?u CH? lýu trong RAM");
}

async function saveDBOrThrow(data) {
  dbCache = data;

  if (mongoReady && MongoModel) {
    const inlineCount = countInlineMenuImages(data);
    if (inlineCount > 0) {
      console.warn("??  C?n " + inlineCount + " ?nh base64 trong menu_items");
    }

    await MongoModel.updateOne(
      { _id: MAIN_DOC_ID },
      { $set: { data: data } },
      { upsert: true }
    );
    return;
  }
}

// ============================================================
// NOTIFICATIONS
// ============================================================
function notifyNewOrder(db, order) {
  if (!db.notifications) db.notifications = [];
  const staff = db.users.filter(u => u.role === "ADMIN" || u.role === "EMPLOYEE");
  staff.forEach(s => {
    const id = nextId(db.notifications);
    db.notifications.push({
      id, user_id: s.id,
      title: "Ðõn hàng m?i",
      content: order.customer_name + " v?a ð?t ðõn " + order.code + " (" + order.total.toLocaleString("vi-VN") + "ð)",
      type: "order",
      link: s.role === "ADMIN" ? "/owner" : "/employee/orders",
      read: false, created_at: new Date().toISOString()
    });
  });
}

function notifyOrderStatus(db, order, newStatus) {
  if (!db.notifications) db.notifications = [];

  const TITLE_BY_STATUS = {
    "Ch? xác nh?n":  "Ðõn hàng " + order.code + " ðang ch? xác nh?n",
    "Ð? xác nh?n":   "Ðõn hàng " + order.code + " ð? ðý?c xác nh?n",
    "Ðang chu?n b?": "Ðõn hàng " + order.code + " ðang ðý?c chu?n b?",
    "S?n sàng nh?n": "Ðõn hàng " + order.code + " s?n sàng nh?n",
    "Hoàn thành":    "Ðõn hàng " + order.code + " ð? hoàn thành",
    "Ð? h?y":        "Ðõn hàng " + order.code + " ð? b? h?y",
  };

  const id = nextId(db.notifications);
  db.notifications.push({
    id, user_id: order.customer_id,
    title: TITLE_BY_STATUS[newStatus] || ("Ðõn hàng " + order.code + " c?p nh?t: " + newStatus),
    content: "Ðõn hàng c?a b?n ðang ? tr?ng thái: " + newStatus,
    type: "status", link: "/customer/orders", read: false,
    created_at: new Date().toISOString()
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

  const earned = Number(order.points_earned) || 0;
  if (earned > 0) {
    const customer = (db.users || []).find((u) => u.id === order.customer_id);
    if (customer) {
      customer.points = Math.max(0, (customer.points || 0) - earned);
    }
    order.points_earned = 0;
  }

  // ? Hoàn ði?m S?ng Xanh n?u ð? duy?t
  const __greenBonus = Number(order.green_points) || 0;
  if (order.green_status === "approved" && __greenBonus > 0) {
    const __cust = (db.users || []).find((u) => u.id === order.customer_id);
    if (__cust) __cust.points = Math.max(0, (__cust.points || 0) - __greenBonus);
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
      db.wallet_transactions = db.wallet_transactions.filter(
        (tx) => !(tx.order_code === order.code && tx.type === "payment")
      );
    }

    if (!db.wallet_transactions) db.wallet_transactions = [];
    const refundId = nextId(db.wallet_transactions);
    db.wallet_transactions.push({
      id: refundId,
      code: "REF" + Date.now().toString().slice(-8),
      user_id: order.customer_id,
      user_name: order.customer_name,
      type: "deposit",
      amount: total,
      method: "WALLET",
      status: "approved",
      note: "Hoàn ti?n ðõn " + order.code + " (b? h?y)",
      order_code: order.code,
      created_at: new Date().toISOString(),
      approved_at: new Date().toISOString(),
    });
  }

  if (order.voucher_code && Array.isArray(db.vouchers)) {
    const vc = db.vouchers.find(
      (v) => v.code === order.voucher_code && v.order_code === order.code
    );
    if (vc) {
      vc.used = false;
      delete vc.used_at;
      delete vc.order_code;
    }
  }

  order._stock_rolled_back = true;
}

const app = express();
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    /\.vercel\.app$/,
    /\.onrender\.com$/
  ],
}));
app.use(express.json({ limit: "25mb" }));

// ============================================================
// MIDDLEWARE AWAIT INIT
// ============================================================
let initPromise = null;

function getInitPromise() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      console.log("?? [middleware] B?t ð?u init MongoDB...");
      const ok = await initMongo();
      console.log("? [middleware] initMongo() xong — ok =", ok);
      if (ok) migrateMenuNutrition();
      return ok;
    } catch (e) {
      console.error("? [middleware] initMongo() l?i:", e.message);
      return false;
    }
  })();
  return initPromise;
}

app.use(async (req, res, next) => {
  if (mongoReady) return next();

  console.log("? Request ð?n — ð?i MongoDB init...");
  await getInitPromise();
  next();
});

// ============================================================
// ? FIX #12: absolutize dùng JSON.stringify replacer (không ð? quy sâu)
// ============================================================
function requestOrigin(req) {
  const proto =
    String(req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0].trim() || "http";
  const host = req.get("x-forwarded-host") || req.get("host");
  return host ? proto + "://" + host : "";
}

function makeAbsoluteUrlReplacer(origin) {
  return function replacer(key, value) {
    if (typeof value === "string" && value.startsWith(MENU_IMAGE_PREFIX)) {
      return origin + value;
    }
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
    } catch {
      return sendJson(body);
    }
  };
  next();
});

app.get("/api/uploads/menu/:id", async (req, res) => {
  try {
    const image = await getMenuImage(req.params.id);
    if (!image) return res.status(404).json({ message: "Không t?m th?y ?nh" });

    if (image.redirectTo) return res.redirect(302, image.redirectTo);

    res.setHeader("Content-Type", image.contentType || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("ETag", '"' + req.params.id + "-" + image.rev + '"');
    res.send(image.buffer);
  } catch (e) {
    console.error("GET /api/uploads/menu/" + req.params.id + " l?i:", e.message);
    res.status(500).json({ message: "L?i t?i ?nh: " + e.message });
  }
});

// ============================================================
// JWT_SECRET
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET || "FALLBACK_SECRET_CHI_DUNG_KHI_DEV_KHONG_AN_TOAN";
if (!process.env.JWT_SECRET) {
  console.error("?? JWT_SECRET chýa set — dùng fallback (KHÔNG AN TOÀN CHO PRODUCTION)");
}

function auth(roles = []) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Chýa ðãng nh?p" });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const db = loadDB();
      const currentUser = (db.users || []).find((u) => u.id == payload.id);
      if (!currentUser) return res.status(401).json({ message: "Tài kho?n không c?n t?n t?i" });
      if (currentUser.status === "B? khóa") return res.status(403).json({ message: "Tài kho?n ð? b? khóa" });
      if (roles.length && !roles.includes(currentUser.role))
        return res.status(403).json({ message: "Không có quy?n" });
      req.user = { ...payload, role: currentUser.role, name: currentUser.name, email: currentUser.email };
      next();
    } catch {
      res.status(401).json({ message: "Token không h?p l?" });
    }
  };
}

// ============ AUTH ============
app.post("/api/auth/login", (req, res) => {
  try {
    const { email, password } = req.body || {};
    const emailNorm = normalizeEmail(email);
    if (!emailNorm || !password) return res.status(400).json({ message: "Thi?u email/m?t kh?u" });
    const db = loadDB();
    const user = db.users.find(u => normalizeEmail(u.email) === emailNorm);
    if (!user) return res.status(401).json({ message: "Sai tài kho?n ho?c m?t kh?u" });
    const ok = bcrypt.compareSync(password, user.password);
    if (!ok) return res.status(401).json({ message: "Sai tài kho?n ho?c m?t kh?u" });

    const filled = autoFillFromCode(db, user);
    if (filled) saveDB(db);

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
    res.json({
      token,
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

app.post("/api/auth/register", (req, res) => {
  try {
    const { email, password, name, phone, student_code } = req.body || {};
    const emailNorm = normalizeEmail(email);
    const nameNorm = String(name || "").trim();
    if (!emailNorm || !password || !nameNorm) return res.status(400).json({ message: "Thi?u thông tin" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) return res.status(400).json({ message: "Email không h?p l?" });
    if (password.length < 6) return res.status(400).json({ message: "M?t kh?u ph?i t? 6 k? t?" });
    if (phone && !/^[0-9]{10,11}$/.test(String(phone).trim()))
      return res.status(400).json({ message: "SÐT ph?i 10-11 s?" });

    let parsedMssv = "";
    if (student_code) {
      const clean = String(student_code).trim();
      if (!/^\d{10}$/.test(clean)) {
        return res.status(400).json({ message: "MSSV ph?i là 10 ch? s?" });
      }
      parsedMssv = clean;
    }

    const db = loadDB();
    if (db.users.find(u => normalizeEmail(u.email) === emailNorm))
      return res.status(400).json({ message: "Email ð? ðý?c s? d?ng" });

    if (parsedMssv) {
      const existing = db.users.find(u => u.student_code === parsedMssv);
      if (existing) {
        return res.status(400).json({
          message: "MSSV này ð? ðý?c liên k?t v?i tài kho?n khác. Vui l?ng ðãng nh?p b?ng tài kho?n trý?ng.",
          code: "MSSV_ALREADY_LINKED",
          linked_email_masked: maskEmail(existing.email),
        });
      }
    }

    const hash = bcrypt.hashSync(password, 10);
    const id = nextId(db.users);
    const user = {
      id, email: emailNorm, password: hash, name: nameNorm,
      phone: String(phone || "").trim(),
      role: "CUSTOMER", status: "Ho?t ð?ng", points: 0,
      student_code: parsedMssv,
      created_at: new Date().toISOString(),
    };

    autoFillFromCode(db, user);

    db.users.push(user);
    saveDB(db);

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({
      token,
      user: {
        id: user.id, email: user.email, name: user.name, role: user.role,
        student_code: user.student_code || "",
        major_name: user.major_name || "",
        faculty: user.faculty || "",
        year_in: user.year_in || null,
      },
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.put("/api/auth/password", auth(), (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ message: "Thi?u thông tin" });
    if (newPassword.length < 6) return res.status(400).json({ message: "M?t kh?u ph?i t? 6 k? t?" });
    const db = loadDB();
    const u = db.users.find(x => x.id === req.user.id);
    if (!u) return res.status(404).json({ message: "Không t?m th?y user" });
    const ok = bcrypt.compareSync(currentPassword, u.password);
    if (!ok) return res.status(401).json({ message: "M?t kh?u hi?n t?i không ðúng" });
    u.password = bcrypt.hashSync(newPassword, 10);
    u.must_change_password = false;
    u.password_changed_at = new Date().toISOString();
    saveDB(db);
    res.json({
      ok: true,
      message: "Ð?i m?t kh?u thành công",
      must_change_password: false,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/auth/me", auth(), (req, res) => {
  const db = loadDB();
  const u = db.users.find(x => x.id === req.user.id);
  if (!u) return res.status(404).json({ message: "Không t?m th?y user" });

  const changed = autoFillFromCode(db, u);
  if (changed) saveDB(db);

  res.json({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    points: u.points || 0,
    phone: u.phone || "",
    address: u.address || "",
    avatar: u.avatar || "",
    student_code: u.student_code || "",
    teacher_code: u.teacher_code || "",
    year_in: u.year_in || null,
    major_code: u.major_code || "",
    major_code_full: u.major_code_full || "",
    major_name: u.major_name || "",
    faculty: u.faculty || "",
    unit_code: u.unit_code || "",
    manual_override: !!u.manual_override,
    must_change_password: !!u.must_change_password,
  });
});

app.put("/api/auth/profile", auth(), (req, res) => {
  try {
    const db = loadDB();
    const u = db.users.find(x => x.id === req.user.id);
    if (!u) return res.status(404).json({ message: "Không t?m th?y user" });
    const { name, phone, avatar, address, email, student_code } = req.body;

    if (student_code !== undefined) {
      const clean = String(student_code || "").trim();

      if (u.student_code && u.student_code !== clean) {
        return res.status(403).json({
          message: "MSSV ð? liên k?t, không th? thay ð?i. Liên h? admin ð? g? liên k?t.",
          code: "MSSV_LOCKED",
        });
      }

      if (clean) {
        if (!/^\d{10}$/.test(clean)) {
          return res.status(400).json({ message: "MSSV ph?i là 10 ch? s?" });
        }
        const existing = db.users.find(x => x.id !== u.id && x.student_code === clean);
        if (existing) {
          return res.status(400).json({
            message: "MSSV này ð? ðý?c liên k?t v?i tài kho?n khác.",
            code: "MSSV_ALREADY_LINKED",
            linked_email_masked: maskEmail(existing.email),
          });
        }
        u.student_code = clean;
        autoFillFromCode(db, u);
      }
    }

    if (email && normalizeEmail(email) !== normalizeEmail(u.email)) {
      const emailNorm = normalizeEmail(email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm))
        return res.status(400).json({ message: "Email không h?p l?" });
      if (db.users.find(x => x.id !== u.id && normalizeEmail(x.email) === emailNorm))
        return res.status(400).json({ message: "Email ð? ðý?c s? d?ng" });
      u.email = emailNorm;
    }
    if (name !== undefined && name.trim()) u.name = name.trim();
    if (phone !== undefined) {
      const phoneTrim = String(phone).trim();
      if (phoneTrim && !/^[0-9]{10,11}$/.test(phoneTrim))
        return res.status(400).json({ message: "SÐT ph?i 10-11 s?" });
      u.phone = phoneTrim;
    }
    if (avatar !== undefined) u.avatar = avatar;
    if (address !== undefined) u.address = address.trim();
    saveDB(db);
    res.json({
      id: u.id, email: u.email, name: u.name, role: u.role,
      phone: u.phone, avatar: u.avatar, address: u.address,
      points: u.points,
      student_code: u.student_code || "",
      teacher_code: u.teacher_code || "",
      year_in: u.year_in || null,
      major_code: u.major_code || "",
      major_name: u.major_name || "",
      faculty: u.faculty || "",
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============ OAUTH ============
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || "";
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";
const GOOGLE_OAUTH_ENABLED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
const FACEBOOK_OAUTH_ENABLED = !!(FACEBOOK_APP_ID && FACEBOOK_APP_SECRET);

app.post("/api/auth/google/callback", async (req, res) => {
  try {
    if (!GOOGLE_OAUTH_ENABLED) return res.status(503).json({ message: "Google OAuth chýa ðý?c c?u h?nh trên server" });
    const { code, redirectUri } = req.body || {};
    if (!code) return res.status(400).json({ message: "Thi?u code" });
    if (!redirectUri) return res.status(400).json({ message: "Thi?u redirectUri" });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.status(400).json({ message: tokenData.error_description || tokenData.error || "Không l?y ðý?c access token t? Google" });

    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: "Bearer " + tokenData.access_token } });
    const profile = await userRes.json();
    if (!profile.email) return res.status(400).json({ message: "Google không tr? v? email" });

    const db = loadDB();
    const emailNorm = normalizeEmail(profile.email);
    let user = db.users.find((u) => normalizeEmail(u.email) === emailNorm);
    if (!user) {
      const id = nextId(db.users);
      user = { id, email: emailNorm, password: "", name: profile.name || emailNorm.split("@")[0], phone: "", role: "CUSTOMER", status: "Ho?t ð?ng", points: 0, provider: "google", avatar: profile.picture || "", created_at: new Date().toISOString() };
      db.users.push(user);
      saveDB(db);
    } else if (profile.picture && !user.avatar) {
      user.avatar = profile.picture;
      saveDB(db);
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, avatar: user.avatar || "", must_change_password: !!user.must_change_password } });
  } catch (e) {
    res.status(500).json({ message: "L?i xác th?c Google: " + e.message });
  }
});

app.post("/api/auth/facebook/callback", async (req, res) => {
  try {
    if (!FACEBOOK_OAUTH_ENABLED) return res.status(503).json({ message: "Facebook OAuth chýa ðý?c c?u h?nh trên server" });
    const { code, redirectUri } = req.body || {};
    if (!code) return res.status(400).json({ message: "Thi?u code" });
    if (!redirectUri) return res.status(400).json({ message: "Thi?u redirectUri" });

    const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${FACEBOOK_APP_ID}&client_secret=${FACEBOOK_APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.status(400).json({ message: tokenData.error?.message || "Không l?y ðý?c access token t? Facebook" });

    const userRes = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture.width(200)&access_token=${tokenData.access_token}`);
    const profile = await userRes.json();
    if (!profile.email) return res.status(400).json({ message: "Facebook không tr? v? email. Vui l?ng c?p quy?n email khi ðãng nh?p." });

    const db = loadDB();
    const emailNorm = normalizeEmail(profile.email);
    let user = db.users.find((u) => normalizeEmail(u.email) === emailNorm);
    if (!user) {
      const id = nextId(db.users);
      user = { id, email: emailNorm, password: "", name: profile.name || "FB User", phone: "", role: "CUSTOMER", status: "Ho?t ð?ng", points: 0, provider: "facebook", avatar: profile.picture?.data?.url || "", created_at: new Date().toISOString() };
      db.users.push(user);
      saveDB(db);
    } else if (profile.picture?.data?.url && !user.avatar) {
      user.avatar = profile.picture.data.url;
      saveDB(db);
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, avatar: user.avatar || "", must_change_password: !!user.must_change_password } });
  } catch (e) {
    res.status(500).json({ message: "L?i xác th?c Facebook: " + e.message });
  }
});

// ============ MICROSOFT OAUTH ============
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || "";
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || "";
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || "f1ea4557-ac25-41fe-9da9-089970695a61";
const MICROSOFT_OAUTH_ENABLED = !!(MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET);

async function microsoftCallbackHandler(req, res) {
  try {
    console.log("?? [Microsoft OAuth] Callback received. Method:", req.method);

    if (!MICROSOFT_OAUTH_ENABLED) {
      return res.status(503).json({ message: "Microsoft OAuth chýa ðý?c c?u h?nh trên server" });
    }

    const code = req.query.code || req.body?.code;
    const proto =
      String(req.get("x-forwarded-proto") || req.protocol || "https")
        .split(",")[0]
        .trim() || "https";
    const fwdHost = req.get("x-forwarded-host") || req.get("host");

    const redirectUri =
      req.query.redirectUri ||
      req.body?.redirectUri ||
      `${proto}://${fwdHost}/api/auth/callback/microsoft-entra-id`;

    if (!code) {
      console.error("? [Microsoft OAuth] Thi?u code");
      return res.status(400).json({ message: "Thi?u code" });
    }

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      }
    );
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("? [Microsoft OAuth] Token error:", tokenData);
      return res.status(400).json({
        message: tokenData.error_description || "Không l?y ðý?c access token t? Microsoft",
      });
    }

    const userRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: "Bearer " + tokenData.access_token },
    });
    const profile = await userRes.json();
    const emailNorm = normalizeEmail(profile.mail || profile.userPrincipalName || "");

    if (!emailNorm) {
      console.error("? [Microsoft OAuth] Không l?y ðý?c email:", profile);
      return res.status(400).json({ message: "Microsoft không tr? v? email" });
    }

    console.log("? [Microsoft OAuth] Profile:", emailNorm);

    const db = loadDB();
    const classify = classifyEmail(emailNorm);
    console.log("?? [Microsoft OAuth] Classify:", classify);

    let user = db.users.find((u) => normalizeEmail(u.email) === emailNorm);
    let isNewUser = false;
    let autoFilled = false;

    if (user) {
      console.log("? [Microsoft OAuth] User ð? t?n t?i:", emailNorm);
      if (!user.provider) user.provider = "microsoft";
      if (profile.displayName && !user.name) user.name = profile.displayName;

      if (emailNorm.endsWith("@hpn.edu.vn") && classify.code && !user.student_code) {
        user.student_code = classify.code;
      }

      if (emailNorm.endsWith("@vwa.edu.vn") && classify.code && !user.teacher_code) {
        const local = emailNorm.split("@")[0];
        if (/^\d{6}-\d{7}$/.test(local)) {
          user.teacher_code = local;
        }
      }

      autoFilled = autoFillFromCode(db, user);
      saveDB(db);

    } else {
      const id = nextId(db.users);
      const local = emailNorm.split("@")[0];
      const isStudent = emailNorm.endsWith("@hpn.edu.vn");
      const isTeacher = emailNorm.endsWith("@vwa.edu.vn");
      const isTeacherWithCode = isTeacher && /^\d{6}-\d{7}$/.test(local);

      user = {
        id, email: emailNorm, password: "",
        name: profile.displayName || local,
        phone: profile.mobilePhone || "",
        role: "CUSTOMER", status: "Ho?t ð?ng",
        points: 0, provider: "microsoft", avatar: "",
        student_code: isStudent ? (classify.code || "") : "",
        teacher_code: isTeacherWithCode ? local : "",
        created_at: new Date().toISOString(),
      };
      db.users.push(user);

      if (!db.wallets) db.wallets = [];
      db.wallets.push({
        user_id: id, balance: 0,
        bank_name: "", bank_account: "", bank_account_name: "",
        linked_at: "", created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      autoFilled = autoFillFromCode(db, user);
      saveDB(db);
      isNewUser = true;

      if (isTeacherWithCode) {
        console.log("? [Microsoft OAuth] Ð? t?o GV (CUSTOMER) m?i + wallet:", emailNorm);
      } else if (isStudent) {
        console.log("? [Microsoft OAuth] Ð? t?o SV (CUSTOMER) m?i + wallet:", emailNorm);
      } else if (isTeacher) {
        console.log("? [Microsoft OAuth] Ð? t?o GV (CUSTOMER, không m?) m?i + wallet:", emailNorm);
      } else {
        console.log("? [Microsoft OAuth] Ð? t?o CUSTOMER m?i (domain khác) + wallet:", emailNorm);
      }
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    if (req.method === "GET") {
      const origin = `${proto}://${fwdHost}`;
      const frontendUrl = `${origin}/login?token=${encodeURIComponent(token)}&provider=microsoft`;
      console.log("? [Microsoft OAuth] Redirect v? frontend:", frontendUrl);
      return res.redirect(frontendUrl);
    }

    res.json({
      token,
      user: {
        id: user.id, email: user.email, name: user.name, role: user.role,
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
    console.error("? [Microsoft OAuth] L?i:", e);
    res.status(500).json({ message: "L?i xác th?c Microsoft: " + e.message });
  }
}

app.get("/api/auth/callback/microsoft-entra-id", microsoftCallbackHandler);
app.get("/api/auth/microsoft-entra-id/callback", microsoftCallbackHandler);
app.post("/api/auth/microsoft-entra-id/callback", microsoftCallbackHandler);
app.post("/api/auth/callback/microsoft-entra-id", microsoftCallbackHandler);

// ============================================================
// MENU
// ============================================================
app.get("/api/menu", (req, res) => {
  try {
    const db = loadDB();
    const { q = "", category = "T?t c?", active_only } = req.query;
    let items = [...(db.menu_items || [])];

    if (active_only === "1" || active_only === "true") {
      items = items.filter((m) => !!m.active);
    }

    if (q) {
      const ql = String(q).toLowerCase();
      items = items.filter((m) => (m.name || "").toLowerCase().includes(ql));
    }
    if (category && category !== "T?t c?") {
      items = items.filter((m) => m.category === category);
    }
    res.json(items);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/menu", auth(["ADMIN", "EMPLOYEE"]), async (req, res) => {
  try {
    const db = loadDB();
    const body = { ...req.body };

    if (!body.name || !body.name.trim()) return res.status(400).json({ message: "Tên món không ðý?c ð? tr?ng" });
    if (body.price !== undefined && (isNaN(Number(body.price)) || Number(body.price) < 0)) return res.status(400).json({ message: "Giá không ðý?c âm" });
    if (body.stock !== undefined && (isNaN(Number(body.stock)) || Number(body.stock) < 0))
      return res.status(400).json({ message: "T?n kho không ðý?c âm" });
    if (body.discount_percent !== undefined) {
      const d = Number(body.discount_percent);
      if (isNaN(d) || d < 0 || d > 90) return res.status(400).json({ message: "Gi?m giá ph?i t? 0-90%" });
    }
    if (body.original_price !== undefined && (isNaN(Number(body.original_price)) || Number(body.original_price) < 0)) return res.status(400).json({ message: "Giá g?c không ðý?c âm" });

    if (body.original_price && body.discount_percent !== undefined) {
      body.price = body.discount_percent > 0
        ? Math.round(body.original_price * (1 - body.discount_percent / 100))
        : body.original_price;
    }

    const id = nextId(db.menu_items);
    const item = { active: 1, sold: 0, image: "", ...body, id };

    await applyMenuImageToItem(item, body.image, { persist: mongoReady });
    fillMenuNutrition(item);

    await autoTranslateMenuItem(db, item, null);

    db.menu_items.push(item);
    saveDB(db);
    res.status(201).json(item);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.put("/api/menu/:id", auth(["ADMIN", "EMPLOYEE"]), async (req, res) => {
  try {
    const db = loadDB();
    const i = db.menu_items.findIndex(m => m.id == req.params.id);
    if (i < 0) return res.status(404).json({ message: "Không t?m th?y món" });
    const oldItem = db.menu_items[i];
    const newData = { ...req.body };

    delete newData.id;

    if (newData.price !== undefined && (isNaN(Number(newData.price)) || Number(newData.price) < 0)) return res.status(400).json({ message: "Giá không ðý?c âm" });
    if (newData.stock !== undefined && (isNaN(Number(newData.stock)) || Number(newData.stock) < 0))
      return res.status(400).json({ message: "T?n kho không ðý?c âm" });
    if (newData.discount_percent !== undefined) {
      const d = Number(newData.discount_percent);
      if (isNaN(d) || d < 0 || d > 90) return res.status(400).json({ message: "Gi?m giá ph?i t? 0-90%" });
    }
    if (newData.original_price !== undefined && (isNaN(Number(newData.original_price)) || Number(newData.original_price) < 0)) return res.status(400).json({ message: "Giá g?c không ðý?c âm" });

    if (newData.original_price && newData.discount_percent !== undefined) {
      newData.price = newData.discount_percent > 0
        ? Math.round(newData.original_price * (1 - newData.discount_percent / 100))
        : newData.original_price;
    }

    if (newData.price !== undefined && Number(newData.price) !== Number(oldItem.price)) {
      if (!db.price_history) db.price_history = [];
      const historyId = nextId(db.price_history);
      db.price_history.push({
        id: historyId, menu_item_id: oldItem.id, menu_item_name: oldItem.name,
        old_price: oldItem.price, new_price: Number(newData.price),
        changed_by: req.user.name, changed_by_id: req.user.id,
        reason: newData.reason || "", created_at: new Date().toISOString()
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
    saveDB(db);
    res.json({ ok: true, item: updated });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/price-history", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  const db = loadDB();
  const { menu_item_id } = req.query;
  let list = db.price_history || [];
  if (menu_item_id) list = list.filter(h => h.menu_item_id == menu_item_id);
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(list);
});

app.delete("/api/menu/:id", auth(["ADMIN", "EMPLOYEE"]), async (req, res) => {
  try {
    const db = loadDB();
    db.menu_items = db.menu_items.filter(m => m.id != req.params.id);
    saveDB(db);
    if (mongoReady) await deleteMenuImage(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============ USERS ============
const VALID_ROLES = ["ADMIN", "EMPLOYEE", "CUSTOMER"];

app.get("/api/users", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  const { role } = req.query;
  const list = role ? db.users.filter(u => u.role === role) : db.users;
  res.json(list.map(u => ({ ...u, password: undefined })));
});

app.post("/api/users", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const emailNorm = normalizeEmail(req.body.email);
    if (!emailNorm) return res.status(400).json({ message: "Thi?u email" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) return res.status(400).json({ message: "Email không h?p l?" });
    if (db.users.find(u => normalizeEmail(u.email) === emailNorm))
      return res.status(400).json({ message: "Email ð? ðý?c s? d?ng" });

    const role = req.body.role || "EMPLOYEE";
    if (!VALID_ROLES.includes(role))
      return res.status(400).json({ message: "Role không h?p l?. Ph?i là: " + VALID_ROLES.join(", ") });

    let cleanTeacherCode = "";
    if (req.body.teacher_code) {
      const clean = String(req.body.teacher_code).trim();
      if (!/^\d{6}-\d{7}$/.test(clean)) {
        return res.status(400).json({ message: "M? GV ph?i có format YYYYNN-NNNNNNN (VD: 202212-0114175)" });
      }
      if (db.users.find(u => u.teacher_code === clean)) {
        return res.status(400).json({ message: "M? GV này ð? ðý?c s? d?ng" });
      }
      cleanTeacherCode = clean;
    }

    const id = nextId(db.users);

    const useTempPassword = !req.body.password;
    const tempPassword = useTempPassword
      ? generateTempPassword()
      : String(req.body.password);
    const hash = bcrypt.hashSync(tempPassword, 10);

    const mustChange =
      req.body.must_change_password !== undefined
        ? req.body.must_change_password === true ||
          req.body.must_change_password === "true"
        : role !== "CUSTOMER";

    const user = {
      id,
      email: emailNorm,
      password: hash,
      name: req.body.name,
      phone: req.body.phone || "",
      role,
      status: "Ho?t ð?ng",
      points: 0,
      teacher_code: cleanTeacherCode,
      must_change_password: mustChange,
      // ? M?I: nhân viên m?i m?c ð?nh ðý?c chat
      chat_enabled: role === "EMPLOYEE" ? true : undefined,
      created_at: new Date().toISOString(),
    };

    if (cleanTeacherCode) autoFillFromCode(db, user);

    db.users.push(user);
    saveDB(db);

    res.status(201).json({
      ...user,
      password: undefined,
      tempPassword: useTempPassword ? tempPassword : undefined,
      must_change_password: mustChange,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.put("/api/users/:id", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const i = db.users.findIndex(u => u.id == req.params.id);
    if (i < 0) return res.status(404).json({ message: "Không t?m th?y user" });

    const data = { ...req.body };

    if (data.role !== undefined && data.role !== db.users[i].role) {
      return res.status(400).json({
        message: "Không th? ð?i role qua endpoint này. Vui l?ng t?o tài kho?n m?i v?i role mong mu?n.",
      });
    }
    delete data.role;

    if (data.email !== undefined) {
      const emailNorm = normalizeEmail(data.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) return res.status(400).json({ message: "Email không h?p l?" });
      const dup = db.users.find((u) => u.id != req.params.id && normalizeEmail(u.email) === emailNorm);
      if (dup) return res.status(400).json({ message: "Email ð? ðý?c s? d?ng" });
      data.email = emailNorm;
    }
    if (data.password) {
      data.password = bcrypt.hashSync(data.password, 10);
      if (data.must_change_password === undefined) {
        data.must_change_password = true;
      }
    } else {
      delete data.password;
    }

    if (data.must_change_password !== undefined) {
      data.must_change_password =
        data.must_change_password === true ||
        data.must_change_password === "true";
    }

    if (data.teacher_code !== undefined) {
      const clean = String(data.teacher_code || "").trim();
      if (clean) {
        if (!/^\d{6}-\d{7}$/.test(clean)) {
          return res.status(400).json({ message: "M? GV ph?i có format YYYYNN-NNNNNNN" });
        }
        const dup = db.users.find(u => u.id != req.params.id && u.teacher_code === clean);
        if (dup) return res.status(400).json({ message: "M? GV này ð? ðý?c s? d?ng" });
      }
      data.teacher_code = clean;
    }

    db.users[i] = { ...db.users[i], ...data };

    autoFillFromCode(db, db.users[i]);

    saveDB(db);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.delete("/api/users/:id", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  db.users = db.users.filter(u => u.id != req.params.id);
  saveDB(db);
  res.json({ ok: true });
});

app.post("/api/users/:id/reset-password", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const u = db.users.find((x) => x.id == req.params.id);
    if (!u) return res.status(404).json({ message: "Không t?m th?y user" });

    const tempPassword = generateTempPassword();
    u.password = bcrypt.hashSync(tempPassword, 10);
    u.must_change_password = true;
    u.password_reset_at = new Date().toISOString();

    saveDB(db);

    res.json({
      ok: true,
      tempPassword,
      must_change_password: true,
      message: "Ð? c?p l?i m?t kh?u t?m — ngý?i dùng ph?i ð?i khi ðãng nh?p",
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============================================================
// SCHOOL / MAJORS MAP APIs
// ============================================================
app.get("/api/school/parse-student/:code", (req, res) => {
  try {
    const db = loadDB();
    res.json(parseStudentCode(req.params.code, db));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/school/parse-teacher/:code", (req, res) => {
  try {
    const db = loadDB();
    res.json(parseTeacherCode(req.params.code, db));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/school/majors-map", (req, res) => {
  try {
    const db = loadDB();
    res.json(getMajorsMap(db));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.put("/api/school/majors-map", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const { map } = req.body;
    if (!map || typeof map !== "object" || Array.isArray(map)) {
      return res.status(400).json({ message: "map ph?i là object {code: {name, faculty, code_full}}" });
    }
    const clean = {};
    for (const [code, info] of Object.entries(map)) {
      if (!/^\d{3,4}$/.test(code)) continue;
      if (!info || typeof info !== "object") continue;
      clean[code] = {
        name: String(info.name || "").slice(0, 200),
        faculty: String(info.faculty || "").slice(0, 200),
        code_full: String(info.code_full || "").slice(0, 20),
      };
    }
    if (!db.settings) db.settings = {};
    db.settings.majorsMap = clean;
    saveDB(db);
    res.json({ ok: true, map: clean });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/school/majors-map/reset", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    if (!db.settings) db.settings = {};
    db.settings.majorsMap = { ...DEFAULT_MAJORS_MAP };
    saveDB(db);
    res.json({ ok: true, map: db.settings.majorsMap });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.put("/api/users/:id/points", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const u = db.users.find((x) => x.id == req.params.id);
    if (!u) return res.status(404).json({ message: "Không t?m th?y user" });
    const { points, reason } = req.body;
    const p = Number(points);
    if (!Number.isFinite(p) || p < 0) {
      return res.status(400).json({ message: "Ði?m ph?i là s? >= 0" });
    }
    const old = u.points || 0;
    u.points = p;
    u.points_updated_at = new Date().toISOString();
    u.points_updated_by = req.user.name;
    if (reason) u.points_reason = String(reason).slice(0, 200);

    if (!db.points_history) db.points_history = [];
    const hid = nextId(db.points_history);
    db.points_history.push({
      id: hid, user_id: u.id, user_name: u.name,
      old_points: old, new_points: p, delta: p - old,
      reason: reason || "Admin ði?u ch?nh",
      changed_by: req.user.name, changed_by_id: req.user.id,
      created_at: new Date().toISOString(),
    });

    saveDB(db);
    res.json({ ok: true, user: { id: u.id, name: u.name, points: u.points } });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.put("/api/users/:id/school-info", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const u = db.users.find((x) => x.id == req.params.id);
    if (!u) return res.status(404).json({ message: "Không t?m th?y user" });

    const { student_code, teacher_code, major_code, major_name, faculty, year_in, manual_override } = req.body;

    if (student_code !== undefined) {
      const clean = String(student_code || "").trim();
      if (clean && !/^\d{10}$/.test(clean)) {
        return res.status(400).json({ message: "MSSV ph?i là 10 ch? s?" });
      }
      u.student_code = clean;
    }
    if (teacher_code !== undefined) u.teacher_code = String(teacher_code || "").trim();
    if (major_code !== undefined) u.major_code = String(major_code || "").trim();
    if (major_name !== undefined) u.major_name = String(major_name || "").trim();
    if (faculty !== undefined) u.faculty = String(faculty || "").trim();
    if (year_in !== undefined) u.year_in = Number(year_in) || null;
    if (manual_override !== undefined) u.manual_override = !!manual_override;

    if (!u.manual_override) autoFillFromCode(db, u);

    saveDB(db);
    res.json({
      ok: true,
      user: {
        id: u.id, name: u.name, student_code: u.student_code,
        teacher_code: u.teacher_code, major_code: u.major_code,
        major_name: u.major_name, faculty: u.faculty, year_in: u.year_in,
        manual_override: !!u.manual_override,
      },
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.delete("/api/users/:id/unlink-mssv", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const u = db.users.find((x) => x.id == req.params.id);
    if (!u) return res.status(404).json({ message: "Không t?m th?y user" });

    delete u.student_code;
    delete u.major_code;
    delete u.major_code_full;
    delete u.major_name;
    delete u.faculty;
    delete u.year_in;
    delete u.mssv_parsed_at;
    u.manual_override = false;

    saveDB(db);
    res.json({ ok: true, message: `Ð? g? liên k?t MSSV c?a ${u.name}` });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============================================================
// ORDERS
// ============================================================
app.post("/api/orders", auth(), async (req, res) => {
  const db = loadDB();
  let touchedItems = [];
  let wallet = null;
  let total = 0;
  let isWalletPay = false;
  let customer = null;
  let pointsEarned = 0;
  let walletTx = null;
  let usedVoucher = null;

  try {
    const { items, payment = "Ti?n m?t", note = "", pickupTime = "", discount = 0, voucherCode, isGreen = false } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "Gi? hàng tr?ng" });

    const qtyByItem = new Map();
    for (const it of items) {
      const q = Number(it.qty);
      if (!Number.isFinite(q) || q <= 0 || !Number.isInteger(q))
        return res.status(400).json({ message: "S? lý?ng món không h?p l?" });

      const mid = String(it.menuItem);
      qtyByItem.set(mid, (qtyByItem.get(mid) || 0) + q);
    }

    let subtotal = 0;
    const detailed = [];

    for (const [mid, qty] of qtyByItem) {
      const m = db.menu_items.find(x => String(x.id) === mid);
      if (!m) return res.status(400).json({ message: "Món không t?n t?i (id=" + mid + ")" });
      if (!m.active) return res.status(400).json({ message: `${m.name} ð? t?m ng?ng bán` });
      if ((m.stock || 0) < qty)
        return res.status(400).json({ message: `${m.name} không ð? hàng (c?n ${m.stock || 0}, c?n ${qty})` });

      subtotal += m.price * qty;
      detailed.push({ menu_item_id: m.id, name: m.name, price: m.price, qty });
      touchedItems.push({ m, q: qty });
    }

    const pickupSlotId = (() => {
      const direct = String(pickupTime || "").replace(/\s/g, "");
      if (/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(direct)) return direct;
      const match = String(note).match(/Nh?n (?:lúc|hàng)\s*:?\s*(\d{2}:\d{2}\s*-\s*\d{2}:\d{2})/);
      return match ? match[1].replace(/\s/g, "") : "";
    })();

    if (pickupSlotId) {
      const slots = getTimeSlots(db);
      const slot = slots.find((s) => s.id === pickupSlotId);
      if (!slot) {
        return res.status(400).json({ message: `Khung gi? ${pickupSlotId} không t?n t?i. Vui l?ng ch?n khung gi? khác.` });
      }
      if (!slot.enabled) {
        return res.status(400).json({ message: `Khung gi? ${pickupSlotId} ð? kín ho?c t?m ngýng. Vui l?ng ch?n khung gi? khác.` });
      }
    }

    let computedDiscount = 0;

    if (voucherCode) {
      const vc = (db.vouchers || []).find(v =>
        v.code.toUpperCase() === String(voucherCode).toUpperCase() &&
        v.user_id === req.user.id &&
        !v.used
      );
      if (!vc) return res.status(400).json({ message: "Voucher không h?p l? ho?c ð? dùng" });
      if (Number(vc.value) > subtotal) {
        return res.status(400).json({ message: "Voucher vý?t quá giá tr? ðõn hàng" });
      }
      computedDiscount = Number(vc.value) || 0;
      usedVoucher = vc;
    }

    const clientDiscount = Number(discount) || 0;

    if (!voucherCode && clientDiscount > 0) {
      return res.status(400).json({ message: "Gi?m giá không h?p l? (không có voucher)" });
    }

    if (voucherCode && Math.abs(clientDiscount - computedDiscount) > 1) {
      return res.status(400).json({
        message: `Gi?m giá không kh?p v?i voucher (client=${clientDiscount}, voucher=${computedDiscount})`
      });
    }

    total = Math.max(0, subtotal - computedDiscount);
    isWalletPay = payment === "Ví Canteen" || payment === "WALLET";

    if (isWalletPay) {
      wallet = getOrCreateWallet(db, req.user.id);
      if (wallet.balance < total) {
        return res.status(400).json({ message: "S? dý ví không ð?. Vui l?ng n?p thêm " + (total - wallet.balance).toLocaleString("vi-VN") + "ð" });
      }
    }

    touchedItems.forEach(({ m, q }) => {
      m.stock = (m.stock || 0) - q;
      m.sold = (m.sold || 0) + q;
    });

    if (isWalletPay) {
      wallet.balance -= total;
      wallet.updated_at = new Date().toISOString();
    }

    const __cfg = getPointsConfig(db);
    pointsEarned = calcEarnPoints(total, __cfg);
    const __greenBonus = isGreen ? calcGreenBonus(__cfg) : 0;
    const __greenRequireApproval = isGreen && __cfg.earn.green_require_approval !== false;
    if (isGreen && !__greenRequireApproval) {
      pointsEarned += __greenBonus;
    }
    customer = db.users.find(u => u.id === req.user.id);
    if (customer) customer.points = (customer.points || 0) + pointsEarned;

    const id = nextId(db.orders);
    const code = generateOrderCode(db);

    if (isWalletPay) {
      if (!db.wallet_transactions) db.wallet_transactions = [];
      const wtxId = nextId(db.wallet_transactions);
      walletTx = {
        id: wtxId, code: "PAY" + Date.now().toString().slice(-8),
        user_id: req.user.id, user_name: req.user.name, user_email: req.user.email,
        type: "payment", amount: total, method: "WALLET", status: "approved",
        note: "Thanh toán ðõn " + code, order_code: code,
        created_at: new Date().toISOString(), approved_at: new Date().toISOString()
      };
      db.wallet_transactions.push(walletTx);
    }

    const order = {
      id, code,
      customer_id: req.user.id, customer_name: req.user.name,
      subtotal, discount: computedDiscount, total,
      points_earned: pointsEarned, status: "Ch? xác nh?n",
      green_requested: !!isGreen,
      green_status: isGreen ? (__greenRequireApproval ? "pending" : "approved") : null,
      green_points: isGreen ? __greenBonus : 0,
      payment, note, items: detailed, created_at: new Date().toISOString()
    };

    if (usedVoucher) {
      usedVoucher.used = true;
      usedVoucher.used_at = new Date().toISOString();
      usedVoucher.order_code = code;
    }

    order.voucher_code = usedVoucher ? usedVoucher.code : "";

    db.orders.push(order);

    notifyNewOrder(db, order);

    await saveDBOrThrow(db);

    res.status(201).json({ ...order, _id: order.id });
  } catch (e) {
    touchedItems.forEach(({ m, q }) => {
      m.stock = (m.stock || 0) + q;
      m.sold = Math.max(0, (m.sold || 0) - q);
    });
    if (isWalletPay && wallet) {
      wallet.balance += total;
      wallet.updated_at = new Date().toISOString();
      if (walletTx && db.wallet_transactions) {
        db.wallet_transactions = db.wallet_transactions.filter((t) => t.id !== walletTx.id);
      }
    }
    if (customer && pointsEarned > 0) {
      customer.points = Math.max(0, (customer.points || 0) - pointsEarned);
    }
    if (usedVoucher) {
      usedVoucher.used = false;
      delete usedVoucher.used_at;
      delete usedVoucher.order_code;
    }
    try { await saveDBOrThrow(db); } catch { /* ignore */ }
    res.status(400).json({ message: e.message });
  }
});

app.get("/api/orders/me", auth(), (req, res) => {
  const db = loadDB();
  const enrich = (o) => {
    const items = (o.items || []).map(it => {
      const menu = (db.menu_items || []).find(m => m.id == it.menu_item_id);
      return { ...it, image: menu?.image || "", category: menu?.category || "" };
    });
    return { ...o, items, _id: o.id };
  };
  res.json(db.orders.filter(o => o.customer_id === req.user.id).map(enrich));
});

app.get("/api/orders", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  const db = loadDB();
  const { status } = req.query;
  let list = db.orders;
  if (status && status !== "T?t c?") list = list.filter(o => o.status === status);
  res.json(list.map(o => ({ ...o, _id: o.id })));
});

const VALID_ORDER_STATUSES = ["Ch? xác nh?n", "Ð? xác nh?n", "Ðang chu?n b?", "S?n sàng nh?n", "Hoàn thành", "Ð? h?y"];

app.patch("/api/orders/:id", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  try {
    const db = loadDB();
    const o = db.orders.find(x => x.id == req.params.id);
    if (!o) return res.status(404).json({ message: "Không t?m th?y ðõn" });

    if (req.user.role === "EMPLOYEE") {
      const emp = db.users.find((u) => u.id === req.user.id);
      const rolePerms = ROLE_PERMISSIONS.EMPLOYEE || [];
      const customPerms = emp?.permissions || [];
      const allPerms = new Set([...rolePerms, ...customPerms]);
      if (!allPerms.has("orders.process") && !allPerms.has("orders.cancel")) {
        return res.status(403).json({ message: "B?n không có quy?n x? l? ðõn hàng" });
      }
    }

    const newStatus = req.body.status;
    if (!VALID_ORDER_STATUSES.includes(newStatus)) return res.status(400).json({ message: "Tr?ng thái không h?p l?: " + newStatus });
    if (newStatus === "Ð? h?y" && o.status !== "Ð? h?y") rollbackCancelledOrder(db, o);
    const oldStatus = o.status;
    if (newStatus === "Ð? xác nh?n" && oldStatus !== "Ð? xác nh?n" && !o._stock_deducted) {
      const stockResult = deductStock(db.inventory || [], o.items || []);
      if (!stockResult.ok) {
        const names = stockResult.missing.map(m => m.name || m.code).join(", ");
        return res.status(400).json({ message: "Không ð? nguyên li?u ð? xác nh?n ðõn: " + names, missing: stockResult.missing });
      }
      o._stock_deducted = true;
      o._stock_deducted_at = new Date().toISOString();
    }
    if (newStatus === "Ð? h?y" && oldStatus !== "Ð? h?y" && o._stock_deducted) {
      refundStock(db.inventory || [], o.items || []);
      o._stock_deducted = false;
      o._stock_refunded_at = new Date().toISOString();
    }
    o.status = newStatus;
    o.updated_at = new Date().toISOString();
    notifyOrderStatus(db, o, newStatus);
    saveDB(db);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/orders/:id/received", auth(), (req, res) => {
  const db = loadDB();
  const o = db.orders.find(x => x.id == req.params.id);
  if (!o) return res.status(404).json({ message: "Không t?m th?y ðõn" });
  if (o.customer_id !== req.user.id) return res.status(403).json({ message: "Không có quy?n" });
  if (o.status !== "S?n sàng nh?n") return res.status(400).json({ message: "Ðõn chýa s?n sàng nh?n" });
  o.status = "Hoàn thành";
  o.received_at = new Date().toISOString();
  const customer = db.users.find(u => u.id === o.customer_id);
  if (customer) customer.points = (customer.points || 0) + 5;
  notifyOrderStatus(db, o, "Hoàn thành");
  saveDB(db);
  res.json({ ok: true, order: o });
});

app.post("/api/orders/:id/cancel", auth(), (req, res) => {
  const db = loadDB();
  const o = db.orders.find(x => x.id == req.params.id);
  if (!o) return res.status(404).json({ message: "Không t?m th?y ðõn" });
  if (o.customer_id !== req.user.id) return res.status(403).json({ message: "Không có quy?n" });
  if (o.status !== "Ch? xác nh?n") return res.status(400).json({ message: "Ch? h?y ðý?c ðõn ch? xác nh?n" });
  rollbackCancelledOrder(db, o);
  if (o._stock_deducted) {
    refundStock(db.inventory || [], o.items || []);
    o._stock_deducted = false;
    o._stock_refunded_at = new Date().toISOString();
  }
  o.status = "Ð? h?y";
  o.updated_at = new Date().toISOString();
  notifyOrderStatus(db, o, "Ð? h?y");
  saveDB(db);
  res.json({ ok: true });
});

app.post("/api/orders/:id/call", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  try {
    const db = loadDB();
    const o = db.orders.find(x => x.id == req.params.id);
    if (!o) return res.status(404).json({ message: "Không t?m th?y ðõn" });

    const { mode = "name", message = "" } = req.body || {};

    o.call_count = (o.call_count || 0) + 1;
    o.last_called_at = new Date().toISOString();
    o.last_call_mode = mode;
    o.last_call_by = req.user.name;

    if (!Array.isArray(o.call_history)) o.call_history = [];
    o.call_history.push({
      at: o.last_called_at,
      by: req.user.name,
      by_id: req.user.id,
      mode,
      message: String(message).slice(0, 200),
    });

    if (o.call_history.length > 20) {
      o.call_history = o.call_history.slice(-20);
    }

    saveDB(db);
    res.json({
      ok: true,
      call_count: o.call_count,
      last_called_at: o.last_called_at,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============================================================
// ? DUY?T S?NG XANH
// ============================================================
function checkGreenPermission(db, req, res) {
  if (req.user.role === "ADMIN") return true;
  const emp = db.users.find((u) => u.id === req.user.id);
  const rolePerms = ROLE_PERMISSIONS.EMPLOYEE || [];
  const customPerms = emp?.permissions || [];
  const allPerms = new Set([...rolePerms, ...customPerms]);
  if (!allPerms.has("orders.approve_green")) {
    res.status(403).json({ message: "B?n không có quy?n duy?t S?ng Xanh" });
    return false;
  }
  return true;
}

app.post("/api/orders/:id/green/approve", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  try {
    const db = loadDB();
    if (!checkGreenPermission(db, req, res)) return;

    const o = db.orders.find(x => x.id == req.params.id);
    if (!o) return res.status(404).json({ message: "Không t?m th?y ðõn" });
    if (!o.green_requested) return res.status(400).json({ message: "Ðõn không có yêu c?u S?ng Xanh" });
    if (o.green_status === "approved") return res.status(400).json({ message: "Ð? duy?t r?i" });
    if (o.green_status === "rejected") return res.status(400).json({ message: "Ð? t? ch?i r?i" });
    if (o.status === "Ð? h?y") return res.status(400).json({ message: "Ðõn ð? h?y" });

    const cfg = getPointsConfig(db);
    const bonus = Number(o.green_points) || calcGreenBonus(cfg);
    const customer = db.users.find(u => u.id === o.customer_id);
    if (customer) customer.points = (customer.points || 0) + bonus;

    o.green_status = "approved";
    o.green_approved_by = req.user.id;
    o.green_approved_by_name = req.user.name;
    o.green_approved_at = new Date().toISOString();
    o.points_earned = (o.points_earned || 0) + bonus;

    // Notify khách
    if (!db.notifications) db.notifications = [];
    const nid = Math.max(0, ...db.notifications.map(n => n.id)) + 1;
    db.notifications.push({
      id: nid, user_id: o.customer_id,
      title: "S?ng Xanh ð? ðý?c duy?t",
      content: "B?n ðý?c c?ng " + bonus + " ði?m t? ðõn " + o.code,
      type: "points", link: "/customer/profile", read: false,
      created_at: new Date().toISOString()
    });

    saveDB(db);
    res.json({ ok: true, bonus, customer_points: customer?.points || 0 });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/orders/:id/green/reject", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  try {
    const db = loadDB();
    if (!checkGreenPermission(db, req, res)) return;

    const o = db.orders.find(x => x.id == req.params.id);
    if (!o) return res.status(404).json({ message: "Không t?m th?y ðõn" });
    if (!o.green_requested) return res.status(400).json({ message: "Ðõn không có yêu c?u S?ng Xanh" });
    if (o.green_status === "approved") return res.status(400).json({ message: "Ð? duy?t r?i" });
    if (o.green_status === "rejected") return res.status(400).json({ message: "Ð? t? ch?i r?i" });

    o.green_status = "rejected";
    o.green_rejected_by = req.user.id;
    o.green_rejected_by_name = req.user.name;
    o.green_rejected_at = new Date().toISOString();
    if (req.body?.reason) o.green_reject_reason = String(req.body.reason).slice(0, 200);

    saveDB(db);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============ REVIEWS ============
app.get("/api/reviews/can-review/:menuItemId", auth(), (req, res) => {
  const db = loadDB();
  const menuItemId = req.params.menuItemId;
  const hasReviewed = (db.reviews || []).some(r => r.user_id === req.user.id && r.menu_item_id == menuItemId);
  const hasPurchased = (db.orders || []).some(o => o.customer_id === req.user.id && o.status === "Hoàn thành" && (o.items || []).some(it => it.menu_item_id == menuItemId));
  res.json({ canReview: !hasReviewed && hasPurchased, hasPurchased, hasReviewed });
});

app.get("/api/reviews/me", auth(), (req, res) => {
  const db = loadDB();
  res.json((db.reviews || []).filter(r => r.user_id === req.user.id));
});

app.get("/api/reviews/:menuItemId", (req, res) => {
  const db = loadDB();
  res.json((db.reviews || []).filter(r => r.menu_item_id == req.params.menuItemId));
});

app.post("/api/reviews", auth(), (req, res) => {
  try {
    const db = loadDB();
    const { menuItemId, rating, comment } = req.body;
    if (!menuItemId || !rating) return res.status(400).json({ message: "Thi?u thông tin" });
    if (rating < 1 || rating > 5) return res.status(400).json({ message: "Ðánh giá ph?i 1-5 sao" });
    if (!db.reviews) db.reviews = [];
    const alreadyReviewed = db.reviews.find(r => r.user_id === req.user.id && r.menu_item_id == menuItemId);
    if (alreadyReviewed) return res.status(400).json({ message: "B?n ð? ðánh giá món này r?i" });
    const hasPurchased = (db.orders || []).some(o => o.customer_id === req.user.id && o.status === "Hoàn thành" && (o.items || []).some(it => it.menu_item_id == menuItemId));
    if (!hasPurchased) return res.status(403).json({ message: "B?n c?n mua món này ð? có th? ðánh giá" });

    const id = nextId(db.reviews);
    const review = { id, menu_item_id: menuItemId, user_id: req.user.id, user_name: req.user.name, rating: +rating, comment: comment || "", created_at: new Date().toISOString() };
    db.reviews.push(review);

    const itemReviews = db.reviews.filter(r => r.menu_item_id == menuItemId);
    const avgRating = itemReviews.reduce((s, r) => s + r.rating, 0) / itemReviews.length;
    const mi = db.menu_items.find(m => m.id == menuItemId);
    if (mi) { mi.rating = Math.round(avgRating * 10) / 10; mi.review_count = itemReviews.length; }
    const __cfgReview = getPointsConfig(db);
    const __reviewBonus = calcReviewBonus(__cfgReview);
    const authorUser = db.users.find(u => u.id === req.user.id);
    if (authorUser) authorUser.points = (authorUser.points || 0) + __reviewBonus;
    saveDB(db);
    res.status(201).json({ ...review, pointsEarned: __reviewBonus });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============================================================
// ? POINTS CONFIG — Ð?c & s?a quy t?c
// ============================================================
app.get("/api/points/config", auth(), (req, res) => {
  try {
    const db = loadDB();
    res.json(getPointsConfig(db));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.put("/api/points/config", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const { earn, redeem } = req.body || {};
    const current = getPointsConfig(db);
    const next = mergeConfig({
      earn: { ...current.earn, ...(earn || {}) },
      redeem: { ...current.redeem, ...(redeem || {}) },
    });

    if (Number(next.earn.rate_amount) <= 0)
      return res.status(400).json({ message: "rate_amount ph?i > 0" });
    if (Number(next.earn.rate_points) < 0)
      return res.status(400).json({ message: "rate_points không ðý?c âm" });
    if (Number(next.earn.green_points) < 0)
      return res.status(400).json({ message: "green_points không ðý?c âm" });
    if (Number(next.earn.review_points) < 0)
      return res.status(400).json({ message: "review_points không ðý?c âm" });
    if (Number(next.redeem.rate_points) <= 0)
      return res.status(400).json({ message: "redeem rate_points ph?i > 0" });
    if (Number(next.redeem.rate_value) <= 0)
      return res.status(400).json({ message: "redeem rate_value ph?i > 0" });
    if (Number(next.redeem.min_points) < 1)
      return res.status(400).json({ message: "min_points ph?i >= 1" });
    if (Number(next.redeem.max_unused_vouchers) < 1)
      return res.status(400).json({ message: "max_unused_vouchers ph?i >= 1" });
    if (!Array.isArray(next.redeem.tiers) || next.redeem.tiers.length === 0)
      return res.status(400).json({ message: "C?n ít nh?t 1 m?c voucher" });

    for (const tr of next.redeem.tiers) {
      if (!Number.isFinite(Number(tr.points)) || Number(tr.points) <= 0)
        return res.status(400).json({ message: "M?c ði?m không h?p l?" });
      if (!Number.isFinite(Number(tr.value)) || Number(tr.value) <= 0)
        return res.status(400).json({ message: "Giá tr? m?c không h?p l?" });
    }

    next.redeem.tiers.sort((a, b) => Number(a.points) - Number(b.points));
    next.updated_at = new Date().toISOString();
    db.points_config = next;
    saveDB(db);
    res.json({ ok: true, config: next });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/points/preview", auth(), (req, res) => {
  try {
    const db = loadDB();
    const cfg = getPointsConfig(db);
    const total = Number(req.body?.total) || 0;
    const isGreen = !!req.body?.isGreen;
    const base = calcEarnPoints(total, cfg);
    const green = isGreen ? calcGreenBonus(cfg) : 0;
    res.json({ base, green, total: base + green });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============ POINTS ============
app.get("/api/points/me", auth(), (req, res) => {
  const db = loadDB();
  const u = db.users.find(x => x.id === req.user.id);
  if (!u) return res.status(404).json({ message: "Không t?m th?y user" });

  const orderHistory = (db.orders || []).filter(o => o.customer_id === req.user.id)
    .map(o => ({ code: o.code, total: o.total, points: o.points_earned || 0, date: o.created_at, type: "earn" }));
  const voucherHistory = (db.vouchers || []).filter(v => v.user_id === req.user.id)
    .map(v => ({ code: v.code, total: v.value, points: -(v.points_used || 0), date: v.created_at, type: "redeem", used: v.used || false }));
  const history = [...orderHistory, ...voucherHistory].sort((a, b) => new Date(b.date) - new Date(a.date));

  res.json({ points: u.points || 0, history });
});

const MAX_ACTIVE_VOUCHERS = 50;

app.post("/api/points/redeem", auth(), (req, res) => {
  try {
    const db = loadDB();
    const { points } = req.body;
    if (!db.vouchers) db.vouchers = [];

    const u = db.users.find(x => x.id === req.user.id);
    if (!u) return res.status(404).json({ message: "Không t?m th?y user" });

    const cfg = getPointsConfig(db);
    const activeCount = db.vouchers.filter(
      (v) => v.user_id === req.user.id && !v.used
    ).length;

    const check = canRedeem(u.points || 0, points, activeCount, cfg);
    if (!check.ok) return res.status(400).json({ message: check.reason });

    u.points -= Number(points);
    const value = check.value;

    const voucherId = nextId(db.vouchers);
    const code = "VOUCHER" + String(voucherId).padStart(4, "0");
    const voucher = {
      id: voucherId,
      code,
      user_id: req.user.id,
      value,
      points_used: Number(points),
      used: false,
      created_at: new Date().toISOString(),
    };
    db.vouchers.push(voucher);
    saveDB(db);
    res.status(201).json(voucher);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============ VOUCHERS ============
app.get("/api/vouchers", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  res.json((db.vouchers || []).sort((a, b) => (b.id || 0) - (a.id || 0)));
});

app.post("/api/vouchers", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    if (!db.vouchers) db.vouchers = [];
    const { code, value, user_id, points_used } = req.body;
    if (!code || !value) return res.status(400).json({ message: "Thi?u m? ho?c giá tr?" });

    const codeNorm = String(code).toUpperCase().trim();
    if (db.vouchers.find((v) => v.code.toUpperCase() === codeNorm)) {
      return res.status(400).json({ message: "M? voucher ð? t?n t?i" });
    }

    const id = nextId(db.vouchers);
    const voucher = { id, code: codeNorm, value: +value, user_id: user_id ? +user_id : null, points_used: +points_used || 0, used: false, created_at: new Date().toISOString() };
    db.vouchers.push(voucher);
    saveDB(db);
    res.status(201).json(voucher);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put("/api/vouchers/:id", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  const v = (db.vouchers || []).find(x => x.id == req.params.id);
  if (!v) return res.status(404).json({ message: "Không t?m th?y" });
  if (req.body.value !== undefined) v.value = +req.body.value;
  if (req.body.used !== undefined) v.used = req.body.used;
  if (req.body.code) {
    const codeNorm = req.body.code.toUpperCase();
    const dup = db.vouchers.find((x) => x.id != req.params.id && x.code.toUpperCase() === codeNorm);
    if (dup) return res.status(400).json({ message: "M? voucher ð? t?n t?i" });
    v.code = codeNorm;
  }
  saveDB(db);
  res.json({ ok: true, voucher: v });
});

app.delete("/api/vouchers/:id", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  db.vouchers = (db.vouchers || []).filter(x => x.id != req.params.id);
  saveDB(db);
  res.json({ ok: true });
});

app.get("/api/vouchers/me", auth(), (req, res) => {
  const db = loadDB();
  res.json((db.vouchers || []).filter(v => v.user_id === req.user.id));
});

app.post("/api/vouchers/validate", auth(), (req, res) => {
  try {
    const db = loadDB();
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: "Thi?u m? voucher" });
    const voucher = (db.vouchers || []).find(v => v.code.toUpperCase() === code.toUpperCase() && v.user_id === req.user.id && !v.used);
    if (!voucher) return res.status(404).json({ message: "M? voucher không h?p l? ho?c ð? dùng" });
    res.json({ valid: true, value: voucher.value, code: voucher.code });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/vouchers/public", auth(), (req, res) => {
  const db = loadDB();
  const myVouchers = (db.vouchers || []).filter(v => v.user_id === req.user.id);
  const claimedIds = myVouchers.map(v => v.claimed_from).filter(Boolean);
  const publicVouchers = (db.vouchers || []).filter(v => !v.user_id && !v.used && !claimedIds.includes(v.id))
    .sort((a, b) => (b.value || 0) - (a.value || 0));
  res.json(publicVouchers);
});

app.post("/api/vouchers/claim/:id", auth(), (req, res) => {
  try {
    const db = loadDB();
    const template = (db.vouchers || []).find(v => v.id == req.params.id && !v.user_id);
    if (!template) return res.status(404).json({ message: "Voucher không t?n t?i ho?c ð? h?t" });
    const alreadyClaimed = (db.vouchers || []).find(v => v.user_id === req.user.id && v.claimed_from === template.id);
    if (alreadyClaimed) return res.status(400).json({ message: "B?n ð? nh?n voucher này r?i" });
    const id = nextId(db.vouchers);
    const newVoucher = { id, code: template.code + "-U" + req.user.id, value: template.value, user_id: req.user.id, points_used: 0, used: false, claimed_from: template.id, created_at: new Date().toISOString() };
    db.vouchers.push(newVoucher);
    saveDB(db);
    res.status(201).json({ ok: true, voucher: newVoucher });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============ PROMOTIONS ============
app.get("/api/promotions", (req, res) => {
  const db = loadDB();
  const list = (db.menu_items || []).filter(m => m.active && m.discount_percent && m.discount_percent > 0)
    .map(m => ({
      id: m.id, name: m.name, image: m.image, category: m.category, description: m.description,
      original_price: m.original_price || m.price, price: m.price, discount_percent: m.discount_percent,
      stock: m.stock, sold: m.sold || 0, rating: m.rating || 0
    }));
  res.json(list);
});

// ============ CATEGORIES ============
const DEFAULT_CATEGORIES = [
  { id: 1, name: "Cõm", icon: "??", order: 1 },
  { id: 2, name: "Món m?n", icon: "??", order: 2 },
  { id: 3, name: "Món chay", icon: "??", order: 3 },
  { id: 4, name: "Món ph?", icon: "??", order: 4 },
  { id: 5, name: "Ð? ãn nhanh", icon: "??", order: 5 },
  { id: 6, name: "Ð? u?ng", icon: "??", order: 6 },
  { id: 7, name: "Combo", icon: "??", order: 7 }
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
    if (!name || !name.trim()) return res.status(400).json({ message: "Thi?u tên danh m?c" });
    const trimmed = name.trim();
    if (categories.find(c => c.name.toLowerCase() === trimmed.toLowerCase())) return res.status(400).json({ message: "Danh m?c ð? t?n t?i" });

    let finalOrder;
    if (order !== undefined && order !== null && order !== "") {
      const parsed = Number(order);
      if (!Number.isInteger(parsed) || parsed < 0) return res.status(400).json({ message: "Th? t? ph?i là s? nguyên >= 0" });
      finalOrder = parsed;
    } else {
      finalOrder = Math.max(0, ...categories.map(c => c.order || 0)) + 1;
    }

    const id = nextId(categories);
    const cat = { id, name: trimmed, icon: icon || "???", order: finalOrder };

    await autoTranslateCategory(db, cat, null);

    categories.push(cat);
    saveDB(db);
    res.status(201).json(cat);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put("/api/categories/:id", auth(["ADMIN", "EMPLOYEE"]), async (req, res) => {
  try {
    const db = loadDB();
    const { categories } = ensureCategories(db);
    const cat = categories.find(c => c.id == req.params.id);
    if (!cat) return res.status(404).json({ message: "Không t?m th?y danh m?c" });
    const oldName = cat.name;
    const { name, icon, order } = req.body;

    if (name && name.trim()) {
      const trimmed = name.trim();
      if (categories.find(c => c.id != req.params.id && c.name.toLowerCase() === trimmed.toLowerCase())) {
        return res.status(400).json({ message: "Tên danh m?c ð? t?n t?i" });
      }
      cat.name = trimmed;
      if (trimmed !== oldName) {
        (db.menu_items || []).forEach(m => { if (m.category === oldName) m.category = trimmed; });
      }
    }

    if (icon !== undefined) cat.icon = icon;

    if (order !== undefined && order !== null && order !== "") {
      const parsed = Number(order);
      if (!Number.isInteger(parsed) || parsed < 0) return res.status(400).json({ message: "Th? t? ph?i là s? nguyên >= 0" });
      cat.order = parsed;
    }

    await autoTranslateCategory(db, cat, { name: oldName });

    saveDB(db);
    res.json(cat);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete("/api/categories/:id", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const { categories } = ensureCategories(db);
    const cat = categories.find(c => c.id == req.params.id);
    if (!cat) return res.status(404).json({ message: "Không t?m th?y danh m?c" });
    const usedCount = (db.menu_items || []).filter(m => m.category === cat.name).length;
    if (usedCount > 0) return res.status(400).json({ message: "Không th? xóa — có " + usedCount + " món ðang dùng danh m?c này" });
    db.categories = categories.filter(c => c.id != req.params.id);
    saveDB(db);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ============ WALLET ============
function getOrCreateWallet(db, userId) {
  if (!db.wallets) db.wallets = [];
  const uid = Number(userId);
  if (!uid || isNaN(uid)) {
    throw new Error("Invalid userId for wallet");
  }
  let w = db.wallets.find(x => Number(x.user_id) === uid);
  if (!w) {
    w = { user_id: uid, balance: 0, bank_name: "", bank_account: "", bank_account_name: "", linked_at: "", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    db.wallets.push(w);
  }
  return w;
}

app.get("/api/wallet/me", auth(), (req, res) => {
  const db = loadDB();
  const existed = (db.wallets || []).some(
    (x) => Number(x.user_id) === Number(req.user.id)
  );
  const w = getOrCreateWallet(db, req.user.id);
  if (!existed) saveDB(db);
  res.json({ balance: w.balance || 0, bank_name: w.bank_name || "", bank_account: w.bank_account || "", bank_account_name: w.bank_account_name || "", linked_at: w.linked_at || "" });
});

app.get("/api/wallet/transactions", auth(), (req, res) => {
  const db = loadDB();
  const list = (db.wallet_transactions || []).filter(t => t.user_id === req.user.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100);
  res.json(list);
});

app.post("/api/wallet/deposit", auth(), (req, res) => {
  try {
    const db = loadDB();
    const { amount, method, note } = req.body;
    const amt = +amount;
    if (!amt || amt < 10000) return res.status(400).json({ message: "S? ti?n t?i thi?u 10.000ð" });
    if (amt > 50000000) return res.status(400).json({ message: "S? ti?n t?i ða 50.000.000ð" });
    if (!["QR", "CASH"].includes(method)) return res.status(400).json({ message: "Phýõng th?c không h?p l?" });

    if (!db.wallet_transactions) db.wallet_transactions = [];
    const id = nextId(db.wallet_transactions);
    const code = "DEP" + Date.now().toString().slice(-8);
    const tx = { id, code, user_id: req.user.id, user_name: req.user.name, user_email: req.user.email, type: "deposit", amount: amt, method, status: "pending", note: note || "", admin_note: "", created_at: new Date().toISOString() };
    db.wallet_transactions.push(tx);
    saveDB(db);
    res.status(201).json({ ok: true, transaction: tx });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/wallet/withdraw", auth(), (req, res) => {
  try {
    const db = loadDB();
    const { amount, note } = req.body;
    const amt = +amount;
    if (!amt || amt < 20000) return res.status(400).json({ message: "S? ti?n rút t?i thi?u 20.000ð" });
    const w = getOrCreateWallet(db, req.user.id);
    if (w.balance < amt) return res.status(400).json({ message: "S? dý không ð?" });
    if (!w.bank_account) return res.status(400).json({ message: "Chýa liên k?t tài kho?n ngân hàng" });

    if (!db.wallet_transactions) db.wallet_transactions = [];
    const id = nextId(db.wallet_transactions);
    const code = "WDR" + Date.now().toString().slice(-8);
    const tx = {
      id, code, user_id: req.user.id, user_name: req.user.name, user_email: req.user.email,
      type: "withdraw", amount: amt, method: "BANK", status: "pending", note: note || "", admin_note: "",
      bank_name: w.bank_name, bank_account: w.bank_account, bank_account_name: w.bank_account_name,
      created_at: new Date().toISOString()
    };
    db.wallet_transactions.push(tx);
    w.balance -= amt;
    w.updated_at = new Date().toISOString();
    saveDB(db);
    res.status(201).json({ ok: true, transaction: tx, newBalance: w.balance });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/wallet/link-bank", auth(), (req, res) => {
  try {
    const db = loadDB();
    const { bank_name, bank_account, bank_account_name } = req.body;
    if (!bank_name || !bank_account || !bank_account_name) return res.status(400).json({ message: "Thi?u thông tin ngân hàng" });
    const w = getOrCreateWallet(db, req.user.id);
    w.bank_name = bank_name;
    w.bank_account = String(bank_account).trim();
    w.bank_account_name = bank_account_name.toUpperCase().trim();
    w.linked_at = new Date().toISOString();
    w.updated_at = new Date().toISOString();
    saveDB(db);
    res.json({ ok: true, wallet: w });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/wallet/requests", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  const { status } = req.query;
  let list = (db.wallet_transactions || []);
  if (status && status !== "all") list = list.filter(t => t.status === status);
  else list = list.filter(t => t.status === "pending");
  list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  res.json(list);
});

app.get("/api/wallet/all", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  res.json([...(db.wallet_transactions || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

app.get("/api/wallet/stats", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  const all = db.wallet_transactions || [];
  const wallets = db.wallets || [];
  res.json({
    totalBalance: wallets.reduce((s, w) => s + (w.balance || 0), 0),
    totalUsers: wallets.length,
    totalDeposited: all.filter(t => t.type === "deposit" && t.status === "approved").reduce((s, t) => s + (t.amount || 0), 0),
    totalWithdrawn: all.filter(t => t.type === "withdraw" && t.status === "approved").reduce((s, t) => s + (t.amount || 0), 0),
    totalPaid: all.filter(t => t.type === "payment" && t.status === "approved").reduce((s, t) => s + (t.amount || 0), 0),
    pendingCount: all.filter(t => t.status === "pending").length,
    pendingDepositCount: all.filter(t => t.type === "deposit" && t.status === "pending").length,
    pendingWithdrawCount: all.filter(t => t.type === "withdraw" && t.status === "pending").length
  });
});

app.patch("/api/wallet/requests/:id/approve", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const tx = (db.wallet_transactions || []).find(t => t.id == req.params.id);
    if (!tx) return res.status(404).json({ message: "Không t?m th?y giao d?ch" });
    if (tx.status !== "pending") return res.status(400).json({ message: "Giao d?ch ð? x? l?" });
    const w = getOrCreateWallet(db, tx.user_id);
    if (tx.type === "deposit") w.balance += tx.amount;
    w.updated_at = new Date().toISOString();
    tx.status = "approved";
    tx.approved_by = req.user.name;
    tx.approved_at = new Date().toISOString();
    if (req.body.admin_note) tx.admin_note = req.body.admin_note;
    saveDB(db);
    res.json({ ok: true, transaction: tx, newBalance: w.balance });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.patch("/api/wallet/requests/:id/reject", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const tx = (db.wallet_transactions || []).find(t => t.id == req.params.id);
    if (!tx) return res.status(404).json({ message: "Không t?m th?y giao d?ch" });
    if (tx.status !== "pending") return res.status(400).json({ message: "Giao d?ch ð? x? l?" });
    const w = getOrCreateWallet(db, tx.user_id);
    if (tx.type === "withdraw") {
      w.balance += tx.amount;
      w.updated_at = new Date().toISOString();
    }
    tx.status = "rejected";
    tx.approved_by = req.user.name;
    tx.approved_at = new Date().toISOString();
    if (req.body.admin_note) tx.admin_note = req.body.admin_note;
    saveDB(db);
    res.json({ ok: true, transaction: tx });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/wallet/pay", auth(), (req, res) => {
  try {
    const db = loadDB();
    const { amount, order_code } = req.body;
    const amt = +amount;
    if (!amt || amt <= 0) return res.status(400).json({ message: "S? ti?n không h?p l?" });
    const w = getOrCreateWallet(db, req.user.id);
    if (w.balance < amt) return res.status(400).json({ message: "S? dý ví không ð?" });
    if (!db.wallet_transactions) db.wallet_transactions = [];
    const id = nextId(db.wallet_transactions);
    const tx = {
      id, code: "PAY" + Date.now().toString().slice(-8), user_id: req.user.id, user_name: req.user.name,
      type: "payment", amount: amt, method: "WALLET", status: "approved",
      note: "Thanh toán ðõn " + (order_code || ""), order_code: order_code || "",
      created_at: new Date().toISOString(), approved_at: new Date().toISOString()
    };
    db.wallet_transactions.push(tx);
    w.balance -= amt;
    w.updated_at = new Date().toISOString();
    saveDB(db);
    res.status(201).json({ ok: true, transaction: tx, newBalance: w.balance });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ============ VOUCHER STATS ============
app.get("/api/vouchers/stats", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  const all = db.vouchers || [];
  const publicTemplates = all.filter(v => !v.user_id);
  const personal = all.filter(v => v.user_id);
  const used = all.filter(v => v.used);
  let totalClaims = 0;
  publicTemplates.forEach(t => { totalClaims += all.filter(v => v.claimed_from === t.id).length; });
  res.json({
    total: all.length, public: publicTemplates.length, personal: personal.length,
    used: used.length, available: personal.filter(v => !v.used).length,
    totalClaims, totalValue: all.reduce((s, v) => s + (v.value || 0), 0),
    usedValue: used.reduce((s, v) => s + (v.value || 0), 0)
  });
});

app.get("/api/vouchers/claims/:templateId", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  const claims = (db.vouchers || []).filter(v => v.claimed_from == req.params.templateId);
  const list = claims.map(v => {
    const user = db.users.find(u => u.id === v.user_id);
    return { id: v.id, code: v.code, user_id: v.user_id, user_name: user?.name || "User #" + v.user_id, user_email: user?.email || "", used: v.used, used_at: v.used_at, created_at: v.created_at };
  });
  res.json(list);
});

app.get("/api/vouchers/user/:userId", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  const userId = +req.params.userId;
  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ message: "Không t?m th?y user" });
  const list = (db.vouchers || []).filter(v => v.user_id === userId);
  res.json({
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, points: user.points || 0 },
    vouchers: list,
    stats: { total: list.length, used: list.filter(v => v.used).length, available: list.filter(v => !v.used).length, totalValue: list.reduce((s, v) => s + (v.value || 0), 0) }
  });
});

app.delete("/api/vouchers/revoke/:id", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  const v = (db.vouchers || []).find(x => x.id == req.params.id);
  if (!v) return res.status(404).json({ message: "Không t?m th?y voucher" });
  if (v.used) return res.status(400).json({ message: "Không th? thu h?i voucher ð? dùng" });
  db.vouchers = db.vouchers.filter(x => x.id != req.params.id);
  saveDB(db);
  res.json({ ok: true });
});

// ============================================================
// ? M?I: CHAT ADMIN — Helpers
// ============================================================

/**
 * Ð?m b?o DB có ð? field chat (migration lazy)
 */
function ensureChatSchema(db) {
  if (!db) return false;
  let changed = false;

  // settings.chat_enabled_global
  if (!db.settings) db.settings = {};
  if (typeof db.settings.chat_enabled_global !== "boolean") {
    db.settings.chat_enabled_global = true;
    changed = true;
  }

  // users.chat_enabled (ch? cho EMPLOYEE, m?c ð?nh true)
  if (Array.isArray(db.users)) {
    for (const u of db.users) {
      if (u.role === "EMPLOYEE" && typeof u.chat_enabled !== "boolean") {
        u.chat_enabled = true;
        changed = true;
      }
    }
  }

  // chat_transfer_requests collection
  if (!Array.isArray(db.chat_transfer_requests)) {
    db.chat_transfer_requests = [];
    changed = true;
  }

  // chat_conversations metadata (assigned_to / assigned_admin_id)
  if (!db.chat_conversations) {
    db.chat_conversations = {};
    changed = true;
  }

  return changed;
}

/**
 * L?y danh sách userId mà Admin ðang ti?p qu?n
 */
function getAdminAssignedUserIds(db) {
  if (!db.chat_conversations) return [];
  return Object.entries(db.chat_conversations)
    .filter(([, meta]) => meta && meta.assigned_to === "admin")
    .map(([uid]) => Number(uid))
    .filter((n) => !isNaN(n));
}

/**
 * Check xem 1 nhân viên có ðý?c phép chat không
 * - Global t?t ? không ai ðý?c
 * - Employee.chat_enabled = false ? không ðý?c
 */
function isStaffAllowedToChat(db, userId) {
  if (!db) return false;
  const globalOn = db.settings?.chat_enabled_global !== false;
  if (!globalOn) return false;

  const u = (db.users || []).find((x) => x.id === userId);
  if (!u) return false;
  if (u.role !== "EMPLOYEE" && u.role !== "ADMIN") return false;
  if (u.role === "ADMIN") return true; // Admin luôn ðý?c g?i

  return u.chat_enabled !== false;
}

/**
 * T?m transfer request ðang pending c?a 1 customer
 */
function findPendingTransferForCustomer(db, customerId) {
  if (!Array.isArray(db.chat_transfer_requests)) return null;
  return db.chat_transfer_requests.find(
    (r) => r.customer_id === customerId && r.status === "pending"
  ) || null;
}

/**
 * Build danh sách conversations cho ADMIN
 * - Tr? v? gi?ng /api/chat/conversations
 * - Thêm: assigned_to, assigned_admin_id, has_pending_transfer
 */
function buildAdminConversations(db) {
  const convMap = {};

  (db.messages || []).forEach((m) => {
    if (!isRecentMessage(m)) return;
    const uid = normalizeUserId(m.user_id);
    if (uid === null) return;

    if (!convMap[uid]) {
      convMap[uid] = {
        user_id: uid,
        user_name: m.user_name || "Khách",
        last_message: m.content,
        last_time: m.created_at,
        unread: 0,
      };
    }
    if (m.from === "customer" && !m.read) convMap[uid].unread += 1;
    if (new Date(m.created_at) > new Date(convMap[uid].last_time)) {
      convMap[uid].last_message = m.content;
      convMap[uid].last_time = m.created_at;
      convMap[uid].user_name = m.user_name || convMap[uid].user_name;
    }
  });

  // G?n metadata assigned_to + has_pending_transfer
  const conversations = Object.values(convMap).map((c) => {
    const meta = db.chat_conversations?.[String(c.user_id)] || {};
    const pendingReq = findPendingTransferForCustomer(db, c.user_id);
    return {
      ...c,
      assigned_to: meta.assigned_to || null,
      assigned_admin_id: meta.assigned_admin_id || null,
      has_pending_transfer: !!pendingReq,
    };
  });

  return conversations.sort(
    (a, b) => new Date(b.last_time) - new Date(a.last_time)
  );
}

// ============================================================
// CHAT — filter 24h
// ============================================================
const CHAT_TTL_MS = 24 * 60 * 60 * 1000;

function isRecentMessage(m) {
  if (!m || !m.created_at) return false;
  const t = new Date(m.created_at).getTime();
  if (isNaN(t)) return false;
  return Date.now() - t <= CHAT_TTL_MS;
}

function normalizeUserId(id) {
  if (id === undefined || id === null) return null;
  const n = Number(id);
  return isNaN(n) ? id : n;
}

app.get("/api/chat/conversations", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  const db = loadDB();
  ensureChatSchema(db);
  const convMap = {};

  (db.messages || []).forEach((m) => {
    if (!isRecentMessage(m)) return;
    const uid = normalizeUserId(m.user_id);
    if (uid === null) return;
    if (!convMap[uid]) {
      convMap[uid] = {
        user_id: uid,
        user_name: m.user_name || "Khách",
        last_message: m.content,
        last_time: m.created_at,
        unread: 0,
      };
    }
    if (m.from === "customer" && !m.read) convMap[uid].unread += 1;
    if (new Date(m.created_at) > new Date(convMap[uid].last_time)) {
      convMap[uid].last_message = m.content;
      convMap[uid].last_time = m.created_at;
      convMap[uid].user_name = m.user_name || convMap[uid].user_name;
    }
  });

  res.json(Object.values(convMap).sort((a, b) => new Date(b.last_time) - new Date(a.last_time)));
});

app.get("/api/chat/me", auth(), (req, res) => {
  const db = loadDB();
  const myId = normalizeUserId(req.user.id);

  const list = (db.messages || [])
    .filter((m) => normalizeUserId(m.user_id) === myId && isRecentMessage(m))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  res.json(list);
});

app.get("/api/chat/with/:userId", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  const db = loadDB();
  const targetId = normalizeUserId(req.params.userId);

  const list = (db.messages || [])
    .filter((m) => normalizeUserId(m.user_id) === targetId && isRecentMessage(m))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  let changed = false;
  (db.messages || []).forEach((m) => {
    if (
      normalizeUserId(m.user_id) === targetId &&
      m.from === "customer" &&
      !m.read
    ) {
      m.read = true;
      changed = true;
    }
  });
  if (changed) saveDB(db);
  res.json(list);
});

app.get("/api/chat/context/:userId", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  try {
    const db = loadDB();
    const userId = normalizeUserId(req.params.userId);
    if (userId === null) return res.status(400).json({ message: "userId không h?p l?" });

    const user = (db.users || []).find((u) => normalizeUserId(u.id) === userId);
    if (!user) return res.status(404).json({ message: "Không t?m th?y khách" });

    const wallet = (db.wallets || []).find((w) => Number(w.user_id) === userId);

    const now = new Date();
    const ordersThisMonth = (db.orders || []).filter((o) => {
      if (o.customer_id !== userId) return false;
      const d = new Date(o.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    const activeOrders = (db.orders || [])
      .filter((o) => o.customer_id === userId && !["Hoàn thành", "Ð? h?y"].includes(o.status))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const currentOrder = activeOrders[0] || null;

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        avatar: user.avatar || "",
        points: user.points || 0,
        faculty: user.faculty || "",
        tier:
          user.points >= 1000
            ? "H?ng Vàng"
            : user.points >= 500
            ? "H?ng B?c"
            : "H?ng Ð?ng",
      },
      wallet: { balance: wallet?.balance || 0 },
      ordersThisMonth: ordersThisMonth.length,
      currentOrder: currentOrder
        ? {
            code: currentOrder.code,
            status: currentOrder.status,
            items: (currentOrder.items || []).map((it) => ({
              name: it.name,
              qty: it.qty,
              price: it.price,
            })),
            subtotal: currentOrder.subtotal || 0,
            discount: currentOrder.discount || 0,
            total: currentOrder.total || 0,
            payment: currentOrder.payment || "",
          }
        : null,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/chat/send", auth(), (req, res) => {
  try {
    const db = loadDB();
    ensureChatSchema(db);
    const { content, toUserId } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: "Tin nh?n tr?ng" });
    if (!db.messages) db.messages = [];

    const isStaff = req.user.role === "ADMIN" || req.user.role === "EMPLOYEE";
    let userId, userName;
    if (isStaff) {
      userId = normalizeUserId(toUserId);
      if (userId === null) return res.status(400).json({ message: "Thi?u toUserId" });
      const customer = db.users.find((u) => normalizeUserId(u.id) === userId);
      userName = customer?.name || "Khách";

      // ? M?I: ki?m tra quy?n chat c?a nhân viên
      if (req.user.role === "EMPLOYEE") {
        if (!isStaffAllowedToChat(db, req.user.id)) {
          return res.status(403).json({
            message: "Admin ð? t?t quy?n chat c?a b?n. Vui l?ng liên h? qu?n tr? viên.",
            code: "CHAT_DISABLED",
          });
        }
        // N?u Admin ðang gi? h?i tho?i này ? ch?n NV
        const meta = db.chat_conversations?.[String(userId)];
        if (meta && meta.assigned_to === "admin") {
          return res.status(403).json({
            message: "Admin ðang x? l? h?i tho?i này. B?n không th? g?i tin.",
            code: "CHAT_HELD_BY_ADMIN",
          });
        }
      }
    } else {
      userId = normalizeUserId(req.user.id);
      userName = req.user.name;
    }

    const id = nextId(db.messages);
    const message = {
      id,
      user_id: userId,
      user_name: userName,
      from: isStaff ? "staff" : "customer",
      from_name: req.user.name,
      from_role: isStaff ? req.user.role : "CUSTOMER",
      content: content.trim(),
      read: false,
      created_at: new Date().toISOString(),
    };
    db.messages.push(message);
    saveDB(db);
    res.status(201).json(message);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============================================================
// ? M?I: CHAT ADMIN — Endpoints
// ============================================================

// ---------- 1. Admin: List t?t c? h?i tho?i ----------
app.get("/api/chat/admin/conversations", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    ensureChatSchema(db);
    res.json(buildAdminConversations(db));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ---------- 2. Admin: Ð?c tin nh?n v?i 1 khách ----------
app.get("/api/chat/admin/messages/:userId", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const targetId = normalizeUserId(req.params.userId);

    const list = (db.messages || [])
      .filter((m) => normalizeUserId(m.user_id) === targetId && isRecentMessage(m))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    let changed = false;
    (db.messages || []).forEach((m) => {
      if (
        normalizeUserId(m.user_id) === targetId &&
        m.from === "customer" &&
        !m.read
      ) {
        m.read = true;
        changed = true;
      }
    });
    if (changed) saveDB(db);

    res.json(list);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ---------- 3. Admin: Tr?ng thái chat c?a nhân viên ----------
app.get("/api/chat/admin/staff-status", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    ensureChatSchema(db);

    const staff = (db.users || [])
      .filter((u) => u.role === "EMPLOYEE")
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        chat_enabled: u.chat_enabled !== false,
      }));

    res.json({
      global_enabled: db.settings?.chat_enabled_global !== false,
      staff,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ---------- 4. Admin: B?t/t?t chat per-employee ----------
app.patch("/api/chat/admin/staff/:id/chat", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    ensureChatSchema(db);
    const u = (db.users || []).find((x) => x.id == req.params.id);
    if (!u) return res.status(404).json({ message: "Không t?m th?y nhân viên" });
    if (u.role !== "EMPLOYEE") {
      return res.status(400).json({ message: "Ch? áp d?ng cho nhân viên" });
    }

    const enabled = req.body?.enabled !== false;
    u.chat_enabled = enabled;
    saveDB(db);

    res.json({
      ok: true,
      staff: {
        id: u.id,
        name: u.name,
        chat_enabled: enabled,
      },
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ---------- 5. Admin: B?t/t?t công t?c global ----------
app.patch("/api/chat/admin/global-chat", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    ensureChatSchema(db);
    const enabled = req.body?.enabled !== false;
    db.settings.chat_enabled_global = enabled;
    saveDB(db);
    res.json({ ok: true, global_enabled: enabled });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ---------- 6. Admin: List yêu c?u chuy?n ti?p ----------
app.get("/api/chat/admin/transfer-requests", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    ensureChatSchema(db);

    const status = String(req.query.status || "pending").toLowerCase();
    let list = [...(db.chat_transfer_requests || [])];

    if (status !== "all") {
      list = list.filter((r) => r.status === status);
    }

    const enriched = list.map((r) => {
      const customer = (db.users || []).find((u) => u.id === r.customer_id);
      const staff = (db.users || []).find((u) => u.id === r.from_staff_id);
      return {
        ...r,
        customer_name: customer?.name || `Khách #${r.customer_id}`,
        customer_email: customer?.email || "",
        from_staff_name: staff?.name || `NV #${r.from_staff_id}`,
      };
    });

    enriched.sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    res.json(enriched);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ---------- 7. Admin: Duy?t/t? ch?i yêu c?u chuy?n ti?p ----------
app.patch(
  "/api/chat/admin/transfer-requests/:id",
  auth(["ADMIN"]),
  (req, res) => {
    try {
      const db = loadDB();
      ensureChatSchema(db);

      const r = (db.chat_transfer_requests || []).find(
        (x) => x.id == req.params.id
      );
      if (!r) return res.status(404).json({ message: "Không t?m th?y yêu c?u" });
      if (r.status !== "pending") {
        return res.status(400).json({ message: "Yêu c?u ð? ðý?c x? l?" });
      }

      const newStatus = String(req.body?.status || "").toLowerCase();
      if (!["accepted", "rejected"].includes(newStatus)) {
        return res.status(400).json({ message: "status ph?i là accepted ho?c rejected" });
      }

      r.status = newStatus;
      r.resolved_at = new Date().toISOString();
      r.resolved_by = req.user.id;
      r.resolved_by_name = req.user.name;
      if (req.body?.note) r.note = String(req.body.note).slice(0, 500);

      if (newStatus === "accepted") {
        if (!db.chat_conversations) db.chat_conversations = {};
        db.chat_conversations[String(r.customer_id)] = {
          assigned_to: "admin",
          assigned_admin_id: req.user.id,
          assigned_at: new Date().toISOString(),
        };
      }

      saveDB(db);
      res.json({ ok: true, request: r });
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  }
);

// ---------- 8. Employee: T?o yêu c?u chuy?n ti?p ----------
app.post("/api/chat/transfer-request", auth(["EMPLOYEE", "ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    ensureChatSchema(db);

    const customerId = normalizeUserId(
      req.body?.customerId ?? req.body?.user_id
    );
    if (customerId === null) {
      return res.status(400).json({ message: "Thi?u customerId" });
    }

    const customer = (db.users || []).find((u) => u.id === customerId);
    if (!customer) {
      return res.status(404).json({ message: "Không t?m th?y khách" });
    }

    const existing = findPendingTransferForCustomer(db, customerId);
    if (existing) {
      return res.status(400).json({
        message: "Ð? có yêu c?u chuy?n ti?p ðang ch? cho khách này",
        code: "ALREADY_PENDING",
        request: existing,
      });
    }

    const id = nextId(db.chat_transfer_requests);
    const record = {
      id,
      customer_id: customerId,
      from_staff_id: req.user.id,
      from_staff_name: req.user.name,
      from_staff_role: req.user.role,
      reason: String(req.body?.reason || "").slice(0, 500),
      status: "pending",
      created_at: new Date().toISOString(),
      resolved_at: null,
      resolved_by: null,
    };

    db.chat_transfer_requests.push(record);
    saveDB(db);

    if (!db.notifications) db.notifications = [];
    const admins = (db.users || []).filter((u) => u.role === "ADMIN");
    admins.forEach((adm) => {
      const nid = nextId(db.notifications);
      db.notifications.push({
        id: nid,
        user_id: adm.id,
        title: "Yêu c?u chuy?n ti?p chat",
        content: `${req.user.name} xin chuy?n h?i tho?i v?i "${customer.name}" lên Admin`,
        type: "chat",
        link: "/owner/chat",
        read: false,
        created_at: new Date().toISOString(),
      });
    });
    saveDB(db);

    res.status(201).json({ ok: true, request: record });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ---------- 9. Admin: Ti?p qu?n h?i tho?i ----------
app.post("/api/chat/admin/takeover/:userId", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    ensureChatSchema(db);

    const targetId = normalizeUserId(req.params.userId);
    if (targetId === null) return res.status(400).json({ message: "userId không h?p l?" });

    if (!db.chat_conversations) db.chat_conversations = {};
    db.chat_conversations[String(targetId)] = {
      assigned_to: "admin",
      assigned_admin_id: req.user.id,
      assigned_at: new Date().toISOString(),
    };

    (db.chat_transfer_requests || []).forEach((r) => {
      if (r.customer_id === targetId && r.status === "pending") {
        r.status = "accepted";
        r.resolved_at = new Date().toISOString();
        r.resolved_by = req.user.id;
        r.resolved_by_name = req.user.name;
      }
    });

    saveDB(db);
    res.json({ ok: true, assigned_to: "admin" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ---------- 10. Admin: Tr? v? cho nhân viên ----------
app.post("/api/chat/admin/release/:userId", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    ensureChatSchema(db);

    const targetId = normalizeUserId(req.params.userId);
    if (targetId === null) return res.status(400).json({ message: "userId không h?p l?" });

    if (db.chat_conversations) {
      delete db.chat_conversations[String(targetId)];
    }

    saveDB(db);
    res.json({ ok: true, assigned_to: null });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ---------- 11. Employee: Tr?ng thái chat c?a m?nh ----------
app.get("/api/chat/my-status", auth(["EMPLOYEE", "ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    ensureChatSchema(db);

    const enabled = isStaffAllowedToChat(db, req.user.id);
    const assigned_to_admin_users = getAdminAssignedUserIds(db);

    res.json({
      enabled,
      global_enabled: db.settings?.chat_enabled_global !== false,
      assigned_to_admin_users,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============================================================
// STAFF CURRENT — dùng cho KPI "Ðang tr?c tuy?n"
// ============================================================
app.get("/api/shifts/current-staff", auth(), (req, res) => {
  try {
    const db = loadDB();
    const today = getLocalDateStr();

    const active = (db.attendances || []).filter(
      (a) => a.date === today && a.checkIn && !a.checkOut
    );

    if (active.length > 0) {
      return res.json(active.map((a) => ({
        id: a.employee_id,
        name: a.employee_name,
        employee_code: a.employee_code || "",
        shift: a.shift,
        checkIn: a.checkIn,
        station: "",
        phone: "",
      })));
    }

    const shiftsToday = (db.shifts || []).filter(
      (s) => s.date === today && s.status === "approved"
    );

    return res.json(shiftsToday.map((s) => ({
      id: s.employee_id,
      name: s.employee_name,
      employee_code: "",
      shift: s.shift,
      checkIn: null,
      station: s.station || "",
      phone: "",
    })));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============ NOTIFICATIONS ============
app.get("/api/notifications", auth(), (req, res) => {
  const db = loadDB();
  const list = (db.notifications || []).filter(n => n.user_id === req.user.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50);
  const unread = list.filter(n => !n.read).length;
  res.json({ list, unread });
});

app.post("/api/notifications/:id/read", auth(), (req, res) => {
  const db = loadDB();
  const n = (db.notifications || []).find(x => x.id == req.params.id && x.user_id === req.user.id);
  if (n) n.read = true;
  saveDB(db);
  res.json({ ok: true });
});

app.post("/api/notifications/read-all", auth(), (req, res) => {
  const db = loadDB();
  (db.notifications || []).forEach(n => { if (n.user_id === req.user.id) n.read = true; });
  saveDB(db);
  res.json({ ok: true });
});

// ============ TOPPINGS & SIZES ============
app.get("/api/toppings", (req, res) => {
  const db = loadDB();
  const { category } = req.query;
  let list = db.toppings || [];
  if (category) list = list.filter(t => t.applies_to?.includes(category));
  res.json(list);
});

app.get("/api/sizes", (req, res) => {
  const db = loadDB();
  res.json(db.sizes || [
    { id: "S", name: "Nh?", extra_price: 0 },
    { id: "M", name: "V?a", extra_price: 5000 },
    { id: "L", name: "L?n", extra_price: 10000 }
  ]);
});

// ============ STATS ============
app.get("/api/stats", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  try {
    const db = loadDB();
    const today = getLocalDateStr();
    const todayOrders = db.orders.filter((o) => toLocalDateStr(o.created_at) === today);
    const byStatus = {};
    db.orders.forEach(o => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });
    res.json({
      revenue: todayOrders.reduce((s, o) => s + o.total, 0),
      orderCount: todayOrders.length,
      customerCount: db.users.filter(u => u.role === "CUSTOMER").length,
      lowStock: (db.inventory || []).filter(i => i.qty < i.min).length,
      byStatus: Object.entries(byStatus).map(([_id, count]) => ({ _id, count }))
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============ INVENTORY ============
app.get("/api/inventory", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  const db = loadDB();
  res.json(db.inventory);
});

app.post("/api/inventory", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    if (!db.inventory) db.inventory = [];
    const { code, name, qty, unit, min } = req.body;
    if (!code || !name) return res.status(400).json({ message: "Thi?u m? ho?c tên" });
    if (db.inventory.find(x => x.code === code)) return res.status(400).json({ message: "M? nguyên li?u ð? t?n t?i" });
    const item = { code, name, qty: +qty || 0, unit: unit || "kg", min: +min || 0 };
    db.inventory.push(item);
    saveDB(db);
    res.status(201).json(item);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.put("/api/inventory/:code", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const item = db.inventory?.find(x => x.code === req.params.code);
    if (!item) return res.status(404).json({ message: "Không t?m th?y nguyên li?u" });
    Object.assign(item, req.body);
    saveDB(db);
    res.json(item);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.delete("/api/inventory/:code", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  db.inventory = (db.inventory || []).filter(x => x.code !== req.params.code);
  saveDB(db);
  res.json({ ok: true });
});

app.post("/api/inventory/:code/import", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  try {
    const db = loadDB();
    const item = db.inventory?.find(x => x.code === req.params.code);
    if (!item) return res.status(404).json({ message: "Không t?m th?y nguyên li?u" });
    const { qty, note, supplier, unitCost } = req.body;
    if (!qty || +qty <= 0) return res.status(400).json({ message: "S? lý?ng không h?p l?" });
    const importQty = +qty;
    const cost = unitCost ? importQty * +unitCost : 0;
    const before = item.qty;
    item.qty += importQty;
    item.last_import = new Date().toISOString();
    if (!db.imports) db.imports = [];
    const id = nextId(db.imports);
    const record = { id, code: item.code, name: item.name, qty: importQty, before, after: item.qty, unit: item.unit, supplier: supplier || "", note: note || "", unit_cost: +unitCost || 0, cost, imported_by: req.user.name, imported_by_id: req.user.id, created_at: new Date().toISOString() };
    db.imports.push(record);
    if (cost > 0) {
      if (!db.settings) db.settings = {};
      if (!db.settings.expenses) db.settings.expenses = [];
      const expId = Date.now() + Math.floor(Math.random() * 1000);
      db.settings.expenses.push({
        id: expId,
        title: "Nh?p " + importQty + item.unit + " " + item.name,
        amount: cost,
        category: "Nh?p hàng",
        note: "M? NL: " + item.code + (supplier ? " · NCC: " + supplier : ""),
        date: new Date().toISOString(),
        source: "import",
        import_id: id,
      });
    }
    saveDB(db);
    res.status(201).json({ message: "Nh?p kho thành công", item, record });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/inventory/imports", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  const db = loadDB();
  res.json((db.imports || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

// ============ ATTENDANCE ============
function todayStr() { return getLocalDateStr(); }

const SHIFT_START_HOUR = { "Ca sáng": 6, "Ca chi?u": 12 };
const SHIFT_START_MIN  = { "Ca sáng": 30, "Ca chi?u": 30 };
const SHIFT_END_HOUR   = { "Ca sáng": 12, "Ca chi?u": 18 };
const SHIFT_END_MIN    = { "Ca sáng": 30, "Ca chi?u": 30 };

app.post("/api/attendance/checkin", auth(["EMPLOYEE", "ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    if (!db.attendances) db.attendances = [];
    const today = todayStr();
    const now = new Date();
    const { hour, minute } = getVNTime(now);
    const nowMinutes = hour * 60 + minute;
    const { shift: bodyShift } = req.body || {};
    let shift = bodyShift || "";

    if (!shift) {
      if (nowMinutes >= 6 * 60 + 30 && nowMinutes < 12 * 60 + 30) shift = "Ca sáng";
      else if (nowMinutes >= 12 * 60 + 30 && nowMinutes < 18 * 60 + 30) shift = "Ca chi?u";
      else return res.status(400).json({ message: "Hi?n không trong khung gi? làm vi?c (06:30-18:30). Vui l?ng ch?n ca th? công." });
    }

    if (!SHIFT_START_HOUR[shift]) {
      return res.status(400).json({ message: "Ca không h?p l?. Ch? h? tr?: Ca sáng, Ca chi?u" });
    }

    const approvedShift = (db.shifts || []).find((s) =>
      s.employee_id === req.user.id && s.date === today && s.shift === shift && s.status === "approved"
    );
    if (!approvedShift) return res.status(403).json({ message: `B?n chýa ðý?c duy?t ${shift} hôm nay. Vui l?ng liên h? admin ð? ðý?c phân ca.`, code: "NO_APPROVED_SHIFT" });

    const existing = db.attendances.find(a => a.employee_id === req.user.id && a.date === today && a.shift === shift && a.checkIn);
    if (existing) return res.status(400).json({ message: "B?n ð? check-in " + shift + " hôm nay r?i" });

    const startHour = SHIFT_START_HOUR[shift] ?? 6;
    const startMin = SHIFT_START_MIN[shift] ?? 30;
    const shiftStartMinutes = startHour * 60 + startMin;
    const late = nowMinutes > shiftStartMinutes + 15;
    const status = late ? "Ði mu?n" : "Ðúng gi?";

    const id = nextId(db.attendances);
    const attendance = { id, employee_id: req.user.id, employee_name: req.user.name, date: today, shift, checkIn: now.toISOString(), checkOut: null, hours: 0, status, note: "", created_at: now.toISOString() };
    db.attendances.push(attendance);
    saveDB(db);
    res.status(201).json({ message: "Check-in " + shift + " thành công", attendance });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/attendance/checkout", auth(["EMPLOYEE", "ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const today = todayStr();
    const now = new Date();
    const { hour, minute } = getVNTime(now);
    const nowMinutes = hour * 60 + minute;
    const { shift: bodyShift } = req.body || {};
    let shift = bodyShift || "";

    if (!shift) {
      if (nowMinutes >= 6 * 60 && nowMinutes < 12 * 60 + 30) shift = "Ca sáng";
      else if (nowMinutes >= 12 * 60 && nowMinutes < 18 * 60 + 30) shift = "Ca chi?u";
      else shift = "Ngoài gi?";
    }

    const att = db.attendances?.find(a => a.employee_id === req.user.id && a.date === today && a.shift === shift && a.checkIn && !a.checkOut);
    if (!att) return res.status(400).json({ message: "B?n chýa check-in " + shift + " hôm nay" });

    att.checkOut = now.toISOString();
    att.hours = Math.round(((now - new Date(att.checkIn)) / 3600000) * 100) / 100;

    const endHour = SHIFT_END_HOUR[shift];
    const endMin = SHIFT_END_MIN[shift] ?? 0;
    const shiftEndMinutes = endHour * 60 + endMin;
    const early = nowMinutes < shiftEndMinutes - 15;
    const wasLate = att.status === "Ði mu?n";

    if (early && wasLate) att.status = "Ði mu?n · V? s?m";
    else if (early && !wasLate) att.status = "V? s?m";

    saveDB(db);
    res.json({ message: "Check-out " + shift + " thành công", attendance: att });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/attendance/today", auth(), (req, res) => {
  const db = loadDB();
  const today = todayStr();
  const att = (db.attendances || []).find(a => a.employee_id === req.user.id && a.date === today);
  res.json(att || null);
});

app.get("/api/attendance/me", auth(), (req, res) => {
  const db = loadDB();
  const list = (db.attendances || []).filter(a => a.employee_id === req.user.id);
  res.json(list.sort((a, b) => b.date.localeCompare(a.date)));
});

app.get("/api/attendance", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  const db = loadDB();
  let list = db.attendances || [];
  const { from, to, employee_id, month } = req.query;
  if (month) list = list.filter(a => a.date && a.date.startsWith(month));
  else if (from && to) list = list.filter(a => a.date >= from && a.date <= to);
  if (employee_id) list = list.filter(a => a.employee_id == employee_id);
  list.sort((a, b) => b.date.localeCompare(a.date));
  res.json(list);
});

app.get("/api/attendance/employees", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  const list = db.users.filter(u => u.role === "EMPLOYEE");
  res.json(list.map(u => ({ id: u.id, name: u.name, role: u.role })));
});

// ============ PERMISSIONS ============
const ALL_PERMISSIONS = [
  { key: "menu.view", label: "Xem th?c ðõn" },
  { key: "menu.create", label: "Thêm món" },
  { key: "menu.update", label: "S?a món" },
  { key: "menu.toggle", label: "T?t / B?t món" },
  { key: "menu.delete", label: "Xóa món" },
  { key: "orders.view", label: "Xem ðõn hàng" },
  { key: "orders.process", label: "X? l? ðõn hàng" },
  { key: "orders.cancel", label: "H?y ðõn hàng" },
  { key: "orders.approve_green", label: "Duy?t S?ng Xanh" },
  { key: "inventory.view", label: "Xem kho" },
  { key: "inventory.import", label: "Nh?p kho" },
  { key: "inventory.manage", label: "Qu?n l? kho" },
  { key: "customers.view", label: "Xem khách hàng" },
  { key: "customers.manage", label: "Qu?n l? khách hàng" },
  { key: "employees.view", label: "Xem nhân viên" },
  { key: "employees.manage", label: "Qu?n l? nhân viên" },
  { key: "attendance.view", label: "Xem ch?m công" },
  { key: "attendance.manage", label: "Qu?n l? ch?m công" },
  { key: "reports.view", label: "Xem báo cáo" },
  { key: "backup.export", label: "Xu?t backup" },
  { key: "backup.import", label: "Nh?p backup" },
  { key: "backup.reset", label: "Reset database" },
  { key: "settings.view", label: "Xem cài ð?t" },
  { key: "settings.manage", label: "Qu?n l? cài ð?t" }
];

const ROLE_PERMISSIONS = {
  ADMIN: ALL_PERMISSIONS.map(p => p.key),
  EMPLOYEE: ["menu.view", "menu.update", "orders.view", "orders.process", "orders.approve_green", "inventory.view", "inventory.import", "customers.view", "attendance.view"],
  CUSTOMER: []
};

app.get("/api/permissions", auth(["ADMIN"]), (req, res) => {
  res.json({ all: ALL_PERMISSIONS, roles: ROLE_PERMISSIONS });
});

app.get("/api/permissions/me", auth(), (req, res) => {
  const db = loadDB();
  const u = db.users.find(x => x.id === req.user.id);
  if (!u) return res.status(404).json({ message: "Không t?m th?y user" });
  const rolePerms = ROLE_PERMISSIONS[u.role] || [];
  const customPerms = u.permissions || [];
  const allPerms = [...new Set([...rolePerms, ...customPerms])];
  res.json({ role: u.role, permissions: allPerms, default: rolePerms, custom: customPerms });
});

app.get("/api/permissions/:userId", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  const u = db.users.find(x => x.id == req.params.userId);
  if (!u) return res.status(404).json({ message: "Không t?m th?y user" });
  const rolePerms = ROLE_PERMISSIONS[u.role] || [];
  const customPerms = u.permissions || [];
  const allPerms = [...new Set([...rolePerms, ...customPerms])];
  res.json({ userId: u.id, userName: u.name, role: u.role, permissions: allPerms, default: rolePerms, custom: customPerms });
});

app.put("/api/permissions/:userId", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const u = db.users.find(x => x.id == req.params.userId);
    if (!u) return res.status(404).json({ message: "Không t?m th?y user" });
    if (u.role === "ADMIN") return res.status(400).json({ message: "Không th? s?a quy?n ADMIN" });
    const { custom } = req.body;
    if (!Array.isArray(custom)) return res.status(400).json({ message: "custom ph?i là array" });
    u.permissions = custom.filter(p => ALL_PERMISSIONS.some(ap => ap.key === p));
    saveDB(db);
    res.json({ ok: true, user: { id: u.id, permissions: u.permissions } });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============ BACKUP ============
app.get("/api/backup/export", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  res.json({ version: "1.0", exported_at: new Date().toISOString(), exported_by: req.user.name, data: db });
});

app.post("/api/backup/import", auth(["ADMIN"]), async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || typeof data !== "object") return res.status(400).json({ message: "File backup không h?p l?" });
    if (!Array.isArray(data.users)) return res.status(400).json({ message: "File backup thi?u m?ng users" });
    if (!Array.isArray(data.menu_items)) return res.status(400).json({ message: "File backup thi?u m?ng menu_items" });
    if (data.users.length === 0) return res.status(400).json({ message: "File backup không có user nào" });

    for (const u of data.users) {
      if (u.email) u.email = normalizeEmail(u.email);
    }

    for (const u of data.users) {
      if (!u.id || !u.email || !VALID_ROLES.includes(u.role)) {
        return res.status(400).json({ message: "User trong backup không h?p l? (thi?u id/email/role)" });
      }
    }

    if (mongoReady) {
      await extractInlineImagesFromData(data, { log: (m) => console.log(m) });
    }

    saveDB(data);
    res.json({ message: "Import thành công!", stats: { users: data.users?.length || 0, menu_items: data.menu_items?.length || 0, orders: data.orders?.length || 0, inventory: data.inventory?.length || 0 } });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/backup/stats", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    res.json({
      users: db.users?.length || 0,
      customers: db.users?.filter(u => u.role === "CUSTOMER").length || 0,
      employees: db.users?.filter(u => u.role === "EMPLOYEE").length || 0,
      menu_items: db.menu_items?.length || 0,
      orders: db.orders?.length || 0,
      inventory: db.inventory?.length || 0,
      toppings: db.toppings?.length || 0,
      sizes: db.sizes?.length || 0,
      reviews: db.reviews?.length || 0,
      vouchers: db.vouchers?.length || 0,
      notifications: db.notifications?.length || 0,
      messages: db.messages?.length || 0,
      attendances: db.attendances?.length || 0,
      imports: db.imports?.length || 0,
      price_history: db.price_history?.length || 0,
      tasks: db.tasks?.length || 0,
      points_history: db.points_history?.length || 0,
      chat_transfer_requests: db.chat_transfer_requests?.length || 0,
      db_size_bytes: JSON.stringify(db).length
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============ REPORTS ============
app.get("/api/reports/revenue", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  try {
    const db = loadDB();
    const { period = "day" } = req.query;
    const now = new Date();
    const completedOrders = (db.orders || []).filter(o => o.status === "Hoàn thành");
    let result = [];
    let totalRevenue = 0;
    let totalOrders = 0;

    if (period === "day") {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = getLocalDateStr(d);
        const dayOrders = completedOrders.filter((o) => toLocalDateStr(o.created_at) === dateStr);
        const revenue = dayOrders.reduce((s, o) => s + (o.total || 0), 0);
        const dayLabel = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][d.getDay()];
        result.push({ label: dayLabel, date: dateStr, revenue, orders: dayOrders.length });
        totalRevenue += revenue;
        totalOrders += dayOrders.length;
      }
    } else if (period === "week") {
      for (let i = 3; i >= 0; i--) {
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() - i * 7);
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 6);
        const weekOrders = completedOrders.filter(o => { const d = new Date(o.created_at); return d >= weekStart && d <= weekEnd; });
        const revenue = weekOrders.reduce((s, o) => s + (o.total || 0), 0);
        result.push({ label: "Tu?n " + (4 - i), date: getLocalDateStr(weekStart) + " - " + getLocalDateStr(weekEnd), revenue, orders: weekOrders.length });
        totalRevenue += revenue;
        totalOrders += weekOrders.length;
      }
    } else if (period === "month") {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = d.getFullYear();
        const month = d.getMonth();
        const monthOrders = completedOrders.filter(o => { const od = new Date(o.created_at); return od.getFullYear() === year && od.getMonth() === month; });
        const revenue = monthOrders.reduce((s, o) => s + (o.total || 0), 0);
        result.push({ label: "T" + (month + 1), date: year + "-" + String(month + 1).padStart(2, "0"), revenue, orders: monthOrders.length });
        totalRevenue += revenue;
        totalOrders += monthOrders.length;
      }
    } else if (period === "year") {
      for (let i = 4; i >= 0; i--) {
        const year = now.getFullYear() - i;
        const yearOrders = completedOrders.filter(o => { const od = new Date(o.created_at); return od.getFullYear() === year; });
        const revenue = yearOrders.reduce((s, o) => s + (o.total || 0), 0);
        result.push({ label: String(year), date: String(year), revenue, orders: yearOrders.length });
        totalRevenue += revenue;
        totalOrders += yearOrders.length;
      }
    }

    const menuSold = {};
    (db.orders || []).forEach(o => {
      if (o.status !== "Hoàn thành") return;
      (o.items || []).forEach(it => {
        if (!menuSold[it.menu_item_id]) menuSold[it.menu_item_id] = { id: it.menu_item_id, name: it.name, sold: 0, revenue: 0 };
        menuSold[it.menu_item_id].sold += it.qty;
        menuSold[it.menu_item_id].revenue += it.price * it.qty;
      });
    });
    const topItems = Object.values(menuSold).sort((a, b) => b.sold - a.sold).slice(0, 5);

    res.json({ period, data: result, totalRevenue, totalOrders, avgOrder: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0, topItems });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============================================================
// TIME SLOTS
// ============================================================
app.get("/api/time-slots", (req, res) => {
  try {
    const db = loadDB();
    const slots = getTimeSlots(db);
    const sorted = [...slots].sort((a, b) => String(a.start || "").localeCompare(String(b.start || "")));
    res.json(sorted);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.patch("/api/time-slots/:id", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const slots = getTimeSlots(db);
    const slotId = req.params.id;
    const idx = slots.findIndex((s) => s.id === slotId);
    if (idx < 0) return res.status(404).json({ message: "Khung gi? không t?n t?i" });
    const { enabled, note } = req.body || {};
    if (enabled !== undefined) slots[idx].enabled = !!enabled;
    if (note !== undefined) slots[idx].note = String(note).slice(0, 100).trim();
    db.settings.timeSlots = slots;
    saveDB(db);
    res.json({ ok: true, slot: slots[idx], message: slots[idx].enabled ? `Ð? B?T khung ${slotId}` : `Ð? T?T khung ${slotId}` });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/time-slots/reset", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    if (!db.settings) db.settings = {};
    db.settings.timeSlots = [...DEFAULT_TIME_SLOTS];
    saveDB(db);
    res.json({ ok: true, slots: db.settings.timeSlots, message: "Ð? reset toàn b? khung gi? v? m?c ð?nh" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============ SETTINGS ============
app.get("/api/settings", auth(), (req, res) => {
  const db = loadDB();
  ensureChatSchema(db);
  const empty = { bank: "VCB", account: "", accountName: "", hotline: "", email: "", address: "", qrCustomImage: "" };
  res.json({ ...empty, ...(db.settings || {}) });
});

app.put("/api/settings", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    if (!db.settings) db.settings = {};
    const allowed = ["bank", "account", "accountName", "hotline", "email", "address", "qrCustomImage", "timeSlots"];
    allowed.forEach(k => {
      if (req.body[k] === undefined) return;

      if (k === "timeSlots") {
        const arr = req.body[k];
        if (!Array.isArray(arr)) {
          return res.status(400).json({ message: "timeSlots ph?i là m?ng" });
        }
        const validated = [];
        for (const s of arr) {
          if (!s || typeof s !== "object") continue;
          if (typeof s.id !== "string" || !s.id.trim()) continue;
          if (typeof s.start !== "string" || !/^\d{2}:\d{2}$/.test(s.start)) continue;
          if (typeof s.end !== "string" || !/^\d{2}:\d{2}$/.test(s.end)) continue;
          validated.push({
            id: s.id.trim().slice(0, 20),
            start: s.start,
            end: s.end,
            enabled: s.enabled !== false,
            note: String(s.note || "").slice(0, 100).trim(),
          });
        }
        if (validated.length === 0) {
          return res.status(400).json({ message: "timeSlots không h?p l? (r?ng sau khi validate)" });
        }
        db.settings[k] = validated;
        return;
      }

      db.settings[k] = req.body[k];
    });
    saveDB(db);
    res.json({ ok: true, settings: db.settings });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============ SHIFTS ============
app.get("/api/shifts/me", auth(), (req, res) => {
  const db = loadDB();
  const today = getLocalDateStr();
  const list = (db.shifts || [])
    .filter((s) => s.employee_id === req.user.id && s.date >= today && s.status === "approved")
    .sort((a, b) => a.date.localeCompare(b.date));
  res.json(list);
});

app.get("/api/shifts/approved-today", auth(["EMPLOYEE", "ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const today = getLocalDateStr();
    const list = (db.shifts || [])
      .filter((s) => s.employee_id === req.user.id && s.date === today && s.status === "approved")
      .sort((a, b) => { const order = { "Ca sáng": 1, "Ca chi?u": 2 }; return (order[a.shift] || 99) - (order[b.shift] || 99); });
    res.json(list);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/shifts/pending", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  const list = (db.shifts || []).filter(s => s.status === "pending").sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  res.json(list);
});

app.get("/api/shifts", auth(["ADMIN", "EMPLOYEE"]), (req, res) => {
  const db = loadDB();
  let list = db.shifts || [];
  const { date, employee_id, shift, include_pending } = req.query;
  if (!include_pending) list = list.filter(s => !s.status || s.status === "approved");
  if (date) list = list.filter(s => s.date === date);
  if (employee_id) list = list.filter(s => s.employee_id == employee_id);
  if (shift) list = list.filter(s => s.shift === shift);
  res.json(list);
});

app.post("/api/shifts/register", auth(["EMPLOYEE", "ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    if (!db.shifts) db.shifts = [];
    const { dates, shifts, note } = req.body;
    if (!dates?.length || !shifts?.length) return res.status(400).json({ message: "Thi?u thông tin" });
    const emp = db.users.find(u => u.id === req.user.id);
    if (!emp) return res.status(404).json({ message: "Không t?m th?y nhân viên" });
    let created = 0;
    let skipped = 0;
    let nextIdVal = nextId(db.shifts);
    dates.forEach(date => {
      shifts.forEach(shift => {
        const exists = db.shifts.find(s => s.employee_id === req.user.id && s.date === date && s.shift === shift);
        if (exists) { skipped++; return; }
        db.shifts.push({ id: nextIdVal++, employee_id: req.user.id, employee_name: emp.name, date, shift, note: note || "", status: "pending", source: "employee", created_by: emp.name, created_at: new Date().toISOString() });
        created++;
      });
    });
    saveDB(db);
    res.status(201).json({ created, skipped, message: "Ð? ðãng k? " + created + " ca" });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.patch("/api/shifts/:id/approve", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const s = (db.shifts || []).find(x => x.id == req.params.id);
    if (!s) return res.status(404).json({ message: "Không t?m th?y" });
    s.status = "approved";
    s.approved_by = req.user.name;
    s.approved_at = new Date().toISOString();
    saveDB(db);
    res.json({ ok: true, shift: s });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete("/api/shifts/:id/reject", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  const before = (db.shifts || []).length;
  db.shifts = (db.shifts || []).filter(x => x.id != req.params.id);
  saveDB(db);
  res.json({ ok: true, removed: before - db.shifts.length });
});

app.post("/api/shifts/bulk", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    if (!db.shifts) db.shifts = [];
    const { employee_id, dates, shifts, note } = req.body;
    if (!employee_id || !dates?.length || !shifts?.length) return res.status(400).json({ message: "Thi?u thông tin" });
    const emp = db.users.find(u => u.id == employee_id);
    if (!emp) return res.status(404).json({ message: "Không t?m th?y nhân viên" });
    let created = 0;
    let skipped = 0;
    let nextIdVal = nextId(db.shifts);
    dates.forEach(date => {
      shifts.forEach(shift => {
        const exists = db.shifts.find(s => s.employee_id == employee_id && s.date === date && s.shift === shift);
        if (exists) { skipped++; return; }
        db.shifts.push({ id: nextIdVal++, employee_id: +employee_id, employee_name: emp.name, date, shift, note: note || "", status: "approved", source: "admin", created_by: req.user.name, created_at: new Date().toISOString() });
        created++;
      });
    });
    saveDB(db);
    res.status(201).json({ created, skipped, message: "Ð? phân " + created + " ca" });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/shifts", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    if (!db.shifts) db.shifts = [];
    const { employee_id, date, shift, note } = req.body;
    if (!employee_id || !date || !shift) return res.status(400).json({ message: "Thi?u thông tin" });
    const emp = db.users.find(u => u.id == employee_id);
    if (!emp) return res.status(404).json({ message: "Không t?m th?y nhân viên" });
    const existing = db.shifts.find(s => s.employee_id == employee_id && s.date === date && s.shift === shift);
    if (existing) return res.status(400).json({ message: "Nhân viên ð? ðý?c phân ca này r?i" });
    const id = nextId(db.shifts);
    const record = { id, employee_id: +employee_id, employee_name: emp.name, date, shift, note: note || "", status: "approved", source: "admin", created_by: req.user.name, created_at: new Date().toISOString() };
    db.shifts.push(record);
    saveDB(db);
    res.status(201).json(record);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.put("/api/shifts/:id", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const s = (db.shifts || []).find(x => x.id == req.params.id);
    if (!s) return res.status(404).json({ message: "Không t?m th?y" });
    if (req.body.date) s.date = req.body.date;
    if (req.body.shift) s.shift = req.body.shift;
    if (req.body.note !== undefined) s.note = req.body.note;
    saveDB(db);
    res.json(s);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.delete("/api/shifts/:id", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  db.shifts = (db.shifts || []).filter(x => x.id != req.params.id);
  saveDB(db);
  res.json({ ok: true });
});

// ============ TASKS ============
const VALID_TASK_STATUSES = ["pending", "done", "cancelled"];
const VALID_TASK_PRIORITIES = ["low", "normal", "high", "urgent"];

app.get("/api/tasks/me", auth(), (req, res) => {
  try {
    const db = loadDB();
    if (!db.tasks) db.tasks = [];
    const today = getLocalDateStr();
    const list = db.tasks
      .filter(
        (t) =>
          t.assigned_to === req.user.id &&
          t.status !== "cancelled" &&
          (!t.due_date || t.due_date >= today)
      )
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
        const pOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
        const pa = pOrder[a.priority] ?? 2;
        const pb = pOrder[b.priority] ?? 2;
        if (pa !== pb) return pa - pb;
        return new Date(b.created_at) - new Date(a.created_at);
      });
    res.json(list);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/tasks", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    if (!db.tasks) db.tasks = [];
    const { assigned_to, status } = req.query;
    let list = [...db.tasks];
    if (assigned_to) list = list.filter((t) => t.assigned_to == assigned_to);
    if (status && status !== "all") list = list.filter((t) => t.status === status);
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(list);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/tasks", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    if (!db.tasks) db.tasks = [];
    const { title, description, assigned_to, due_date, shift, priority } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: "Thi?u tiêu ð?" });
    }
    if (!assigned_to) {
      return res.status(400).json({ message: "Thi?u nhân viên ðý?c giao" });
    }
    const emp = db.users.find((u) => u.id == assigned_to);
    if (!emp) {
      return res.status(404).json({ message: "Không t?m th?y nhân viên" });
    }

    const id = nextId(db.tasks);
    const task = {
      id,
      title: String(title).trim(),
      description: String(description || "").trim(),
      assigned_to: Number(assigned_to),
      assigned_by: req.user.id,
      assigned_by_name: req.user.name,
      due_date: due_date || "",
      shift: shift || "",
      status: "pending",
      priority: VALID_TASK_PRIORITIES.includes(priority) ? priority : "normal",
      created_at: new Date().toISOString(),
      completed_at: null,
    };
    db.tasks.push(task);
    saveDB(db);
    res.status(201).json(task);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.put("/api/tasks/:id", auth(["ADMIN"]), (req, res) => {
  try {
    const db = loadDB();
    const t = (db.tasks || []).find((x) => x.id == req.params.id);
    if (!t) return res.status(404).json({ message: "Không t?m th?y task" });
    const { title, description, due_date, shift, priority, status } = req.body || {};
    if (title !== undefined) t.title = String(title).trim();
    if (description !== undefined) t.description = String(description).trim();
    if (due_date !== undefined) t.due_date = due_date;
    if (shift !== undefined) t.shift = shift;
    if (priority !== undefined && VALID_TASK_PRIORITIES.includes(priority)) {
      t.priority = priority;
    }
    if (status !== undefined && VALID_TASK_STATUSES.includes(status)) {
      t.status = status;
      if (status === "done") t.completed_at = new Date().toISOString();
    }
    saveDB(db);
    res.json(t);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.delete("/api/tasks/:id", auth(["ADMIN"]), (req, res) => {
  const db = loadDB();
  db.tasks = (db.tasks || []).filter((x) => x.id != req.params.id);
  saveDB(db);
  res.json({ ok: true });
});

app.patch("/api/tasks/:id/complete", auth(), (req, res) => {
  try {
    const db = loadDB();
    const t = (db.tasks || []).find((x) => x.id == req.params.id);
    if (!t) return res.status(404).json({ message: "Không t?m th?y task" });
    if (t.assigned_to !== req.user.id && req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Không có quy?n" });
    }
    t.status = t.status === "done" ? "pending" : "done";
    t.completed_at = t.status === "done" ? new Date().toISOString() : null;
    saveDB(db);
    res.json(t);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ============ ADMIN BACKFILL TRANSLATIONS ============
app.post("/api/admin/backfill-translations", auth(["ADMIN"]), async (req, res) => {
  try {
    const db = loadDB();
    const FIELDS_MENU = ["name", "description"];
    const FIELDS_CAT = ["name"];
    const LANGS = ["en", "ja", "ko", "zh"];

    let menuTodo = [];
    let catTodo = [];

    for (const m of db.menu_items || []) {
      let need = false;
      for (const f of FIELDS_MENU) {
        if (!m[f] || !String(m[f]).trim()) continue;
        for (const l of LANGS) {
          if (!m[`${f}_${l}`]) { need = true; break; }
        }
        if (need) break;
      }
      if (need) menuTodo.push(m);
    }

    for (const c of db.categories || []) {
      let need = false;
      for (const f of FIELDS_CAT) {
        if (!c[f] || !String(c[f]).trim()) continue;
        for (const l of LANGS) {
          if (!c[`${f}_${l}`]) { need = true; break; }
        }
        if (need) break;
      }
      if (need) catTodo.push(c);
    }

    for (const m of menuTodo) {
      try {
        await autoTranslateMenuItem(db, m, null);
      } catch (e) {
        console.warn("Backfill menu fail:", m?.name, e.message);
      }
    }
    for (const c of catTodo) {
      try {
        await autoTranslateCategory(db, c, null);
      } catch (e) {
        console.warn("Backfill category fail:", c?.name, e.message);
      }
    }

    saveDB(db);

    res.json({
      ok: true,
      queued: {
        menu: menuTodo.length,
        category: catTodo.length,
      },
      message: `Ð? d?ch ${menuTodo.length} món và ${catTodo.length} danh m?c.`,
    });
  } catch (e) {
    console.error("BACKFILL ERROR:", e);
    res.status(500).json({ message: e.message });
  }
});

// ============ HEALTH ============
const healthHandler = (_, res) => res.json({
  ok: true,
  name: "Canteen VWA API (JSON)",
  version: BUILD_VERSION,
  timezone: VN_TIMEZONE,
  autoTranslate: { mode: "sync-on-write", langs: ASYNC_LANGS },
  chat: { ttlHours: 24, admin: true },
  oauth: {
    google: GOOGLE_OAUTH_ENABLED,
    facebook: FACEBOOK_OAUTH_ENABLED,
  },
  mongo: mongoReady ? "connected" : "not-connected",
  vercel: !!process.env.VERCEL,
  timestamp: new Date().toISOString()
});

app.get("/", healthHandler);
app.get("/api", healthHandler);
app.get("/api/", healthHandler);

const PORT = process.env.PORT || 3000;

// ============ BACKUP RESET ============
app.post("/api/backup/reset", auth(["ADMIN"]), (req, res) => {
  try {
    const { confirm } = req.body;
    const RESET_TOKEN = process.env.RESET_CONFIRM_TOKEN || "RESET";
    if (confirm !== RESET_TOKEN) {
      return res.status(400).json({
        message: `C?n xác nh?n '${RESET_TOKEN}' ð? th?c hi?n.`,
        code: "RESET_CONFIRM_REQUIRED",
      });
    }
    const db = loadDB();
    db.orders = [];
    db.wallets = [];
    db.wallet_transactions = [];
    db.notifications = [];
    db.messages = [];
    db.attendances = [];
    db.shifts = [];
    db.imports = [];
    db.price_history = [];
    db.reviews = [];
    db.points_history = [];
    db.chat_transfer_requests = [];
    db.chat_conversations = {};
    (db.users || []).forEach(u => { u.points = 0; });
    (db.menu_items || []).forEach(m => {
      if (m.stock !== undefined) m.stock = Math.max(m.stock, 30);
      m.sold = 0;
    });
    saveDB(db);
    res.json({ ok: true, message: "Reset thành công", stats: { users: db.users.length, menu_items: db.menu_items.length, orders: 0, wallets: 0 } });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

export default app;

const IS_VERCEL = !!process.env.VERCEL;

if (!IS_VERCEL) {
  getInitPromise().then(() => {
    app.listen(PORT, () => {
      console.log("?? API (JSON): http://localhost:" + PORT + " | TZ: " + VN_TIMEZONE);
      console.log("   ?? Chat TTL: 24h");
      console.log("   ???  Chat Admin: enabled");
    });
  });
} else {
  console.log("?? API ch?y trên Vercel Serverless | TZ: " + VN_TIMEZONE);
}

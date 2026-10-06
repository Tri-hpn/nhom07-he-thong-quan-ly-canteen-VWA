// ============================================================
// DATETIME.JS — Helpers format ngày giờ cho Canteen VWA (V2)
// ============================================================
// V2 (2026-10):
//   - 🔧 FIX #70: diffDaysFromToday dùng Number() có thể NaN
//                 → validate bằng isNaN + guard slice
//   - Giữ nguyên API còn lại
// ============================================================

const VN_TZ = "Asia/Ho_Chi_Minh";

function toDate(iso) {
  if (!iso) return null;
  if (iso instanceof Date) return isNaN(iso.getTime()) ? null : iso;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function getVNDateKey(d) {
  const date = toDate(d);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * 🔧 FIX #70: Số ngày lệch (0 = hôm nay, 1 = hôm qua, ...).
 * - Guard toàn bộ input: y/m/d phải là số hợp lệ
 * - Nếu parse fail → trả null (không crash)
 */
function diffDaysFromToday(iso) {
  const d = toDate(iso);
  if (!d) return null;

  const targetKey = getVNDateKey(d);
  const todayKey = getVNDateKey(new Date());
  if (!targetKey || !todayKey) return null;
  if (targetKey.length < 10 || todayKey.length < 10) return null;

  const targetY = Number(targetKey.slice(0, 4));
  const targetM = Number(targetKey.slice(5, 7));
  const targetD = Number(targetKey.slice(8, 10));

  const todayY = Number(todayKey.slice(0, 4));
  const todayM = Number(todayKey.slice(5, 7));
  const todayD = Number(todayKey.slice(8, 10));

  // 🔧 FIX #70: guard NaN
  if (
    !Number.isFinite(targetY) || !Number.isFinite(targetM) || !Number.isFinite(targetD) ||
    !Number.isFinite(todayY) || !Number.isFinite(todayM) || !Number.isFinite(todayD)
  ) {
    return null;
  }

  const targetUTC = Date.UTC(targetY, targetM - 1, targetD);
  const todayUTC = Date.UTC(todayY, todayM - 1, todayD);

  const diff = Math.round((todayUTC - targetUTC) / 86400000);
  return Number.isFinite(diff) ? diff : null;
}

/**
 * Format giờ HH:MM theo timezone VN.
 */
export function fmtTime(iso) {
  const d = toDate(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: VN_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * Format ngày giờ đầy đủ: DD/MM/YYYY • HH:MM
 */
export function fmtDateTime(iso) {
  const d = toDate(iso);
  if (!d) return "—";
  const dd = new Intl.DateTimeFormat("en-GB", {
    timeZone: VN_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  return `${dd} • ${fmtTime(d)}`;
}

/**
 * Nhãn ngày tương đối: "Hôm nay" | "Hôm qua" | "28/02" | ""
 */
export function fmtDateLabel(iso) {
  const diff = diffDaysFromToday(iso);
  if (diff === null) return "";

  if (diff === 0) return "Hôm nay";
  if (diff === 1) return "Hôm qua";

  const d = toDate(iso);
  if (!d) return "";
  const dd = new Intl.DateTimeFormat("en-GB", {
    timeZone: VN_TZ,
    day: "2-digit",
    month: "2-digit",
  }).format(d);
  return dd;
}

/**
 * Variant cho CSS class — "today" | "yesterday" | "old"
 */
export function getDateLabelVariant(iso) {
  const diff = diffDaysFromToday(iso);
  if (diff === null) return "old";
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  return "old";
}

/**
 * Giờ + nhãn ngày: "14:30 • Hôm qua" hoặc "14:30" nếu hôm nay.
 */
export function fmtTimeWithLabel(iso) {
  const t = fmtTime(iso);
  if (!t) return "";
  const diff = diffDaysFromToday(iso);
  if (diff === 0) return t;
  const label = fmtDateLabel(iso);
  return label ? `${t} • ${label}` : t;
}

/**
 * Nhãn ca hiện tại theo giờ VN.
 */
export function getCurrentShiftLabel(date = new Date()) {
  const d = toDate(date) || new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VN_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(
    parts.find((p) => p.type === "minute")?.value || "0",
    10
  );
  const min = hour * 60 + minute;

  const hhmm = (h, m) => h * 60 + m;
  if (min >= hhmm(6, 30) && min < hhmm(12, 30)) return "Ca Sáng";
  if (min >= hhmm(12, 30) && min < hhmm(18, 30)) return "Ca Chiều";
  if (min >= hhmm(18, 30) && min < hhmm(22, 0)) return "Ca Tối";
  return "Ngoài giờ";
}

/**
 * Cùng ngày (theo giờ VN)?
 */
export function isSameDay(iso1, iso2) {
  const a = getVNDateKey(iso1);
  const b = getVNDateKey(iso2);
  return a && b && a === b;
}

/**
 * Format ngày ngắn: DD/MM/YYYY
 */
export function fmtDate(iso) {
  const d = toDate(iso);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: VN_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}
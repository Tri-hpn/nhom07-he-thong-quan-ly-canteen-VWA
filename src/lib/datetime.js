// ============================================================
// DATETIME.JS — Helpers format ngày giờ cho Canteen VWA (V3)
// ============================================================
// V3 (B8): fmtDateLabel + getCurrentShiftLabel nhận `t` tùy chọn
//          (backward compatible — không truyền `t` → fallback VN)

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

// 🔧 B8: nhận `t` tùy chọn (nếu không có → fallback tiếng Việt)
export function fmtDateLabel(iso, t) {
  const diff = diffDaysFromToday(iso);
  if (diff === null) return "";

  const tr = typeof t === "function" ? t : (s) => s;

  if (diff === 0) return tr("Hôm nay");
  if (diff === 1) return tr("Hôm qua");

  const d = toDate(iso);
  if (!d) return "";
  const dd = new Intl.DateTimeFormat("en-GB", {
    timeZone: VN_TZ,
    day: "2-digit",
    month: "2-digit",
  }).format(d);
  return dd;
}

export function getDateLabelVariant(iso) {
  const diff = diffDaysFromToday(iso);
  if (diff === null) return "old";
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  return "old";
}

export function fmtTimeWithLabel(iso, t) {
  const timeStr = fmtTime(iso);
  if (!timeStr) return "";
  const diff = diffDaysFromToday(iso);
  if (diff === 0) return timeStr;
  const label = fmtDateLabel(iso, t);
  return label ? `${timeStr} • ${label}` : timeStr;
}

// 🔧 B8: nhận `t` tùy chọn
export function getCurrentShiftLabel(date = new Date(), t) {
  const tr = typeof t === "function" ? t : (s) => s;
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
  if (min >= hhmm(6, 30) && min < hhmm(12, 30)) return tr("Ca Sáng");
  if (min >= hhmm(12, 30) && min < hhmm(18, 30)) return tr("Ca Chiều");
  if (min >= hhmm(18, 30) && min < hhmm(22, 0)) return tr("Ca Tối");
  return tr("Ngoài giờ");
}

export function isSameDay(iso1, iso2) {
  const a = getVNDateKey(iso1);
  const b = getVNDateKey(iso2);
  return a && b && a === b;
}

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
// ============================================================
// DATETIME.JS — Helper định dạng ngày/giờ dùng chung
// ============================================================
// Dùng cho MỌI role (Customer, Employee, Admin) để tránh lệch format.
// ============================================================

/**
 * Chỉ giờ HH:MM
 */
export function fmtTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const hh = d.getHours().toString().padStart(2, "0");
    const mi = d.getMinutes().toString().padStart(2, "0");
    return `${hh}:${mi}`;
  } catch {
    return "";
  }
}

/**
 * Nhãn tương đối: "Hôm nay" | "Hôm qua" | "X ngày trước" | "dd/mm"
 * Trả về "" nếu không parse được.
 */
export function fmtDateLabel(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today - target) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Hôm nay";
    if (diffDays === 1) return "Hôm qua";
    if (diffDays < 7) return `${diffDays} ngày trước`;

    const dd = d.getDate().toString().padStart(2, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    return `${dd}/${mm}`;
  } catch {
    return "";
  }
}

/**
 * "15:48 • Hôm qua" | "15:48 • 02/10" | "15:48"
 * Khi hôm nay chỉ trả giờ, không thêm label.
 */
export function fmtTimeWithLabel(iso) {
  const time = fmtTime(iso);
  if (!time) return "";
  const label = fmtDateLabel(iso);
  if (!label || label === "Hôm nay") return time;
  return `${time} • ${label}`;
}

/**
 * "04/10/2026 • 15:48" — đầy đủ
 */
export function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const dd = d.getDate().toString().padStart(2, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = d.getHours().toString().padStart(2, "0");
    const mi = d.getMinutes().toString().padStart(2, "0");
    return `${dd}/${mm}/${yyyy} • ${hh}:${mi}`;
  } catch {
    return "—";
  }
}

/**
 * Trả về variant màu cho label: "today" | "yesterday" | "old" | null
 * Dùng để chọn CSS class.
 */
export function getDateLabelVariant(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today - target) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    return "old";
  } catch {
    return null;
  }
}

/**
 * Tên ca dựa vào giờ hiện tại (CHỈ 2 CA)
 *   06:30 - 12:30 → "Ca sáng"
 *   12:30 - 18:30 → "Ca chiều"
 *   Ngoài giờ   → "Ngoài giờ"
 */
export function getCurrentShiftName(now = new Date()) {
  const min = now.getHours() * 60 + now.getMinutes();
  const hhmm = (h, m) => h * 60 + m;

  if (min >= hhmm(6, 30) && min < hhmm(12, 30)) return "Ca sáng";
  if (min >= hhmm(12, 30) && min < hhmm(18, 30)) return "Ca chiều";
  return "Ngoài giờ";
}

/**
 * Label đầy đủ của ca: "Ca sáng (06:30 - 12:30)"
 */
export function getCurrentShiftLabel(now = new Date()) {
  const name = getCurrentShiftName(now);
  if (name === "Ca sáng") return "Ca sáng (06:30 - 12:30)";
  if (name === "Ca chiều") return "Ca chiều (12:30 - 18:30)";
  return "Ngoài giờ";
}
// ============================================================
// API.JS — HTTP client cho Backend Express (V7 - FINAL)
// ============================================================
// V7 (2026-10):
//   - ✅ Thêm api.users.setPoints — set điểm user (ADMIN)
//   - ✅ Thêm api.users.unlinkMssv — gỡ liên kết MSSV (ADMIN)
//   - ✅ Thêm api.users.schoolInfo — cập nhật school info (ADMIN)
//   - ✅ Thêm api.school.* — parse MSSV/mã GV, majors map
//   - Giữ V6: sessionStorage thuần, memoryToken fallback,
//     credentials same-origin
// ============================================================

const BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");

const DEFAULT_TIMEOUT_MS = 20000;
const UPLOAD_TIMEOUT_MS = 60000;

// ============================================================
// TOKEN — sessionStorage thuần (mỗi tab riêng)
// ============================================================

let memoryToken = null;

export function getToken() {
  try {
    const t = sessionStorage.getItem("token");
    if (t) return t;
    return memoryToken;
  } catch {
    return memoryToken;
  }
}

export function setToken(t) {
  memoryToken = t || null;
  try {
    if (t) {
      sessionStorage.setItem("token", t);
    } else {
      sessionStorage.removeItem("token");
    }
  } catch (e) {
    console.warn("Không thể lưu token vào sessionStorage:", e.message);
  }
}

// ============================================================
// REQUEST WRAPPER
// ============================================================
async function req(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(BASE + path, {
      ...options,
      headers,
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") {
      const err = new Error(
        "Yêu cầu quá thời gian. Vui lòng kiểm tra kết nối và thử lại."
      );
      err.status = 0;
      err.isTimeout = true;
      throw err;
    }
    const err = new Error(
      "Không kết nối được máy chủ: " + (e.message || "unknown error")
    );
    err.status = 0;
    err.isNetworkError = true;
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.status === 401 && token) {
    setToken(null);
    try {
      window.dispatchEvent(new CustomEvent("auth-expired"));
    } catch {}
  }

  const contentType = res.headers.get("content-type") || "";
  let data;
  try {
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      const text = await res.text();
      data = text ? { message: text.slice(0, 300) } : {};
    }
  } catch {
    data = {};
  }

  if (!res.ok) {
    const message =
      data.message ||
      data.error ||
      `HTTP ${res.status}${res.statusText ? " " + res.statusText : ""}`;
    const err = new Error(message);
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data;
}

// ============================================================
// API
// ============================================================
export const api = {
  _base: BASE,

  // AUTH
  login: (email, password) =>
    req("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (data) =>
    req("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  me: () => req("/auth/me"),
  updateProfile: (data) =>
    req("/auth/profile", { method: "PUT", body: JSON.stringify(data) }),
  changePassword: (data) =>
    req("/auth/password", { method: "PUT", body: JSON.stringify(data) }),

  oauth: {
    callback: (provider, code, redirectUri) =>
      req(`/auth/${provider}/callback`, {
        method: "POST",
        body: JSON.stringify({ code, redirectUri }),
      }),
  },

  stats: () => req("/stats"),

  menu: {
    list: (q = "", category = "Tất cả", sort = "popular", all = false) => {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (category && category !== "Tất cả") p.set("category", category);
      if (sort) p.set("sort", sort);
      if (all) p.set("all", "1");
      const qs = p.toString();
      return req("/menu" + (qs ? "?" + qs : ""));
    },
    listActive: (q = "", category = "Tất cả", sort = "popular") => {
      const p = new URLSearchParams();
      p.set("active_only", "1");
      if (q) p.set("q", q);
      if (category && category !== "Tất cả") p.set("category", category);
      if (sort) p.set("sort", sort);
      return req("/menu?" + p.toString());
    },
    get:    (id)       => req(`/menu/${id}`),
    create: (data)     => req("/menu",       { method: "POST",   body: JSON.stringify(data) }),
    update: (id, data) => req(`/menu/${id}`, { method: "PUT",    body: JSON.stringify(data) }),
    remove: (id)       => req(`/menu/${id}`, { method: "DELETE" }),
  },

  priceHistory: {
    list: (menuItemId) =>
      req("/price-history" + (menuItemId ? "?menu_item_id=" + menuItemId : "")),
  },

  orders: {
    create:   (data)       => req("/orders",               { method: "POST",  body: JSON.stringify(data) }),
    myOrders: ()           => req("/orders/me"),
    all: (status = "Tất cả") => {
      const qs = status && status !== "Tất cả"
        ? `?status=${encodeURIComponent(status)}` : "";
      return req("/orders" + qs);
    },
    setStatus: (id, status) => req(`/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    received:  (id)         => req(`/orders/${id}/received`, { method: "POST" }),
    cancel:    (id)         => req(`/orders/${id}/cancel`,   { method: "POST" }),
  },

  users: {
    list:   (role)     => req(`/users${role ? `?role=${role}` : ""}`),
    create: (data)     => req("/users",       { method: "POST",   body: JSON.stringify(data) }),
    update: (id, data) => req(`/users/${id}`, { method: "PUT",    body: JSON.stringify(data) }),
    remove: (id)       => req(`/users/${id}`, { method: "DELETE" }),
    resetPassword: (id) => req(`/users/${id}/reset-password`, { method: "POST" }),

    // ✅ V7 — MỚI: Set điểm user (ADMIN)
    setPoints: (id, data) =>
      req(`/users/${id}/points`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),

    // ✅ V7 — MỚI: Cập nhật thông tin trường (ADMIN override)
    schoolInfo: (id, data) =>
      req(`/users/${id}/school-info`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),

    // ✅ V7 — MỚI: Gỡ liên kết MSSV (ADMIN)
    unlinkMssv: (id) =>
      req(`/users/${id}/unlink-mssv`, { method: "DELETE" }),
  },

  // ✅ V7 — MỚI: SCHOOL / MAJORS MAP
  school: {
    parseStudent: (code) =>
      req(`/school/parse-student/${encodeURIComponent(code)}`),
    parseTeacher: (code) =>
      req(`/school/parse-teacher/${encodeURIComponent(code)}`),
    majorsMap: () => req("/school/majors-map"),
    updateMajorsMap: (map) =>
      req("/school/majors-map", {
        method: "PUT",
        body: JSON.stringify({ map }),
      }),
    resetMajorsMap: () =>
      req("/school/majors-map/reset", { method: "POST" }),
  },

  inventory: {
    list:    ()           => req("/inventory"),
    create:  (data)       => req("/inventory",               { method: "POST",   body: JSON.stringify(data) }),
    update:  (code, data) => req(`/inventory/${code}`,        { method: "PUT",    body: JSON.stringify(data) }),
    remove:  (code)       => req(`/inventory/${code}`,        { method: "DELETE" }),
    import:  (code, data) => req(`/inventory/${code}/import`, { method: "POST",   body: JSON.stringify(data) }),
    imports: ()           => req("/inventory/imports"),
  },

  attendance: {
    today:    ()        => req("/attendance/today"),
    me:       ()        => req("/attendance/me"),
    checkIn:  (data)    => req("/attendance/checkin",  { method: "POST", body: JSON.stringify(data || {}) }),
    checkOut: (data)    => req("/attendance/checkout", { method: "POST", body: JSON.stringify(data || {}) }),
    all:      (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return req("/attendance" + (q ? `?${q}` : ""));
    },
    employees: ()       => req("/attendance/employees"),
  },

  shifts: {
    approvedToday: () => req("/shifts/approved-today"),
    currentStaff:  () => req("/shifts/current-staff"),
    mine:          () => req("/shifts/me"),
    pending:       () => req("/shifts/pending"),
    all:           (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return req("/shifts" + (q ? `?${q}` : ""));
    },
    register: (data)     => req("/shifts/register", { method: "POST", body: JSON.stringify(data) }),
    bulk:     (data)     => req("/shifts/bulk",     { method: "POST", body: JSON.stringify(data) }),
    create:   (data)     => req("/shifts",          { method: "POST", body: JSON.stringify(data) }),
    update:   (id, data) => req(`/shifts/${id}`,    { method: "PUT",  body: JSON.stringify(data) }),
    remove:   (id)       => req(`/shifts/${id}`,    { method: "DELETE" }),
    approve:  (id)       => req(`/shifts/${id}/approve`, { method: "PATCH"  }),
    reject:   (id)       => req(`/shifts/${id}/reject`,  { method: "DELETE" }),
  },

  tasks: {
    me:       ()              => req("/tasks/me"),
    all:      (params = {})   => {
      const q = new URLSearchParams(params).toString();
      return req("/tasks" + (q ? `?${q}` : ""));
    },
    create:   (data)          => req("/tasks",             { method: "POST",   body: JSON.stringify(data) }),
    update:   (id, data)      => req(`/tasks/${id}`,       { method: "PUT",    body: JSON.stringify(data) }),
    remove:   (id)            => req(`/tasks/${id}`,       { method: "DELETE" }),
    complete: (id)            => req(`/tasks/${id}/complete`, { method: "PATCH" }),
  },

  wallet: {
    me:           ()         => req("/wallet/me"),
    transactions: ()         => req("/wallet/transactions"),
    deposit:      (data)     => req("/wallet/deposit",   { method: "POST", body: JSON.stringify(data) }),
    withdraw:     (data)     => req("/wallet/withdraw",  { method: "POST", body: JSON.stringify(data) }),
    linkBank:     (data)     => req("/wallet/link-bank", { method: "POST", body: JSON.stringify(data) }),
    pay:          (data)     => req("/wallet/pay",       { method: "POST", body: JSON.stringify(data) }),
    requests:     (status)   => req("/wallet/requests" + (status ? "?status=" + status : "")),
    all:          ()         => req("/wallet/all"),
    stats:        ()         => req("/wallet/stats"),
    approve:      (id, note) => req(`/wallet/requests/${id}/approve`, { method: "PATCH", body: JSON.stringify({ admin_note: note || "" }) }),
    reject:       (id, note) => req(`/wallet/requests/${id}/reject`,  { method: "PATCH", body: JSON.stringify({ admin_note: note || "" }) }),
  },

  reviews: {
    me:        ()           => req("/reviews/me"),
    list:      (menuItemId) => req(`/reviews/${menuItemId}`),
    create:    (data)       => req("/reviews", { method: "POST", body: JSON.stringify(data) }),
    canReview: (menuItemId) => req(`/reviews/can-review/${menuItemId}`),
  },

  points: {
    me:     ()     => req("/points/me"),
    redeem: (data) => req("/points/redeem", { method: "POST", body: JSON.stringify(data) }),
  },

  vouchers: {
    me:       ()         => req("/vouchers/me"),
    public:   ()         => req("/vouchers/public"),
    validate: (code)     => req("/vouchers/validate", { method: "POST", body: JSON.stringify({ code }) }),
    claim:    (id)       => req(`/vouchers/claim/${id}`, { method: "POST" }),
    all:      ()         => req("/vouchers"),
    create:   (data)     => req("/vouchers",       { method: "POST",   body: JSON.stringify(data) }),
    update:   (id, data) => req(`/vouchers/${id}`, { method: "PUT",    body: JSON.stringify(data) }),
    remove:   (id)       => req(`/vouchers/${id}`, { method: "DELETE" }),
    stats:    ()         => req("/vouchers/stats"),
    claims:   (templateId) => req(`/vouchers/claims/${templateId}`),
    ofUser:   (userId)   => req(`/vouchers/user/${userId}`),
    revoke:   (id)       => req(`/vouchers/revoke/${id}`, { method: "DELETE" }),
  },

  notifications: {
    list:    ()   => req("/notifications"),
    read:    (id) => req(`/notifications/${id}/read`, { method: "POST" }),
    readAll: ()   => req("/notifications/read-all",   { method: "POST" }),
  },

  chat: {
    myMessages:    ()       => req("/chat/me"),
    conversations: ()       => req("/chat/conversations"),
    messagesWith:  (userId) => req(`/chat/with/${userId}`),
    send:          (data)   => req("/chat/send", { method: "POST", body: JSON.stringify(data) }),
    getContext:    (userId) => req(`/chat/context/${userId}`),
  },

  toppings: {
    list: (category) =>
      req(`/toppings${category ? `?category=${encodeURIComponent(category)}` : ""}`),
  },
  sizes:      { list: () => req("/sizes") },
  categories: {
    list:   ()         => req("/categories"),
    create: (data)     => req("/categories",       { method: "POST",   body: JSON.stringify(data) }),
    update: (id, data) => req(`/categories/${id}`, { method: "PUT",    body: JSON.stringify(data) }),
    remove: (id)       => req(`/categories/${id}`, { method: "DELETE" }),
  },
  promotions: { list: () => req("/promotions") },

  permissions: {
    all:    ()              => req("/permissions"),
    me:     ()              => req("/permissions/me"),
    ofUser: (userId)        => req(`/permissions/${userId}`),
    update: (userId, custom) =>
      req(`/permissions/${userId}`, { method: "PUT", body: JSON.stringify({ custom }) }),
  },

  backup: {
    export: ()        => req("/backup/export"),
    import: (data)    => req("/backup/import", { method: "POST", body: JSON.stringify(data), timeoutMs: UPLOAD_TIMEOUT_MS }),
    reset:  (confirm) => req("/backup/reset",  { method: "POST", body: JSON.stringify({ confirm }) }),
    stats:  ()        => req("/backup/stats"),
  },

  reports: {
    revenue: (period = "day") => req(`/reports/revenue?period=${period}`),
  },

  settings: {
    get:    ()     => req("/settings"),
    update: (data) => req("/settings", { method: "PUT", body: JSON.stringify(data) }),
  },

  timeSlots: {
    list: () => req("/time-slots"),
    update: (id, data) =>
      req(`/time-slots/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    reset: () => req("/time-slots/reset", { method: "POST" }),
  },

  admin: {
    translationStats: () => req("/admin/translation-stats"),
    backfill:          () => req("/admin/backfill-translations", { method: "POST" }),
    backfillSync: (limit = 30) =>
      req("/admin/backfill-translations-sync", {
        method: "POST",
        body: JSON.stringify({ limit }),
        timeoutMs: 50000,
      }),
  },
};

export default api;
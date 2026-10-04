// ============================================================
// API.JS — HTTP client cho Backend Express
// ============================================================
// - BASE: tự động lấy từ .env hoặc fallback "/api"
// - Token: lưu trong sessionStorage (mất khi đóng tab)
// - req(): wrapper fetch với error handling + timeout
// - api.*: các endpoint chia theo nhóm chức năng
// ============================================================

// ✅ Strip trailing slash — tránh BASE + "/menu" = "//menu"
const BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");

// Timeout mặc định cho mọi request (ms)
const DEFAULT_TIMEOUT_MS = 15000;

// ============================================================
// TOKEN HELPERS
// ============================================================

export function getToken() {
  return sessionStorage.getItem("token");
}

export function setToken(t) {
  if (t) sessionStorage.setItem("token", t);
  else sessionStorage.removeItem("token");
}

// ============================================================
// FETCH WRAPPER
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
      data.description ||
      `HTTP ${res.status}${res.statusText ? " " + res.statusText : ""}`;

    const err = new Error(message);
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data;
}

// ============================================================
// API ENDPOINTS
// ============================================================

export const api = {
  // Base URL hiện tại (dùng để debug)
  _base: BASE,

  // ----------------------------------------------------------
  // AUTH — Xác thực & tài khoản cá nhân
  // ----------------------------------------------------------
  login: (email, password) =>
    req("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (data) =>
    req("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  me: () => req("/auth/me"),

  updateProfile: (data) =>
    req("/auth/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  changePassword: (data) =>
    req("/auth/password", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // ----------------------------------------------------------
  // OAUTH — Đăng nhập mạng xã hội (Google / Facebook)
  // ----------------------------------------------------------
  // FE redirect user → provider consent screen
  // Provider redirect về /auth/{provider}/callback?code=xxx
  // FE gọi method dưới để exchange code → JWT
  oauth: {
    callback: (provider, code, redirectUri) =>
      req(`/auth/${provider}/callback`, {
        method: "POST",
        body: JSON.stringify({ code, redirectUri }),
      }),
  },

  // ----------------------------------------------------------
  // STATS — LayoutDashboard tổng quan
  // ----------------------------------------------------------
  stats: () => req("/stats"),

  // ----------------------------------------------------------
  // MENU — Thực đơn
  // ----------------------------------------------------------
  menu: {
    list: (q = "", category = "Tất cả", sort = "popular", all = false) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (category && category !== "Tất cả") params.set("category", category);
      if (sort) params.set("sort", sort);
      if (all) params.set("all", "1");
      const qs = params.toString();
      return req("/menu" + (qs ? "?" + qs : ""));
    },

    listActive: (q = "", category = "Tất cả", sort = "popular") => {
      const params = new URLSearchParams();
      params.set("active_only", "1");
      if (q) params.set("q", q);
      if (category && category !== "Tất cả") params.set("category", category);
      if (sort) params.set("sort", sort);
      return req("/menu?" + params.toString());
    },

    get:    (id)          => req(`/menu/${id}`),
    create: (data)        => req("/menu",       { method: "POST",   body: JSON.stringify(data) }),
    update: (id, data)    => req(`/menu/${id}`, { method: "PUT",    body: JSON.stringify(data) }),
    remove: (id)          => req(`/menu/${id}`, { method: "DELETE" }),
  },

  // ----------------------------------------------------------
  // PRICE HISTORY — Lịch sử đổi giá
  // ----------------------------------------------------------
  priceHistory: {
    list: (menuItemId) =>
      req("/price-history" + (menuItemId ? "?menu_item_id=" + menuItemId : "")),
  },

  // ----------------------------------------------------------
  // ORDERS — Đơn hàng
  // ----------------------------------------------------------
  orders: {
    create:    (data)        => req("/orders",              { method: "POST",  body: JSON.stringify(data) }),
    myOrders:  ()            => req("/orders/me"),
    all: (status = "Tất cả") => {
      const qs =
        status && status !== "Tất cả"
          ? `?status=${encodeURIComponent(status)}`
          : "";
      return req("/orders" + qs);
    },
    setStatus: (id, status)  => req(`/orders/${id}`,        { method: "PATCH", body: JSON.stringify({ status }) }),
    received:  (id)          => req(`/orders/${id}/received`, { method: "POST" }),
    cancel:    (id)          => req(`/orders/${id}/cancel`,   { method: "POST" }),
  },

  // ----------------------------------------------------------
  // USERS — Quản lý người dùng (chỉ ADMIN)
  // ----------------------------------------------------------
  users: {
    list:   (role)        => req(`/users${role ? `?role=${role}` : ""}`),
    create: (data)        => req("/users",       { method: "POST",   body: JSON.stringify(data) }),
    update: (id, data)    => req(`/users/${id}`, { method: "PUT",    body: JSON.stringify(data) }),
    remove: (id)          => req(`/users/${id}`, { method: "DELETE" }),

    // Giai đoạn 2 — Admin cấp lại mật khẩu tạm cho user:
    // server sinh mật khẩu ngẫu nhiên + bật cờ must_change_password
    resetPassword: (id) =>
      req(`/users/${id}/reset-password`, { method: "POST" }),
  },

  // ----------------------------------------------------------
  // INVENTORY — Kho hàng
  // ----------------------------------------------------------
  inventory: {
    list:    ()              => req("/inventory"),
    create:  (data)          => req("/inventory",                { method: "POST",   body: JSON.stringify(data) }),
    update:  (code, data)    => req(`/inventory/${code}`,         { method: "PUT",    body: JSON.stringify(data) }),
    remove:  (code)          => req(`/inventory/${code}`,         { method: "DELETE" }),
    import:  (code, data)    => req(`/inventory/${code}/import`,  { method: "POST",   body: JSON.stringify(data) }),
    imports: ()              => req("/inventory/imports"),
  },

  // ----------------------------------------------------------
  // ATTENDANCE — Chấm công
  // ----------------------------------------------------------
  attendance: {
    today:     ()        => req("/attendance/today"),
    me:        ()        => req("/attendance/me"),
    checkIn:   (data)    => req("/attendance/checkin",  { method: "POST", body: JSON.stringify(data || {}) }),
    checkOut:  (data)    => req("/attendance/checkout", { method: "POST", body: JSON.stringify(data || {}) }),
    all:       (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return req("/attendance" + (q ? `?${q}` : ""));
    },
    employees: ()        => req("/attendance/employees"),
  },

  // ----------------------------------------------------------
  // SHIFTS — Quản lý ca làm việc
  // ----------------------------------------------------------
  shifts: {
    approvedToday: () => req("/shifts/approved-today"),
    mine:          ()             => req("/shifts/me"),
    pending:       ()             => req("/shifts/pending"),
    all:           (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return req("/shifts" + (q ? `?${q}` : ""));
    },
    register:      (data)         => req("/shifts/register", { method: "POST", body: JSON.stringify(data) }),
    bulk:          (data)         => req("/shifts/bulk",     { method: "POST", body: JSON.stringify(data) }),
    create:        (data)         => req("/shifts",          { method: "POST", body: JSON.stringify(data) }),
    update:        (id, data)     => req(`/shifts/${id}`,    { method: "PUT",  body: JSON.stringify(data) }),
    remove:        (id)           => req(`/shifts/${id}`,    { method: "DELETE" }),
    approve:       (id)           => req(`/shifts/${id}/approve`, { method: "PATCH"  }),
    reject:        (id)           => req(`/shifts/${id}/reject`,  { method: "DELETE" }),
  },

  // ----------------------------------------------------------
  // WALLET — Ví Canteen
  // ----------------------------------------------------------
  wallet: {
    me:           ()            => req("/wallet/me"),
    transactions: ()            => req("/wallet/transactions"),
    deposit:      (data)        => req("/wallet/deposit",   { method: "POST", body: JSON.stringify(data) }),
    withdraw:     (data)        => req("/wallet/withdraw",  { method: "POST", body: JSON.stringify(data) }),
    linkBank:     (data)        => req("/wallet/link-bank", { method: "POST", body: JSON.stringify(data) }),
    pay:          (data)        => req("/wallet/pay",       { method: "POST", body: JSON.stringify(data) }),

    requests:     (status)      => req("/wallet/requests" + (status ? "?status=" + status : "")),
    all:          ()            => req("/wallet/all"),
    stats:        ()            => req("/wallet/stats"),
    approve:      (id, note)    => req(`/wallet/requests/${id}/approve`, {
      method: "PATCH",
      body: JSON.stringify({ admin_note: note || "" }),
    }),
    reject:       (id, note)    => req(`/wallet/requests/${id}/reject`, {
      method: "PATCH",
      body: JSON.stringify({ admin_note: note || "" }),
    }),
  },

  // ----------------------------------------------------------
  // REVIEWS — Đánh giá món ăn
  // ----------------------------------------------------------
  reviews: {
    me:        ()            => req("/reviews/me"),
    list:      (menuItemId)  => req(`/reviews/${menuItemId}`),
    create:    (data)        => req("/reviews", { method: "POST", body: JSON.stringify(data) }),
    canReview: (menuItemId)  => req(`/reviews/can-review/${menuItemId}`),
  },

  // ----------------------------------------------------------
  // POINTS — Điểm tích lũy
  // ----------------------------------------------------------
  points: {
    me:     ()      => req("/points/me"),
    redeem: (data)  => req("/points/redeem", { method: "POST", body: JSON.stringify(data) }),
  },

  // ----------------------------------------------------------
  // VOUCHERS — Khuyến mãi (khách hàng)
  // ----------------------------------------------------------
  vouchers: {
    me:       ()      => req("/vouchers/me"),
    public:   ()      => req("/vouchers/public"),
    validate: (code)  => req("/vouchers/validate", { method: "POST", body: JSON.stringify({ code }) }),
    claim:    (id)    => req(`/vouchers/claim/${id}`, { method: "POST" }),

    all:      ()          => req("/vouchers"),
    create:   (data)      => req("/vouchers",       { method: "POST",   body: JSON.stringify(data) }),
    update:   (id, data)  => req(`/vouchers/${id}`, { method: "PUT",    body: JSON.stringify(data) }),
    remove:   (id)        => req(`/vouchers/${id}`, { method: "DELETE" }),

    stats:    ()          => req("/vouchers/stats"),
    claims:   (templateId) => req(`/vouchers/claims/${templateId}`),
    ofUser:   (userId)    => req(`/vouchers/user/${userId}`),
    revoke:   (id)        => req(`/vouchers/revoke/${id}`, { method: "DELETE" }),
  },

  // ----------------------------------------------------------
  // NOTIFICATIONS — Thông báo
  // ----------------------------------------------------------
  notifications: {
    list:    ()      => req("/notifications"),
    read:    (id)    => req(`/notifications/${id}/read`, { method: "POST" }),
    readAll: ()      => req("/notifications/read-all",   { method: "POST" }),
  },

  // ----------------------------------------------------------
  // CHAT — Tin nhắn khách hàng ↔ nhân viên
  // ----------------------------------------------------------
  chat: {
    myMessages:    ()       => req("/chat/me"),
    conversations: ()       => req("/chat/conversations"),
    messagesWith:  (userId) => req(`/chat/with/${userId}`),
    send:          (data)   => req("/chat/send", { method: "POST", body: JSON.stringify(data) }),
  },

  // ----------------------------------------------------------
  // CATALOG — Topping / Size / LayoutGrid
  // ----------------------------------------------------------
  toppings: {
    list: (category) =>
      req(`/toppings${category ? `?category=${encodeURIComponent(category)}` : ""}`),
  },

  sizes: {
    list: () => req("/sizes"),
  },

  categories: {
    list:   ()          => req("/categories"),
    create: (data)      => req("/categories",       { method: "POST",   body: JSON.stringify(data) }),
    update: (id, data)  => req(`/categories/${id}`, { method: "PUT",    body: JSON.stringify(data) }),
    remove: (id)        => req(`/categories/${id}`, { method: "DELETE" }),
  },

  // ----------------------------------------------------------
  // PROMOTIONS — Món đang giảm giá (public)
  // ----------------------------------------------------------
  promotions: {
    list: () => req("/promotions"),
  },

  // ----------------------------------------------------------
  // PERMISSIONS — Phân quyền chi tiết
  // ----------------------------------------------------------
  permissions: {
    all:    ()              => req("/permissions"),
    me:     ()              => req("/permissions/me"),
    ofUser: (userId)        => req(`/permissions/${userId}`),
    update: (userId, custom) =>
      req(`/permissions/${userId}`, { method: "PUT", body: JSON.stringify({ custom }) }),
  },

  // ----------------------------------------------------------
  // BACKUP — Sao lưu / phục hồi database
  // ----------------------------------------------------------
  backup: {
    export: ()        => req("/backup/export"),
    import: (data)    => req("/backup/import", { method: "POST", body: JSON.stringify(data) }),
    reset:  (confirm) => req("/backup/reset",  { method: "POST", body: JSON.stringify({ confirm }) }),
    stats:  ()        => req("/backup/stats"),
  },

  // ----------------------------------------------------------
  // REPORTS — Báo cáo doanh thu
  // ----------------------------------------------------------
  reports: {
    revenue: (period = "day") => req(`/reports/revenue?period=${period}`),
  },

  // ----------------------------------------------------------
  // SETTINGS — Cài đặt hệ thống (bank, hotline, ...)
  // ----------------------------------------------------------
  settings: {
    get:    ()      => req("/settings"),
    update: (data)  => req("/settings", { method: "PUT", body: JSON.stringify(data) }),
  },

  // ----------------------------------------------------------
  // TIME SLOTS — Khung giờ nhận món
  // ----------------------------------------------------------
  timeSlots: {
    list: () => req("/time-slots"),

    update: (id, data) =>
      req(`/time-slots/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    reset: () => req("/time-slots/reset", { method: "POST" }),
  },
};
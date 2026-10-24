// src/api.js
const BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");
const DEFAULT_TIMEOUT_MS = 20000;
const UPLOAD_TIMEOUT_MS = 60000;
const MAX_RETRY_503 = 5;

let memoryToken = null;
let isAuthExpiredDispatched = false;
let refreshInFlight = null;

let storageAvailable = (() => {
  try {
    const k = "__test__";
    sessionStorage.setItem(k, "1");
    sessionStorage.removeItem(k);
    return true;
  } catch { return false; }
})();

export function getToken() {
  if (memoryToken) return memoryToken;
  if (storageAvailable) {
    try {
      const t = sessionStorage.getItem("token");
      if (t) { memoryToken = t; return t; }
    } catch { storageAvailable = false; }
  }
  return null;
}

export function setToken(t) {
  memoryToken = t || null;
  if (t) isAuthExpiredDispatched = false;
  if (storageAvailable) {
    try {
      if (t) sessionStorage.setItem("token", t);
      else sessionStorage.removeItem("token");
    } catch {}
  }
  try { window.dispatchEvent(new CustomEvent("token-changed", { detail: { hasToken: !!t } })); } catch {}
}

export function clearToken() { setToken(null); }
export function resetAuthExpiredFlag() { isAuthExpiredDispatched = false; }

const authChannel = typeof window !== "undefined" && "BroadcastChannel" in window ? new BroadcastChannel("vwa_auth") : null;
function broadcastAuthEvent(type) { try { authChannel?.postMessage({ type, ts: Date.now() }); } catch {} }

function dispatchAuthExpired() {
  if (isAuthExpiredDispatched) return;
  isAuthExpiredDispatched = true;
  try { window.dispatchEvent(new CustomEvent("auth-expired")); } catch {}
  broadcastAuthEvent("logout");
}

async function tryRefresh() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(BASE + "/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) return false;
      const data = await res.json().catch(() => ({}));
      if (data.token) setToken(data.token);
      return true;
    } catch { return false; }
    finally { refreshInFlight = null; }
  })();
  return refreshInFlight;
}

async function req(path, options = {}, _retryCount = 0) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(BASE + path, {
      ...options, headers, cache: "no-store", credentials: "include", signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") {
      const err = new Error("Yêu cầu quá thời gian."); err.status = 0; throw err;
    }
    if (_retryCount < 3 && (e.message.includes("Failed to fetch") || e.message.includes("Network"))) {
      await new Promise((r) => setTimeout(r, 1500 * (_retryCount + 1)));
      return req(path, options, _retryCount + 1);
    }
    const err = new Error("Không kết nối được máy chủ: " + (e.message || "unknown")); err.status = 0; throw err;
  } finally { clearTimeout(timeoutId); }

  // 503 — Vercel Cold Start, retry lên tới 5 lần với backoff
  if (res.status === 503 && _retryCount < MAX_RETRY_503) {
    await new Promise((r) => setTimeout(r, 2000 + _retryCount * 1000));
    return req(path, options, _retryCount + 1);
  }

  // 401 — thử refresh 1 lần trước khi đá văng
  if (res.status === 401 && token) {
    const isAuthEndpoint =
      path.includes("/auth/login") ||
      path.includes("/auth/register") ||
      path.includes("/auth/refresh") ||
      path.includes("/auth/logout") ||
      path.includes("/auth/me");

    if (!isAuthEndpoint && _retryCount < 2) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        return req(path, options, _retryCount + 1);
      }
    }

    if (!isAuthEndpoint) {
      clearToken();
      dispatchAuthExpired();
    }
  }

  const contentType = res.headers.get("content-type") || "";
  let data;
  try {
    if (contentType.includes("application/json")) data = await res.json();
    else { const text = await res.text(); data = text ? { message: text.slice(0, 300) } : {}; }
  } catch { data = {}; }

  if (!res.ok) {
    const message = data.message || data.error || `HTTP ${res.status}`;
    const err = new Error(message); err.status = res.status; err.body = data; throw err;
  }
  return data;
}

export const api = {
  _base: BASE,
  health: () => req(""),
  login: (email, password) => req("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }).then(r => {
    if (r.token) setToken(r.token);
    resetAuthExpiredFlag();
    return r;
  }),
  register: (data) => req("/auth/register", { method: "POST", body: JSON.stringify(data) }).then(r => {
    if (r.token) setToken(r.token);
    resetAuthExpiredFlag();
    return r;
  }),
  logout: () => req("/auth/logout", { method: "POST" }).catch(() => {}).finally(() => {
    clearToken();
    dispatchAuthExpired();
  }),
  me: () => req("/auth/me"),
  updateProfile: (data) => req("/auth/profile", { method: "PUT", body: JSON.stringify(data) }),
  changePassword: (data) => req("/auth/password", { method: "PUT", body: JSON.stringify(data) }),
  oauth: {
    callback: (provider, code, redirectUri) =>
      req(`/auth/${provider}/callback`, { method: "POST", body: JSON.stringify({ code, redirectUri }) }).then(r => {
        if (r.token) setToken(r.token);
        resetAuthExpiredFlag();
        return r;
      }),
  },
  stats: () => req("/stats"),
  menu: {
    list: (q = "", category = "Tất cả", sort = "popular") => {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (category && category !== "Tất cả") p.set("category", category);
      if (sort) p.set("sort", sort);
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
    get: (id) => req(`/menu/${id}`),
    create: (data) => req("/menu", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => req(`/menu/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => req(`/menu/${id}`, { method: "DELETE" }),
  },
  priceHistory: { list: (menuItemId) => req("/price-history" + (menuItemId ? "?menu_item_id=" + menuItemId : "")) },
  orders: {
    create: (data) => req("/orders", { method: "POST", body: JSON.stringify(data) }),
    myOrders: () => req("/orders/me"),
    all: (status = "Tất cả") => {
      const qs = status && status !== "Tất cả" ? `?status=${encodeURIComponent(status)}` : "";
      return req("/orders" + qs);
    },
    setStatus: (id, status) => req(`/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    received: (id) => req(`/orders/${id}/received`, { method: "POST" }),
    lookupQr: (orderCode) => req("/orders/scan-pickup/lookup", { method: "POST", body: JSON.stringify({ orderCode }) }),
    publicQrLookup: (code) => req(`/orders/public-qr/${encodeURIComponent(code)}`),
    scanReceived: (id) => req(`/orders/${id}/scan-received`, { method: "POST" }),
    cancel: (id) => req(`/orders/${id}/cancel`, { method: "POST" }),
    remind: (id, data) => req(`/orders/${id}/reminder`, { method: "POST", body: JSON.stringify(data || {}) }),
    call: (id, data) => req(`/orders/${id}/call`, { method: "POST", body: JSON.stringify(data || {}) }),
    approveGreen: (id) => req(`/orders/${id}/green/approve`, { method: "POST" }),
    rejectGreen: (id, reason) => req(`/orders/${id}/green/reject`, { method: "POST", body: JSON.stringify({ reason: reason || "" }) }),
  },
  users: {
    list: (role) => req(`/users${role ? `?role=${role}` : ""}`),
    listByRole: (role) => req(`/users?role=${encodeURIComponent(role)}`),
    create: (data) => req("/users", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => req(`/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => req(`/users/${id}`, { method: "DELETE" }),
    resetPassword: (id) => req(`/users/${id}/reset-password`, { method: "POST" }),
    setPoints: (id, data) => req(`/users/${id}/points`, { method: "PUT", body: JSON.stringify(data) }),
    schoolInfo: (id, data) => req(`/users/${id}/school-info`, { method: "PUT", body: JSON.stringify(data) }),
    unlinkMssv: (id) => req(`/users/${id}/unlink-mssv`, { method: "DELETE" }),
  },
  school: {
    parseStudent: (code) => req(`/school/parse-student/${encodeURIComponent(code)}`),
    parseTeacher: (code) => req(`/school/parse-teacher/${encodeURIComponent(code)}`),
    majorsMap: () => req("/school/majors-map"),
    updateMajorsMap: (map) => req("/school/majors-map", { method: "PUT", body: JSON.stringify({ map }) }),
    resetMajorsMap: () => req("/school/majors-map/reset", { method: "POST" }),
  },
  inventory: {
    list: () => req("/inventory"),
    create: (data) => req("/inventory", { method: "POST", body: JSON.stringify(data) }),
    update: (code, data) => req(`/inventory/${code}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (code) => req(`/inventory/${code}`, { method: "DELETE" }),
    import: (code, data) => req(`/inventory/${code}/import`, { method: "POST", body: JSON.stringify(data) }),
    imports: () => req("/inventory/imports"),
  },
  attendance: {
    today: () => req("/attendance/today"),
    me: () => req("/attendance/me"),
    checkIn: (data) => req("/attendance/checkin", { method: "POST", body: JSON.stringify(data || {}) }),
    checkOut: (data) => req("/attendance/checkout", { method: "POST", body: JSON.stringify(data || {}) }),
    all: (params = {}) => { const q = new URLSearchParams(params).toString(); return req("/attendance" + (q ? `?${q}` : "")); },
    employees: () => req("/attendance/employees"),
  },
  shifts: {
    approvedToday: () => req("/shifts/approved-today"),
    currentStaff: () => req("/shifts/current-staff"),
    mine: () => req("/shifts/me"),
    pending: () => req("/shifts/pending"),
    all: (params = {}) => { const q = new URLSearchParams(params).toString(); return req("/shifts" + (q ? `?${q}` : "")); },
    register: (data) => req("/shifts/register", { method: "POST", body: JSON.stringify(data) }),
    bulk: (data) => req("/shifts/bulk", { method: "POST", body: JSON.stringify(data) }),
    create: (data) => req("/shifts", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => req(`/shifts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => req(`/shifts/${id}`, { method: "DELETE" }),
    approve: (id) => req(`/shifts/${id}/approve`, { method: "PATCH" }),
    reject: (id) => req(`/shifts/${id}/reject`, { method: "DELETE" }),
  },
  tasks: {
    me: () => req("/tasks/me"),
    all: (params = {}) => { const q = new URLSearchParams(params).toString(); return req("/tasks" + (q ? `?${q}` : "")); },
    create: (data) => req("/tasks", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => req(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => req(`/tasks/${id}`, { method: "DELETE" }),
    complete: (id) => req(`/tasks/${id}/complete`, { method: "PATCH" }),
  },
  wallet: {
    me: () => req("/wallet/me"),
    transactions: () => req("/wallet/transactions"),
    deposit: (data) => req("/wallet/deposit", { method: "POST", body: JSON.stringify(data) }),
    withdraw: (data) => req("/wallet/withdraw", { method: "POST", body: JSON.stringify(data) }),
    linkBank: (data) => req("/wallet/link-bank", { method: "POST", body: JSON.stringify(data) }),
    pay: (data) => req("/wallet/pay", { method: "POST", body: JSON.stringify(data) }),
    requests: (status) => req("/wallet/requests" + (status ? "?status=" + status : "")),
    all: () => req("/wallet/all"),
    stats: () => req("/wallet/stats"),
    approve: (id, note) => req(`/wallet/requests/${id}/approve`, { method: "PATCH", body: JSON.stringify({ admin_note: note || "" }) }),
    reject: (id, note) => req(`/wallet/requests/${id}/reject`, { method: "PATCH", body: JSON.stringify({ admin_note: note || "" }) }),
  },
  ecoRewards: {
    me: () => req("/eco-rewards/me"),
    create: (data) => req("/eco-rewards", { method: "POST", body: JSON.stringify(data) }),
    pending: () => req("/eco-rewards/pending"),
    decide: (id, status) => req(`/eco-rewards/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  },
  reviews: {
    me: () => req("/reviews/me"),
    list: (menuItemId) => req(`/reviews/${menuItemId}`),
    create: (data) => req("/reviews", { method: "POST", body: JSON.stringify(data) }),
    canReview: (menuItemId) => req(`/reviews/can-review/${menuItemId}`),
  },
  points: {
    history: () => req("/points/history"),
    me: () => req("/points/me"),
    redeem: (data) => req("/points/redeem", { method: "POST", body: JSON.stringify(data) }),
    config: () => req("/points/config"),
    updateConfig: (data) => req("/points/config", { method: "PUT", body: JSON.stringify(data) }),
    preview: (data) => req("/points/preview", { method: "POST", body: JSON.stringify(data) }),
  },
  vouchers: {
    me: () => req("/vouchers/me"),
    public: () => req("/vouchers/public"),
    validate: (code) => req("/vouchers/validate", { method: "POST", body: JSON.stringify({ code }) }),
    claim: (id) => req(`/vouchers/claim/${id}`, { method: "POST" }),
    all: () => req("/vouchers"),
    create: (data) => req("/vouchers", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => req(`/vouchers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => req(`/vouchers/${id}`, { method: "DELETE" }),
    stats: () => req("/vouchers/stats"),
    claims: (templateId) => req(`/vouchers/claims/${templateId}`),
    ofUser: (userId) => req(`/vouchers/user/${userId}`),
    revoke: (id) => req(`/vouchers/revoke/${id}`, { method: "DELETE" }),
  },
  notifications: {
    list: () => req("/notifications"),
    read: (id) => req(`/notifications/${id}/read`, { method: "POST" }),
    readAll: () => req("/notifications/read-all", { method: "POST" }),
  },
  chat: {
    myMessages: () => req("/chat/me"),
    conversations: () => req("/chat/conversations"),
    messagesWith: (userId) => req(`/chat/with/${userId}`),
    send: (data) => req("/chat/send", { method: "POST", body: JSON.stringify(data) }),
    getContext: (userId) => req(`/chat/context/${userId}`),
    admin: {
      conversations: (params = {}) => { const q = new URLSearchParams(params).toString(); return req("/chat/admin/conversations" + (q ? `?${q}` : "")); },
      messagesWith: (userId) => req(`/chat/admin/messages/${userId}`),
      staffStatus: () => req("/chat/admin/staff-status"),
      toggleStaff: (id, enabled) => req(`/chat/admin/staff/${id}/chat`, { method: "PATCH", body: JSON.stringify({ enabled: !!enabled }) }),
      toggleGlobal: (enabled) => req("/chat/admin/global-chat", { method: "PATCH", body: JSON.stringify({ enabled: !!enabled }) }),
      transferRequests: (status = "pending") => req(`/chat/admin/transfer-requests?status=${encodeURIComponent(status)}`),
      resolveTransfer: (id, status, note = "") => req(`/chat/admin/transfer-requests/${id}`, { method: "PATCH", body: JSON.stringify({ status, note }) }),
      requestTransfer: (data) => req("/chat/transfer-request", { method: "POST", body: JSON.stringify(data || {}) }),
      takeover: (userId) => req(`/chat/admin/takeover/${userId}`, { method: "POST" }),
      release: (userId) => req(`/chat/admin/release/${userId}`, { method: "POST" }),
      myChatStatus: () => req("/chat/my-status"),
    },
  },
  toppings: { list: (category) => req(`/toppings${category ? `?category=${encodeURIComponent(category)}` : ""}`) },
  sizes: { list: () => req("/sizes") },
  categories: {
    list: () => req("/categories"),
    create: (data) => req("/categories", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => req(`/categories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id) => req(`/categories/${id}`, { method: "DELETE" }),
  },
  promotions: { list: () => req("/promotions") },
  permissions: {
    all: () => req("/permissions"),
    me: () => req("/permissions/me"),
    ofUser: (userId) => req(`/permissions/${userId}`),
    update: (userId, custom) => req(`/permissions/${userId}`, { method: "PUT", body: JSON.stringify({ custom }) }),
  },
  backup: {
    export: () => req("/backup/export"),
    import: (data) => req("/backup/import", { method: "POST", body: JSON.stringify(data), timeoutMs: UPLOAD_TIMEOUT_MS }),
    reset: (confirm) => req("/backup/reset", { method: "POST", body: JSON.stringify({ confirm }) }),
    stats: () => req("/backup/stats"),
  },
  reports: { revenue: (period = "day") => req(`/reports/revenue?period=${period}`) },
  settings: {
    get: () => req("/settings"),
    update: (data) => req("/settings", { method: "PUT", body: JSON.stringify(data) }),
  },
  timeSlots: {
    list: () => req("/time-slots"),
    update: (id, data) => req(`/time-slots/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }),
    reset: () => req("/time-slots/reset", { method: "POST" }),
  },
  admin: { backfill: () => req("/admin/backfill-translations", { method: "POST" }) },
};

if (typeof window !== "undefined" && authChannel) {
  authChannel.onmessage = (e) => {
    if (e.data?.type === "logout") { try { window.dispatchEvent(new CustomEvent("auth-expired")); } catch {} }
  };
}
export default api;
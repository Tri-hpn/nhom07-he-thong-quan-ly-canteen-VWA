// ============================================================
// SIDEBAR.JSX — Sidebar cho ADMIN & EMPLOYEE (V9 - FINAL)
// ============================================================
// V9 (2026-10):
//   - ✅ Thêm menu "Chat & Hỗ trợ" cho ADMIN (/owner/chat)
//   - ✅ Badge số yêu cầu chuyển tiếp chat đang chờ
//   - Giữ V8: label dùng key có trong en.json
// ============================================================

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Utensils, ShoppingBag, Users, UserCog, Warehouse,
  BarChart3, LogOut, ClipboardList, Bell, UserRound, CreditCard,
  MessageCircle, CalendarCheck, Database, TrendingUp, Shield, Wallet,
  Ticket, Sun, ChefHat, Megaphone, Package, Receipt, CheckSquare,
  ShieldCheck, Kanban, History, BellRing, ReceiptText, UtensilsCrossed,
  LayoutGrid, BadgeCheck, Activity, Settings,
} from "lucide-react";
import { api } from "../api";
import { useI18n } from "../hooks/useI18n";
import { LogoVWACompact } from "./LogoVWA";

const POLL_MS = 30000;
const BADGE_MAX = 99;

const ICONS = {
  dashboard: LayoutDashboard,
  menu: Utensils,
  orders: ShoppingBag,
  customers: Users,
  employees: UserCog,
  inventory: Warehouse,
  reports: BarChart3,
  process: ClipboardList,
  notifications: Bell,
  profile: UserRound,
  points: Ticket,
  chat: MessageCircle,
  attendance: CalendarCheck,
  backup: Database,
  price: TrendingUp,
  permissions: Shield,
  orders_admin: ShoppingBag,
  finance: Wallet,
  vouchers: Ticket,
  promotions: Ticket,
  wallet: CreditCard,
  wallet_admin: CreditCard,
  kds_kanban: Kanban,
  kds_prep: ChefHat,
  kds_history: History,
  kds_menu: UtensilsCrossed,
  kds_attendance: CalendarCheck,
  kds_alerts: BellRing,
};

const MENU_CONFIG = {
  ADMIN: {
    zones: [
      {
        label: null,
        items: [
          ["dashboard",    "Tổng quan",           "/owner"],
          ["orders_admin", "Đơn hàng",            "/owner/orders"],
          ["menu",         "Thực đơn",            "/owner/menu"],
          ["price",        "Lịch sử giá",         "/owner/price-history"],
          ["inventory",    "Kho hàng",            "/owner/inventory"],
          ["vouchers",     "Voucher",             "/owner/vouchers"],
          ["finance",      "Báo cáo tài chính", "/owner/finance"],
          ["wallet_admin", "Ví",                  "/owner/wallet"],
          ["employees",    "Quản lý nhân viên",   "/owner/employees"],
          ["customers",    "Khách hàng",          "/owner/customers"],
          // ✅ V9: Chat & Hỗ trợ
          ["chat",         "Chat & Hỗ trợ",       "/owner/chat", { badge: "chat" }],
          ["permissions",  "Phân quyền",          "/owner/permissions"],
          ["backup",       "Backup dữ liệu",      "/owner/backup"],
        ],
      },
    ],
  },
  EMPLOYEE: {
    zones: [
      {
        label: "Nhân viên & Bếp (KDS)",
        items: [
          ["dashboard",   "Tổng quan ca làm việc", "/employee"],
          ["kds_kanban",  "Bàn làm việc (Kanban)", "/employee/orders", { badge: "kds_kanban" }],
          ["kds_menu",    "Thực đơn & Kho",        "/employee/menu"],
          ["kds_history", "Ca làm việc",           "/employee/shifts"],
          ["kds_alerts",  "Thông báo khẩn",        "/employee/chat"],
        ],
      },
    ],
  },
  CUSTOMER: {
    zones: [
      {
        label: null,
        items: [
          ["dashboard",  "Trang chủ",             "/customer"],
          ["menu",       "Thực đơn",              "/customer/menu"],
          ["orders",     "Đơn hàng",              "/customer/orders"],
          ["wallet",     "Ví",                    "/customer/wallet"],
          ["promotions", "Khuyến mãi & Ưu đãi",   "/customer/promotions"],
          ["chat",       "Chat hỗ trợ",           "/customer/chat"],
          ["profile",    "Hồ sơ",                 "/customer/profile"],
        ],
      },
    ],
  },
};

const PROFILE_CONFIG = {
  ADMIN:    { to: "/owner/profile",    label: "Quản trị viên" },
  EMPLOYEE: { to: "/employee/profile", label: "Nhân viên" },
  CUSTOMER: { to: "/customer/profile", label: "Khách hàng" },
};

const ROOT_PATHS = ["/owner", "/employee", "/customer"];

function splitTo(to) {
  const raw = String(to || "");
  const i = raw.indexOf("?");
  return i < 0
    ? { path: raw, query: "" }
    : { path: raw.slice(0, i), query: raw.slice(i + 1) };
}

function pathMatches(path, pathname) {
  if (ROOT_PATHS.includes(path)) return pathname === path;
  return pathname === path || pathname.startsWith(path + "/");
}

function queryMatches(query, search) {
  const want = new URLSearchParams(query);
  const keys = [...want.keys()];
  if (keys.length === 0) return false;
  const current = new URLSearchParams(search);
  return keys.every((k) => current.get(k) === want.get(k));
}

function isNavItemActive(to, siblings, location) {
  const { path, query } = splitTo(to);
  if (!pathMatches(path, location.pathname)) return false;
  if (query) return queryMatches(query, location.search);
  return !siblings.some((it) => {
    const q = splitTo(it).query;
    return q ? queryMatches(q, location.search) : false;
  });
}

function getInitials(name) {
  if (!name) return "VWA";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "VWA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function readCartCount() {
  try {
    const raw = localStorage.getItem("canteen_cart");
    const cart = raw ? JSON.parse(raw) : {};
    if (!cart || typeof cart !== "object") return 0;
    return Object.values(cart).reduce(
      (s, m) => s + (Number(m?.qty) || 0),
      0
    );
  } catch {
    return 0;
  }
}

function readLastSeen(key) {
  try {
    return parseInt(localStorage.getItem(key) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function StaffSidebarUser({ user, onLogout, t }) {
  if (!user) return null;

  return (
    <div className="staff-sidebar-user">
      <div className="staff-sidebar-user__row">
        <div className="staff-sidebar-user__avatar">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.name || t("Avatar")}
              onError={(e) => {
                e.target.onerror = null;
                e.target.style.display = "none";
              }}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            getInitials(user.name)
          )}
        </div>
        <div className="staff-sidebar-user__info">
          <span className="staff-sidebar-user__name">
            {user.name || t("Nhân viên")}
          </span>
          <span className="staff-sidebar-user__role">
            {user.employeeCode || "NV-2024-08"} • {t("Quầy 01")}
          </span>
        </div>
      </div>

      <div className="staff-sidebar-user__footer">
        <span className="staff-sidebar-user__tag">
          {t("Thu ngân / ĐP Bếp")}
        </span>
        <button
          type="button"
          className="staff-sidebar-user__logout"
          onClick={onLogout}
          title={t("Đăng xuất")}
          aria-label={t("Đăng xuất")}
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
}

function ProfileLink({ user, role, onNavClick, t }) {
  const cfg = PROFILE_CONFIG[role];
  if (!cfg || !user) return null;

  const initials = getInitials(user.name);

  return (
    <Link
      to={cfg.to}
      onClick={onNavClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        marginTop: 10,
        background: "transparent",
        borderRadius: 12,
        textDecoration: "none",
        transition: "background 0.2s",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--sky-100, #E0F2FE)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "transparent")
      }
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background:
            "linear-gradient(135deg, var(--sky-400, #38BDF8), var(--sky-600, #0284C7))",
          color: "#fff",
          display: "grid",
          placeItems: "center",
          fontSize: 13,
          fontWeight: 700,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={user.name || t("Avatar")}
            onError={(e) => {
              e.target.onerror = null;
              e.target.style.display = "none";
            }}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          initials
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <b
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--sky-ink-900, #0F172A)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {user.name || t("Khách")}
        </b>
        <small
          style={{
            display: "block",
            fontSize: 11,
            color: "var(--sky-ink-500, #64748B)",
          }}
        >
          {t(cfg.label)}
        </small>
      </div>
    </Link>
  );
}

export default function Sidebar({ role, onLogout, user }) {
  const { t } = useI18n();

  const [open, setOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [orderPending, setOrderPending] = useState(0);
  const [voucherCount, setVoucherCount] = useState(0);
  const [kdsCount, setKdsCount] = useState(0);
  const [prepCount, setPrepCount] = useState(0);
  // ✅ V9: badge số yêu cầu chuyển tiếp chat
  const [chatTransferCount, setChatTransferCount] = useState(0);

  const [tabVisible, setTabVisible] = useState(
    typeof document === "undefined" || !document.hidden
  );

  const fetchReqIdRef = useRef(0);
  const isStaff = role === "EMPLOYEE";

  const location = useLocation();

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("toggle-sidebar", toggle);
    return () => window.removeEventListener("toggle-sidebar", toggle);
  }, []);

  useEffect(() => {
    const handler = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (document.body.style.overflow === "hidden") {
        document.body.style.overflow = prev;
      }
    };
  }, [open]);

  useEffect(() => {
    if (open) document.body.classList.add("sidebar-open");
    else document.body.classList.remove("sidebar-open");
    return () => document.body.classList.remove("sidebar-open");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const readCart = useCallback(() => {
    setCartCount(readCartCount());
  }, []);

  useEffect(() => {
    if (role !== "CUSTOMER") return;
    readCart();
    const handler = () => readCart();
    window.addEventListener("cart-updated", handler);
    window.addEventListener("refresh-cart", handler);
    return () => {
      window.removeEventListener("cart-updated", handler);
      window.removeEventListener("refresh-cart", handler);
    };
  }, [role, readCart]);

  const fetchCounts = useCallback(async () => {
    const myReqId = ++fetchReqIdRef.current;
    try {
      if (role === "CUSTOMER") {
        const [orders, vouchers] = await Promise.all([
          api.orders.myOrders().catch(() => []),
          api.vouchers.me().catch(() => []),
        ]);

        if (myReqId !== fetchReqIdRef.current) return;

        const lastSeen = readLastSeen("orders_last_seen");
        const pending = (Array.isArray(orders) ? orders : []).filter(
          (o) => {
            const created = new Date(o?.created_at || 0).getTime();
            return !isNaN(created) && created > lastSeen;
          }
        ).length;
        setOrderPending(pending);

        const lastSeenPoints = readLastSeen("points_last_seen");
        const available = (
          Array.isArray(vouchers) ? vouchers : []
        ).filter((v) => {
          if (v?.used) return false;
          const created = new Date(v?.created_at || 0).getTime();
          return !isNaN(created) && created > lastSeenPoints;
        }).length;
        setVoucherCount(available);
      } else if (role === "EMPLOYEE") {
        const orders = await api.orders.all("Tất cả").catch(() => []);
        if (myReqId !== fetchReqIdRef.current) return;

        const list = Array.isArray(orders) ? orders : [];

        const kanbanCount = list.filter(
          (o) => o.status === "Chờ xác nhận"
        ).length;
        const prepCountValue = list.filter(
          (o) => o.status === "Đang chuẩn bị"
        ).length;

        setKdsCount(kanbanCount);
        setPrepCount(prepCountValue);
      } else if (role === "ADMIN") {
        // ✅ V9: đếm yêu cầu chuyển tiếp chat đang chờ
        const pending = await api.chat.admin
          .transferRequests("pending")
          .catch(() => []);
        if (myReqId !== fetchReqIdRef.current) return;
        setChatTransferCount(Array.isArray(pending) ? pending.length : 0);
      }
    } catch {
      if (myReqId === fetchReqIdRef.current) {
        setOrderPending(0);
        setVoucherCount(0);
        setKdsCount(0);
        setPrepCount(0);
        setChatTransferCount(0);
      }
    }
  }, [role]);

  useEffect(() => {
    if (
      role !== "CUSTOMER" &&
      role !== "EMPLOYEE" &&
      role !== "ADMIN"
    )
      return;

    fetchCounts();
    if (!tabVisible) return;

    const interval = setInterval(fetchCounts, POLL_MS);

    const onRefresh = () => fetchCounts();
    window.addEventListener("refresh-user", onRefresh);
    window.addEventListener("order-updated", onRefresh);
    window.addEventListener("points-seen", onRefresh);
    window.addEventListener("order-reviewed", onRefresh);
    window.addEventListener("orders-seen", onRefresh);
    // ✅ V9: refresh badge khi resolve transfer
    window.addEventListener("chat-transfer-updated", onRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener("refresh-user", onRefresh);
      window.removeEventListener("order-updated", onRefresh);
      window.removeEventListener("points-seen", onRefresh);
      window.removeEventListener("order-reviewed", onRefresh);
      window.removeEventListener("orders-seen", onRefresh);
      window.removeEventListener("chat-transfer-updated", onRefresh);
    };
  }, [role, fetchCounts, tabVisible]);

  const config = useMemo(
    () => MENU_CONFIG[role] || MENU_CONFIG.CUSTOMER,
    [role]
  );

  const getBadge = useCallback(
    (key) => {
      if (key === "orders" && orderPending > 0) return orderPending;
      if (key === "promotions" && voucherCount > 0) return voucherCount;

      if (
        (key === "kds_kanban" || key === "kds") &&
        kdsCount > 0
      ) {
        return kdsCount;
      }

      if (
        (key === "prep" || key === "kds_prep") &&
        prepCount > 0
      ) {
        return prepCount;
      }

      // ✅ V9: badge chat transfer cho ADMIN
      if (key === "chat" && chatTransferCount > 0) {
        return chatTransferCount;
      }

      return 0;
    },
    [orderPending, voucherCount, kdsCount, prepCount, chatTransferCount]
  );

  const closeSidebar = () => setOpen(false);

  return (
    <>
      {open && (
        <div
          className="mobile-overlay active"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      <aside
        className={"sidebar " + (open ? "mobile-open" : "")}
        aria-label={t("Điều hướng chính")}
      >
        <div className="brand">
          <LogoVWACompact size={40} />

          <div className="brand-text">
            <strong>CANTEEN VWA</strong>
            <small>{isStaff ? t("KDS/SAAS") : "VWA"}</small>
          </div>
        </div>

        {!isStaff && (
          <div className="role-chip">
            {role === "ADMIN" ? t("Quản trị viên") : t("Khách hàng")}
          </div>
        )}

        <nav>
          {config.zones.map((zone, zIdx) => (
            <div key={zIdx}>
              {zone.label && (
                <div className="staff-sidebar-zone-label">
                  {t(zone.label)}
                </div>
              )}

              {zone.items.map((item) => {
                const [key, label, to, opts] = item;
                const Icon = ICONS[key] || ShoppingBag;
                const badge = getBadge(opts?.badge || key);
                const itemPaths = zone.items.map((it) => it[2]);
                const active = isNavItemActive(to, itemPaths, location);

                return (
                  <NavLink
                    key={to + label + key}
                    to={to}
                    className={() =>
                      "nav-link " + (active ? "active" : "")
                    }
                    aria-current={active ? "page" : null}
                    onClick={closeSidebar}
                  >
                    <Icon size={18} />
                    <span>{t(label)}</span>
                    {badge > 0 && (
                      <span
                        className="nav-badge"
                        aria-label={`${badge} ${t("mới")}`}
                      >
                        {badge > BADGE_MAX ? `${BADGE_MAX}+` : badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {isStaff && (
          <div className="staff-sidebar-node">
            <div className="staff-sidebar-node__left">
              <span className="staff-sidebar-node__dot" />
              <span>POS Node #01</span>
            </div>
            <span className="staff-sidebar-node__version">v2.4.0</span>
          </div>
        )}

        {isStaff ? (
          <StaffSidebarUser user={user} onLogout={onLogout} t={t} />
        ) : (
          <>
            <ProfileLink
              user={user}
              role={role}
              onNavClick={closeSidebar}
              t={t}
            />
            <button
              type="button"
              className="logout-btn"
              onClick={onLogout}
            >
              <LogOut size={18} /> {t("Đăng xuất")}
            </button>
          </>
        )}
      </aside>
    </>
  );
}
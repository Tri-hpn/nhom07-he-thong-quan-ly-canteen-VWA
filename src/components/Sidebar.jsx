// ============================================================
// SIDEBAR.JSX — Sidebar cho ADMIN & EMPLOYEE (V12 - FINAL)
// ============================================================
// V12 (2026-10):
//   - ✅ Cập nhật lại menu EMPLOYEE: Đơn hàng, Thực đơn và kho, Ca làm việc, Chat và hỗ trợ.
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
          ["orders_admin", "Quản lý đơn hàng",            "/owner/orders"],
          ["menu",         "Quản lý thực đơn",            "/owner/menu"],
          ["inventory",    "Quản lý kho hàng",            "/owner/inventory"],
          ["vouchers",     "Quản lý voucher",             "/owner/vouchers"],
          ["finance",      "Báo cáo tài chính",   "/owner/finance"],
          ["wallet_admin", "Quản lý ví",                  "/owner/wallet"],
          ["employees",    "Quản lý nhân viên",   "/owner/employees"],
          ["customers",    "Quản lý khách hàng",          "/owner/customers"],
          ["chat",         "Chat & Hỗ trợ",       "/owner/chat", { badge: "chat" }],
          ["backup",       "Backup dữ liệu",      "/owner/backup"],
        ],
      },
    ],
  },
  EMPLOYEE: {
    zones: [
      {
        label: null,
        items: [
          ["dashboard",   "Tổng quan ca làm việc", "/employee"],
          ["orders",      "Quản lý đơn hàng",              "/employee/orders", { badge: "kds_kanban" }],
          ["kds_menu",    "Thực đơn và kho",       "/employee/menu"],
          ["kds_history", "Ca làm việc",           "/employee/shifts"],
          ["chat",        "Chat và hỗ trợ",        "/employee/chat"],
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
          ["menu",       "Quản lý thực đơn",              "/customer/menu"],
          ["orders",     "Quản lý đơn hàng",              "/customer/orders"],
          ["wallet",     "Quản lý ví",                    "/customer/wallet"],
          ["promotions", "Khuyến mãi & Ưu đãi",   "/customer/promotions"],
          ["chat",       "Chat hỗ trợ",           "/customer/chat"],
          ["profile",    "Hồ sơ",                 "/customer/profile"],
        ],
      },
    ],
  },
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

export default function Sidebar({ role, onLogout, user }) {
  const { t } = useI18n();

  const [open, setOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [orderPending, setOrderPending] = useState(0);
  const [voucherCount, setVoucherCount] = useState(0);
  const [kdsCount, setKdsCount] = useState(0);
  const [prepCount, setPrepCount] = useState(0);
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
      if ((key === "kds_kanban" || key === "kds") && kdsCount > 0) return kdsCount;
      if ((key === "prep" || key === "kds_prep") && prepCount > 0) return prepCount;
      if (key === "chat" && chatTransferCount > 0) return chatTransferCount;
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

        {/* Role chip đồng bộ cho cả 3 role */}
        <div className="role-chip">
          {role === "ADMIN" ? t("Quản trị viên") : role === "EMPLOYEE" ? t("Nhân viên") : t("Quản lý khách hàng")}
        </div>

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
      </aside>
    </>
  );
}
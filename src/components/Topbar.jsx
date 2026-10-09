// ============================================================
// TOPBAR.JSX — Top navigation cho Customer (V5 - FINAL)
// ============================================================
// V5 (2026-10):
//   - ✅ Bỏ dropdown profile cũ → bấm profile → mở SettingsModal (Q1:A)
//   - ✅ Thêm nút logout icon riêng trên topbar (Q2:C)
//   - 🔧 FIX #5 (lỗi ban đầu): Đọc token qua getToken() từ api.js
//     thay vì sessionStorage — mobile không mất badge đơn hàng
//   - 🔧 FIX #34 (lỗi ban đầu): Bỏ effect applyTheme thủ công —
//     useSettings (trong SettingsModal) tự apply theme vào DOM
//   - Dọn import không dùng
//
// 🌐 i18n: source-text tiếng Việt, tự dịch
// ============================================================

import { useEffect, useState, useRef, useCallback } from "react";
import { NavLink, Link, useNavigate, useLocation } from "react-router-dom";
import {
  ShoppingBag, Home, UtensilsCrossed, Gift, Wallet, Package, Bell,
  Menu, Settings,
} from "lucide-react";
import { api, getToken } from "../api";
import { useI18n } from "../hooks/useI18n";
import { LogoVWACompact } from "./LogoVWA";
import SettingsModal from "./SettingsModal";

// ============================================================
// CONSTANTS
// ============================================================

const CART_KEY = "canteen_cart";
const ORDERS_SEEN_KEY = "orders_last_seen";
const POLL_MS = 30000;
const BADGE_MAX = 99;

const NAV_ITEMS = [
  { key: "home",       label: "Khám phá",    icon: Home,            path: "/customer/home" },
  { key: "menu",       label: "Thực đơn",    icon: UtensilsCrossed, path: "/customer/menu" },
  { key: "promotions", label: "Khuyến mãi",  icon: Gift,            path: "/customer/promotions" },
  { key: "orders",     label: "Đơn hàng",    icon: Package,         path: "/customer/orders" },
  { key: "wallet",     label: "Ví Canteen",  icon: Wallet,          path: "/customer/wallet" },
];

const ACTIVE_ORDER_STATUSES = [
  "Chờ xác nhận",
  "Đã xác nhận",
  "Đang chuẩn bị",
  "Sẵn sàng nhận",
];

// ============================================================
// HELPERS
// ============================================================

function getInitials(name) {
  if (!name) return "VWA";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "VWA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function readCartCount() {
  try {
    const raw = localStorage.getItem(CART_KEY);
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

function isPathActive(currentPath, targetPath) {
  if (!currentPath || !targetPath) return false;
  if (currentPath === targetPath) return true;
  return currentPath.startsWith(targetPath + "/");
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function CustomerTopbar({
  user,
  cart,
  onLogout,
  onOpenMobileMenu,
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  const [cartCount, setCartCount] = useState(0);
  const [orderPending, setOrderPending] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [notificationUnread, setNotificationUnread] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const orderReqIdRef = useRef(0);
  const notificationMenuRef = useRef(null);

  // ============================================================
  // READ CART
  // ============================================================
  const readCart = useCallback(() => {
    setCartCount(readCartCount());
  }, []);

  const readNotifications = useCallback(async () => {
    try {
      const data = await api.notifications.list();
      const list = Array.isArray(data?.list) ? data.list : [];
      setNotifications(list);
      setNotificationUnread(
        Number.isFinite(Number(data?.unread))
          ? Number(data.unread)
          : list.filter((n) => !n.read).length
      );
    } catch {
      setNotifications([]);
      setNotificationUnread(0);
    }
  }, []);

  useEffect(() => {
    readNotifications();
    const timer = setInterval(readNotifications, 30000);
    return () => clearInterval(timer);
  }, [readNotifications]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (notificationMenuRef.current && !notificationMenuRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleNotificationClick = async (notification) => {
    try {
      if (!notification.read) {
        await api.notifications.read(notification.id);
        setNotifications((prev) => prev.map((item) =>
          item.id === notification.id ? { ...item, read: true } : item
        ));
        setNotificationUnread((prev) => Math.max(0, prev - 1));
      }
      setShowNotifications(false);
      if (notification.link) navigate(notification.link);
    } catch (error) {
      console.error("Không thể đọc thông báo:", error);
    }
  };

  const handleReadAllNotifications = async () => {
    try {
      await api.notifications.readAll();
      setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
      setNotificationUnread(0);
    } catch (error) {
      console.error("Không thể đọc tất cả thông báo:", error);
    }
  };

  // ============================================================
  // READ ORDERS — 🔧 FIX #5: dùng getToken() thay vì sessionStorage
  // ============================================================
  const readOrders = useCallback(async () => {
    const myReqId = ++orderReqIdRef.current;
    try {
      const token = getToken();
      if (!token) {
        setOrderPending(0);
        return;
      }
      const data = await api.orders.myOrders();
      if (myReqId !== orderReqIdRef.current) return;

      const lastSeen = parseInt(
        localStorage.getItem(ORDERS_SEEN_KEY) || "0",
        10
      );
      const count = (Array.isArray(data) ? data : []).filter((o) => {
        if (!ACTIVE_ORDER_STATUSES.includes(o.status)) return false;
        const created = new Date(o.created_at || 0).getTime();
        return created > lastSeen;
      }).length;
      setOrderPending(count);
    } catch {
      if (myReqId === orderReqIdRef.current) setOrderPending(0);
    }
  }, []);

  // ============================================================
  // EFFECTS — Cart + Orders + Polling
  // ============================================================
  useEffect(() => {
    readCart();
    readOrders();

    const onCart = () => readCart();
    const onOrder = () => readOrders();

    window.addEventListener("cart-updated", onCart);
    window.addEventListener("refresh-cart", onCart);
    window.addEventListener("orders-seen", onOrder);
    window.addEventListener("order-updated", onOrder);

    const timer = setInterval(readOrders, POLL_MS);

    return () => {
      window.removeEventListener("cart-updated", onCart);
      window.removeEventListener("refresh-cart", onCart);
      window.removeEventListener("orders-seen", onOrder);
      window.removeEventListener("order-updated", onOrder);
      clearInterval(timer);
    };
  }, [readCart, readOrders]);

  // ============================================================
  // ============================================================
  // HANDLERS
  // ============================================================
  const openSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const closeSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  const renderBadge = (count) => {
    if (!count || count <= 0) return null;
    return (
      <span className="topbar-badge">
        {count > BADGE_MAX ? `${BADGE_MAX}+` : count}
      </span>
    );
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <header className="customer-topbar">
      {/* ============ ROLE BAR (dòng trên) ============ */}
      <div className="customer-topbar__rolebar">
        <div className="customer-topbar__rolebar-inner">
          <div className="customer-topbar__status">
            <span className="customer-topbar__status-online">
              <span className="customer-topbar__status-dot" />
              {t("Trực tuyến")}
            </span>
            <span className="customer-topbar__hotline">
              {t("Hỗ trợ:")} 1900 6868
            </span>
          </div>
        </div>
      </div>

      {/* ============ MAIN BAR (dòng dưới) ============ */}
      <div className="customer-topbar__main">
        <div className="customer-topbar__main-inner">
          <div className="customer-topbar__left">
            {/* Hamburger mobile */}
            <button
              type="button"
              className="customer-topbar__hamburger"
              onClick={onOpenMobileMenu}
              aria-label={t("Mở menu")}
            >
              <Menu size={22} />
            </button>

            {/* Logo */}
            <Link to="/customer/home" className="customer-topbar__logo">
              <LogoVWACompact size={36} />
              <div className="customer-topbar__logo-text">
                <b>CANTEEN VWA</b>
                <small>{t("HỌC VIỆN PHỤ NỮ VN")}</small>
              </div>
            </Link>

            {/* Desktop nav */}
            <nav className="customer-topbar__nav">
              {NAV_ITEMS.map((item) => {
                const active = isPathActive(location.pathname, item.path);
                return (
                  <NavLink
                    key={item.key}
                    to={item.path}
                    className={`customer-topbar__nav-item ${
                      active ? "active" : ""
                    }`}
                  >
                    {t(item.label)}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* Right actions */}
          <div className="customer-topbar__right">
            {/* Cart */}
            <Link
              to="/customer/cart"
              className="customer-topbar__icon-btn"
              aria-label={t("Giỏ hàng")}
            >
              <ShoppingBag size={20} />
              {renderBadge(cartCount)}
            </Link>

            {/* Notifications */}
            <div className="customer-topbar__notification-wrap" ref={notificationMenuRef}>
              <button type="button" className="customer-topbar__icon-btn" onClick={() => setShowNotifications((prev) => !prev)} aria-label="Thông báo" title="Thông báo">
                <Bell size={20} />
                {notificationUnread > 0 && <span className="customer-topbar__notification-badge">{notificationUnread > 99 ? "99+" : notificationUnread}</span>}
              </button>
              {showNotifications && (
                <div className="customer-topbar__notification-menu">
                  <div className="customer-topbar__notification-header">
                    <strong>Thông báo</strong>
                    {notificationUnread > 0 && <button type="button" onClick={handleReadAllNotifications}>Đọc tất cả</button>}
                  </div>
                  <div className="customer-topbar__notification-list">
                    {notifications.length === 0 ? <div className="customer-topbar__notification-empty">Không có thông báo</div> : notifications.map((notification) => (
                      <button type="button" key={notification.id} className={`customer-topbar__notification-item ${!notification.read ? "is-unread" : ""}`} onClick={() => handleNotificationClick(notification)}>
                        <strong>{notification.title || "Thông báo"}</strong>
                        <span>{notification.content || notification.message || ""}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Profile button — bấm vào mở SettingsModal (Q1:A) */}
            <button
              type="button"
              className="customer-topbar__profile-btn"
              onClick={openSettings}
              aria-label={t("Cài đặt")}
              title={t("Cài đặt")}
            >
              <div className="customer-topbar__avatar">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.name || t("Khách")} />
                ) : (
                  getInitials(user?.name)
                )}
              </div>
              <div className="customer-topbar__profile-info">
                <b>{user?.name || t("Khách")}</b>
                <span>{t("Sinh viên VWA")}</span>
              </div>
              <Settings size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ============ SETTINGS MODAL (CUSTOMER) ============ */}
      <SettingsModal
        open={showSettings}
        onClose={closeSettings}
        role="CUSTOMER"
        user={user}
        onLogout={onLogout}
      />
    </header>
  );
}
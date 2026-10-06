// ============================================================
// BOTTOMNAV.JSX — Bottom navigation cho Customer (V2 - design mới)
// ============================================================
// ✅ GIỮ NGUYÊN: logic badge, poll orders, more menu, logout
// 🎨 THAY ĐỔI: CSS classes mới theo design system
// 🔧 FIX #56: pause poll khi tab ẩn (document.hidden + visibilitychange)
// ============================================================

import { useEffect, useState, useRef, useCallback } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  Home, UtensilsCrossed, ShoppingCart, Package, User, Menu, Wallet, Gift, LogOut, X,
} from "lucide-react";
import { api, setToken } from "../api";
import { useI18n } from "../hooks/useI18n";
import ConfirmDialog, { LogoutIcon } from "./ConfirmDialog";

const CART_KEY = "canteen_cart";
const ORDERS_SEEN_KEY = "orders_last_seen";
const POLL_MS = 30000;
const BADGE_MAX = 99;

const TABS = [
  { key: "home",   label: "Trang chủ",  icon: Home,            path: "/customer/home" },
  { key: "menu",   label: "Thực đơn",   icon: UtensilsCrossed, path: "/customer/menu" },
  { key: "cart",   label: "Giỏ hàng",   icon: ShoppingCart,    path: "/customer/cart",   badge: "cart" },
  { key: "orders", label: "Đơn hàng",   icon: Package,         path: "/customer/orders", badge: "orders" },
];

const MORE_ITEMS = [
  { key: "wallet",     label: "Ví Canteen",  icon: Wallet, path: "/customer/wallet" },
  { key: "promotions", label: "Khuyến mãi",  icon: Gift,   path: "/customer/promotions" },
  { key: "profile",    label: "Hồ sơ",       icon: User,   path: "/customer/profile" },
];

const ACTIVE_ORDER_STATUSES = [
  "Chờ xác nhận",
  "Đã xác nhận",
  "Đang chuẩn bị",
  "Sẵn sàng nhận",
];

function readCartFromStorage() {
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

export default function BottomNav({ onLogout }) {
  const [cartCount, setCartCount] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [showMore, setShowMore] = useState(false);
  const { t } = useI18n();

  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // 🔧 FIX #56: theo dõi tab visible để pause poll khi ẩn
  const [tabVisible, setTabVisible] = useState(
    typeof document === "undefined" || !document.hidden
  );

  const navigate = useNavigate();
  const location = useLocation();

  const orderReqIdRef = useRef(0);

  const readCart = useCallback(() => {
    setCartCount(readCartFromStorage());
  }, []);

  const readOrders = useCallback(async () => {
    const myReqId = ++orderReqIdRef.current;

    try {
      const token = sessionStorage.getItem("token");
      if (!token) {
        setOrderCount(0);
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

      setOrderCount(count);
    } catch {
      if (myReqId === orderReqIdRef.current) setOrderCount(0);
    }
  }, []);

  // 🔧 FIX #56: lắng nghe visibilitychange
  useEffect(() => {
    const handler = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  useEffect(() => {
    readCart();
    readOrders();

    const onCart = () => readCart();
    const onOrder = () => readOrders();

    window.addEventListener("cart-updated", onCart);
    window.addEventListener("refresh-cart", onCart);
    window.addEventListener("orders-seen", onOrder);
    window.addEventListener("order-updated", onOrder);

    // 🔧 FIX #56: chỉ poll khi tab visible
    if (!tabVisible) {
      return () => {
        window.removeEventListener("cart-updated", onCart);
        window.removeEventListener("refresh-cart", onCart);
        window.removeEventListener("orders-seen", onOrder);
        window.removeEventListener("order-updated", onOrder);
      };
    }

    const timer = setInterval(readOrders, POLL_MS);

    return () => {
      window.removeEventListener("cart-updated", onCart);
      window.removeEventListener("refresh-cart", onCart);
      window.removeEventListener("orders-seen", onOrder);
      window.removeEventListener("order-updated", onOrder);
      clearInterval(timer);
    };
  }, [readCart, readOrders, tabVisible]);

  useEffect(() => {
    setShowMore(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!showMore) return;

    const handler = (e) => {
      if (e.key === "Escape") setShowMore(false);
    };
    window.addEventListener("keydown", handler);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [showMore]);

  const getBadge = (key) => {
    if (key === "cart") return cartCount;
    if (key === "orders") return orderCount;
    return 0;
  };

  const isMoreActive = MORE_ITEMS.some((i) =>
    isPathActive(location.pathname, i.path)
  );

  const openLogoutConfirm = () => {
    setShowMore(false);
    setConfirmLogout(true);
  };

  const performLogout = () => {
    setLoggingOut(true);
    try {
      localStorage.removeItem(ORDERS_SEEN_KEY);
      localStorage.removeItem("canteen_cart_selected");
    } catch {}

    document.body.style.overflow = "";
    document.body.classList.remove("has-bottom-nav");
    document.body.classList.remove("mobile-open");

    if (onLogout) {
      onLogout();
    } else {
      setToken(null);
      navigate("/");
    }
  };

  const handleMoreToggle = () => setShowMore((s) => !s);

  const renderBadge = (count) => {
    if (!count || count <= 0) return null;
    return (
      <span className="customer-bottomnav__badge" aria-hidden="true">
        {count > BADGE_MAX ? `${BADGE_MAX}+` : count}
      </span>
    );
  };

  return (
    <>
      {showMore && (
        <div
          className="customer-bottomnav__more-overlay"
          onClick={() => setShowMore(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t("Menu mở rộng")}
        >
          <div
            className="customer-bottomnav__more-menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="customer-bottomnav__more-head">
              <span>{t("Thực đơn")}</span>
              <button
                onClick={() => setShowMore(false)}
                className="customer-bottomnav__more-close"
                aria-label={t("Đóng menu")}
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            {MORE_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isPathActive(location.pathname, item.path);

              return (
                <button
                  key={item.key}
                  type="button"
                  className={`customer-bottomnav__more-item ${
                    active ? "active" : ""
                  }`}
                  onClick={() => {
                    setShowMore(false);
                    navigate(item.path);
                  }}
                >
                  <Icon size={20} />
                  <span>{t(item.label)}</span>
                </button>
              );
            })}

            <div className="customer-bottomnav__more-sep" />

            <button
              type="button"
              className="customer-bottomnav__more-item customer-bottomnav__more-item--danger"
              onClick={openLogoutConfirm}
            >
              <LogOut size={20} />
              <span>{t("Đăng xuất")}</span>
            </button>
          </div>
        </div>
      )}

      <nav
        className="customer-bottomnav"
        aria-label={t("Điều hướng chính")}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const badge = getBadge(tab.badge);

          return (
            <NavLink
              key={tab.key}
              to={tab.path}
              end={tab.path === "/customer/home"}
              className={({ isActive }) =>
                `customer-bottomnav__item ${isActive ? "active" : ""}`
              }
            >
              <div className="customer-bottomnav__icon">
                <Icon size={22} />
                {renderBadge(badge)}
              </div>
              <span className="customer-bottomnav__label">
                {t(tab.label)}
              </span>
            </NavLink>
          );
        })}

        <button
          type="button"
          className={`customer-bottomnav__item ${
            isMoreActive || showMore ? "active" : ""
          }`}
          onClick={handleMoreToggle}
          aria-label={t("Mở menu thêm")}
          aria-expanded={showMore}
          aria-haspopup="menu"
        >
          <div className="customer-bottomnav__icon">
            <Menu size={22} />
          </div>
          <span className="customer-bottomnav__label">{t("Thêm")}</span>
        </button>
      </nav>

      <ConfirmDialog
        open={confirmLogout}
        icon={LogoutIcon}
        title={t("Đăng xuất khỏi Canteen VWA?")}
        message={t("Giỏ hàng hiện tại sẽ bị xoá. Bạn sẽ cần đăng nhập lại để tiếp tục.")}
        confirmText={t("Đăng xuất")}
        cancelText={t("Ở lại")}
        danger
        loading={loggingOut}
        onConfirm={performLogout}
        onClose={() => !loggingOut && setConfirmLogout(false)}
      />
    </>
  );
}
// ============================================================
// TOPBAR.JSX — Top navigation cho Customer (V2 - design mới)
// ============================================================
// ✅ GIỮ NGUYÊN: logic cart badge, order count, user, logout
// 🎨 THAY ĐỔI: layout 2 rows theo design mới
// ✅ FIX: Dropdown profile gọn lại — chỉ Hồ sơ / Ngôn ngữ / Theme / Logout
// ============================================================

import { useEffect, useState, useRef, useCallback } from "react";
import { NavLink, Link, useNavigate, useLocation } from "react-router-dom";
import {
  Search, ShoppingBag, User, Bell, Sun, Moon, Globe, ChevronDown, LogOut,
  Package, Home, UtensilsCrossed, Gift, Wallet, MessageCircle, X, Menu,
  UserRound, Settings, LayoutDashboard, UserCog, ChefHat, Check,
} from "lucide-react";
import { api } from "../api";
import { useI18n } from "../hooks/useI18n";

// ============================================================
// CONSTANTS
// ============================================================

const CART_KEY = "canteen_cart";
const ORDERS_SEEN_KEY = "orders_last_seen";
const POLL_MS = 30000;
const BADGE_MAX = 99;

// Ngôn ngữ hỗ trợ — đồng bộ với LANGUAGES bên CustomerProfile
const LANGUAGES = [
  { code: "vi", flag: "🇻🇳", label: "Tiếng Việt" },
  { code: "en", flag: "🇺🇸", label: "English" },
];

// Main nav items (desktop)
const NAV_ITEMS = [
  { key: "home",       label: "Khám phá",    icon: Home,            path: "/customer/home" },
  { key: "menu",       label: "Thực đơn",    icon: UtensilsCrossed, path: "/customer/menu" },
  { key: "promotions", label: "Khuyến mãi",  icon: Gift,            path: "/customer/promotions" },
  { key: "orders",     label: "Đơn hàng",    icon: Package,         path: "/customer/orders" },
  { key: "wallet",     label: "Ví Canteen",  icon: Wallet,          path: "/customer/wallet" },
  { key: "profile",    label: "Tài khoản",   icon: User,            path: "/customer/profile" },
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

export default function CustomerTopbar({ user, cart, onLogout, onOpenMobileMenu }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  const [cartCount, setCartCount] = useState(0);
  const [orderPending, setOrderPending] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  // Ngôn ngữ hiện tại — đọc từ localStorage (CustomerProfile ghi vào đây)
  const [currentLang, setCurrentLang] = useState(() => {
    if (typeof window === "undefined") return "vi";
    return localStorage.getItem("vwa_lang") || "vi";
  });

  const [darkMode, setDarkMode] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark-mode");
  });

  const orderReqIdRef = useRef(0);
  const profileMenuRef = useRef(null);
  const langMenuRef = useRef(null);
  const searchInputRef = useRef(null);

  // ---------- Cart ----------
  const readCart = useCallback(() => {
    setCartCount(readCartCount());
  }, []);

  // ---------- Orders pending ----------
  const readOrders = useCallback(async () => {
    const myReqId = ++orderReqIdRef.current;
    try {
      const token = sessionStorage.getItem("token");
      if (!token) {
        setOrderPending(0);
        return;
      }
      const data = await api.orders.myOrders();
      if (myReqId !== orderReqIdRef.current) return;

      const lastSeen = parseInt(localStorage.getItem(ORDERS_SEEN_KEY) || "0", 10);
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

  // ---------- Effects ----------
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

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setShowProfileMenu(false);
        setShowLangMenu(false);
      }
      if (langMenuRef.current && !langMenuRef.current.contains(e.target)) {
        setShowLangMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Ctrl+K → focus search
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Sync dark mode
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark-mode", darkMode);
    try {
      localStorage.setItem("vwa_theme", darkMode ? "dark" : "light");
    } catch {}
  }, [darkMode]);

  // ---------- Handlers ----------
  const handleSearch = (e) => {
    e?.preventDefault?.();
    const q = searchQuery.trim();
    if (!q) return;
    navigate(`/customer/menu?q=${encodeURIComponent(q)}`);
    setSearchQuery("");
  };

  const handleLogout = () => {
    setShowProfileMenu(false);
    setShowLangMenu(false);
    onLogout?.();
  };

  const handleSelectLanguage = (code) => {
    setCurrentLang(code);
    setShowLangMenu(false);
    setShowProfileMenu(false);
    try {
      localStorage.setItem("vwa_lang", code);
      window.dispatchEvent(
        new CustomEvent("language-change", { detail: { lang: code } })
      );
    } catch {}
  };

  const renderBadge = (count) => {
    if (!count || count <= 0) return null;
    return (
      <span className="topbar-badge">
        {count > BADGE_MAX ? `${BADGE_MAX}+` : count}
      </span>
    );
  };

  const currentLangObj =
    LANGUAGES.find((l) => l.code === currentLang) || LANGUAGES[0];

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <header className="customer-topbar">
      {/* ============ ROW 1: STATUS BAR ============ */}
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

      {/* ============ ROW 2: MAIN BAR ============ */}
      <div className="customer-topbar__main">
        <div className="customer-topbar__main-inner">
          {/* Left: Mobile menu + Logo + Nav */}
          <div className="customer-topbar__left">
            <button
              className="customer-topbar__hamburger"
              onClick={onOpenMobileMenu}
              aria-label={t("Mở menu")}
            >
              <Menu size={22} />
            </button>

            <Link to="/customer/home" className="customer-topbar__logo">
              <div className="customer-topbar__logo-mark">V</div>
              <div className="customer-topbar__logo-text">
                <b>CANTEEN VWA</b>
                <small>{t("HỌC VIỆN PHỤ NỮ VN")}</small>
              </div>
            </Link>

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

          {/* Center: Search */}
          <form className="customer-topbar__search" onSubmit={handleSearch}>
            <Search size={18} className="customer-topbar__search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("Tìm kiếm món ăn, thức uống, set trưa...")}
              className="customer-topbar__search-input"
            />
          </form>

          {/* Right: Cart + Profile */}
          <div className="customer-topbar__right">
            <Link
              to="/customer/cart"
              className="customer-topbar__icon-btn"
              aria-label={t("Giỏ hàng")}
            >
              <ShoppingBag size={20} />
              {renderBadge(cartCount)}
            </Link>

            {/* Profile */}
            <div
              className="customer-topbar__profile-wrap"
              ref={profileMenuRef}
            >
              <button
                className="customer-topbar__profile-btn"
                onClick={() => {
                  setShowProfileMenu((s) => !s);
                  setShowLangMenu(false);
                }}
                aria-label={t("Tài khoản")}
                aria-expanded={showProfileMenu}
              >
                <div className="customer-topbar__avatar">
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user.name} />
                  ) : (
                    getInitials(user?.name)
                  )}
                </div>
                <div className="customer-topbar__profile-info">
                  <b>{user?.name || t("Khách")}</b>
                  <span>{t("Sinh viên VWA")}</span>
                </div>
                <ChevronDown size={14} />
              </button>

              {showProfileMenu && (
                <div className="customer-topbar__dropdown">
                  {/* Header user */}
                  <div className="customer-topbar__dropdown-header">
                    <b>{user?.name || t("Khách")}</b>
                    <span>{user?.email || "user@vwa.edu.vn"}</span>
                  </div>

                  {/* Hồ sơ cá nhân */}
                  <Link
                    to="/customer/profile"
                    className="customer-topbar__dropdown-item"
                    onClick={() => setShowProfileMenu(false)}
                  >
                    <UserRound size={16} />
                    {t("Hồ sơ cá nhân")}
                  </Link>

                  {/* Đổi ngôn ngữ (expand submenu) */}
                  <div ref={langMenuRef}>
                    <button
                      type="button"
                      className="customer-topbar__dropdown-item"
                      onClick={() => setShowLangMenu((s) => !s)}
                      aria-expanded={showLangMenu}
                    >
                      <Globe size={16} />
                      {t("Đổi ngôn ngữ")}
                      <span className="customer-topbar__dropdown-lang-current">
                        {currentLangObj.flag} {currentLangObj.label}
                      </span>
                      <ChevronDown
                        size={14}
                        className={`customer-topbar__dropdown-caret ${
                          showLangMenu ? "is-open" : ""
                        }`}
                      />
                    </button>

                    {showLangMenu && (
                      <div className="customer-topbar__lang-submenu">
                        {LANGUAGES.map((lang) => {
                          const isActive = currentLang === lang.code;
                          return (
                            <button
                              key={lang.code}
                              type="button"
                              className={`customer-topbar__dropdown-item ${
                                isActive
                                  ? "customer-topbar__dropdown-item--active"
                                  : ""
                              }`}
                              onClick={() => handleSelectLanguage(lang.code)}
                            >
                              <span className="customer-topbar__lang-flag">
                                {lang.flag}
                              </span>
                              <span className="customer-topbar__lang-label">
                                {lang.label}
                              </span>
                              {isActive && (
                                <Check
                                  size={14}
                                  className="customer-topbar__dropdown-check"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="customer-topbar__dropdown-sep" />

                  {/* Chế độ sáng/tối */}
                  <button
                    type="button"
                    className="customer-topbar__dropdown-item"
                    onClick={() => setDarkMode((d) => !d)}
                  >
                    {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                    {darkMode ? t("Chế độ sáng") : t("Chế độ tối")}
                  </button>

                  {/* Đăng xuất */}
                  <button
                    type="button"
                    className="customer-topbar__dropdown-item customer-topbar__dropdown-item--danger"
                    onClick={handleLogout}
                  >
                    <LogOut size={16} />
                    {t("Đăng xuất")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
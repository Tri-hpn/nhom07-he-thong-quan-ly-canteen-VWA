// ============================================================
// LAYOUT.JSX — Layout chính (V4 - FINAL)
// ============================================================
// V4 (2026-10):
//   - ✅ Thêm SettingsModal cho EMPLOYEE/ADMIN qua nút ⚙️ topbar
//   - 🔧 FIX typo "Giỏi hàng" → "Giỏ hàng"
//   - Giữ nguyên: PAGE_HEADINGS (auto lookup disabled do CSS global),
//     hideHeading (backward compat), CustomerTopbar riêng
//
// 🌐 i18n: source-text tiếng Việt, tự dịch
// ============================================================

import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Menu, Settings } from "lucide-react";

import Sidebar from "./Sidebar";
import CustomerTopbar from "./Topbar";
import BottomNav from "./BottomNav";
import Footer from "./Footer";
import NotificationBell from "./NotificationBell";
import ConfirmDialog, { LogoutIcon } from "./ConfirmDialog";
import SettingsModal from "./SettingsModal";
import { useI18n } from "../hooks/useI18n";

// ============================================================
// PAGE HEADINGS — Auto heading cho EMPLOYEE/ADMIN
// ============================================================
// 🔧 FIX #64: AUTO LOOKUP **DISABLED** due to global CSS
//   - Rule `.page-heading { display: none !important }` trong CSS toàn cục
//     đã ẩn mọi heading auto → giữ map này chỉ để tham khảo.
//   - Nếu sau này muốn bật lại:
//       1. Xóa rule CSS `.page-heading { display: none !important }`
//       2. Uncomment block auto lookup trong useMemo `heading` bên dưới.
//   - KHÔNG xóa map này để tránh phá vỡ import/test nào còn dùng.
// ============================================================

const PAGE_HEADINGS = [
  // EMPLOYEE
  {
    path: "/employee/attendance",
    title: "Chấm công",
    subtitle: "Check-in / Check-out",
  },
  {
    path: "/employee/orders",
    title: "Quản lý đơn hàng",
    subtitle: "Xử lý đơn khách",
  },
  {
    path: "/employee/prep",
    title: "Chuẩn bị đơn",
    subtitle: "Danh sách đơn bếp cần xử lý",
  },
  {
    path: "/employee/menu",
    title: "Quản lý thực đơn",
    subtitle: "Xem tình trạng món",
  },
  {
    path: "/employee/shifts",
    title: "Ca làm việc",
    subtitle: "Ca trực & chấm công hôm nay",
  },
  {
    path: "/employee/profile",
    title: "Hồ sơ cá nhân",
    subtitle: "Thông tin tài khoản",
  },
  {
    path: "/employee/chat",
    title: "Chat khách hàng",
    subtitle: "Hỗ trợ khách hàng",
  },

  // OWNER
  {
    path: "/owner/employees",
    title: "Quản lý nhân viên",
    subtitle: "Danh sách nhân viên",
  },
  {
    path: "/owner/shifts",
    title: "Quản lý ca",
    subtitle: "Phân ca + theo dõi chấm công",
  },
  {
    path: "/owner/attendance",
    title: "Chấm công",
    subtitle: "Lịch sử chấm công nhân viên",
  },
  {
    path: "/owner/customers",
    title: "Quản lý khách hàng",
    subtitle: "Danh sách khách hàng",
  },
  {
    path: "/owner/menu",
    title: "Quản lý thực đơn",
    subtitle: "Món ăn",
  },
  {
    path: "/owner/price-history",
    title: "Lịch sử giá",
    subtitle: "Theo dõi thay đổi giá món ăn",
  },
  {
    path: "/owner/inventory",
    title: "Quản lý kho hàng",
    subtitle: "Nguyên liệu",
  },
  {
    path: "/owner/reports",
    title: "Báo cáo",
    subtitle: "Doanh thu & thống kê",
  },
  {
    path: "/owner/orders",
    title: "Quản lý đơn hàng",
    subtitle: "Xử lý đơn khách như nhân viên",
  },
  {
    path: "/owner/vouchers",
    title: "Quản lý Voucher",
    subtitle: "Tạo / sửa / xóa voucher cho khách",
  },
  {
    path: "/owner/finance",
    title: "Quản lý tài chính",
    subtitle: "Tài khoản nhận tiền, doanh thu, chi phí",
  },
  {
    path: "/owner/wallet",
    title: "Quản lý Ví Canteen",
    subtitle: "Duyệt nạp / rút / thanh toán của khách",
  },
  {
    path: "/owner/settings",
    title: "Cài đặt",
    subtitle: "Tài khoản nhận tiền + thông tin liên hệ",
  },
  {
    path: "/owner/profile",
    title: "Hồ sơ cá nhân",
    subtitle: "Thông tin tài khoản",
  },
  {
    path: "/owner/backup",
    title: "Backup dữ liệu",
    subtitle: "Xuất / nhập / reset database",
  },
];

/**
 * 🔧 FIX #64: UNUSED — auto lookup đã bị disable vì CSS global ẩn heading.
 * Giữ lại để tham khảo / bật lại sau này. Không gọi ở đâu cả.
 * @deprecated Auto heading lookup DISABLED due to global CSS.
 */
// eslint-disable-next-line no-unused-vars
function lookupHeading(pathname) {
  if (!pathname) return null;
  const sorted = [...PAGE_HEADINGS].sort(
    (a, b) => b.path.length - a.path.length
  );
  for (const h of sorted) {
    if (pathname === h.path || pathname.startsWith(h.path + "/")) {
      return h;
    }
  }
  return null;
}

// ============================================================
// MAIN LAYOUT
// ============================================================

export default function Layout({
  role,
  children,
  title,
  subtitle,
  onLogout,
  user,
  // 🔧 M8: hideHeading giữ để tương thích ngược — KHÔNG còn dùng nữa
  // eslint-disable-next-line no-unused-vars
  hideHeading = false,
  showFooter = false,
  cart,
  setCart,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const isCustomer = role === "CUSTOMER";
  const isAdmin = role === "ADMIN";

  // Body class cho mobile bottom nav
  useEffect(() => {
    if (isCustomer) {
      document.body.classList.add("has-bottom-nav");
    } else {
      document.body.classList.remove("has-bottom-nav");
    }
    return () => document.body.classList.remove("has-bottom-nav");
  }, [isCustomer]);

  // 🔧 M8 + FIX #64: Heading giờ CHỈ lấy từ props (title + subtitle).
  //         Không tự động lookup nữa vì đã có CSS ẩn toàn cục.
  const heading = useMemo(() => {
    if (isCustomer) return null;

    if (title || subtitle) {
      return {
        title: title ? t(title) : title,
        subtitle: subtitle ? t(subtitle) : subtitle,
      };
    }

    // 🔧 FIX #64: Auto lookup DISABLED (do CSS ẩn toàn cục)
    // const found = lookupHeading(location.pathname);
    // if (!found) return null;
    // return {
    //   title: t(found.title),
    //   subtitle: t(found.subtitle),
    // };

    return null;
  }, [isCustomer, title, subtitle, t]);

  const toggleSidebar = useCallback(() => {
    window.dispatchEvent(new CustomEvent("toggle-sidebar"));
  }, []);

  const openLogoutConfirm = useCallback(() => {
    setShowLogoutConfirm(true);
  }, []);

  const handleLogoutConfirm = useCallback(() => {
    setShowLogoutConfirm(false);
    onLogout?.();
  }, [onLogout]);

  const openSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const closeSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div
      className={
        "app-shell" +
        (isCustomer ? " customer-layout" : "") +
        (isAdmin ? " admin-shell" : "")
      }
    >
      {/* ============ SIDEBAR — Chỉ cho EMPLOYEE/ADMIN ============ */}
      {!isCustomer && (
        <Sidebar
          role={role}
          onLogout={openLogoutConfirm}
          user={user}
        />
      )}

      <main className="main">
        {/* ============ TOPBAR ============ */}
        {isCustomer ? (
          /* CUSTOMER: CustomerTopbar (2 rows) */
          <CustomerTopbar
            user={user}
            cart={cart || {}}
            onLogout={openLogoutConfirm}
            onOpenMobileMenu={toggleSidebar}
          />
        ) : (
          /* EMPLOYEE / ADMIN: Inline topbar */
          <header className="topbar">
            <div className="topbar-left">
              <button
                type="button"
                className="hamburger-btn"
                onClick={toggleSidebar}
                aria-label={t("Mở menu")}
              >
                <Menu size={20} />
              </button>
            </div>

            <div className="topbar-right" style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {user && (
                <div onClick={() => navigate(role === "ADMIN" ? "/owner/profile" : "/employee/profile")} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#0284C7", color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, overflow: "hidden" }}>
                      {user.avatar ? (
                        <img src={user.avatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span>{user.name ? user.name.slice(0, 2).toUpperCase() : "AD"}</span>
                      )}
                    </div>
                  <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary, #172033)" }}>{user.name || "Quản trị viên"}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted, #64748b)" }}>{role === "ADMIN" ? "Quản trị viên" : "Nhân viên"}</span>
                  </div>
                </div>
              )}
              
              <button type="button" className="topbar-icon-btn" onClick={openSettings} style={{ background: "transparent", border: 0, cursor: "pointer", display: "grid", placeItems: "center", color: "var(--text-muted)" }}>
                <Settings size={20} />
              </button>

              <NotificationBell />
            </div>
          </header>
        )}

        {/* ============ MAIN CONTENT ============ */}
        <section className="page-content">
          {heading && (heading.title || heading.subtitle) && (
            <div className="page-heading">
              {heading.title && <h1>{heading.title}</h1>}
              {heading.subtitle && <p>{heading.subtitle}</p>}
            </div>
          )}

          {children}

          {showFooter && <Footer />}
        </section>
      </main>

      {/* ============ BOTTOM NAV — Chỉ cho CUSTOMER mobile ============ */}
      {isCustomer && <BottomNav onLogout={openLogoutConfirm} />}

      {/* ============ LOGOUT CONFIRM — CUSTOMER / EMPLOYEE / ADMIN ============ */}
      <ConfirmDialog
        open={showLogoutConfirm}
        icon={LogoutIcon}
        title={t("Đăng xuất khỏi Canteen VWA?")}
        message={t(
          "Giỏ hàng hiện tại sẽ bị xoá. Bạn sẽ cần đăng nhập lại để tiếp tục."
        )}
        confirmText={t("Đăng xuất")}
        cancelText={t("Ở lại")}
        danger
        onConfirm={handleLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
      />

      {/* ============ SETTINGS MODAL — EMPLOYEE/ADMIN ============ */}
      {!isCustomer && (
        <SettingsModal
          open={showSettings}
          onClose={closeSettings}
          role={role}
          user={user}
          onLogout={onLogout}
        />
      )}
    </div>
  );
}
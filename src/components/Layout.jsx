// ============================================================
// LAYOUT.JSX — Layout chính (Clean V2)
// ============================================================
// 3 nhánh rõ ràng theo role:
//   - CUSTOMER   → CustomerTopbar + BottomNav + Footer
//   - EMPLOYEE   → Sidebar + inline topbar
//   - ADMIN      → Sidebar + inline topbar
// ============================================================

import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Menu,
} from "lucide-react";

import Sidebar from "./Sidebar";
import CustomerTopbar from "./Topbar";
import BottomNav from "./BottomNav";
import Footer from "./Footer";
import NotificationBell from "./NotificationBell";
import ConfirmDialog, { LogoutIcon } from "./ConfirmDialog";
import { useI18n } from "../hooks/useI18n";

// ============================================================
// PAGE HEADINGS — Auto heading cho EMPLOYEE/ADMIN
// ============================================================

const PAGE_HEADINGS = [
  // EMPLOYEE
  { path: "/employee/attendance", title: "Chấm công",          subtitle: "Check-in / Check-out" },
  { path: "/employee/orders",     title: "Đơn hàng",           subtitle: "Xử lý đơn khách" },
  { path: "/employee/menu",       title: "Thực đơn",           subtitle: "Xem tình trạng món" },
  { path: "/employee/shifts",     title: "Lịch sử ca",         subtitle: "Ca trực & chấm công hôm nay" },
  { path: "/employee/profile",    title: "Hồ sơ cá nhân",      subtitle: "Thông tin tài khoản" },
  { path: "/employee/chat",       title: "Chat khách hàng",    subtitle: "Hỗ trợ khách hàng" },

  // OWNER
  { path: "/owner/employees",     title: "Quản lý nhân viên",  subtitle: "Danh sách nhân viên" },
  { path: "/owner/shifts",        title: "Quản lý ca",         subtitle: "Phân ca + theo dõi chấm công" },
  { path: "/owner/attendance",    title: "Chấm công",          subtitle: "Lịch sử chấm công nhân viên" },
  { path: "/owner/customers",     title: "Quản lý khách hàng", subtitle: "Danh sách khách hàng" },
  { path: "/owner/menu",          title: "Quản lý thực đơn",   subtitle: "Món ăn" },
  { path: "/owner/price-history", title: "Lịch sử giá",        subtitle: "Theo dõi thay đổi giá món ăn" },
  { path: "/owner/inventory",     title: "Kho hàng",           subtitle: "Nguyên liệu" },
  { path: "/owner/reports",       title: "Báo cáo",            subtitle: "Doanh thu & thống kê" },
  { path: "/owner/permissions",   title: "Phân quyền",         subtitle: "Phân quyền chi tiết cho từng user" },
  { path: "/owner/orders",        title: "Quản lý đơn hàng",   subtitle: "Xử lý đơn khách như nhân viên" },
  { path: "/owner/vouchers",      title: "Quản lý Voucher",    subtitle: "Tạo / sửa / xóa voucher cho khách" },
  { path: "/owner/finance",       title: "Quản lý tài chính",  subtitle: "Tài khoản nhận tiền, doanh thu, chi phí" },
  { path: "/owner/wallet",        title: "Quản lý Ví Canteen", subtitle: "Duyệt nạp / rút / thanh toán của khách" },
  { path: "/owner/settings",      title: "Cài đặt",            subtitle: "Tài khoản nhận tiền + thông tin liên hệ" },
  { path: "/owner/profile",       title: "Hồ sơ cá nhân",      subtitle: "Thông tin tài khoản" },
  { path: "/owner/backup",        title: "Backup dữ liệu",     subtitle: "Xuất / nhập / reset database" },
];

function lookupHeading(pathname) {
  if (!pathname) return null;
  const sorted = [...PAGE_HEADINGS].sort((a, b) => b.path.length - a.path.length);
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
  hideHeading = false,
  showFooter = false,
  cart,
  setCart,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const isCustomer = role === "CUSTOMER";
  const isEmployee = role === "EMPLOYEE";
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

  // Auto heading cho EMPLOYEE/ADMIN
  const heading = useMemo(() => {
    if (isCustomer) return null;

    if (title || subtitle) {
      return {
        title: title ? t(title) : title,
        subtitle: subtitle ? t(subtitle) : subtitle,
      };
    }
    const found = lookupHeading(location.pathname);
    if (!found) return null;
    return {
      title: t(found.title),
      subtitle: t(found.subtitle),
    };
  }, [isCustomer, title, subtitle, location.pathname, t]);

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
        <Sidebar role={role} onLogout={openLogoutConfirm} user={user} />
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
            <div className="topbar-right">
              <NotificationBell />
            </div>
          </header>
        )}

        {/* ============ MAIN CONTENT ============ */}
        <section className="page-content">
          {!hideHeading && heading && (heading.title || heading.subtitle) && (
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
      {isCustomer && <BottomNav onLogout={onLogout} />}

      {/* ============ LOGOUT CONFIRM ============ */}
      <ConfirmDialog
        open={showLogoutConfirm}
        icon={LogoutIcon}
        title={t("Đăng xuất khỏi Canteen VWA?")}
        message={t("Giỏ hàng hiện tại sẽ bị xoá. Bạn sẽ cần đăng nhập lại để tiếp tục.")}
        confirmText={t("Đăng xuất")}
        cancelText={t("Ở lại")}
        danger
        onConfirm={handleLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
}
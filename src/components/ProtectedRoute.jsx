// ============================================================
// PROTECTEDROUTE.JSX — Chặn route theo VAI TRÒ (V3 - FIX LOGIN)
// ============================================================

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const HOME_BY_ROLE = {
  ADMIN: "/owner",
  EMPLOYEE: "/employee",
  CUSTOMER: "/customer/home",
};

export function homePathForRole(role) {
  return HOME_BY_ROLE[role] || HOME_BY_ROLE.CUSTOMER;
}

export default function ProtectedRoute({ allow = [], redirectTo, children }) {
  const { user, loading, mustChangePassword } = useAuth();
  const location = useLocation();

  // ---------- Đang đọc token / khôi phục phiên ----------
  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
        Đang tải...
      </div>
    );
  }

  // ---------- Chưa đăng nhập ----------
  // 🔴 FIX: Chuyển hướng về /login thay vì / (để tránh nhầm lẫn với trang chủ)
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // ---------- Bắt buộc đổi mật khẩu lần đầu ----------
  if (mustChangePassword) {
    return <Navigate to="/" replace />;
  }

  // ---------- Sai vai trò ----------
  if (allow.length > 0 && !allow.includes(user.role)) {
    return (
      <Navigate
        to={redirectTo || homePathForRole(user.role)}
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return children ? children : <Outlet />;
}
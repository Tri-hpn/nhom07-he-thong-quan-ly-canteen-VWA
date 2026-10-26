// ============================================================
// PROTECTEDROUTE.JSX — Deep-link + Role Guard
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

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
        Đang tải...
      </div>
    );
  }

  // URL đầy đủ (path + query + hash) để returnUrl không mất query
  const returnUrl = location.pathname + location.search + location.hash;

  // Chưa đăng nhập → chuyển về /login?returnUrl=<url hiện tại>
  if (!user) {
    return (
      <Navigate
        to={"/login?returnUrl=" + encodeURIComponent(returnUrl)}
        replace
      />
    );
  }

  // Đổi mật khẩu lần đầu — App.jsx (root) render <ForcePasswordChange />
  if (mustChangePassword) {
    return null;
  }

  // Sai vai trò → 403
  if (allow.length > 0 && !allow.includes(user.role)) {
    return (
      <Navigate
        to={redirectTo || "/403"}
        replace
        state={{ from: returnUrl }}
      />
    );
  }

  return children ? children : <Outlet />;
}
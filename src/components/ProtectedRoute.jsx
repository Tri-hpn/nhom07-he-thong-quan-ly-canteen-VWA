// ============================================================
// PROTECTEDROUTE.JSX — Chặn route theo VAI TRÒ (Giai đoạn 2)
// ============================================================
// Cách dùng 1 — layout route (chặn cả NHÓM route, khuyên dùng):
//   <Route element={<ProtectedRoute allow={["ADMIN"]} />}>
//     <Route path="/owner/menu" element={...} />
//     <Route path="/owner/reports" element={...} />
//   </Route>
//
// Cách dùng 2 — bọc trực tiếp 1 trang:
//   <Route
//     path="/x"
//     element={<ProtectedRoute allow={["ADMIN"]}><Page /></ProtectedRoute>}
//   />
//
// Quy tắc:
//   • Đang khôi phục phiên (loading) → hiện màn hình chờ
//   • Chưa đăng nhập               → về trang đăng nhập "/"
//   • must_change_password = true   → về "/" (App sẽ hiện trang đổi MK)
//   • Sai vai trò                   → về trang chủ đúng vai trò
// 🔧 FIX #67: giữ state.from khi redirect do sai role (không mất ngữ cảnh)
// ============================================================

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const HOME_BY_ROLE = {
  ADMIN: "/owner",
  EMPLOYEE: "/employee",
  CUSTOMER: "/customer/home",
};

// Trang chủ mặc định của từng vai trò
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
  if (!user) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  // ---------- Bắt buộc đổi mật khẩu lần đầu ----------
  if (mustChangePassword) {
    return <Navigate to="/" replace />;
  }

  // ---------- Sai vai trò ----------
  // 🔧 FIX #67: giữ state.from để sau khi login đúng role có thể quay lại
  if (allow.length > 0 && !allow.includes(user.role)) {
    return (
      <Navigate
        to={redirectTo || homePathForRole(user.role)}
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  // children = dùng như component bọc; không có children = dùng như layout route
  return children ? children : <Outlet />;
}
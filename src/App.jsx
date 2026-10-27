// ============================================================
// APP.JSX — Root + Routing (Deep-link aware)
// ============================================================

import { useState, useEffect, useRef } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";

import Layout from "./components/Layout";
import CardHoverEffect from "./components/CardHoverEffect";
import { api } from "./api";
import { toast } from "./components/Effects";
import { useAuth } from "./contexts/AuthContext";
import ProtectedRoute, { homePathForRole } from "./components/ProtectedRoute";

import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import PaymentResult from "./pages/PaymentResult";
import StaffProfile from "./pages/StaffProfile";
import OAuthCallback from "./pages/OAuthCallback";
import ForcePasswordChange from "./pages/ForcePasswordChange";

import CustomerHome from "./pages/customer/CustomerHome";
import CustomerMenu from "./pages/customer/CustomerMenu";
import CustomerCart from "./pages/customer/CustomerCart";
import CustomerCheckout from "./pages/customer/CustomerCheckout";
import CustomerOrders from "./pages/customer/CustomerOrders";
import PublicOrderQr from "./pages/customer/PublicOrderQr";
import ChatBotWidget from "./components/ChatBotWidget";
import CustomerProfile from "./pages/customer/CustomerProfile";
import CustomerPromotions from "./pages/customer/CustomerPromotions";
import CustomerSuccess from "./pages/customer/CustomerSuccess";
import CustomerWallet from "./pages/customer/CustomerWallet";
import CustomerChat from "./pages/customer/CustomerChat";

import EmployeeHome from "./pages/employee/EmployeeHome";
import EmployeeOrders from "./pages/employee/EmployeeOrders";
import EmployeeMenu from "./pages/employee/EmployeeMenu";
import EmployeeChat from "./pages/employee/EmployeeChat";
import EmployeeShifts from "./pages/employee/EmployeeShifts";

import OwnerDashboard from "./pages/owner/OwnerDashboard";
import OwnerEmployees from "./pages/owner/OwnerEmployees";
import OwnerAttendance from "./pages/owner/OwnerAttendance";
import OwnerCustomers from "./pages/owner/OwnerCustomers";
import OwnerMenu from "./pages/owner/OwnerMenu";
import OwnerPriceHistory from "./pages/owner/OwnerPriceHistory";
import OwnerInventory from "./pages/owner/OwnerInventory";
import OwnerBackup from "./pages/owner/OwnerBackup";
import OwnerWallet from "./pages/owner/OwnerWallet";
import OwnerVouchers from "./pages/owner/OwnerVouchers";
import OwnerOrders from "./pages/owner/OwnerOrders";
import OwnerFinance from "./pages/owner/OwnerFinance";
import OwnerSettings from "./pages/owner/OwnerSettings";
import OwnerChat from "./pages/owner/OwnerChat";

// ── Helpers ─────────────────────────────────────────────────
/** Đọc ?returnUrl=… nhưng CHỈ chấp nhận URL nội bộ (chống open-redirect) */
function getSafeReturnUrl(search) {
  try {
    const params = new URLSearchParams(search || "");
    const raw = params.get("returnUrl");
    if (!raw) return null;
    const decoded = decodeURIComponent(raw);
    if (!decoded.startsWith("/") || decoded.startsWith("//")) return null;
    const u = new URL(decoded, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

function Forbidden() {
  const { user } = useAuth();
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        padding: 24,
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 72, margin: 0, color: "#ef4444" }}>403</h1>
      <h2 style={{ margin: "8px 0 24px" }}>Bạn không có quyền truy cập</h2>
      <p style={{ color: "#64748b", marginBottom: 24 }}>
        Tài khoản của bạn không được phép truy cập trang này.
      </p>
      <a
        href={homePathForRole(user?.role)}
        style={{
          padding: "10px 20px",
          background: "#0ea5e9",
          color: "#fff",
          borderRadius: 6,
          textDecoration: "none",
        }}
      >
        Về trang chủ
      </a>
    </div>
  );
}

// ── App ─────────────────────────────────────────────────────
export default function App() {
  const { user, loading, login, logout, setUser, mustChangePassword } =
    useAuth();

  const [orderChatRequest, setOrderChatRequest] = useState(null);

  // Giỏ hàng: khôi phục từ localStorage, đồng bộ ngược lại
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem("canteen_cart");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const navigate = useNavigate();
  const lastAuthExpiredRef = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem("canteen_cart", JSON.stringify(cart));
      window.dispatchEvent(new CustomEvent("cart-updated", { detail: cart }));
    } catch {}
  }, [cart]);

  // auth-expired: về /login?returnUrl=<trang hiện tại>, dedup trong 2s
  useEffect(() => {
    const handler = () => {
      const now = Date.now();
      if (now - lastAuthExpiredRef.current < 2000) return;
      lastAuthExpiredRef.current = now;

      setUser(null);
      setCart({});
      try {
        localStorage.removeItem("canteen_cart");
        localStorage.removeItem("canteen_cart_selected");
        localStorage.removeItem("orders_last_seen");
        localStorage.removeItem("points_last_seen");
      } catch {}

      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
      document.documentElement.style.overflow = "";
      document.body.classList.remove("has-bottom-nav");
      document.body.classList.remove("mobile-open");

      toast("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", "warning");

      const here = window.location.pathname + window.location.search;
      if (here.startsWith("/login")) {
        navigate("/login", { replace: true });
      } else {
        navigate("/login?returnUrl=" + encodeURIComponent(here), { replace: true });
      }
    };

    window.addEventListener("auth-expired", handler);
    return () => window.removeEventListener("auth-expired", handler);
  }, [navigate, setUser]);

  /** Login: chuyển hướng thông minh qua returnUrl → fallback homePathForRole */
  const handleLogin = async (email, password) => {
    const u = await login(email, password);
    setUser(u);
    toast("Xin chào " + u.name + "!", "success");

    const returnUrl = getSafeReturnUrl(window.location.search);
    navigate(returnUrl || homePathForRole(u.role), { replace: true });
    return u;
  };

  const handleLogout = async () => {
    // 🔴 FIX #F-3: AuthContext.logout ĐÃ gọi api.logout() → KHÔNG gọi lại
    await logout();
    setCart({});
    try {
      localStorage.removeItem("canteen_cart");
      localStorage.removeItem("canteen_cart_selected");
      localStorage.removeItem("orders_last_seen");
      localStorage.removeItem("points_last_seen");
    } catch {}

    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
    document.documentElement.style.overflow = "";
    document.body.classList.remove("has-bottom-nav");
    document.body.classList.remove("mobile-open");

    navigate("/login", { replace: true });
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
        Đang tải...
      </div>
    );
  }

  if (mustChangePassword) {
    return <ForcePasswordChange />;
  }

  // ── Chưa đăng nhập ────────────────────────────────────────
  if (!user) {
    return (
      <>
        <CardHoverEffect />
        <Routes>
          <Route path="/" element={<Login onLogin={handleLogin} />} />
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/payment-result" element={<PaymentResult />} />
          <Route path="/order-qr/:code" element={<PublicOrderQr />} />
          <Route path="/403" element={<Forbidden />} />

          <Route
            path="/auth/google/callback"
            element={
              <OAuthCallback provider="google" onLoginSuccess={(u) => setUser(u)} />
            }
          />
          <Route
            path="/auth/facebook/callback"
            element={
              <OAuthCallback provider="facebook" onLoginSuccess={(u) => setUser(u)} />
            }
          />
          <Route
            path="/auth/microsoft-entra-id/callback"
            element={
              <OAuthCallback
                provider="microsoft-entra-id"
                onLoginSuccess={(u) => setUser(u)}
              />
            }
          />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </>
    );
  }

  // ── Đã đăng nhập ──────────────────────────────────────────
  /** Layout có heading (employee + owner) */
  const wrap = (title, subtitle, node, options = {}) => (
    <Layout
      role={user.role}
      title={title}
      subtitle={subtitle}
      onLogout={handleLogout}
      user={user}
      cart={cart}
      setCart={setCart}
      {...options}
    >
      {node}
    </Layout>
  );

  /** Layout không heading (customer) */
  const wrapCustomer = (node, options = {}) => (
    <Layout
      role="CUSTOMER"
      title=""
      subtitle=""
      onLogout={handleLogout}
      user={user}
      cart={cart}
      setCart={setCart}
      hideHeading
      {...options}
    >
      {node}
    </Layout>
  );

  return (
    <>
      <CardHoverEffect />
      <Routes>
        {/* 403 */}
        <Route path="/403" element={<Forbidden />} />

        {/* ───── Customer ───── */}
        <Route element={<ProtectedRoute allow={["CUSTOMER"]} />}>
          <Route path="/customer" element={<Navigate to="/customer/home" replace />} />
          <Route
            path="/customer/home"
            element={wrapCustomer(
              <CustomerHome user={user} cart={cart} setCart={setCart} />,
              { showFooter: true }
            )}
          />
          <Route
            path="/customer/menu"
            element={wrapCustomer(
              <CustomerMenu cart={cart} setCart={setCart} user={user} />
            )}
          />
          <Route
            path="/customer/cart"
            element={wrapCustomer(<CustomerCart cart={cart} setCart={setCart} />)}
          />
          <Route
            path="/customer/checkout"
            element={wrapCustomer(
              <CustomerCheckout cart={cart} setCart={setCart} user={user} />
            )}
          />
          <Route path="/customer/points" element={<Navigate to="/customer/promotions" replace />} />
          <Route
            path="/customer/orders"
            element={wrapCustomer(
              <>
                <CustomerOrders user={user} onOpenSupport={setOrderChatRequest} />
                <ChatBotWidget
                  cart={cart}
                  setCart={setCart}
                  user={user}
                  hideLauncher
                  supportRequest={orderChatRequest}
                  onSupportRequestHandled={() => setOrderChatRequest(null)}
                />
              </>
            )}
          />
          <Route
            path="/customer/profile"
            element={wrapCustomer(<CustomerProfile user={user} setUser={setUser} />)}
          />
          <Route path="/customer/promotions" element={wrapCustomer(<CustomerPromotions />)} />
          <Route path="/customer/wallet" element={wrapCustomer(<CustomerWallet user={user} />)} />
          <Route
            path="/customer/chat"
            element={wrapCustomer(<CustomerChat user={user} cart={cart} setCart={setCart} />)}
          />
          <Route path="/customer/success" element={wrapCustomer(<CustomerSuccess />)} />
          <Route path="/customer/payment-result" element={wrapCustomer(<PaymentResult />)} />
        </Route>

        {/* ───── Employee ───── */}
        <Route element={<ProtectedRoute allow={["EMPLOYEE"]} />}>
          <Route
            path="/employee"
            element={
              <Layout
                role={user.role}
                title=""
                subtitle=""
                onLogout={handleLogout}
                user={user}
                hideHeading
              >
                <EmployeeHome />
              </Layout>
            }
          />
          <Route path="/employee/prep" element={<Navigate to="/employee/orders?station=kitchen" replace />} />
          <Route
            path="/employee/shifts"
            element={wrap("Ca làm việc", "Chấm công & lịch sử ca", <EmployeeShifts />)}
          />
          <Route path="/employee/attendance" element={<Navigate to="/employee/shifts" replace />} />
          <Route
            path="/employee/orders"
            element={wrap("Đơn hàng", "Xử lý đơn khách", <EmployeeOrders />)}
          />
          <Route
            path="/employee/menu"
            element={wrap("Thực đơn", "Xem tình trạng món", <EmployeeMenu />)}
          />
          <Route
            path="/employee/profile"
            element={wrap(
              "Hồ sơ cá nhân",
              "Thông tin tài khoản",
              <StaffProfile user={user} setUser={setUser} canEditEmail={false} />
            )}
          />
          <Route
            path="/employee/chat"
            element={wrap("Chat khách hàng", "Hỗ trợ khách hàng", <EmployeeChat />)}
          />
        </Route>

        {/* ───── Admin / Owner ───── */}
        <Route element={<ProtectedRoute allow={["ADMIN"]} />}>
          <Route
            path="/owner"
            element={wrap("Tổng quan", "Theo dõi hoạt động Canteen", <OwnerDashboard />)}
          />
          <Route
            path="/owner/employees"
            element={wrap("Quản lý nhân viên", "Danh sách nhân viên", <OwnerEmployees />)}
          />
          {/* ⚠️ ĐÃ XOÁ DÒNG LỖI SYNTAX ")} />" Ở ĐÂY */}
          <Route
            path="/owner/attendance"
            element={wrap("Chấm công", "Lịch sử chấm công nhân viên", <OwnerAttendance />)}
          />
          <Route
            path="/owner/customers"
            element={wrap("Quản lý khách hàng", "Danh sách khách hàng", <OwnerCustomers />)}
          />
          <Route
            path="/owner/menu"
            element={wrap("Quản lý thực đơn", "Món ăn", <OwnerMenu />)}
          />
          <Route
            path="/owner/price-history"
            element={wrap("Lịch sử giá", "Theo dõi thay đổi giá món ăn", <OwnerPriceHistory />)}
          />
          <Route
            path="/owner/inventory"
            element={wrap("Kho hàng", "Nguyên liệu", <OwnerInventory />)}
          />
          <Route path="/owner/reports" element={<Navigate to="/owner/finance" replace />} />
          <Route
            path="/owner/orders"
            element={wrap("Quản lý đơn hàng", "Xử lý đơn khách như nhân viên", <OwnerOrders />)}
          />
          <Route
            path="/owner/vouchers"
            element={wrap("Quản lý Voucher", "Tạo / sửa / xóa voucher cho khách", <OwnerVouchers />)}
          />
          <Route
            path="/owner/finance"
            element={wrap("Quản lý tài chính", "Báo cáo tài chính tổng hợp", <OwnerFinance />)}
          />
          <Route
            path="/owner/wallet"
            element={wrap("Quản lý Ví Canteen", "Duyệt nạp / rút / thanh toán của khách", <OwnerWallet />)}
          />
          <Route
            path="/owner/settings"
            element={wrap("Cài đặt", "Tài khoản nhận tiền + thông tin liên hệ", <OwnerSettings />)}
          />
          <Route
            path="/owner/profile"
            element={wrap(
              "Hồ sơ cá nhân",
              "Thông tin tài khoản",
              <StaffProfile user={user} setUser={setUser} canEditEmail={true} />
            )}
          />
          <Route
            path="/owner/backup"
            element={wrap("Backup dữ liệu", "Xuất / nhập / reset database", <OwnerBackup />)}
          />
          <Route
            path="/owner/chat"
            element={wrap("Chat & Hỗ trợ", "Giám sát & điều phối chat toàn hệ thống", <OwnerChat />)}
          />
        </Route>

        {/* Public routes (vẫn render được khi đã login) */}
        <Route path="/order-qr/:code" element={<PublicOrderQr />} />
        <Route path="/payment-result" element={<PaymentResult />} />

        {/* Root & fallback khi đã login */}
        <Route path="/" element={<Navigate to={homePathForRole(user.role)} replace />} />
        <Route path="/login" element={<Navigate to={homePathForRole(user.role)} replace />} />
        <Route path="/register" element={<Navigate to={homePathForRole(user.role)} replace />} />
        <Route path="*" element={<Navigate to={homePathForRole(user.role)} replace />} />
      </Routes>
    </>
  );
}
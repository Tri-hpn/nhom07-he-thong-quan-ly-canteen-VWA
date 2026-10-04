// ============================================================
// AUTHCONTEXT.JSX — Nguồn dữ liệu DUY NHẤT về người đăng nhập
// ============================================================
// GIAI ĐOẠN 2 — gom toàn bộ logic auth đang rải trong App.jsx:
//   • Auto-login khi mở app: đọc token → GET /api/auth/me
//   • Nghe sự kiện "refresh-user" (sau khi sửa hồ sơ cá nhân)
//   • Nghe sự kiện "auth-expired" (api.js gặp 401)
//   • login() / logout() / refresh()
//   • Cờ must_change_password → buộc đổi mật khẩu lần đầu
//
// Dùng ở mọi component qua hook useAuth():
//   const { user, role, loading, login, logout, mustChangePassword } = useAuth();
// ============================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, getToken, setToken } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // ---------- State ----------
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ---------- Lấy lại thông tin user từ server ----------
  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      return null;
    }

    try {
      const me = await api.me();
      setUser(me);
      return me;
    } catch (e) {
      // Token hết hạn / tài khoản đã bị xóa → dọn phiên ngay
      if (e && (e.status === 401 || e.status === 403 || e.status === 404)) {
        setToken(null);
        setUser(null);
      }
      return null;
    }
  }, []);

  // ---------- 1. Auto-login khi mở app ----------
  useEffect(() => {
    let alive = true;

    (async () => {
      if (getToken()) {
        try {
          const me = await api.me();
          if (alive) setUser(me);
        } catch {
          setToken(null);
          if (alive) setUser(null);
        }
      }
      if (alive) setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  // ---------- 2. Nghe "refresh-user" (sửa hồ sơ → cập nhật header) ----------
  useEffect(() => {
    const handler = () => {
      if (getToken()) refresh();
    };

    window.addEventListener("refresh-user", handler);
    return () => window.removeEventListener("refresh-user", handler);
  }, [refresh]);

  // ---------- 3. Nghe "auth-expired" (api.js gặp 401) ----------
  useEffect(() => {
    const handler = () => {
      setToken(null);
      setUser(null);
    };

    window.addEventListener("auth-expired", handler);
    return () => window.removeEventListener("auth-expired", handler);
  }, []);

  // ---------- Actions ----------

  // Đăng nhập: lưu token + set user. Ném lỗi để trang Login hiển thị thông báo.
  const login = useCallback(async (email, password) => {
    const res = await api.login(email, password);
    setToken(res.token);
    setUser(res.user || null);
    return res.user;
  }, []);

  // Đăng xuất: xóa token + user, phát sự kiện "logout" cho các listener cũ
  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    try {
      window.dispatchEvent(new CustomEvent("logout"));
    } catch {}
  }, []);

  // Cập nhật cục bộ vài trường của user (không gọi server)
  const patchUser = useCallback((patch) => {
    setUser((prev) => (prev ? { ...prev, ...(patch || {}) } : prev));
  }, []);

  const value = useMemo(
    () => ({
      user,
      role: user ? user.role : null,
      token: getToken(),
      loading,
      mustChangePassword: !!(user && user.must_change_password),
      login,
      logout,
      refresh,
      setUser,
      patchUser,
    }),
    [user, loading, login, logout, refresh, patchUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useAuth() phải được dùng bên trong <AuthProvider>");
  }

  return ctx;
}

export default AuthContext;

// ============================================================
// AUTHCONTEXT.JSX — Context xác thực toàn cục (Giai đoạn 2)
// ============================================================
// Nguồn dữ liệu duy nhất về user:
//   - user, token, loading, mustChangePassword
//   - login(email, password)
//   - logout()
//   - setUser(u)        — cập nhật thủ công (sau khi đổi profile)
//   - refreshUser()     — fetch lại /auth/me
//
// Luồng khởi động:
//   1. Đọc token từ sessionStorage (api.js)
//   2. Nếu có → gọi /api/auth/me
//   3. Set user + mustChangePassword
//   4. loading = false
//
// Đồng bộ:
//   - Lắng nghe "auth-expired" từ api.js (401) → clear user
//   - Lắng nghe "refresh-user" từ Profile/Backfill → gọi lại /auth/me
//   - Lắng nghe "logout" → clear
// ============================================================

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { api, setToken, getToken } from "../api";

const AuthContext = createContext(null);

// ============================================================
// PROVIDER
// ============================================================

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Tránh race: /auth/me gọi 2 lần cùng lúc (StrictMode / effect)
  const meReqIdRef = useRef(0);
  const mountedRef = useRef(true);

  // ----------------------------------------------------------
  // setUser wrapper — luôn cập nhật mustChangePassword
  // ----------------------------------------------------------
  const setUser = useCallback((updater) => {
    setUserState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (next && typeof next === "object") {
        setMustChangePassword(!!next.must_change_password);
      } else if (!next) {
        setMustChangePassword(false);
      }
      return next;
    });
  }, []);

  // ----------------------------------------------------------
  // refreshUser — fetch lại /auth/me
  // ----------------------------------------------------------
  const refreshUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      if (mountedRef.current) {
        setUser(null);
        setMustChangePassword(false);
      }
      return null;
    }

    const myReqId = ++meReqIdRef.current;
    try {
      const me = await api.me();
      if (!mountedRef.current) return null;
      if (myReqId !== meReqIdRef.current) return null;

      setUser(me);
      return me;
    } catch (e) {
      if (!mountedRef.current) return null;
      if (myReqId !== meReqIdRef.current) return null;

      // 401 → api.js đã dispatch "auth-expired" → không cần xử lý thêm
      if (e.status !== 401) {
        console.error("[AuthContext] refreshUser failed:", e.message);
      }
      setUser(null);
      setMustChangePassword(false);
      return null;
    }
  }, [setUser]);

  // ----------------------------------------------------------
  // login
  // ----------------------------------------------------------
  const login = useCallback(
    async (email, password) => {
      const res = await api.login(email, password);
      if (!res || !res.token || !res.user) {
        throw new Error("Phản hồi đăng nhập không hợp lệ");
      }

      setToken(res.token);
      setUser(res.user);

      // Sau khi login, gọi /auth/me để lấy full info (points, avatar…)
      // nhưng KHÔNG block — set user tạm từ response trước
      try {
        const me = await api.me();
        if (mountedRef.current) setUser(me);
      } catch {
        /* Bỏ qua — user tạm đã có từ response login */
      }

      return res.user;
    },
    [setUser]
  );

  // ----------------------------------------------------------
  // logout
  // ----------------------------------------------------------
  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setMustChangePassword(false);

    // Clear cache local liên quan đến user
    try {
      sessionStorage.removeItem("canteen_cart_selected");
      localStorage.removeItem("orders_last_seen");
      localStorage.removeItem("points_last_seen");
    } catch {}
  }, [setUser]);

  // ----------------------------------------------------------
  // Effect 1 — Mount: đọc token, fetch /auth/me
  // ----------------------------------------------------------
  useEffect(() => {
    mountedRef.current = true;

    let cancelled = false;

    (async () => {
      const token = getToken();

      if (!token) {
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      // Có token → verify bằng /auth/me
      try {
        const myReqId = ++meReqIdRef.current;
        const me = await api.me();
        if (cancelled) return;
        if (myReqId !== meReqIdRef.current) return;
        setUser(me);
      } catch (e) {
        if (cancelled) return;
        if (e.status !== 401) {
          console.error("[AuthContext] initial me() failed:", e.message);
        }
        setUser(null);
        setToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [setUser]);

  // ----------------------------------------------------------
  // Effect 2 — Lắng nghe event toàn cục
  // ----------------------------------------------------------
  useEffect(() => {
    const onAuthExpired = () => {
      setUser(null);
      setMustChangePassword(false);
    };

    const onLogout = () => {
      setUser(null);
      setMustChangePassword(false);
    };

    const onRefreshUser = () => {
      refreshUser();
    };

    window.addEventListener("auth-expired", onAuthExpired);
    window.addEventListener("logout", onLogout);
    window.addEventListener("refresh-user", onRefreshUser);

    return () => {
      window.removeEventListener("auth-expired", onAuthExpired);
      window.removeEventListener("logout", onLogout);
      window.removeEventListener("refresh-user", onRefreshUser);
    };
  }, [setUser, refreshUser]);

  // ----------------------------------------------------------
  // Context value
  // ----------------------------------------------------------
  const value = {
    user,
    loading,
    mustChangePassword,
    login,
    logout,
    setUser,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================
// HOOK
// ============================================================

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    // Fallback an toàn — không crash app nếu component dùng useAuth
    // ngoài AuthProvider (VD: ErrorBoundary render lỗi).
    console.warn(
      "[useAuth] Component sử dụng useAuth() bên ngoài AuthProvider"
    );
    return {
      user: null,
      loading: false,
      mustChangePassword: false,
      login: async () => {
        throw new Error("AuthProvider chưa được mount");
      },
      logout: () => {},
      setUser: () => {},
      refreshUser: async () => null,
    };
  }

  return ctx;
}

export default AuthContext;
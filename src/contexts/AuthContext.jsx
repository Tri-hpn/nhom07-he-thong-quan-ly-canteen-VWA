// ============================================================
// AUTHCONTEXT.JSX — Context xác thực toàn cục (V5 - FINAL)
// ============================================================
// V4 (2026-10):
//   - ✅ FIX: useAuth() không còn warn spam khi Provider chưa mount
//   - ✅ FIX: fallback an toàn — KHÔNG throw ngay, trả null + warn
//
// V5 (2026-10) - FINAL:
//   - 🔧 FIX L16: refreshUser() chỉ logout khi e.status === 401.
//     Lỗi khác (500, network) → giữ nguyên user hiện tại, chỉ log.
//     Trước đây logout cả khi server lỗi tạm thời → user bị đá ra
//     oan, phải F5 lại. Sau fix, user tiếp tục dùng bình thường.
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

// ✅ chỉ warn 1 lần duy nhất
let warnedMissingProvider = false;

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const meReqIdRef = useRef(0);
  const mountedRef = useRef(true);

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

      // 🔧 FIX L16: chỉ logout khi 401 Unauthorized.
      // 401 đã được api.js xử lý trước đó (clearToken + dispatch
      // "auth-expired"), nhưng ta vẫn setUser(null) để UI khớp.
      // Lỗi khác (500, network, timeout...) → giữ nguyên user,
      // chỉ log để không đá user ra oan.
      if (e.status === 401) {
        setUser(null);
        setMustChangePassword(false);
        return null;
      }

      console.error("[AuthContext] refreshUser failed:", e.message);
      return user; // trả về user hiện tại (không đổi state)
    }
  }, [setUser, user]);

  const login = useCallback(
    async (email, password) => {
      const res = await api.login(email, password);
      if (!res || !res.token || !res.user) {
        throw new Error("Phản hồi đăng nhập không hợp lệ");
      }

      setToken(res.token);
      setUser(res.user);

      try {
        const me = await api.me();
        if (mountedRef.current) setUser(me);
      } catch {
        /* Bỏ qua */
      }

      return res.user;
    },
    [setUser]
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setMustChangePassword(false);

    try {
      sessionStorage.removeItem("canteen_cart_selected");
      localStorage.removeItem("orders_last_seen");
      localStorage.removeItem("points_last_seen");
    } catch {}
  }, [setUser]);

  // ============================================================
  // EFFECT 1 — Mount: đọc token, fetch /auth/me
  // ============================================================
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
        // 🔧 FIX L16: chỉ clear user + token khi 401.
        if (e.status === 401) {
          setUser(null);
          setToken(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [setUser]);

  // ============================================================
  // EFFECT 2 — Lắng nghe event toàn cục
  // ============================================================
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

  const value = {
    user,
    loading,
    mustChangePassword,
    login,
    logout,
    setUser,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    // ✅ chỉ warn 1 lần duy nhất, không spam
    if (!warnedMissingProvider) {
      warnedMissingProvider = true;
      console.warn(
        "[useAuth] Component gọi useAuth() bên ngoài AuthProvider. " +
          "Kiểm tra main.jsx — AuthProvider phải bọc NGOÀI BrowserRouter."
      );
    }

    // Fallback an toàn — không crash component
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
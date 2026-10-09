// ============================================================
// AUTHCONTEXT.JSX — Context xác thực toàn cục (V4 - FINAL)
// ============================================================
// V4 (2026-10):
//   - ✅ FIX: useAuth() không còn warn spam khi Provider chưa kịp mount
//     (dedupe warning bằng biến module)
//   - ✅ FIX: fallback an toàn khi Provider chưa mount — KHÔNG throw
//     ngay lập tức mà trả về null + warning
//   - Giữ V3: sessionStorage, meReqIdRef, refresh-user event
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

// ✅ FIX V4: chỉ warn 1 lần duy nhất
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

      if (e.status !== 401) {
        console.error("[AuthContext] refreshUser failed:", e.message);
      }
      setUser(null);
      setMustChangePassword(false);
      return null;
    }
  }, [setUser]);

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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    // ✅ FIX V4: chỉ warn 1 lần duy nhất, không spam
    if (!warnedMissingProvider) {
      warnedMissingProvider = true;
      console.warn(
        "[useAuth] Component gọi useAuth() bên ngoài AuthProvider. " +
          "Kiểm tra main.jsx — AuthProvider phải bọc NGOÀI BrowserRouter."
      );
    }

    // ✅ FIX V4: KHÔNG throw ngay — trả fallback an toàn
    // để component render được (không crash), chỉ warn
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
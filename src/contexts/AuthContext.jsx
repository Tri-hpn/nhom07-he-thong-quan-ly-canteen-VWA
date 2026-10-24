// ============================================================
// AUTHCONTEXT.JSX — Context xác thực toàn cục (V9 - FINAL)
// ============================================================
// V9 (2026-10):
//   - 🔧 FIX F5: Không xoá token khi gặp lỗi mạng (status 0) hoặc 503
//   - 🔧 Xử lý mượt mà quá trình Server khởi động
// ============================================================

import {
  createContext, useContext, useState, useEffect, useCallback, useRef, useMemo,
} from "react";
import { api, setToken, getToken } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);

  const meReqIdRef = useRef(0);
  const mountedRef = useRef(true);
  const isRefreshingRef = useRef(false);

  const mustChangePassword = useMemo(() => !!user?.must_change_password, [user]);

  const setUser = useCallback((updater) => {
    setUserState((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  const refreshUser = useCallback(async () => {
    if (isRefreshingRef.current) return null;
    isRefreshingRef.current = true;

    const token = getToken();
    if (!token) {
      if (mountedRef.current) setUserState(null);
      isRefreshingRef.current = false;
      return null;
    }

    const myReqId = ++meReqIdRef.current;
    try {
      const me = await api.me();
      if (!mountedRef.current) return null;
      if (myReqId !== meReqIdRef.current) return null;
      setUserState(me);
      return me;
    } catch (e) {
      if (!mountedRef.current) return null;
      if (myReqId !== meReqIdRef.current) return null;
      
      // 🔧 FIX: Chỉ logout khi 401. Nếu 503 hoặc mất mạng, giữ nguyên user hiện tại (nếu có)
      if (e.status === 401) {
        setUserState(null);
        setToken(null);
      } else if (e.status === 503) {
        console.warn("[AuthContext] Server đang khởi động, giữ nguyên session.");
      } else {
        console.error("[AuthContext] refreshUser failed:", e.message);
      }
      return null;
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.login(email, password);
    if (!res || !res.token || !res.user) throw new Error("Phản hồi đăng nhập không hợp lệ");

    setToken(res.token);
    setUserState(res.user);

    try {
      const me = await api.me();
      if (mountedRef.current) setUserState(me);
      return me;
    } catch {
      return res.user;
    }
  }, []);

  const logout = useCallback(() => {
    meReqIdRef.current++;
    setToken(null);
    setUserState(null);
    try {
      localStorage.removeItem("canteen_cart_selected");
      sessionStorage.removeItem("canteen_cart_selected");
      localStorage.removeItem("orders_last_seen");
      localStorage.removeItem("points_last_seen");
    } catch {}
  }, []);

  // MOUNT: Khôi phục session
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    (async () => {
      const token = getToken();
      if (!token) {
        if (!cancelled) { setUserState(null); setLoading(false); }
        return;
      }
      try {
        const myReqId = ++meReqIdRef.current;
        const me = await api.me();
        if (cancelled) return;
        if (myReqId !== meReqIdRef.current) return;
        setUserState(me);
      } catch (e) {
        if (cancelled) return;
        // 🔧 FIX: Không xoá token khi 503
        if (e.status === 401) { 
          setUserState(null); 
          setToken(null); 
        } else {
          console.warn("[AuthContext] Lỗi khôi phục phiên (F5):", e.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  // Listen events
  useEffect(() => {
    const onTokenChanged = (e) => {
      if (e?.detail?.hasToken) refreshUser();
      else { meReqIdRef.current++; setUserState(null); }
    };
    const onAuthExpired = () => { meReqIdRef.current++; setUserState(null); };
    const onLogout = () => { meReqIdRef.current++; setUserState(null); };

    window.addEventListener("token-changed", onTokenChanged);
    window.addEventListener("auth-expired", onAuthExpired);
    window.addEventListener("logout", onLogout);
    return () => {
      window.removeEventListener("token-changed", onTokenChanged);
      window.removeEventListener("auth-expired", onAuthExpired);
      window.removeEventListener("logout", onLogout);
    };
  }, [refreshUser]);

  const value = useMemo(
    () => ({ user, loading, mustChangePassword, login, logout, setUser, refreshUser }),
    [user, loading, mustChangePassword, login, logout, setUser, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("[useAuth] Phải bọc trong AuthProvider");
  return ctx;
}

export default AuthContext;
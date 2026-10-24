// ============================================================
// AUTHCONTEXT.JSX — Context xác thực toàn cục (V8 - FINAL)
// ============================================================
// V8 (2026-10):
//   - ✅ FIX: Listen `token-changed` → OAuth/FB/Microsoft tự
//     động refresh user ngay khi setToken được gọi.
//   - ✅ FIX: Listen `storage` event để đồng bộ giữa các tab.
//   - ✅ Giữ nguyên V7 (derive mustChangePassword từ user).
// ============================================================

import {
  createContext, useContext, useState, useEffect, useCallback, useRef, useMemo,
} from "react";
import { api, setToken, getToken } from "../api";

const AuthContext = createContext(null);
let warnedMissingProvider = false;

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
      if (e.status === 401) { setUserState(null); return null; }
      console.error("[AuthContext] refreshUser failed:", e.message);
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

  // ============================================================
  // MOUNT: đọc token → fetch /me
  // ============================================================
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
        if (e.status !== 401) console.error("[AuthContext] initial me() failed:", e.message);
        if (e.status === 401) { setUserState(null); setToken(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  // ============================================================
  // Listen token-changed (OAuth callback, external setToken)
  // ============================================================
  useEffect(() => {
    const onTokenChanged = (e) => {
      const hasToken = e?.detail?.hasToken;
      if (hasToken) {
        // Có token mới (OAuth/Login) → refresh user
        refreshUser();
      } else {
        // Token bị xoá (logout hoặc auth-expired) → clear state
        meReqIdRef.current++;
        setUserState(null);
      }
    };

    window.addEventListener("token-changed", onTokenChanged);
    return () => window.removeEventListener("token-changed", onTokenChanged);
  }, [refreshUser]);

  // ============================================================
  // Listen auth-expired, logout, refresh-user events
  // ============================================================
  useEffect(() => {
    const onAuthExpired = () => {
      meReqIdRef.current++;
      setUserState(null);
    };
    const onLogout = () => {
      meReqIdRef.current++;
      setUserState(null);
    };
    const onRefreshUser = () => { refreshUser(); };

    window.addEventListener("auth-expired", onAuthExpired);
    window.addEventListener("logout", onLogout);
    window.addEventListener("refresh-user", onRefreshUser);
    return () => {
      window.removeEventListener("auth-expired", onAuthExpired);
      window.removeEventListener("logout", onLogout);
      window.removeEventListener("refresh-user", onRefreshUser);
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
  if (!ctx) {
    if (!warnedMissingProvider) {
      warnedMissingProvider = true;
      console.warn(
        "[useAuth] Component gọi useAuth() bên ngoài AuthProvider. Kiểm tra main.jsx."
      );
    }
    return {
      user: null, loading: false, mustChangePassword: false,
      login: async () => { throw new Error("AuthProvider chưa được mount"); },
      logout: () => {},
      setUser: () => {},
      refreshUser: async () => null,
    };
  }
  return ctx;
}

export default AuthContext;
// src/contexts/AuthContext.jsx
import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { api, clearToken, getToken } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);
  const meReqIdRef = useRef(0);
  const mountedRef = useRef(true);

  const mustChangePassword = useMemo(() => !!user?.must_change_password, [user]);

  const setUser = useCallback((updater) => {
    setUserState((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  const restoreSession = useCallback(async () => {
    const myReqId = ++meReqIdRef.current;
    const token = getToken();
    if (!token) { setUserState(null); return null; }
    try {
      const me = await api.me();
      if (!mountedRef.current || myReqId !== meReqIdRef.current) return null;
      setUserState(me);
      return me;
    } catch (e) {
      if (!mountedRef.current || myReqId !== meReqIdRef.current) return null;
      
      // 🔧 FIX: CHỈ xóa token khi lỗi 401 (Hết phiên thật sự).
      // Nếu lỗi 403 (sai quyền) hay 500 (server lỗi) thì giữ nguyên token, không đá văng user.
      if (e.status === 401) { 
        setUserState(null); 
        clearToken(); 
      }
      return null;
    }
  }, []);

  const refreshUser = restoreSession;

  const login = useCallback(async (email, password) => {
    const res = await api.login(email, password);
    if (!res || !res.user) throw new Error("Phản hồi không hợp lệ");
    setUserState(res.user);
    return res.user;
  }, []);

    const logout = useCallback(async () => {
    meReqIdRef.current++;
    try { await api.logout(); } catch {}
    clearToken();
    setUserState(null);
    try {
      localStorage.removeItem("canteen_cart"); // 🔧 FIX: Xóa giỏ hàng tránh lộ dữ liệu
      localStorage.removeItem("canteen_cart_selected");
      sessionStorage.removeItem("canteen_cart_selected");
      localStorage.removeItem("orders_last_seen");
      localStorage.removeItem("points_last_seen");
    } catch {}
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    (async () => {
      await restoreSession();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; mountedRef.current = false; };
  }, [restoreSession]);

  useEffect(() => {
    const onAuthExpired = () => {
      meReqIdRef.current++;
      setUserState(null);
      clearToken();
    };
    const onLogout = () => {
      meReqIdRef.current++;
      setUserState(null);
      clearToken();
    };
    window.addEventListener("auth-expired", onAuthExpired);
    window.addEventListener("logout", onLogout);
    return () => {
      window.removeEventListener("auth-expired", onAuthExpired);
      window.removeEventListener("logout", onLogout);
    };
  }, []);

  const value = useMemo(
    () => ({ user, loading, mustChangePassword, login, logout, setUser, refreshUser, restoreSession }),
    [user, loading, mustChangePassword, login, logout, setUser, refreshUser, restoreSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("[useAuth] Phải bọc trong AuthProvider");
  return ctx;
}

export default AuthContext;
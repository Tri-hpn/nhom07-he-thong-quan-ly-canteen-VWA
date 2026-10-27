// src/contexts/AuthContext.jsx
import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { api, clearToken } from "../api";

const AuthContext = createContext(null);
const AUTH_CHANNEL = "vwa-auth";

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);
  const meReqIdRef = useRef(0);
  const mountedRef = useRef(true);
  const channelRef = useRef(null);

  const mustChangePassword = useMemo(() => !!user?.must_change_password, [user]);

  const setUser = useCallback((updater) => {
    setUserState((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  // Restore session từ cookie/Bearer — api.js tự refresh khi cần
  const restoreSession = useCallback(async () => {
    const myReqId = ++meReqIdRef.current;
    try {
      const me = await api.me();
      if (!mountedRef.current || myReqId !== meReqIdRef.current) return null;
      setUserState(me);
      return me;
    } catch (e) {
      if (!mountedRef.current || myReqId !== meReqIdRef.current) return null;
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
    try { channelRef.current?.postMessage({ type: "LOGIN", data: { user: res.user } }); } catch {}
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    meReqIdRef.current++;
    try { await api.logout(); } catch {}
    clearToken();
    setUserState(null);
    try { channelRef.current?.postMessage({ type: "LOGOUT", data: {} }); } catch {}
    try {
      localStorage.removeItem("canteen_cart");
      localStorage.removeItem("canteen_cart_selected");
      sessionStorage.removeItem("canteen_cart_selected");
      localStorage.removeItem("orders_last_seen");
      localStorage.removeItem("points_last_seen");
    } catch {}
  }, []);

  // BroadcastChannel: setup + listen
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(AUTH_CHANNEL);
    channelRef.current = ch;
    ch.onmessage = (ev) => {
      const { type, data } = ev.data || {};
      if (type === "LOGIN" && data?.user) {
        meReqIdRef.current++;
        setUserState(data.user);
      } else if (type === "LOGOUT") {
        meReqIdRef.current++;
        clearToken();
        setUserState(null);
        try {
          localStorage.removeItem("canteen_cart");
          localStorage.removeItem("canteen_cart_selected");
          sessionStorage.removeItem("canteen_cart_selected");
        } catch {}
      } else if (type === "USER_UPDATE" && data?.user) {
        setUserState((prev) =>
          prev && String(prev.id) === String(data.user.id) ? data.user : prev
        );
      }
    };
    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, []);

  // Init: restore session 1 lần
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    (async () => {
      await restoreSession();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [restoreSession]);

  // Legacy events
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
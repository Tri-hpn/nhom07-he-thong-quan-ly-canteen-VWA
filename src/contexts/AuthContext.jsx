// src/contexts/AuthContext.jsx
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { api, clearToken } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);
  const meReqIdRef = useRef(0);
  const mountedRef = useRef(true);

  const mustChangePassword = useMemo(
    () => !!user?.must_change_password,
    [user]
  );

  const setUser = useCallback((updater) => {
    setUserState((prev) =>
      typeof updater === "function" ? updater(prev) : updater
    );
  }, []);

  // ── restoreSession: F5 / cross-tab login → luôn gọi /auth/me
  // (server đọc HttpOnly cookie, không cần token FE)
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
      // 503 (Vercel cold start) → giữ session
      return null;
    }
  }, []);

  const refreshUser = restoreSession; // alias backward-compat

  const login = useCallback(async (email, password) => {
    const res = await api.login(email, password);
    if (!res || !res.user) throw new Error("Phản hồi không hợp lệ");
    setUserState(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    meReqIdRef.current++;
    try {
      await api.logout();
    } catch {}
    clearToken();
    setUserState(null);
    try {
      localStorage.removeItem("canteen_cart_selected");
      sessionStorage.removeItem("canteen_cart_selected");
      localStorage.removeItem("orders_last_seen");
      localStorage.removeItem("points_last_seen");
    } catch {}
  }, []);

  // ── Bootstrap: F5 → restoreSession (không check token FE)
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

  // ── Cross-tab: nghe window events do api.js dispatch
  useEffect(() => {
    const onTokenChanged = (e) => {
      if (e?.detail?.hasToken) restoreSession();
      else {
        meReqIdRef.current++;
        setUserState(null);
      }
    };
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

    window.addEventListener("token-changed", onTokenChanged);
    window.addEventListener("auth-expired", onAuthExpired);
    window.addEventListener("logout", onLogout);
    return () => {
      window.removeEventListener("token-changed", onTokenChanged);
      window.removeEventListener("auth-expired", onAuthExpired);
      window.removeEventListener("logout", onLogout);
    };
  }, [restoreSession]);

  const value = useMemo(
    () => ({
      user,
      loading,
      mustChangePassword,
      login,
      logout,
      setUser,
      refreshUser,
      restoreSession,
    }),
    [
      user,
      loading,
      mustChangePassword,
      login,
      logout,
      setUser,
      refreshUser,
      restoreSession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("[useAuth] Phải bọc trong AuthProvider");
  return ctx;
}

export default AuthContext;
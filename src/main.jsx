// src/main.jsx
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import App from "./App.jsx";

import "./styles.css";
import "./styles-sky.css";
import "./styles-employee.css";
import "./styles-admin.css";
import "./styles-customer.css";

async function cleanupOldServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const flagKey = "vwa_sw_cleaned_v4";
    if (sessionStorage.getItem(flagKey) === "1") return;
    sessionStorage.setItem(flagKey, "1");
    for (const reg of regs) { try { await reg.unregister(); } catch {} }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => /^vwa-|^workbox-|^api-|^runtime-/i.test(k)).map((k) => caches.delete(k).catch(() => {})));
    }
  } catch (e) { console.warn("[SW cleanup] failed:", e); }
}

async function registerPWA() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  await cleanupOldServiceWorkers();
  import("virtual:pwa-register").then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() { if (window.confirm("Có bản cập nhật mới cho Canteen VWA. Tải lại ngay?")) updateSW(true); },
      onOfflineReady() { console.log("[PWA] Sẵn sàng offline — menu vẫn xem được khi mất mạng"); },
    });
  }).catch((e) => { console.warn("[PWA] register failed:", e); });
  if (navigator.storage?.persist) { navigator.storage.persist().catch(() => {}); }
}

if (document.readyState === "complete") registerPWA();
else window.addEventListener("load", registerPWA);

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) {
    console.error("Canteen App Error caught:", error, errorInfo);
    try {
      fetch("/api/telemetry/error", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: String(error?.message || error), stack: String(error?.stack || "").slice(0, 2000), component: errorInfo?.componentStack?.slice(0, 2000), url: window.location.href, ua: navigator.userAgent, ts: Date.now() }),
      }).catch(() => {});
    } catch {}
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>
          <h2>Đã có lỗi xảy ra trong hệ thống Canteen.</h2>
          <p>Vui lòng tải lại trang hoặc kiểm tra console.</p>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 20px", background: "#ff4d4f", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", marginTop: 15 }}>Tải lại trang</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <AuthProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ErrorBoundary>
    </StrictMode>
  );
}
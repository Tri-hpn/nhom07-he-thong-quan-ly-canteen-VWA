// src/main.jsx
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import App from "./App.jsx";

import "./index.css";           // 🔴 FIX #F-1: file này trước đây KHÔNG BAO GIỜ được load
import "./styles.css";
import "./styles-sky.css";
import "./styles-employee.css";
import "./styles-admin.css";
import "./styles-customer.css";

/**
 * Dọn SW/caches cũ (migration 1 lần / session).
 * Đặt flag SAU cleanup để nếu cleanup throw giữa chừng, lần sau vẫn retry.
 */
async function cleanupOldServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const flagKey = "vwa_sw_cleaned_v4";
    if (sessionStorage.getItem(flagKey) === "1") return;

    for (const reg of regs) {
      try {
        await reg.unregister();
      } catch {}
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => /^vwa-|^workbox-|^api-|^runtime-/i.test(k))
          .map((k) => caches.delete(k).catch(() => {}))
      );
    }
    sessionStorage.setItem(flagKey, "1");
  } catch (e) {
    console.warn("[SW cleanup] failed:", e);
  }
}

/**
 * Đăng ký PWA — CHỈ chạy ở production.
 * `registerType: "prompt"` trong vite.config → onNeedRefresh được gọi khi có bản mới.
 */
async function registerPWA() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  await cleanupOldServiceWorkers();

  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          if (window.confirm("Có bản cập nhật mới cho Canteen VWA. Tải lại ngay?"))
            updateSW(true);
        },
        onOfflineReady() {
          // ✅ console.info KHÔNG bị strip trong production (chỉ log/debug/trace bị strip)
          console.info("[PWA] Sẵn sàng offline — menu vẫn xem được khi mất mạng");
        },
      });
    })
    .catch((e) => {
      console.warn("[PWA] register failed:", e);
    });

  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

if (document.readyState === "complete") registerPWA();
else window.addEventListener("load", registerPWA);

/** Bắt lỗi runtime React → báo telemetry + màn hình fallback */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("Canteen App Error caught:", error, errorInfo);
    // Telemetry tạm tắt — server chưa có endpoint POST /api/telemetry/error.
    // Khi thêm route server, bật lại khối fetch dưới.
    // if (import.meta.env.PROD) {
    //   fetch("/api/telemetry/error", { ... })
    // }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>
          <h2>Đã có lỗi xảy ra trong hệ thống Canteen.</h2>
          <p>Vui lòng tải lại trang hoặc kiểm tra console.</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 20px",
              background: "#ff4d4f",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              marginTop: 15,
            }}
          >
            Tải lại trang
          </button>
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
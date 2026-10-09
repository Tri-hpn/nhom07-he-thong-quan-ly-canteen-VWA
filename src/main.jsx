// ============================================================
// MAIN.JSX — Entry point (V5 - FINAL)
// ============================================================
// V5 (2026-10):
//   - ✅ FIX CRITICAL: AuthProvider PHẢI bọc NGOÀI BrowserRouter
//     → Không còn lỗi "AuthProvider chưa được mount"
//     → Không còn redirect loop khi share link
//   - ✅ FIX: Dùng createRoot 1 lần (guard bằng data-attribute)
//   - Giữ V4: i18n init, StrictMode, ErrorBoundary, global handlers
// ============================================================

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./components/UI";
import { AuthProvider } from "./contexts/AuthContext";
import { initI18n } from "./lib/i18n";

// ============================================================
// STYLES — Thứ tự QUAN TRỌNG (không đổi)
// ============================================================
import "./styles.css";
import "./styles-sky.css";
import "./styles-employee.css";
import "./styles-admin.css";
import "./styles-customer.css";

// ============================================================
// LƯỚI AN TOÀN TOÀN CỤC — bắt lỗi async không qua ErrorBoundary
// ============================================================
window.addEventListener("unhandledrejection", (e) => {
  console.error("[unhandledrejection]", e.reason);
});
window.addEventListener("error", (e) => {
  console.error("[window.error]", e.error || e.message);
});

// ============================================================
// ROOT
// ============================================================
const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Không tìm thấy #root trong index.html");
}

// ✅ FIX V5: guard gắn vào DOM — không bị reset khi HMR
if (rootEl.dataset.reactMounted === "1") {
  console.warn(
    "[main] #root đã được mount — skip renderApp() để tránh double-render"
  );
} else {
  rootEl.dataset.reactMounted = "1";

  const root = ReactDOM.createRoot(rootEl);

  function renderApp() {
    root.render(
      <React.StrictMode>
        {/*
          ✅ FIX CRITICAL: AuthProvider PHẢI bọc NGOÀI BrowserRouter
          ─────────────────────────────────────────────────────────
          Lý do: App.jsx gọi useAuth() ngay đầu component. Nếu
          AuthProvider nằm trong BrowserRouter → khi StrictMode
          double-render, context chưa kịp mount → useAuth() trả
          fallback lỗi → redirect loop + lỗi "AuthProvider chưa mount".
        */}
        <AuthProvider>
          <BrowserRouter
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <ThemeProvider>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </ThemeProvider>
          </BrowserRouter>
        </AuthProvider>
      </React.StrictMode>
    );
  }

  // ============================================================
  // INIT I18N — không block render, có guard chống double
  // ============================================================
  (async () => {
    try {
      const result = initI18n();
      if (result && typeof result.then === "function") {
        await result;
      }
      console.log("[i18n] init OK");
    } catch (err) {
      console.error("[i18n] init failed, rendering anyway:", err);
    } finally {
      renderApp();
    }
  })();
}
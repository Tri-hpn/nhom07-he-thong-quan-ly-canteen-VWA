// ============================================================
// MAIN.JSX — Entry point (V3)
// ============================================================
// - Guard chống double-render nếu i18n reject
// - Log rõ ràng khi i18n init
// - StrictMode giữ nguyên (dev only double-invoke effect)
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
const root = ReactDOM.createRoot(rootEl);

// ============================================================
// GUARD — chỉ render 1 lần dù i18n resolve/reject
// ============================================================
let hasRendered = false;

function renderApp() {
  if (hasRendered) return;
  hasRendered = true;

  root.render(
    <React.StrictMode>
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ThemeProvider>
          <ErrorBoundary>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </BrowserRouter>
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
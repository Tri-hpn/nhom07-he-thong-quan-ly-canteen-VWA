import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./components/UI";
import { AuthProvider } from "./contexts/AuthContext";
import { initI18n } from "./lib/i18n";
import ErrorBoundary from "./components/ErrorBoundary";

// ============================================================
// STYLES — Thứ tự QUAN TRỌNG
// ============================================================
import "./styles.css";
import "./styles-sky.css";
import "./styles-employee.css";
import "./styles-admin.css";
import "./styles-customer.css";

// ============================================================
// RENDER — Không block bởi i18n
// ============================================================
const root = ReactDOM.createRoot(document.getElementById("root"));

// ============================================================
// LƯỚI AN TOÀN TOÀN CỤC
// ============================================================
// ErrorBoundary KHÔNG bắt được lỗi xảy ra trong event handler hoặc
// trong Promise bị reject (lỗi async). Hai listener dưới đây đảm bảo
// các lỗi đó luôn hiện rõ trong console thay vì "biến mất" âm thầm.
window.addEventListener("unhandledrejection", (e) => {
  console.error("[unhandledrejection]", e.reason);
});
window.addEventListener("error", (e) => {
  console.error("[window.error]", e.error || e.message);
});

function renderApp() {
  root.render(
    <React.StrictMode>
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ThemeProvider>
          <ErrorBoundary>
            {/* Giai đoạn 2 — AuthProvider: nguồn dữ liệu duy nhất về user */}
            <AuthProvider>
              <App />
            </AuthProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
}

// Init i18n không block render — nếu lỗi vẫn render
try {
  const result = initI18n();
  if (result && typeof result.then === "function") {
    result
      .then(() => {
        console.log("[i18n] init OK");
        renderApp();
      })
      .catch((err) => {
        console.error("[i18n] init failed, rendering anyway:", err);
        renderApp();
      });
  } else {
    renderApp();
  }
} catch (err) {
  console.error("[i18n] init threw, rendering anyway:", err);
  renderApp();
}
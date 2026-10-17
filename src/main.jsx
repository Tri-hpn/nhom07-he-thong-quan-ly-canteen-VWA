// ============================================================
// MAIN.JSX â€” Entry point (V6 - FINAL)
// ============================================================
// V6 (2026-10):
//   - ðŸ”§ FIX M6: HMR dispose unmount root â€” trÃ¡nh stale component
//     sau khi sá»­a code trong dev
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
// STYLES â€” Thá»© tá»± QUAN TRá»ŒNG (khÃ´ng Ä‘á»•i)
// ============================================================
import "./styles.css";
import "./styles-sky.css";
import "./styles-employee.css";
import "./styles-admin.css";
import "./styles-customer.css";

// ============================================================
// LÆ¯á»šI AN TOÃ€N TOÃ€N Cá»¤C â€” báº¯t lá»—i async khÃ´ng qua ErrorBoundary
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
  throw new Error("KhÃ´ng tÃ¬m tháº¥y #root trong index.html");
}

// âœ… FIX V5: guard gáº¯n vÃ o DOM â€” khÃ´ng bá»‹ reset khi HMR
if (rootEl.dataset.reactMounted === "1") {
  console.warn(
    "[main] #root Ä‘Ã£ Ä‘Æ°á»£c mount â€” skip renderApp() Ä‘á»ƒ trÃ¡nh double-render"
  );
} else {
  rootEl.dataset.reactMounted = "1";

  const root = ReactDOM.createRoot(rootEl);

  function renderApp() {
    root.render(
      <React.StrictMode>
        {/*
          âœ… FIX CRITICAL: AuthProvider PHáº¢I bá»c NGOÃ€I BrowserRouter
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
  // INIT I18N â€” khÃ´ng block render, cÃ³ guard chá»‘ng double
  // ============================================================
  (async () => {
    try {
      const result = initI18n();
      if (result && typeof result.then === "function") {
        await result;
      }

    } catch (err) {
      console.error("[i18n] init failed, rendering anyway:", err);
    } finally {
      renderApp();
    }
  })();

  // âœ… FIX M6: HMR cleanup â€” unmount root Ä‘á»ƒ láº§n sau mount láº¡i tá»« Ä‘áº§u
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      try {
        delete rootEl.dataset.reactMounted;
        root.unmount();
      } catch (e) {
        console.warn("[main] HMR dispose error:", e);
      }
    });
  }
}
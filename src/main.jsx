import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import App from "./App.jsx";

// ============================================================
// CSS IMPORTS — THỨ TỰ BẮT BUỘC (cascade)
// 1. styles.css         → base + reset + layout + toast
// 2. styles-sky.css     → theme xanh da trời (sidebar, topbar, form)
// 3. styles-employee.css→ layout KDS / Chat / Menu86 / Dashboard nhân viên
// 4. styles-admin.css   → layout Owner (menu, employees, print)
// 5. styles-customer.css→ layout Customer (home, menu, cart, wallet, chat)
// ============================================================
import "./styles.css";
import "./styles-sky.css";
import "./styles-employee.css";
import "./styles-admin.css";
import "./styles-customer.css";

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
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "40px", textAlign: "center", fontFamily: "sans-serif" }}>
          <h2>Đã có lỗi xảy ra trong hệ thống Canteen.</h2>
          <p>Vui lòng tải lại trang hoặc kiểm tra console.</p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: "10px 20px", background: "#ff4d4f", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", marginTop: "15px" }}
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
  const root = createRoot(rootElement);

  root.render(
    <StrictMode>
      <ErrorBoundary>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ErrorBoundary>
    </StrictMode>
  );
}
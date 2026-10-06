// ============================================================
// ERRORBOUNDARY.JSX — Chặn lỗi "trắng màn hình" (V3)
// ============================================================
// V3:
//   - Tự lấy `t` từ useI18n thông qua wrapper I18nErrorBoundary
//   - Không còn phải truyền prop t từ ngoài
//   - Giữ export default ErrorBoundary (class) cho React yêu cầu
//   - safeTranslate fallback tiếng Việt nếu i18n chưa ready
// ============================================================

import { Component, useMemo, useState } from "react";
import {
  AlertTriangle,
  RefreshCw,
  Home,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from "lucide-react";
import { useI18n } from "../hooks/useI18n";

// ============================================================
// SAFE TRANSLATE — Fallback khi i18n chưa sẵn sàng
// ============================================================

function safeTranslate(t, key) {
  if (typeof t === "function") {
    try {
      const result = t(key);
      if (typeof result === "string" && result.trim()) return result;
    } catch {
      /* Bỏ qua lỗi i18n */
    }
  }
  return key;
}

// ============================================================
// STYLES (inline — không phụ thuộc CSS external)
// ============================================================

const S = {
  wrap: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "clamp(16px, 4vw, 40px)",
    background: "var(--bg-primary, #f5f7fb)",
  },
  card: {
    width: "100%",
    maxWidth: 560,
    background: "var(--card-bg, #ffffff)",
    border: "1px solid var(--border-color, #e5e9ef)",
    borderRadius: 16,
    padding: "clamp(20px, 4vw, 32px)",
    boxShadow: "0 12px 40px rgba(15, 23, 42, 0.10)",
    textAlign: "center",
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    margin: "0 auto 16px",
    background: "rgba(239, 68, 68, 0.12)",
    color: "var(--danger, #ef4444)",
  },
  title: {
    fontSize: "clamp(17px, 2.4vw, 21px)",
    fontWeight: 700,
    color: "var(--text-primary, #172033)",
    lineHeight: 1.35,
    marginBottom: 8,
  },
  desc: {
    fontSize: 14,
    lineHeight: 1.6,
    color: "var(--text-muted, #64748b)",
    marginBottom: 20,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  btnPrimary: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 18px",
    minHeight: 44,
    borderRadius: 10,
    border: 0,
    background: "var(--brand, #2634d5)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnGhost: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 18px",
    minHeight: 44,
    borderRadius: 10,
    border: "1px solid var(--border-color, #e5e9ef)",
    background: "var(--card-bg, #ffffff)",
    color: "var(--text-primary, #172033)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  detailToggle: {
    marginTop: 20,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    minHeight: 40,
    border: 0,
    background: "transparent",
    color: "var(--text-muted, #64748b)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  detailBox: {
    marginTop: 12,
    textAlign: "left",
    background: "var(--bg-tertiary, #f5f7fb)",
    border: "1px solid var(--border-color, #e5e9ef)",
    borderRadius: 10,
    padding: 12,
    maxHeight: 240,
    overflow: "auto",
  },
  pre: {
    margin: 0,
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: 12,
    lineHeight: 1.55,
    color: "var(--danger, #ef4444)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
};

// ============================================================
// ERROR FALLBACK UI — Function Component dùng hook
// ============================================================

function ErrorFallback({ error, errorInfo, onReload, onGoHome }) {
  const { t } = useI18n();
  const [showDetail, setShowDetail] = useState(false);
  const [copied, setCopied] = useState(false);

  const detailText = useMemo(() => {
    if (!error) return "";
    return [
      "Message: " + (error.message || String(error)),
      "",
      "Stack:",
      error.stack || "(không có stack)",
      "",
      "Component stack:",
      errorInfo && errorInfo.componentStack
        ? errorInfo.componentStack.trim()
        : "(không có)",
    ].join("\n");
  }, [error, errorInfo]);

  const handleCopy = async () => {
    const markDone = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(detailText);
        markDone();
        return;
      }
    } catch {
      /* fallback bên dưới */
    }

    try {
      const ta = document.createElement("textarea");
      ta.value = detailText;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      markDone();
    } catch {
      /* Không copy được — bỏ qua */
    }
  };

  const titleText = safeTranslate(t, "Đã xảy ra lỗi khi hiển thị trang");
  const descText = safeTranslate(
    t,
    "Rất tiếc, trang này gặp sự cố ngoài ý muốn. Bạn hãy thử tải lại trang, nếu vẫn lỗi thì quay về trang chủ."
  );
  const retryText = safeTranslate(t, "Thử lại");
  const homeText = safeTranslate(t, "Về trang chủ");
  const showDetailText = safeTranslate(t, "Xem chi tiết lỗi");
  const hideDetailText = safeTranslate(t, "Ẩn chi tiết lỗi");
  const copiedText = safeTranslate(t, "Đã sao chép");
  const copyText = safeTranslate(t, "Sao chép chi tiết");

  return (
    <div style={S.wrap}>
      <div style={S.card} role="alert">
        <div style={S.iconBox} aria-hidden="true">
          <AlertTriangle size={30} />
        </div>

        <div style={S.title}>{titleText}</div>
        <div style={S.desc}>{descText}</div>

        <div style={S.actions}>
          <button type="button" style={S.btnPrimary} onClick={onReload}>
            <RefreshCw size={16} />
            {retryText}
          </button>

          <button type="button" style={S.btnGhost} onClick={onGoHome}>
            <Home size={16} />
            {homeText}
          </button>
        </div>

        <button
          type="button"
          style={S.detailToggle}
          onClick={() => setShowDetail((s) => !s)}
          aria-expanded={showDetail}
        >
          {showDetail ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {showDetail ? hideDetailText : showDetailText}
        </button>

        {showDetail && (
          <div style={S.detailBox}>
            <pre style={S.pre}>{detailText}</pre>
            <button
              type="button"
              style={{ ...S.btnGhost, marginTop: 12 }}
              onClick={handleCopy}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? copiedText : copyText}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ERROR BOUNDARY — Class Component
// ============================================================

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };

    this.handleReload = this.handleReload.bind(this);
    this.handleGoHome = this.handleGoHome.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("[ErrorBoundary] Lỗi runtime:", error);
    if (errorInfo && errorInfo.componentStack) {
      console.error(
        "[ErrorBoundary] Component stack:",
        errorInfo.componentStack
      );
    }
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, errorInfo: null });
    }
  }

  handleReload() {
    try {
      window.location.reload();
    } catch {
      /* ignore */
    }
  }

  handleGoHome() {
    try {
      window.location.href = "/";
    } catch {
      /* ignore */
    }
  }

  render() {
    const { error, errorInfo } = this.state;
    const { children } = this.props;

    if (!error) return children;

    return (
      <ErrorFallback
        error={error}
        errorInfo={errorInfo}
        onReload={this.handleReload}
        onGoHome={this.handleGoHome}
      />
    );
  }
}

// ============================================================
// WRAPPER — Dùng cái này nếu muốn tự động có resetKey theo route
// ============================================================
// CÁCH DÙNG TRONG App.jsx:
//   import { RouteErrorBoundary } from "./components/ErrorBoundary";
//   <RouteErrorBoundary resetKey={location.pathname}>
//     <App />
//   </RouteErrorBoundary>
// ============================================================

export function RouteErrorBoundary({ children, resetKey }) {
  return <ErrorBoundary resetKey={resetKey}>{children}</ErrorBoundary>;
}
// ============================================================
// ERRORBOUNDARY.JSX — Chặn lỗi "trắng màn hình"
// ============================================================
// Trước đây dự án KHÔNG có Error Boundary. Bất kỳ lỗi runtime nào
// (ví dụ: quên import 1 icon → JSX nhận `undefined`) đều làm TOÀN BỘ
// trang trắng xóa: không thông báo, không hướng dẫn, rất khó debug.
//
// Component này bắt lỗi trong lúc React render và hiển thị:
//   • Thông báo thân thiện (tiếng Việt, có i18n)
//   • Nút "Thử lại" và "Về trang chủ"
//   • Chi tiết lỗi (thu gọn) + nút Sao chép để gửi cho dev
//
// ✅ FIX: Dùng `t` an toàn — fallback về chuỗi gốc nếu i18n chưa sẵn sàng
// ============================================================

import { Component } from "react";
import {
  AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp, Copy, Check,
} from "lucide-react";

// ✅ FIX: Import an toàn — không crash nếu lib/i18n chưa load
let i18nT = null;
try {
  const i18nModule = require("../lib/i18n");
  i18nT = i18nModule?.t || null;
} catch {
  i18nT = null;
}

/**
 * ✅ FIX: Hàm dịch an toàn.
 * - Nếu `t` khả dụng → dùng `t(key)`
 * - Nếu `t` undefined hoặc throw → trả về `key` gốc (tiếng Việt)
 *
 * Điều này đảm bảo ErrorBoundary KHÔNG BAO GIỜ crash
 * ngay cả khi i18n chưa khởi tạo xong.
 */
function safeT(key) {
  try {
    if (typeof i18nT === "function") {
      const result = i18nT(key);
      if (typeof result === "string" && result.trim()) return result;
    }
  } catch {
    // Bỏ qua lỗi i18n, dùng fallback
  }
  return key;
}

// ------------------------------------------------------------
// Inline style — dùng đúng biến CSS của dự án (styles.css :root)
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// COMPONENT
// ------------------------------------------------------------

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
      errorInfo: null,
      showDetail: false,
      copied: false,
    };

    this.handleReload = this.handleReload.bind(this);
    this.handleGoHome = this.handleGoHome.bind(this);
    this.toggleDetail = this.toggleDetail.bind(this);
    this.handleCopy = this.handleCopy.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("[ErrorBoundary] Lỗi runtime:", error);
    if (errorInfo && errorInfo.componentStack) {
      console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);
    }
  }

  componentDidUpdate(prevProps) {
    // Đổi route (resetKey) → cho phép render lại bình thường
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, errorInfo: null, showDetail: false });
    }
  }

  handleReload() {
    try {
      window.location.reload();
    } catch (e) {
      /* ignore */
    }
  }

  handleGoHome() {
    try {
      window.location.href = "/";
    } catch (e) {
      /* ignore */
    }
  }

  toggleDetail() {
    this.setState((s) => ({ showDetail: !s.showDetail }));
  }

  buildDetailText() {
    const { error, errorInfo } = this.state;
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
  }

  handleCopy() {
    const text = this.buildDetailText();
    const markDone = () => {
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 2000);
    };

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(text)
          .then(markDone)
          .catch(() => this.fallbackCopy(text, markDone));
      } else {
        this.fallbackCopy(text, markDone);
      }
    } catch (e) {
      this.fallbackCopy(text, markDone);
    }
  }

  fallbackCopy(text, done) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done();
    } catch (e) {
      /* ignore */
    }
  }

  render() {
    const { error, showDetail, copied } = this.state;

    // Không có lỗi → render bình thường
    if (!error) return this.props.children;

    return (
      <div style={S.wrap}>
        <div style={S.card} role="alert">
          <div style={S.iconBox} aria-hidden="true">
            <AlertTriangle size={30} />
          </div>

          {/* ✅ FIX: Dùng safeT() thay vì t() */}
          <div style={S.title}>
            {safeT("Đã xảy ra lỗi khi hiển thị trang")}
          </div>

          <div style={S.desc}>
            {safeT(
              "Rất tiếc, trang này gặp sự cố ngoài ý muốn. Bạn hãy thử tải lại trang, nếu vẫn lỗi thì quay về trang chủ."
            )}
          </div>

          <div style={S.actions}>
            <button
              type="button"
              style={S.btnPrimary}
              onClick={this.handleReload}
            >
              <RefreshCw size={16} />
              {safeT("Thử lại")}
            </button>

            <button
              type="button"
              style={S.btnGhost}
              onClick={this.handleGoHome}
            >
              <Home size={16} />
              {safeT("Về trang chủ")}
            </button>
          </div>

          <button
            type="button"
            style={S.detailToggle}
            onClick={this.toggleDetail}
            aria-expanded={showDetail}
          >
            {showDetail ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {showDetail ? safeT("Ẩn chi tiết lỗi") : safeT("Xem chi tiết lỗi")}
          </button>

          {showDetail && (
            <div style={S.detailBox}>
              <pre style={S.pre}>{this.buildDetailText()}</pre>
              <button
                type="button"
                style={{ ...S.btnGhost, marginTop: 12 }}
                onClick={this.handleCopy}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? safeT("Đã sao chép") : safeT("Sao chép chi tiết")}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
}
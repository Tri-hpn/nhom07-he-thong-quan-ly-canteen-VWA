// ============================================================
// PAYMENTRESULT.JSX — Trang kết quả thanh toán
// ============================================================
// Dùng cho các luồng thanh toán redirect (VD: VNPay, MoMo):
//   /customer/payment-result?status=success&code=VWA-1234
//   /customer/payment-result?status=failed&code=VWA-1234
//   /customer/payment-result?status=pending&code=VWA-1234
//
// Query params:
//   status — "success" | "failed" | "pending" | "cancel" (mặc định: success)
//   code   — Mã đơn hàng (tùy chọn)
//
// ✅ SOURCE-TEXT I18N: dùng tiếng Việt trực tiếp qua t("...")
// ============================================================

import { useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { useI18n } from "../hooks/useI18n";

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function PaymentResult() {
  const [params] = useSearchParams();
  const status = params.get("status") || "success";
  const code = params.get("code") || "";
  const { t } = useI18n();

  // Cấu hình cho từng status — dùng source-text
  const STATUS_CONFIG = {
    success: {
      icon: CheckCircle2,
      bg: "#d1fae5",
      color: "#18a967",
      title: t("Thanh toán thành công!"),
      desc: t("Cảm ơn bạn đã đặt hàng tại Canteen VWA."),
      primaryCTA: { label: t("Xem đơn hàng"), to: "/customer/orders" },
    },
    failed: {
      icon: XCircle,
      bg: "#fee2e2",
      color: "#ef4444",
      title: t("Thanh toán thất bại"),
      desc: t("Vui lòng thử lại hoặc chọn phương thức thanh toán khác."),
      primaryCTA: { label: t("Thử lại"), to: "/customer/checkout" },
    },
    cancel: {
      icon: XCircle,
      bg: "#fef3c7",
      color: "#f59e0b",
      title: t("Đã hủy thanh toán"),
      desc: t("Bạn đã hủy giao dịch. Đơn hàng chưa được tạo."),
      primaryCTA: { label: t("Quay lại giỏ hàng"), to: "/customer/cart" },
    },
    pending: {
      icon: Clock,
      bg: "#dbeafe",
      color: "#2634d5",
      title: t("Đang xử lý thanh toán"),
      desc: t("Hệ thống đang xác nhận giao dịch. Vui lòng chờ trong giây lát."),
      primaryCTA: { label: t("Xem đơn hàng"), to: "/customer/orders" },
    },
  };

  // Fallback về "success" nếu status không hợp lệ
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.success;
  const Icon = config.icon;

  // ---------- Effects ----------

  /**
   * Tự động đóng popup nếu trang được mở dưới dạng popup
   * (một số cổng thanh toán mở popup mới để redirect)
   */
  useEffect(() => {
    if (window.opener && window.opener !== window) {
      const timer = setTimeout(() => window.close(), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div
      className="payment-result-card"
      style={{
        maxWidth: 500,
        margin: "60px auto",
        background: "var(--card-bg, #fff)",
        borderRadius: 16,
        padding: 40,
        textAlign: "center",
        border: "1px solid var(--border-color, #e7ebf0)",
      }}
    >
      {/* ---------- Icon tròn ---------- */}
      <div
        role="img"
        aria-label={config.title}
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          margin: "0 auto 20px",
          display: "grid",
          placeItems: "center",
          background: config.bg,
          color: config.color,
        }}
      >
        <Icon size={44} />
      </div>

      {/* ---------- Tiêu đề ---------- */}
      <h2
        style={{
          margin: "0 0 12px",
          color: "var(--text-primary, #172033)",
          fontSize: 22,
        }}
      >
        {config.title}
      </h2>

      {/* ---------- Mã đơn (nếu có) ---------- */}
      {code && (
        <p
          style={{
            color: "var(--text-muted, #64748b)",
            marginBottom: 20,
            fontSize: 13,
          }}
        >
          {t("Mã đơn")}:{" "}
          <b style={{ color: "var(--text-primary, #172033)" }}>{code}</b>
        </p>
      )}

      {/* ---------- Mô tả ---------- */}
      <p
        style={{
          color: "var(--text-muted, #64748b)",
          marginBottom: 24,
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        {config.desc}
      </p>

      {/* ---------- Nút CTA ---------- */}
      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <Link to={config.primaryCTA.to} style={primaryBtnStyle}>
          {config.primaryCTA.label}
        </Link>

        <Link to="/customer" style={secondaryBtnStyle}>
          {t("Về trang chủ")}
        </Link>
      </div>
    </div>
  );
}

// ============================================================
// STYLE CONSTANTS
// ============================================================

const primaryBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 20px",
  background: "#2634d5",
  color: "#fff",
  borderRadius: 10,
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 13,
  transition: "all 0.2s",
};

const secondaryBtnStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 20px",
  background: "var(--card-bg, #fff)",
  color: "var(--text-primary, #172033)",
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 10,
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 13,
  transition: "all 0.2s",
};
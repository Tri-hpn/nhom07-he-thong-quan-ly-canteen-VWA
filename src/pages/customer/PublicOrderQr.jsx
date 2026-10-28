// ============================================================
// PUBLICORDERQR.JSX — Tra cứu công khai qua QR (V2)
// ============================================================
// V2 (B9.3b):
//   - Thêm useI18n cho toàn bộ text
//   - Số + date dùng locale dynamic
//   - Guard item.qty / item.price (fallback qty/unitPrice)

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { money } from "../../components/UI";
import { useI18n } from "../../hooks/useI18n";

const POLL_MS = 15000;

function dateLabel(value, locale) {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString(locale || "vi");
  } catch {
    return "";
  }
}

export default function PublicOrderQr() {
  const { code = "" } = useParams();
  const { t, locale } = useI18n();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const result = await api.orders.publicQrLookup(code);
        if (active) {
          setOrder(result?.order || null);
          setError(result?.order ? "" : t("Không tìm thấy đơn hàng."));
        }
      } catch (e) {
        if (active) {
          setError(e?.message || t("Không thể tải thông tin đơn hàng."));
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    setLoading(true);
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [code, t]);

  const ready = order?.status === "Sẵn sàng nhận";
  const cancelled = order?.status === "Đã hủy";
  const statusColor = ready ? "#15803d" : cancelled ? "#dc2626" : "#1d4ed8";
  const statusBg = ready ? "#dcfce7" : cancelled ? "#fee2e2" : "#dbeafe";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f6fc",
        padding: "28px 16px",
        boxSizing: "border-box",
        fontFamily: "Arial, sans-serif",
        color: "#172033",
      }}
    >
      <div style={{ maxWidth: 650, margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              background: "#2634d5",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 900,
            }}
          >
            VWA
          </div>
          <div>
            <strong style={{ display: "block", fontSize: 18 }}>CANTEEN VWA</strong>
            <span style={{ fontSize: 12, color: "#64748b" }}>{t("Tra cứu đơn hàng")}</span>
          </div>
        </header>

        <section
          style={{
            background: "#fff",
            border: "1px solid #dce3ef",
            borderRadius: 22,
            padding: 22,
            boxShadow: "0 12px 36px rgba(15,23,42,.07)",
          }}
        >
          {loading && !order ? (
            <p style={{ textAlign: "center", padding: 28 }}>
              {t("Đang tải thông tin đơn hàng...")}
            </p>
          ) : error ? (
            <div role="alert" style={{ padding: 12, color: "#b91c1c" }}>
              <strong>{t("Không mở được đơn hàng")}</strong>
              <p>{error}</p>
              <p style={{ fontSize: 13 }}>
                {t("Hãy kiểm tra kết nối mạng và quét lại mã QR trên đơn hàng.")}
              </p>
            </div>
          ) : order ? (
            <>
              <div style={{ color: "#64748b", fontSize: 12, fontWeight: 700 }}>
                {t("THÔNG TIN ĐƠN HÀNG")}
              </div>
              <h1
                style={{
                  fontSize: 23,
                  overflowWrap: "anywhere",
                  margin: "8px 0 14px",
                }}
              >
                #{order.code}
              </h1>

              <span
                style={{
                  display: "inline-flex",
                  padding: "7px 11px",
                  borderRadius: 99,
                  background: statusBg,
                  color: statusColor,
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                {t(order.status)}
              </span>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 10,
                  padding: "16px 0",
                  borderBottom: "1px solid #e2e8f0",
                  fontSize: 13,
                  color: "#64748b",
                }}
              >
                <span>{t("Thời gian đặt")}</span>
                <strong style={{ color: "#172033" }}>
                  {dateLabel(order.created_at, locale) || "—"}
                </strong>
              </div>

              {order.counter_name && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "14px 0",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  <span style={{ color: "#64748b" }}>{t("Quầy nhận")}</span>
                  <strong>{order.counter_name}</strong>
                </div>
              )}

              <h2 style={{ fontSize: 16, margin: "22px 0 12px" }}>
                {t("Danh sách món")}
              </h2>
              <div style={{ display: "grid", gap: 10 }}>
                {(order.items || []).map((item, index) => {
                  const qty = Number(item.qty ?? item.quantity ?? 1) || 1;
                  const price = Number(item.price ?? item.unitPrice ?? 0) || 0;
                  return (
                    <div
                      key={`${item.name}-${index}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: 13,
                        background: "#f5f7ff",
                        borderRadius: 13,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: "block", overflowWrap: "anywhere" }}>
                          {item.name}
                        </strong>
                        <span style={{ color: "#64748b", fontSize: 13 }}>
                          {t("Số lượng")}: {qty}
                        </span>
                      </div>
                      <strong style={{ whiteSpace: "nowrap" }}>
                        {money(price * qty)}
                      </strong>
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  paddingTop: 20,
                  marginTop: 18,
                  borderTop: "1px solid #e2e8f0",
                }}
              >
                <strong>{t("Thực thanh toán")}</strong>
                <strong style={{ color: "#2634d5", fontSize: 22 }}>
                  {money(order.total)}
                </strong>
              </div>

              {ready && (
                <p
                  style={{
                    background: "#dcfce7",
                    color: "#166534",
                    padding: 13,
                    borderRadius: 12,
                    lineHeight: 1.5,
                    fontSize: 14,
                  }}
                >
                  {t("Đơn hàng đã sẵn sàng nhận. Vui lòng đến quầy nhận món.")}
                </p>
              )}
              {cancelled && (
                <p
                  style={{
                    background: "#fee2e2",
                    color: "#991b1b",
                    padding: 13,
                    borderRadius: 12,
                    fontSize: 14,
                  }}
                >
                  {t("Đơn hàng này đã bị hủy.")}
                </p>
              )}
              <p style={{ color: "#94a3b8", fontSize: 11, marginTop: 18 }}>
                {t("Thông tin trạng thái được cập nhật tự động từ hệ thống.")}
              </p>
            </>
          ) : null}
        </section>

        <div style={{ textAlign: "center", marginTop: 18 }}>
          <Link
            to="/"
            style={{
              display: "inline-block",
              color: "#2634d5",
              fontWeight: 700,
              textDecoration: "none",
              padding: 10,
            }}
          >
            {t("Canteen VWA")}
          </Link>
        </div>
      </div>
    </main>
  );
}
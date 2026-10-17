// ============================================================
// KDSTICKET.JSX — Ticket đơn trong KDS board (V5)
// ============================================================
// V5 (2026-10):
//   - ✅ Logic Sống Xanh:
//       + Bước 4 (Sẵn sàng nhận): Hiện nút Duyệt/Từ chối.
//       + Bước 1, 2, 3: Chỉ hiện badge nhỏ báo "Có Sống Xanh".
// ============================================================

import {
  Check, Clock, Volume2, CheckCircle2, Soup, AlertTriangle,
  XCircle, PackageCheck, Loader2, Timer, Ban, Leaf,
} from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import { money } from "./UI";
import { fmtTime, getDateLabelVariant } from "../lib/datetime";

function fmtElapsed(seconds) {
  if (!seconds || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const ACTION_LABELS = {
  "Chờ xác nhận": "Duyệt Đơn",
  "Đã xác nhận": "Bắt Đầu Nấu",
  "Đang chuẩn bị": "Báo Xong Món",
  "Sẵn sàng nhận": "Khách Đã Nhận Món",
};

const PAYMENT_LABELS = {
  "Tiền mặt": "Tiền mặt tại quầy",
  cash: "Tiền mặt tại quầy",
  CASH: "Tiền mặt tại quầy",
  QR: "VietQR (Đã TT)",
  qr: "VietQR (Đã TT)",
  VietQR: "VietQR (Đã TT)",
  "Ví Canteen": "Ví Nội Bộ VWA",
  WALLET: "Ví Nội Bộ VWA",
  wallet: "Ví Nội Bộ VWA",
  "Thẻ": "Thẻ SV",
  card: "Thẻ SV",
  "Thẻ SV": "Thẻ SV",
};

// ============================================================
// PICKUP TICKET (variant "pickup" — giữ nguyên)
// ============================================================

function PickupTicket({ order, pickupNumber, onAction, onRecall, loading, t }) {
  return (
    <div className="kds-pickup">
      <div className="kds-pickup__bar" />
      <div className="kds-pickup__inner">
        <div className="kds-pickup__head">
          <div className="kds-pickup__id-group">
            <span className="kds-pickup__id">#{pickupNumber}</span>
            <span className="kds-pickup__sub">{order.code}</span>
          </div>
          {order.pickupStatus ? (
            <span className="kds-pickup__status">{order.pickupStatus}</span>
          ) : (
            <span className="kds-pickup__status kds-pickup__status--new">
              {t("Mới sẵn sàng")}
            </span>
          )}
        </div>

        <div className="kds-pickup__info">
          <span className="kds-pickup__customer">
            {t("Khách:")} <b>{order.customer_name}</b>
          </span>
          <p className="kds-pickup__items">
            {order.items?.map((it) => `${it.name} x${it.qty}`).join(", ")}
          </p>
        </div>

        <div
          className={`kds-pickup__actions ${
            onRecall ? "" : "kds-pickup__actions--single"
          }`}
        >
          {onRecall && (
            <button
              type="button"
              className="kds-pickup__btn kds-pickup__btn--ghost"
              onClick={onRecall}
              disabled={loading}
            >
              <Volume2 size={14} />
              {t("Gọi Lại")}
            </button>
          )}
          <button
            type="button"
            className="kds-pickup__btn kds-pickup__btn--success"
            onClick={() => onAction?.(order)}
            disabled={loading}
          >
            <CheckCircle2 size={14} />
            {onRecall ? t("Đã Trao") : t("Xác Nhận Đã Trao Khay")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN
// ============================================================

export default function KDSTicket({
  variant = "prep",
  layout = "compact",
  order,
  pickupNumber,
  elapsed = 0,
  isPriority = false,
  isProcessing = false,
  onAction,
  onAdvance,
  onReject,
  onRecall,
  onApproveGreen,
  onRejectGreen,
  greenBusy = false,
  loading = false,
  urgent = false,
  t: tProp,
}) {
  const { t: tHook } = useI18n();
  const t = tProp || tHook;

  const priority = isPriority || urgent;
  const processing = isProcessing || loading;
  const handleAdvance = onAdvance || onAction;

  if (variant === "pickup") {
    return (
      <PickupTicket
        order={order}
        pickupNumber={pickupNumber}
        onAction={handleAdvance}
        onRecall={onRecall}
        loading={processing}
        t={t}
      />
    );
  }

  const normalizedVariant = variant === "preparing" ? "prep" : variant;

  const isPending = normalizedVariant === "pending";
  const isConfirmed = normalizedVariant === "confirmed";
  const isPrep = normalizedVariant === "prep";
  const isReady = normalizedVariant === "ready";

  const items = order.items || [];
  const total = Number(order.total) || 0;

  const elapsedMin = Math.floor(elapsed / 60);
  const isUrgent = elapsedMin >= 12;

  const paymentLabel =
    PAYMENT_LABELS[order.payment] || order.payment || t("Tiền mặt tại quầy");

  const actionLabel =
    ACTION_LABELS[order.status] ||
    (isPrep ? t("Báo Xong Món") : t("Xử lý"));

  const dateVariant = getDateLabelVariant(order.created_at);
  const showDateLabel = dateVariant && dateVariant !== "today";
  const dateLabelText = (() => {
    if (!showDateLabel) return "";
    if (dateVariant === "yesterday") return t("Hôm qua");
    const d = new Date(order.created_at);
    const dd = d.getDate().toString().padStart(2, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    return `${dd}/${mm}`;
  })();

  const showReject = isPending && typeof onReject === "function";

  const isTall = layout === "tall";

  // 🔧 Xác định có điểm Sống Xanh hay không
  const hasGreen = 
    order.green_status === "pending" || 
    order.green_status === "approved" || 
    Number(order.green_points) > 0;

  return (
    <article
      className={`kds-card ${
        processing ? "kds-card--processing" : ""
      } ${priority ? "kds-ticket--priority" : ""}`}
    >
      {/* HEAD */}
      <div className="kds-card__head">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            minWidth: 0,
          }}
        >
          <span className="kds-card__code">{order.code}</span>
          {isUrgent && isPending && (
            <span className="kds-card__tag kds-card__tag--danger">
              {t("Còn")} {Math.max(0, 12 - elapsedMin)}p
            </span>
          )}
          {isConfirmed && (
            <span className="kds-card__tag kds-card__tag--primary">
              {t("Chờ Bếp")}
            </span>
          )}
          {isPrep && (
            <span className="kds-card__tag kds-card__tag--primary">
              {t("BẾP")}
            </span>
          )}
          {isReady && (
            <span className="kds-card__tag kds-card__tag--success">
              {t("ĐÃ BÁO KHÁCH")}
            </span>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 4,
            flexShrink: 0,
          }}
        >
          <span
            className={`kds-card__time-badge ${
              isUrgent ? "kds-card__time-badge--urgent" : ""
            }`}
          >
            {fmtTime(order.created_at)}
          </span>
          {showDateLabel && (
            <span
              className={`kds-card__date-label kds-card__date-label--${dateVariant}`}
            >
              {dateLabelText}
            </span>
          )}
        </div>
      </div>

      {/* CUSTOMER — ẩn khi tall; hiện MSSV/email */}
      {!isTall && (
        <div className="kds-card__customer">
          {order.customer_name || t("Khách")}{" "}
          {order.customer_mssv ? (
            <span className="kds-card__customer-id">
              (MSSV: {order.customer_mssv})
            </span>
          ) : order.customer_email ? (
            <span className="kds-card__customer-id">
              ({order.customer_email})
            </span>
          ) : null}
        </div>
      )}

      {/* TIMER */}
      {isPrep && !isTall && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--st-text-muted)",
            fontWeight: 600,
          }}
        >
          <Timer size={13} />
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {fmtElapsed(elapsed)}
          </span>
        </div>
      )}

      {/* ITEMS */}
      <div className="kds-card__items">
        {items.slice(0, 4).map((it, i) => (
          <div key={i} className="kds-card__item">
            <span className="kds-card__item-name">
              {it.qty}x {it.name}
            </span>
            <span className="kds-card__item-price">
              {money((Number(it.price) || 0) * (Number(it.qty) || 0))}
            </span>
          </div>
        ))}

        {items.length > 4 && (
          <div
            style={{
              fontSize: 11,
              color: "var(--st-text-muted)",
              fontStyle: "italic",
              textAlign: "center",
              paddingTop: 2,
            }}
          >
            +{items.length - 4} {t("món khác")}
          </div>
        )}

        {order.note && (
          <div className="kds-card__note">
            <AlertTriangle
              size={12}
              style={{ flexShrink: 0, marginTop: 2 }}
            />
            <span>{order.note}</span>
          </div>
        )}
      </div>

      {/* META */}
      <div className="kds-card__meta">
        <span
          className={`kds-card__payment ${
            order.payment === "Ví Canteen" || order.payment === "WALLET"
              ? "kds-card__payment--success"
              : ""
          } ${
            order.payment === "QR" || order.payment === "VietQR"
              ? "kds-card__payment--primary"
              : ""
          }`}
        >
          <CheckCircle2 size={14} />
          {paymentLabel}
        </span>
        <span className="kds-card__total">{money(total)}</span>
      </div>

      {/* GREEN STATUS */}
      {hasGreen && (
        isReady ? (
          // Bước 4: Khối Duyệt/Từ chối đầy đủ
          <div className="kds-card__green-block" style={{
            marginTop: 6, padding: "8px 10px",
            background: "rgba(24, 169, 103, 0.08)",
            border: "1px solid rgba(24, 169, 103, 0.35)",
            borderRadius: 8,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#18a967" }}>
              <Leaf size={14} />
              <span>{order.green_status === "pending" ? t("Chờ duyệt Sống Xanh") : t("Đã duyệt Sống Xanh")} +{order.green_points || 0} {t("điểm")}</span>
            </div>
            {order.green_status === "pending" && (onApproveGreen || onRejectGreen) && (
              <div style={{ display: "flex", gap: 6 }}>
                {onApproveGreen && (
                  <button
                    type="button"
                    onClick={() => onApproveGreen(order)}
                    disabled={greenBusy || processing}
                    style={{
                      flex: 1, padding: "6px 10px", border: 0, borderRadius: 6,
                      background: "#18a967", color: "#fff", fontWeight: 700,
                      fontSize: 12, cursor: greenBusy ? "wait" : "pointer",
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
                      opacity: greenBusy ? 0.6 : 1,
                    }}
                  >
                    <Check size={13} /> {t("Duyệt")}
                  </button>
                )}
                {onRejectGreen && (
                  <button
                    type="button"
                    onClick={() => onRejectGreen(order)}
                    disabled={greenBusy || processing}
                    style={{
                      flex: 1, padding: "6px 10px", borderRadius: 6,
                      background: "transparent", color: "#ef4444",
                      border: "1px solid #ef4444", fontWeight: 700,
                      fontSize: 12, cursor: greenBusy ? "wait" : "pointer",
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
                      opacity: greenBusy ? 0.6 : 1,
                    }}
                  >
                    <XCircle size={13} /> {t("Từ chối")}
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          // Bước 1, 2, 3: Chỉ hiện badge nhỏ báo có Sống Xanh
          <div style={{
            marginTop: 6,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: 12,
            background: "rgba(24, 169, 103, 0.1)",
            color: "#18a967",
            fontSize: 11,
            fontWeight: 700,
            alignSelf: "flex-start",
          }}>
            <Leaf size={12} />
            <span>{t("Khách mang đồ đựng")} (+{order.green_points || 10}đ)</span>
          </div>
        )
      )}

      {/* ACTIONS */}
      <div
        className={`kds-card__actions ${
          showReject ? "kds-card__actions--stack" : ""
        }`}
      >
        {showReject && (
          <button
            type="button"
            className="kds-card__btn kds-card__btn--ghost"
            onClick={() => onReject?.(order)}
            disabled={processing}
          >
            <XCircle size={18} />
            <span>{t("Từ chối")}</span>
          </button>
        )}

        {handleAdvance && (
          <button
            type="button"
            className={`kds-card__btn ${
              isPending || isConfirmed || isPrep
                ? "kds-card__btn--primary"
                : "kds-card__btn--tertiary"
            }`}
            onClick={() => handleAdvance(order)}
            disabled={processing}
          >
            {processing ? (
              <Loader2
                size={18}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : isPending ? (
              <Check size={18} />
            ) : isConfirmed ? (
              <Soup size={18} />
            ) : isPrep ? (
              <CheckCircle2 size={18} />
            ) : (
              <PackageCheck size={18} />
            )}
            <span>{actionLabel}</span>
          </button>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </article>
  );
}
// ============================================================
// KDSTICKET.JSX — Ticket đơn trong KDS board (V3)
// ============================================================
// 2 mode layout:
//   - layout="compact" (default): dùng cho EmployeeHome
//       → hiển thị: tên khách + timer count-up + badge timer
//   - layout="tall": dùng cho EmployeeOrders
//       → ẩn tên khách + timer count-up → block VUÔNG VẮN, GỌN GÀNG
//
// Variant trạng thái:
//   - variant="pending"    → Chờ xác nhận → nút Duyệt Đơn (+ Từ chối nếu có onReject)
//   - variant="confirmed"  → Đã xác nhận → nút Bắt Đầu Nấu
//   - variant="prep"       → Đang chuẩn bị → nút Báo Xong Món
//   - variant="ready"      → Sẵn sàng nhận → nút Khách Đã Nhận
//   - variant="pickup"     → (legacy) card pickup riêng cho EmployeeHome
//   - variant="preparing"  → (legacy alias) = prep
//
// Optional:
//   - onReject (pending only) → hiện nút "Từ chối" XẾP DỌC trên nút chính
//   - isPriority / urgent → nháy đỏ
// ============================================================

import {
  Check, Clock, Volume2, CheckCircle2, Soup, AlertTriangle,
  XCircle, PackageCheck, Loader2, Timer,
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
  QR: "VietQR (Đã TT)",
  "Ví Canteen": "Ví Nội Bộ VWA",
  "Thẻ": "Thẻ SV",
};

// ────────────────────────────────────────────────────────────
// VARIANT "pickup" — giữ nguyên để không phá vỡ code cũ (EmployeeHome)
// ────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────
export default function KDSTicket({
  variant = "prep",
  layout = "compact", // "compact" | "tall"
  order,
  pickupNumber,
  elapsed = 0,
  isPriority = false,
  isProcessing = false,
  onAction,
  onAdvance,
  onReject,
  onRecall,
  loading = false,
  urgent = false, // alias cho isPriority (backward compat)
  t: tProp,
}) {
  const { t: tHook } = useI18n();
  const t = tProp || tHook;

  // Backward compat
  const priority = isPriority || urgent;
  const processing = isProcessing || loading;
  const handleAdvance = onAdvance || onAction;

  // Variant "pickup" đi nhánh riêng (giữ layout cũ)
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

  // Alias "preparing" (legacy từ EmployeeHome) → dùng như "prep"
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
    PAYMENT_LABELS[order.payment] || PAYMENT_LABELS["Tiền mặt"];

  const actionLabel =
    ACTION_LABELS[order.status] ||
    (isPrep ? t("Báo Xong Món") : t("Xử lý"));

  const dateVariant = getDateLabelVariant(order.created_at);
  const showDateLabel = dateVariant && dateVariant !== "today";
  const dateLabelText = (() => {
    if (!showDateLabel) return "";
    if (dateVariant === "yesterday") return "Hôm qua";
    const d = new Date(order.created_at);
    const dd = d.getDate().toString().padStart(2, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    return `${dd}/${mm}`;
  })();

  const showReject = isPending && typeof onReject === "function";

  const layoutClass = layout === "tall" ? "kds-card--tall" : "";

  // 🔧 FIX: layout="tall" (trang orders) → ẩn tên khách + timer thừa
  //   để block vuông vắn gọn gàng giống ảnh 2
  const isTall = layout === "tall";

  return (
    <article
      className={`kds-card ${layoutClass} ${
        processing ? "kds-card--processing" : ""
      } ${priority ? "kds-ticket--priority" : ""}`}
    >
      {/* HEAD: mã đơn + timer + badge */}
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

      {/* CUSTOMER — 🔧 ẩn khi layout="tall" */}
      {!isTall && (
        <div className="kds-card__customer">
          {order.customer_name || t("Khách")}{" "}
          {order.customer_mssv && (
            <span className="kds-card__customer-id">
              (MSSV: {order.customer_mssv})
            </span>
          )}
        </div>
      )}

      {/* TIMER count up (chỉ prep) — 🔧 ẩn khi layout="tall" */}
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

      {/* META: payment + total */}
      <div className="kds-card__meta">
        <span
          className={`kds-card__payment ${
            order.payment === "Ví Canteen"
              ? "kds-card__payment--success"
              : ""
          } ${order.payment === "QR" ? "kds-card__payment--primary" : ""}`}
        >
          <CheckCircle2 size={14} />
          {paymentLabel}
        </span>
        <span className="kds-card__total">{money(total)}</span>
      </div>

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
              isPending
                ? "kds-card__btn--primary"
                : isConfirmed
                ? "kds-card__btn--primary"
                : isPrep
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
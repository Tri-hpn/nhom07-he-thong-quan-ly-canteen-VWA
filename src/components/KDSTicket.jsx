// ============================================================
// KDSTICKET.JSX — Ticket đơn trong KDS board (V6 - LIVE TIMER)
// ============================================================
// V6.1 (B7): PAYMENT_LABELS + ACTION_LABELS qua t();
//            tData cho tên món; aria-label dùng giá trị đã dịch

import { useEffect, useMemo, useState } from "react";
import {
  Check, Volume2, CheckCircle2, Soup, AlertTriangle,
  XCircle, PackageCheck, Loader2, Timer, Leaf,
} from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import { money } from "./UI";
import { fmtTime, getDateLabelVariant } from "../lib/datetime";

function fmtElapsed(seconds) {
  if (!seconds || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
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

function PickupTicket({ order, pickupNumber, onAction, onRecall, loading, t, tData }) {
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
            {order.items?.map((it) => `${tData(it, "name")} x${it.qty}`).join(", ")}
          </p>
        </div>

        <div className={`kds-pickup__actions ${onRecall ? "" : "kds-pickup__actions--single"}`}>
          {onRecall && (
            <button
              type="button"
              className="kds-pickup__btn kds-pickup__btn--ghost"
              onClick={onRecall}
              disabled={loading}
              aria-label={t("Gọi lại khách đến nhận")}
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
            aria-label={t("Xác nhận đã trao khay cho khách")}
          >
            {loading ? (
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <CheckCircle2 size={14} />
            )}
            {onRecall ? t("Đã Trao") : t("Xác Nhận Đã Trao Khay")}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const { t: tHook, tData } = useI18n();
  const t = tProp || tHook;

  const [elapsedSec, setElapsedSec] = useState(elapsed);

  useEffect(() => {
    setElapsedSec(elapsed);
  }, [elapsed]);

  useEffect(() => {
    if (!order?.created_at) return;
    const created = new Date(order.created_at).getTime();
    if (isNaN(created)) return;

    const tick = () => {
      const now = Date.now();
      setElapsedSec(Math.max(0, Math.floor((now - created) / 1000)));
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [order?.created_at]);

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
        tData={tData}
      />
    );
  }

  const normalizedVariant = variant === "preparing" ? "prep" : variant;
  const isPending = normalizedVariant === "pending";
  const isConfirmed = normalizedVariant === "confirmed";
  const isPrep = normalizedVariant === "prep";
  const isReady = normalizedVariant === "ready";

  const items = useMemo(() => order?.items || [], [order?.items]);
  const total = useMemo(() => Number(order?.total) || 0, [order?.total]);

  const elapsedMin = Math.floor(elapsedSec / 60);

  const maxPrepTime = useMemo(
    () => items.reduce((mx, it) => Math.max(mx, Number(it.prep_time) || 0), 0),
    [items]
  );
  const urgencyThreshold = maxPrepTime > 0 ? Math.max(12, maxPrepTime + 3) : 12;
  const isUrgent = elapsedMin >= urgencyThreshold;
  const minutesLeft = Math.max(0, urgencyThreshold - elapsedMin);

  // 🔧 B7: wrap qua t() để dịch visible label
  const paymentLabel = useMemo(() => {
    const raw =
      PAYMENT_LABELS[order?.payment] ||
      order?.payment ||
      "Tiền mặt tại quầy";
    return t(raw);
  }, [order?.payment, t]);

  const actionLabel = useMemo(() => {
    const raw =
      ACTION_LABELS[order?.status] ||
      (isPrep ? "Báo Xong Món" : "Xử lý");
    return t(raw);
  }, [order?.status, isPrep, t]);

  const dateVariant = getDateLabelVariant(order?.created_at);
  const showDateLabel = dateVariant && dateVariant !== "today";
  const dateLabelText = useMemo(() => {
    if (!showDateLabel) return "";
    if (dateVariant === "yesterday") return t("Hôm qua");
    const d = new Date(order.created_at);
    const dd = d.getDate().toString().padStart(2, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    return `${dd}/${mm}`;
  }, [showDateLabel, dateVariant, order?.created_at, t]);

  const showReject = isPending && typeof onReject === "function";
  const isTall = layout === "tall";

  const hasGreen =
    order?.green_status === "pending" ||
    order?.green_status === "approved" ||
    Number(order?.green_points) > 0;

  const greenPoints = Number(order?.green_points) || 0;
  const isWallet = order?.payment === "Ví Canteen" || order?.payment === "WALLET";
  const isQR = order?.payment === "QR" || order?.payment === "VietQR";

  return (
    <article
      className={`kds-card ${processing ? "kds-card--processing" : ""} ${
        priority ? "kds-ticket--priority" : ""
      }`}
      aria-busy={processing}
    >
      <div className="kds-card__head">
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span className="kds-card__code">{order.code}</span>
          {isUrgent && isPending && (
            <span className="kds-card__tag kds-card__tag--danger">
              {t("Còn")} {minutesLeft}p
            </span>
          )}
          {isConfirmed && (
            <span className="kds-card__tag kds-card__tag--primary">{t("Chờ Bếp")}</span>
          )}
          {isPrep && (
            <span className="kds-card__tag kds-card__tag--primary">{t("BẾP")}</span>
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
            <span className={`kds-card__date-label kds-card__date-label--${dateVariant}`}>
              {dateLabelText}
            </span>
          )}
        </div>
      </div>

      {!isTall && (
        <div className="kds-card__customer">
          {order.customer_name || t("Khách")}{" "}
          {order.customer_mssv ? (
            <span className="kds-card__customer-id">(MSSV: {order.customer_mssv})</span>
          ) : order.customer_email ? (
            <span className="kds-card__customer-id">({order.customer_email})</span>
          ) : null}
        </div>
      )}

      {(isPrep || isPending) && !isTall && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: isUrgent ? "var(--st-error, #ef4444)" : "var(--st-text-muted)",
            fontWeight: 600,
          }}
        >
          <Timer size={13} />
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtElapsed(elapsedSec)}</span>
          {isUrgent && (
            <span style={{ marginLeft: "auto", fontSize: 11 }}>
              ⚠ {t("Trễ")} {Math.floor((elapsedSec - urgencyThreshold * 60) / 60)}p
            </span>
          )}
        </div>
      )}

      <div className="kds-card__items">
        {items.slice(0, 4).map((it, i) => (
          <div key={`${it.menu_item_id || i}-${i}`} className="kds-card__item">
            <span className="kds-card__item-name">
              {it.qty}x {tData(it, "name")}
              {it.size?.id && it.size.id !== "S" && (
                <span style={{ color: "var(--st-text-muted)", fontWeight: 500 }}>
                  {" "}({it.size.id})
                </span>
              )}
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
            <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{order.note}</span>
          </div>
        )}
      </div>

      <div className="kds-card__meta">
        <span
          className={`kds-card__payment ${isWallet ? "kds-card__payment--success" : ""} ${
            isQR ? "kds-card__payment--primary" : ""
          }`}
        >
          <CheckCircle2 size={14} />
          {paymentLabel}
        </span>
        <span className="kds-card__total">{money(total)}</span>
      </div>

      {hasGreen &&
        (isReady ? (
          <div
            className="kds-card__green-block"
            style={{
              marginTop: 6,
              padding: "8px 10px",
              background: "rgba(24, 169, 103, 0.08)",
              border: "1px solid rgba(24, 169, 103, 0.35)",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
                color: "#18a967",
              }}
            >
              <Leaf size={14} />
              <span>
                {order.green_status === "pending"
                  ? t("Chờ duyệt Sống Xanh")
                  : t("Đã duyệt Sống Xanh")}{" "}
                +{greenPoints} {t("điểm")}
              </span>
            </div>
            {order.green_status === "pending" && (onApproveGreen || onRejectGreen) && (
              <div style={{ display: "flex", gap: 6 }}>
                {onApproveGreen && (
                  <button
                    type="button"
                    onClick={() => onApproveGreen(order)}
                    disabled={greenBusy || processing}
                    aria-label={t("Duyệt điểm Sống Xanh")}
                    style={{
                      flex: 1,
                      padding: "6px 10px",
                      border: 0,
                      borderRadius: 6,
                      background: "#18a967",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: greenBusy ? "wait" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      opacity: greenBusy ? 0.6 : 1,
                    }}
                  >
                    {greenBusy ? (
                      <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                    ) : (
                      <Check size={13} />
                    )}{" "}
                    {t("Duyệt")}
                  </button>
                )}
                {onRejectGreen && (
                  <button
                    type="button"
                    onClick={() => onRejectGreen(order)}
                    disabled={greenBusy || processing}
                    aria-label={t("Từ chối điểm Sống Xanh")}
                    style={{
                      flex: 1,
                      padding: "6px 10px",
                      borderRadius: 6,
                      background: "transparent",
                      color: "#ef4444",
                      border: "1px solid #ef4444",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: greenBusy ? "wait" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
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
          <div
            style={{
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
            }}
          >
            <Leaf size={12} />
            <span>
              {t("Khách mang đồ đựng")} (+{greenPoints || 10} {t("điểm")})
            </span>
          </div>
        ))}

      <div className={`kds-card__actions ${showReject ? "kds-card__actions--stack" : ""}`}>
        {showReject && (
          <button
            type="button"
            className="kds-card__btn kds-card__btn--ghost"
            onClick={() => onReject?.(order)}
            disabled={processing}
            aria-label={t("Từ chối đơn hàng")}
          >
            {processing ? (
              <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <XCircle size={18} />
            )}
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
            aria-label={actionLabel}
          >
            {processing ? (
              <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
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
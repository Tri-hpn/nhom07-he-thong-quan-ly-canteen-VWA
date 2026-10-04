// ============================================================
// KDSTICKET.JSX — Ticket đơn trong KDS board
// ============================================================
// 2 loại:
//   - variant="preparing": card đang chế biến (có nút Báo Xong Món)
//   - variant="pending":   card chờ bếp (có nút Đẩy Vào Chảo / POS)
//   - variant="pickup":    card sẵn sàng nhận (pickup số + nút trao khay)
// ============================================================

import {
  Check, Clock, Volume2, CheckCircle2, Soup, AlertTriangle,
} from "lucide-react";
import { useI18n } from "../hooks/useI18n";

function fmtElapsed(seconds) {
  if (!seconds || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function KDSTicket({
  variant = "preparing",
  order,
  pickupNumber,
  elapsed = 0,
  urgent = false,
  onAction,
  onRecall,
  loading = false,
}) {
  const { t } = useI18n();

  if (variant === "pickup") {
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

  // preparing | pending
  const barClass = urgent
    ? "kds-ticket__bar--urgent"
    : `kds-ticket__bar--${variant}`;

  const ctaLabel =
    variant === "preparing" ? t("Báo Xong Món") : t("Đẩy Vào Chảo Bếp");
  const CtaIcon = variant === "preparing" ? Check : Soup;

  return (
    <div className="kds-ticket">
      <div className={`kds-ticket__bar ${barClass}`} />

      <div className="kds-ticket__inner">
        <div className="kds-ticket__head">
          <span className="kds-ticket__code">{order.code}</span>
          <span
            className={`kds-ticket__timer ${
              urgent
                ? "kds-ticket__timer--urgent"
                : variant === "pending"
                ? "kds-ticket__timer--neutral"
                : ""
            }`}
          >
            <Clock size={12} />
            {fmtElapsed(elapsed)}
          </span>
        </div>

        <div className="kds-ticket__body">
          <p className="kds-ticket__name">
            {order.items?.[0]?.name || "—"}
            {order.items?.[0]?.qty > 1 && ` x${order.items[0].qty}`}
          </p>

          {order.items?.length > 1 && (
            <p className="kds-ticket__sub">
              + {order.items.slice(1).map((it) => `${it.name} x${it.qty}`).join(", ")}
            </p>
          )}

          {order.note && (
            <span className="kds-ticket__note">
              <AlertTriangle size={10} style={{ display: "inline", marginRight: 4 }} />
              {order.note}
            </span>
          )}

          {variant === "preparing" && (
            <div className="kds-ticket__tag-row">
              <span className="kds-ticket__tag kds-ticket__tag--gray">
                {t("Bếp chảo đang làm")}
              </span>
              <span className="kds-ticket__tag kds-ticket__tag--primary">
                {t("Quầy 02")}
              </span>
            </div>
          )}

          {urgent && (
            <div className="kds-ticket__tag-row">
              <span className="kds-ticket__tag kds-ticket__tag--urgent">
                {t("Ưu tiên")}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          className={`kds-ticket__cta ${
            variant === "preparing"
              ? ""
              : "kds-ticket__cta--ghost"
          }`}
          onClick={() => onAction?.(order)}
          disabled={loading}
        >
          <CtaIcon size={14} />
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
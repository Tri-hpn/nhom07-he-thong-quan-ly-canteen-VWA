// ============================================================
// CUSTOMERORDERDETAIL.JSX — Modal chi tiết đơn hàng (Customer)
// ============================================================
// V2 (2026-10):
//   - ✅ FIX #2: Bọc t() cho label ở STATUS_FLOW và ALL_STEPS
//   - Giữ nguyên: full datetime, modal review, modal huỷ/nhận
//
// 🌐 i18n: source-text tiếng Việt, tự dịch
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, Package, Clock, CheckCircle2, ChefHat, Truck, Star, Send,
  Loader2,
} from "lucide-react";
import { api } from "../api";
import { money } from "./UI";
import { toast } from "./Effects";
import ConfirmDialog from "./ConfirmDialog";
import { useI18n } from "../hooks/useI18n";

const MODAL_Z = 2147483600;
const POINTS_PER_REVIEW = 10;
const MAX_COMMENT_LENGTH = 500;

const STATUS_FLOW = {
  "Chờ xác nhận": { step: 1, label: "Chờ xác nhận", color: "#f59e0b" },
  "Đã xác nhận": { step: 2, label: "Đã xác nhận", color: "#2634d5" },
  "Đang chuẩn bị": { step: 3, label: "Đang chuẩn bị", color: "#8b5cf6" },
  "Sẵn sàng nhận": { step: 4, label: "Sẵn sàng nhận", color: "#18a967" },
  "Hoàn thành": { step: 5, label: "Hoàn thành", color: "#18a967" },
  "Đã hủy": { step: 0, label: "Đã hủy", color: "#ef4444" },
};

const ALL_STEPS = [
  { step: 1, label: "Chờ xác nhận", icon: Clock },
  { step: 2, label: "Đã xác nhận", icon: CheckCircle2 },
  { step: 3, label: "Đang chuẩn bị", icon: ChefHat },
  { step: 4, label: "Sẵn sàng nhận", icon: Truck },
  { step: 5, label: "Hoàn thành", icon: CheckCircle2 },
];

function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const dd = d.getDate().toString().padStart(2, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = d.getHours().toString().padStart(2, "0");
    const mi = d.getMinutes().toString().padStart(2, "0");
    return `${dd}/${mm}/${yyyy} • ${hh}:${mi}`;
  } catch {
    return "—";
  }
}

function getRelativeDateLabel(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today - target) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Hôm nay";
    if (diffDays === 1) return "Hôm qua";
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return "";
  } catch {
    return "";
  }
}

function getOrderId(order) {
  return order?._id || order?.id || null;
}

function getReviewedKey(code) {
  return `reviewed_order_${code}`;
}

export default function CustomerOrderDetail({
  order: initialOrder,
  user,
  onClose,
  onUpdate,
}) {
  const { t, tData } = useI18n();
  const [order, setOrder] = useState(initialOrder);
  const [showReview, setShowReview] = useState(false);
  const [showMyReviews, setShowMyReviews] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [myReviews, setMyReviews] = useState([]);

  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState("");

  const [receiving, setReceiving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [confirmAction, setConfirmAction] = useState(null);

  const lastCodeRef = useRef(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    setOrder(initialOrder);
  }, [initialOrder]);

  useEffect(() => {
    const code = initialOrder?.code;
    if (!code) return;
    if (lastCodeRef.current === code) return;

    lastCodeRef.current = code;
    setChecking(true);
    setCheckError("");

    const localReviewed = (() => {
      try {
        return localStorage.getItem(getReviewedKey(code));
      } catch {
        return null;
      }
    })();

    const itemIds = (initialOrder.items || [])
      .map((it) => it.menu_item_id)
      .filter(Boolean);

    api.reviews
      .me()
      .then((list) => {
        const mine = (list || []).filter((r) =>
          itemIds.includes(r.menu_item_id)
        );
        setMyReviews(mine);

        const apiReviewed =
          itemIds.length > 0 && mine.length >= itemIds.length;

        if (localReviewed || apiReviewed) {
          setReviewed(true);
          setReviewedCount(mine.length || itemIds.length);
        } else {
          setReviewed(false);
          setReviewedCount(0);
        }
      })
      .catch((e) => {
        setMyReviews([]);
        setCheckError(e.message || "");
        if (localReviewed) setReviewed(true);
      })
      .finally(() => setChecking(false));
  }, [initialOrder]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (submitting || receiving || cancelling) return;
      onClose?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, submitting, receiving, cancelling]);

  if (!order) return null;

  const current = STATUS_FLOW[order.status] || STATUS_FLOW["Chờ xác nhận"];
  const isCancelled = order.status === "Đã hủy";
  const isCompleted = order.status === "Hoàn thành";

  const orderId = getOrderId(order);
  const items = order.items || [];
  const itemsCount = items.length;
  const earnPoints = itemsCount * POINTS_PER_REVIEW;

  const handleReceived = () => {
    if (receiving) return;
    setConfirmAction("received");
  };

  const handleCancel = () => {
    if (cancelling) return;
    setConfirmAction("cancel");
  };

  const executeConfirm = useCallback(async () => {
    if (!confirmAction) return;

    if (confirmAction === "received") {
      setReceiving(true);
      try {
        await api.orders.received(orderId);
        toast(t("Đã xác nhận nhận hàng thành công!"), "success");
        setConfirmAction(null);
        onUpdate?.();
        onClose?.();
      } catch (e) {
        toast(e.message || t("Không xác nhận được, vui lòng thử lại"), "error");
      } finally {
        setReceiving(false);
      }
      return;
    }

    if (confirmAction === "cancel") {
      setCancelling(true);
      try {
        await api.orders.cancel(orderId);
        toast(t("Đã hủy đơn hàng thành công"), "success");
        setConfirmAction(null);
        onUpdate?.();
        onClose?.();
      } catch (e) {
        toast(e.message || t("Không hủy được đơn hàng"), "error");
      } finally {
        setCancelling(false);
      }
      return;
    }
  }, [confirmAction, orderId, onUpdate, onClose, t]);

  const openReview = () => {
    if (!itemsCount) {
      toast(t("Đơn hàng không có món để đánh giá"), "error");
      return;
    }
    setRating(5);
    setComment("");
    setShowReview(true);
    setShowMyReviews(false);
  };

  const openMyReviews = () => {
    setShowMyReviews(true);
    setShowReview(false);
  };

  const submitReview = async () => {
    if (submittingRef.current) return;
    if (!itemsCount) return;

    submittingRef.current = true;
    setSubmitting(true);

    let success = 0;
    const trimmedComment = comment.trim().slice(0, MAX_COMMENT_LENGTH);

    for (const it of items) {
      if (!it.menu_item_id) continue;
      try {
        await api.reviews.create({
          menuItemId: it.menu_item_id,
          rating,
          comment: trimmedComment,
        });
        success++;
      } catch {
        // Skip
      }
    }

    setSubmitting(false);
    submittingRef.current = false;

    if (success > 0) {
      setReviewedCount(success);
      setReviewed(true);
      setShowReview(false);

      try {
        localStorage.setItem(
          getReviewedKey(order.code),
          Date.now().toString()
        );
      } catch {}

      api.reviews
        .me()
        .then((list) => {
          const itemIds = items.map((it) => it.menu_item_id).filter(Boolean);
          setMyReviews(
            (list || []).filter((r) => itemIds.includes(r.menu_item_id))
          );
        })
        .catch(() => {});

      try {
        window.dispatchEvent(new CustomEvent("refresh-user"));
        window.dispatchEvent(new CustomEvent("order-reviewed"));
      } catch {}

      onUpdate?.();
      toast(
        t("Cảm ơn bạn đã đánh giá {n} món! Nhận {points} xu thưởng.")
          .replace("{n}", success)
          .replace("{points}", success * POINTS_PER_REVIEW),
        "success"
      );
    } else {
      toast(t("Bạn đã đánh giá các món trong đơn này rồi."), "error");
    }
  };

  const handleOverlayClick = () => {
    if (showReview && comment.trim()) return;
    if (submitting || receiving || cancelling) return;
    onClose?.();
  };

  const relativeLabel = getRelativeDateLabel(order.created_at);

  return (
    <>
      <div
        onClick={handleOverlayClick}
        role="dialog"
        aria-modal="true"
        aria-label={`${t("Chi tiết đơn hàng")} ${order.code}`}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "grid",
          placeItems: "center",
          zIndex: MODAL_Z,
          padding: 20,
          overflowY: "auto",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "var(--card-bg, #fff)",
            borderRadius: 14,
            padding: 24,
            width: "100%",
            maxWidth: 560,
            maxHeight: "90vh",
            overflowY: "auto",
          }}
        >
          {showMyReviews ? (
            <MyReviewsView
              order={order}
              myReviews={myReviews}
              onClose={() => setShowMyReviews(false)}
              t={t}
              tData={tData}
            />
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: "linear-gradient(135deg,#2634d5,#20c779)",
                      color: "#fff",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Package size={20} />
                  </div>
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        color: "var(--text-primary, #172033)",
                      }}
                    >
                      {t("Chi tiết đơn hàng")}
                    </h3>
                    <b style={{ fontSize: 13, color: "#2634d5" }}>
                      {order.code}
                    </b>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  aria-label={t("Đóng")}
                  type="button"
                  style={{
                    background: "transparent",
                    border: 0,
                    cursor: "pointer",
                    color: "var(--text-light, #8993a3)",
                    padding: 4,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              {!isCancelled && (
                <div
                  style={{
                    background: "var(--bg-tertiary, #f5f7fb)",
                    borderRadius: 12,
                    padding: 20,
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      position: "relative",
                    }}
                  >
                    {ALL_STEPS.map((s, i) => {
                      const active = current.step >= s.step;
                      const Icon = s.icon;
                      return (
                        <div
                          key={s.step}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            flex: 1,
                            position: "relative",
                          }}
                        >
                          {i < ALL_STEPS.length - 1 && (
                            <div
                              style={{
                                position: "absolute",
                                top: 18,
                                left: "50%",
                                right: "-50%",
                                height: 2,
                                background:
                                  current.step > s.step
                                    ? "#18a967"
                                    : "var(--border-color, #e5e9ef)",
                                zIndex: 0,
                              }}
                            />
                          )}
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: "50%",
                              background: active
                                ? "#18a967"
                                : "var(--card-bg, #fff)",
                              color: active
                                ? "#fff"
                                : "var(--text-light, #94a3b8)",
                              border:
                                "2px solid " +
                                (active
                                  ? "#18a967"
                                  : "var(--border-color, #e5e9ef)"),
                              display: "grid",
                              placeItems: "center",
                              position: "relative",
                              zIndex: 1,
                            }}
                          >
                            <Icon size={16} />
                          </div>
                          <span
                            style={{
                              fontSize: 10,
                              marginTop: 6,
                              textAlign: "center",
                              color: active
                                ? "var(--text-primary, #172033)"
                                : "var(--text-light, #94a3b8)",
                              fontWeight: active ? 700 : 500,
                            }}
                          >
                            {t(s.label)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {isCancelled && (
                <div
                  style={{
                    background: "#fee2e2",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 20,
                    textAlign: "center",
                  }}
                >
                  <X
                    size={32}
                    color="#ef4444"
                    style={{ margin: "0 auto 8px" }}
                  />
                  <b style={{ color: "#991b1b", fontSize: 15 }}>
                    {t("Đơn hàng đã bị hủy")}
                  </b>
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <InfoRow
                  label={t("Thời gian đặt hàng")}
                  value={
                    <>
                      {fmtDateTime(order.created_at)}
                      {relativeLabel && (
                        <span
                          style={{
                            marginLeft: 6,
                            color: "#2634d5",
                            fontWeight: 700,
                            fontSize: 11,
                            background: "rgba(38, 52, 213, 0.1)",
                            padding: "1px 8px",
                            borderRadius: 9999,
                          }}
                        >
                          {relativeLabel}
                        </span>
                      )}
                    </>
                  }
                />
                <InfoRow
                  label={t("Trạng thái")}
                  value={
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: 20,
                        fontSize: 11,
                        fontWeight: 700,
                        background: current.color + "20",
                        color: current.color,
                      }}
                    >
                      {t(current.label)}
                    </span>
                  }
                />
                <InfoRow
                  label={t("Phương thức thanh toán")}
                  value={order.payment || t("Tiền mặt")}
                  last
                />
              </div>

              <h4
                style={{
                  margin: "16px 0 12px",
                  color: "var(--text-primary, #172033)",
                  fontSize: 14,
                }}
              >
                {t("Món đã đặt")}
              </h4>
              <div
                style={{
                  background: "var(--bg-tertiary, #f8fafc)",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 16,
                }}
              >
                {items.map((it, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 0",
                      borderBottom:
                        i < items.length - 1
                          ? "1px solid var(--border-color, #eef2f7)"
                          : "none",
                      fontSize: 13,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "var(--text-primary, #172033)" }}>
                        <b>{it.qty}×</b> {tData(it, "name")}
                      </div>

                      {it.size && (
                        <div
                          style={{
                            marginTop: 4,
                            color: "var(--text-muted, #64748b)",
                            fontSize: 12,
                          }}
                        >
                          {t("Size")}: {it.size.name}
                          {Number(it.size.extra_price || 0) > 0 &&
                            ` (+${money(Number(it.size.extra_price))})`}
                        </div>
                      )}

                      {Array.isArray(it.toppings) && it.toppings.length > 0 && (
                        <div
                          style={{
                            marginTop: 4,
                            color: "var(--text-muted, #64748b)",
                            fontSize: 12,
                          }}
                        >
                          <div>{t("Topping")}:</div>
                          {it.toppings.map((topping, toppingIndex) => (
                            <div
                              key={topping.id ?? toppingIndex}
                              style={{ paddingLeft: 8 }}
                            >
                              • {topping.name}
                              {Number(topping.price || 0) > 0 &&
                                ` (+${money(Number(topping.price))})`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <b style={{ color: "var(--text-muted, #64748b)" }}>
                      {money(Number(it.price || 0) * Number(it.qty || 0))}
                    </b>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "12px 0",
                  borderTop: "2px solid var(--border-color, #eef2f7)",
                }}
              >
                <b style={{ color: "var(--text-primary, #172033)" }}>
                  {t("Tổng cộng")}
                </b>
                <strong style={{ color: "#2634d5", fontSize: 20 }}>
                  {money(order.total || 0)}
                </strong>
              </div>

              {order.note && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    background: "var(--bg-tertiary, #f8fafc)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--text-muted, #64748b)",
                  }}
                >
                  <b style={{ color: "var(--text-primary, #172033)" }}>
                    {t("Ghi chú")}:
                  </b>{" "}
                  {order.note}
                </div>
              )}

              {showReview && (
                <div
                  style={{
                    marginTop: 16,
                    padding: 16,
                    background: "var(--bg-tertiary, #f8fafc)",
                    borderRadius: 12,
                    border: "1px solid var(--border-color, #e5e9ef)",
                  }}
                >
                  <h4
                    style={{
                      margin: "0 0 12px",
                      color: "var(--text-primary, #172033)",
                      fontSize: 14,
                    }}
                  >
                    ⭐ {t("Đánh giá đơn hàng")}
                  </h4>

                  <div
                    style={{
                      marginBottom: 14,
                      padding: "10px 12px",
                      background: "rgba(38, 52, 213, 0.08)",
                      border: "1px solid rgba(38, 52, 213, 0.2)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "#2634d5",
                      fontWeight: 600,
                    }}
                  >
                    💡{" "}
                    {t("Đánh giá sẽ được áp dụng cho tất cả {n} món trong đơn.")
                      .replace("{n}", itemsCount)}
                  </div>

                  <label style={labelStyle}>{t("Số sao đánh giá")}</label>
                  <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        onClick={() => setRating(s)}
                        type="button"
                        aria-label={`${t("Chọn")} ${s} ${t("sao")}`}
                        style={{
                          background: "transparent",
                          border: 0,
                          cursor: "pointer",
                          padding: 2,
                        }}
                      >
                        <Star
                          size={28}
                          fill={s <= rating ? "#f59e0b" : "none"}
                          color={s <= rating ? "#f59e0b" : "#cbd5e1"}
                        />
                      </button>
                    ))}
                  </div>

                  <label style={labelStyle}>
                    {t("Nhận xét của bạn")}{" "}
                    <span
                      style={{
                        fontWeight: 400,
                        color: "var(--text-light, #94a3b8)",
                      }}
                    >
                      ({t("không bắt buộc")})
                    </span>
                  </label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={t("Chia sẻ cảm nhận về món ăn...")}
                    maxLength={MAX_COMMENT_LENGTH}
                    disabled={submitting}
                    style={{
                      width: "100%",
                      padding: 10,
                      border: "1px solid var(--border-color, #e5e9ef)",
                      borderRadius: 8,
                      minHeight: 70,
                      outline: "none",
                      resize: "vertical",
                      background: "var(--card-bg, #fff)",
                      color: "var(--text-primary, #172033)",
                      fontSize: 13,
                      boxSizing: "border-box",
                    }}
                  />

                  <button
                    onClick={submitReview}
                    disabled={submitting}
                    type="button"
                    style={{
                      marginTop: 12,
                      width: "100%",
                      padding: 12,
                      background: submitting ? "#94a3b8" : "#2634d5",
                      color: "#fff",
                      border: 0,
                      borderRadius: 8,
                      fontWeight: 700,
                      cursor: submitting ? "not-allowed" : "pointer",
                      fontSize: 13,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    {submitting ? (
                      <>
                        <Loader2
                          size={14}
                          style={{ animation: "spin 1s linear infinite" }}
                        />
                        {t("Đang gửi...")}
                      </>
                    ) : (
                      <>
                        <Send size={14} />{" "}
                        {t("Gửi đánh giá & nhận {n} xu").replace(
                          "{n}",
                          earnPoints
                        )}
                      </>
                    )}
                  </button>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 20,
                  flexDirection: "column",
                }}
              >
                {order.status === "Sẵn sàng nhận" && (
                  <button
                    onClick={handleReceived}
                    disabled={receiving || cancelling}
                    type="button"
                    style={{
                      padding: 12,
                      background: "#18a967",
                      color: "#fff",
                      border: 0,
                      borderRadius: 8,
                      fontWeight: 600,
                      cursor: receiving ? "not-allowed" : "pointer",
                      opacity: receiving ? 0.7 : 1,
                    }}
                  >
                    {receiving ? (
                      <>
                        <Loader2
                          size={14}
                          style={{ animation: "spin 1s linear infinite" }}
                        />{" "}
                        {t("Đang xử lý...")}
                      </>
                    ) : (
                      `✅ ${t("Xác nhận đã nhận món")}`
                    )}
                  </button>
                )}

                {order.status === "Chờ xác nhận" && (
                  <button
                    onClick={handleCancel}
                    disabled={cancelling || receiving}
                    type="button"
                    style={{
                      padding: 12,
                      background: "var(--card-bg, #fff)",
                      color: "#ef4444",
                      border: "1px solid #ef4444",
                      borderRadius: 8,
                      fontWeight: 600,
                      cursor: cancelling ? "not-allowed" : "pointer",
                      opacity: cancelling ? 0.7 : 1,
                    }}
                  >
                    {cancelling ? (
                      <>
                        <Loader2
                          size={14}
                          style={{ animation: "spin 1s linear infinite" }}
                        />{" "}
                        {t("Đang xử lý...")}
                      </>
                    ) : (
                      t("Hủy đơn hàng")
                    )}
                  </button>
                )}

                {isCompleted &&
                  !showReview &&
                  !reviewed &&
                  !checking &&
                  !checkError && (
                    <button
                      onClick={openReview}
                      type="button"
                      style={{
                        padding: 12,
                        background: "#f59e0b",
                        color: "#fff",
                        border: 0,
                        borderRadius: 8,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontSize: 13,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                    >
                      <Star size={16} fill="#fff" />{" "}
                      {t("Đánh giá đơn hàng (+{n} Xu)").replace(
                        "{n}",
                        earnPoints
                      )}
                    </button>
                  )}

                {isCompleted && reviewed && !showMyReviews && (
                  <button
                    onClick={openMyReviews}
                    type="button"
                    style={{
                      padding: 12,
                      background: "rgba(24, 169, 103, 0.15)",
                      color: "#18a967",
                      border: "1px solid #18a967",
                      borderRadius: 8,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: 13,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <CheckCircle2 size={16} /> {t("Xem đánh giá của tôi")}
                  </button>
                )}

                <button
                  onClick={onClose}
                  disabled={submitting || receiving || cancelling}
                  type="button"
                  style={{
                    padding: 12,
                    background: "var(--card-bg, #fff)",
                    color: "var(--text-primary, #172033)",
                    border: "1px solid var(--border-color, #e5e9ef)",
                    borderRadius: 8,
                    fontWeight: 600,
                    cursor:
                      submitting || receiving || cancelling
                        ? "not-allowed"
                        : "pointer",
                    opacity: submitting || receiving || cancelling ? 0.6 : 1,
                  }}
                >
                  {t("Đóng")}
                </button>
              </div>
            </>
          )}
        </div>

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </div>

      <ConfirmDialog
        open={confirmAction === "received"}
        title={t("Xác nhận đã nhận món?")}
        message={t("Bạn xác nhận đã nhận {n} món của đơn {code}.")
          .replace("{n}", itemsCount)
          .replace("{code}", order.code)}
        confirmText={t("Đã nhận món")}
        cancelText={t("Chưa nhận được")}
        loading={receiving}
        onConfirm={executeConfirm}
        onClose={() => !receiving && setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === "cancel"}
        title={t("Hủy đơn hàng này?")}
        message={t("Đơn hàng {code} sẽ bị hủy và không thể khôi phục.")
          .replace("{code}", order.code)}
        confirmText={t("Hủy đơn")}
        cancelText={t("Giữ đơn")}
        danger
        loading={cancelling}
        onConfirm={executeConfirm}
        onClose={() => !cancelling && setConfirmAction(null)}
      />
    </>
  );
}

function InfoRow({ label, value, last = false }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 0",
        borderBottom: last
          ? "none"
          : "1px dashed var(--border-color, #eef2f7)",
        fontSize: 13,
        gap: 10,
      }}
    >
      <span style={{ color: "var(--text-muted, #64748b)" }}>{label}</span>
      <b
        style={{
          color: "var(--text-primary, #172033)",
          textAlign: "right",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        {value}
      </b>
    </div>
  );
}

function MyReviewsView({ order, myReviews, onClose, t, tData }) {
  const items = order.items || [];
  const totalPoints = myReviews.length * POINTS_PER_REVIEW;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "linear-gradient(135deg,#f59e0b,#ef4444)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Star size={20} fill="#fff" />
          </div>
          <div>
            <h3 style={{ margin: 0, color: "var(--text-primary, #172033)" }}>
              {t("Đánh giá của tôi")}
            </h3>
            <b style={{ fontSize: 13, color: "#2634d5" }}>{order.code}</b>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label={t("Đóng")}
          type="button"
          style={{
            background: "transparent",
            border: 0,
            cursor: "pointer",
            color: "var(--text-light, #8993a3)",
            padding: 4,
            display: "grid",
            placeItems: "center",
          }}
        >
          <X size={20} />
        </button>
      </div>

      <div
        style={{
          padding: 14,
          background:
            "linear-gradient(135deg, rgba(24, 169, 103, 0.1), rgba(38, 52, 213, 0.1))",
          borderRadius: 10,
          marginBottom: 18,
          fontSize: 13,
          color: "#18a967",
          fontWeight: 600,
          textAlign: "center",
        }}
      >
        ✨ {t("Bạn đã nhận được {points} xu thưởng").replace(
          "{points}",
          totalPoints
        )}
      </div>

      {myReviews.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            color: "var(--text-light, #8993a3)",
            fontSize: 13,
          }}
        >
          {t("Chưa có đánh giá nào")}
        </div>
      ) : (
        myReviews.map((r, i) => {
          const item = items.find((it) => it.menu_item_id === r.menu_item_id);
          return (
            <div
              key={r.id || i}
              style={{
                padding: 14,
                background: "var(--bg-tertiary, #f8fafc)",
                borderRadius: 10,
                marginBottom: 12,
                border: "1px solid var(--border-color, #e5e9ef)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                  gap: 10,
                }}
              >
                <b
                  style={{
                    color: "var(--text-primary, #172033)",
                    fontSize: 13,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tData(item, "name") || t("Món ăn")}
                </b>
                <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      size={14}
                      fill={s <= r.rating ? "#f59e0b" : "none"}
                      color={s <= r.rating ? "#f59e0b" : "#cbd5e1"}
                    />
                  ))}
                </div>
              </div>
              {r.comment ? (
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: 13,
                    color: "var(--text-muted, #64748b)",
                    fontStyle: "italic",
                  }}
                >
                  "{r.comment}"
                </p>
              ) : (
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: 12,
                    color: "var(--text-light, #94a3b8)",
                  }}
                >
                  ({t("Không có nhận xét")})
                </p>
              )}
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-light, #94a3b8)",
                  marginTop: 8,
                }}
              >
                {fmtDateTime(r.created_at)}
              </div>
            </div>
          );
        })
      )}

      <button
        onClick={onClose}
        type="button"
        style={{
          width: "100%",
          padding: 12,
          marginTop: 12,
          background: "#2634d5",
          color: "#fff",
          border: 0,
          borderRadius: 8,
          fontWeight: 600,
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        {t("Đóng")}
      </button>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 6,
  color: "var(--text-muted, #475569)",
};
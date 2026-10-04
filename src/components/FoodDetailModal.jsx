// ============================================================
// FOODDETAILMODAL.JSX — Modal chi tiết món ăn
// ============================================================
// ✅ SOURCE-TEXT I18N: dùng tiếng Việt trực tiếp qua t("...")
// ============================================================

import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Star, Plus, ShoppingBag, Save, X,
} from "lucide-react";
import { money } from "./UI";
import { toast } from "./Effects";
import { useI18n } from "../hooks/useI18n";
import ToppingSelector from "./ToppingSelector";
import ReviewSection from "./ReviewSection";

const MODAL_Z = 2147483600;
const DEFAULT_MAX_QTY = 99;

const FALLBACK_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
      <rect fill='#f5f7fb' width='100' height='100'/>
      <text x='50' y='58' font-size='40' text-anchor='middle'>🍽️</text>
    </svg>`
  );

function getMaxQty(item) {
  if (!item) return 0;
  if (typeof item.stock === "number") {
    return Math.max(0, item.stock);
  }
  return DEFAULT_MAX_QTY;
}

function sortToppings(toppings) {
  if (!Array.isArray(toppings)) return [];
  return [...toppings].sort();
}

export default function FoodDetailModal({
  item,
  cart,
  setCart,
  user,
  mode = "cart",
  onClose,
  editingKey,
  initialToppings,
  initialSize,
  initialQty,
  onUpdate,
}) {
  const { t, tData } = useI18n();
  const navigate = useNavigate();

  const [selectedToppings, setSelectedToppings] = useState([]);
  const [selectedSize, setSelectedSize] = useState("S");
  const [totalWithToppings, setTotalWithToppings] = useState(item?.price || 0);
  const [qty, setQty] = useState(1);

  const maxQty = useMemo(() => getMaxQty(item), [item]);
  const isOutOfStock = maxQty === 0;

  const itemId = item?._id || item?.id;

  useEffect(() => {
    if (!item) return;

    const initToppings = Array.isArray(initialToppings) ? initialToppings : [];
    const initSize = initialSize || "S";
    const initQty = Number(initialQty) || 1;

    setSelectedToppings(initToppings);
    setSelectedSize(initSize);
    setQty(Math.min(initQty, getMaxQty(item) || initQty));
    setTotalWithToppings(Number(item.price) || 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  useEffect(() => {
    if (isOutOfStock) return;
    setQty((q) => Math.min(Math.max(1, q), maxQty));
  }, [maxQty, isOutOfStock]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const sortedToppings = useMemo(
    () => sortToppings(selectedToppings),
    [selectedToppings]
  );

  const buildKey = useCallback(() => {
    const id = item?._id || item?.id || "";
    return `${id}-${selectedSize}-${sortedToppings.join(",")}`;
  }, [item, selectedSize, sortedToppings]);

  const buildName = useCallback(() => {
    if (!item) return "";
    const sizePart = selectedSize !== "S" ? ` (${selectedSize})` : "";
    const topPart =
      selectedToppings.length > 0
        ? ` (${selectedToppings.length} ${t("topping")})`
        : "";
    return `${item.name}${sizePart}${topPart}`;
  }, [item, selectedSize, selectedToppings.length, t]);

  if (!item) return null;

  const buildCartEntry = (quantity) => ({
    ...item,
    name: buildName(),
    price: Number(totalWithToppings) || Number(item.price) || 0,
    qty: quantity,
    stock: item.stock ?? DEFAULT_MAX_QTY,
    _originalId: item._id || item.id,
    _toppings: selectedToppings,
    _size: selectedSize,
  });

  const addToCart = () => {
    if (isOutOfStock) {
      toast(t("Hết hàng"), "error");
      return null;
    }

    const key = buildKey();
    const name = buildName();

    setCart((c) => {
      const existing = c[key];
      const currentQty = Number(existing?.qty) || 0;
      const newQty = Math.min(maxQty, currentQty + 1);

      if (existing && currentQty >= maxQty) return c;

      return {
        ...c,
        [key]: {
          ...buildCartEntry(newQty),
        },
      };
    });

    return name;
  };

  const handleAddToCart = () => {
    if (editingKey && onUpdate) {
      if (isOutOfStock) {
        toast(t("Hết hàng"), "error");
        return;
      }

      if (qty > maxQty) {
        toast(`${t("Chỉ còn")} ${maxQty} ${t("phần")}`, "error");
        return;
      }

      const key = buildKey();
      const entry = buildCartEntry(qty);
      onUpdate(editingKey, key, entry);
      toast(`${t("Đã cập nhật")} ${entry.name}`, "success");
      onClose?.();
      return;
    }

    if (isOutOfStock) {
      toast(t("Hết hàng"), "error");
      return;
    }

    const key = buildKey();
    const existing = cart?.[key];
    if (existing && Number(existing.qty) >= maxQty) {
      toast(`${t("Chỉ còn")} ${maxQty} ${t("phần")}`, "error");
      return;
    }

    const name = addToCart();
    if (!name) return;

    if (qty > 1) {
      setCart((c) => {
        const e = c[key];
        if (!e) return c;
        const newQty = Math.min(maxQty, (Number(e.qty) || 1) + (qty - 1));
        return { ...c, [key]: { ...e, qty: newQty } };
      });
    }

    toast(`${t("Đã thêm")} ${name} ${t("vào giỏ")}`, "success");
    onClose?.();
  };

  const handleBuyNow = () => {
    if (isOutOfStock) {
      toast(t("Hết hàng"), "error");
      return;
    }

    const name = addToCart();
    if (!name) return;

    if (qty > 1) {
      const key = buildKey();
      setCart((c) => {
        const e = c[key];
        if (!e) return c;
        const newQty = Math.min(maxQty, (Number(e.qty) || 1) + (qty - 1));
        return { ...c, [key]: { ...e, qty: newQty } };
      });
    }

    toast(`${t("Đã thêm")} ${name} — ${t("chuyển đến thanh toán")}`, "success");
    onClose?.();
    navigate("/customer/checkout");
  };

  const handleQtyMinus = () => setQty((q) => Math.max(1, q - 1));
  const handleQtyPlus = () => {
    setQty((q) => {
      if (q >= maxQty) {
        toast(`${t("Chỉ còn")} ${maxQty} ${t("phần")}`, "error");
        return q;
      }
      return q + 1;
    });
  };

  const unitPrice = Number(totalWithToppings) || Number(item.price) || 0;
  const grandTotal = unitPrice * qty;
  const atMax = qty >= maxQty;
  const atMin = qty <= 1;

  return (
    <div
      onClick={onClose}
      className="food-detail-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${t("Chi tiết")} ${tData(item, "name")}`}
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
        className="food-detail-content"
        style={{
          background: "var(--card-bg, #fff)",
          borderRadius: 14,
          padding: 24,
          width: "100%",
          maxWidth: 520,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* HEADER */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            gap: 12,
          }}
        >
          <h3
            style={{
              margin: 0,
              color: "var(--text-primary, #172033)",
              fontSize: 18,
              lineHeight: 1.3,
              minWidth: 0,
            }}
          >
            {tData(item, "name")}
          </h3>
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
              flexShrink: 0,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* IMAGE */}
        <img
          src={item.image || FALLBACK_IMG}
          alt={item.name}
          loading="lazy"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = FALLBACK_IMG;
          }}
          style={{
            width: "100%",
            height: 200,
            objectFit: "cover",
            borderRadius: 10,
            marginBottom: 14,
            display: "block",
          }}
        />

        {/* DESCRIPTION */}
        {item.description && (
          <p
            style={{
              margin: "0 0 12px",
              color: "var(--text-muted, #64748b)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {tData(item, "description")}
          </p>
        )}

        {/* PRICE + STOCK */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
            gap: 10,
          }}
        >
          <b style={{ color: "#18a967", fontSize: 20 }}>
            {money(item.price || 0)}
          </b>
          {typeof item.stock === "number" && (
            <span
              style={{
                fontSize: 12,
                color: isOutOfStock ? "#ef4444" : "var(--text-light, #8993a3)",
                fontWeight: isOutOfStock ? 700 : 400,
              }}
            >
              {isOutOfStock
                ? t("Hết hàng")
                : `${t("Còn")} ${item.stock} ${t("phần")}`}
            </span>
          )}
        </div>

        {/* RATING */}
        {item.rating && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 14,
              fontSize: 13,
            }}
          >
            <Star size={14} fill="#f59e0b" color="#f59e0b" />
            <b style={{ color: "var(--text-primary, #172033)" }}>
              {item.rating}
            </b>
            <span style={{ color: "var(--text-light, #8993a3)" }}>
              ({item.review_count || 0} {t("đánh giá")})
            </span>
          </div>
        )}

        {/* TOPPING + SIZE */}
        <ToppingSelector
          category={item.category}
          basePrice={item.price}
          onToppingsChange={setSelectedToppings}
          onSizeChange={setSelectedSize}
          onTotalChange={setTotalWithToppings}
        />

        {/* QTY */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid var(--border-color, #eef2f7)",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: "var(--text-muted, #64748b)",
              fontWeight: 600,
            }}
          >
            {t("Số lượng")}:
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={handleQtyMinus}
              disabled={atMin}
              aria-label={t("Giảm số lượng")}
              style={{
                width: 32,
                height: 32,
                border: "1px solid var(--border-color, #e5e9ef)",
                borderRadius: 8,
                background: "var(--card-bg, #fff)",
                color: atMin ? "#cbd5e1" : "#172033",
                cursor: atMin ? "not-allowed" : "pointer",
                fontSize: 18,
                fontWeight: 700,
                display: "grid",
                placeItems: "center",
                lineHeight: 1,
                opacity: atMin ? 0.5 : 1,
              }}
            >
              −
            </button>
            <b
              style={{
                minWidth: 40,
                textAlign: "center",
                fontSize: 16,
                color: "#172033",
              }}
            >
              {qty}
            </b>
            <button
              type="button"
              onClick={handleQtyPlus}
              disabled={atMax || isOutOfStock}
              aria-label={t("Tăng số lượng")}
              style={{
                width: 32,
                height: 32,
                border: "1px solid var(--border-color, #e5e9ef)",
                borderRadius: 8,
                background: "var(--card-bg, #fff)",
                color: atMax || isOutOfStock ? "#cbd5e1" : "#172033",
                cursor: atMax || isOutOfStock ? "not-allowed" : "pointer",
                fontSize: 18,
                fontWeight: 700,
                display: "grid",
                placeItems: "center",
                lineHeight: 1,
                opacity: atMax || isOutOfStock ? 0.5 : 1,
              }}
            >
              +
            </button>
          </div>

          <span
            style={{
              fontSize: 11,
              color: "var(--text-light, #8993a3)",
            }}
          >
            {t("tối đa")}: {maxQty}
          </span>
        </div>

        {/* TOTAL */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid var(--border-color, #eef2f7)",
            gap: 10,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-muted, #64748b)",
              }}
            >
              {t("Tổng")}:
            </div>
            {qty > 1 && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-light, #94a3b8)",
                  marginTop: 2,
                }}
              >
                {money(unitPrice)} × {qty}
              </div>
            )}
          </div>
          <b style={{ color: "#18a967", fontSize: 22 }}>
            {money(grandTotal)}
          </b>
        </div>

        {/* REVIEWS */}
        <ReviewSection
          menuItemId={item._id || item.id}
          currentUser={user}
          readOnly={true}
        />

        {/* ACTION BUTTON */}
        <div
          style={{
            position: "sticky",
            bottom: -24,
            marginTop: 16,
            marginLeft: -24,
            marginRight: -24,
            paddingTop: 14,
            paddingBottom: 24,
            paddingLeft: 24,
            paddingRight: 24,
            background: "var(--card-bg, #fff)",
            borderTop: "1px solid var(--border-color, #eef2f7)",
            boxShadow: "0 -8px 20px rgba(0,0,0,0.06)",
            zIndex: 5,
          }}
        >
          {isOutOfStock ? (
            <button
              disabled
              type="button"
              style={{
                width: "100%",
                padding: 14,
                background: "#94a3b8",
                color: "#fff",
                border: 0,
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 14,
                cursor: "not-allowed",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {t("Hết hàng")}
            </button>
          ) : mode === "buy" ? (
            <button
              onClick={handleBuyNow}
              type="button"
              style={{
                width: "100%",
                padding: 14,
                background: "#2634d5",
                color: "#fff",
                border: "2px solid #2634d5",
                borderRadius: 10,
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 14,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <ShoppingBag size={16} /> {t("Mua ngay")}
            </button>
          ) : (
            <button
              onClick={handleAddToCart}
              type="button"
              style={{
                width: "100%",
                padding: 14,
                background: "var(--card-bg, #fff)",
                color: "#2634d5",
                border: "2px solid #2634d5",
                borderRadius: 10,
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 14,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {editingKey ? <Save size={16} /> : <Plus size={16} />}
              {editingKey ? t("Cập nhật") : t("Thêm vào giỏ")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
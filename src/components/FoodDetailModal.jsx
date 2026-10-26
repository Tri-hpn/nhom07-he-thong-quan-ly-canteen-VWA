// ============================================================
// FOODDETAILMODAL.JSX — Modal chi tiết món ăn (V5 - FINAL)
// ============================================================
// V5 (2026-11):
//   - 🔧 FIX: getItemId ưu tiên `id` trước `_id` (khớp backend
//     POST /api/orders dùng String(m.id)). Trước đây ưu tiên `_id`
//     có thể gây 400 nếu Mongo trả về cả _id (ObjectId) và id (số).
//   - 🔧 FIX: handleAddToCart edit mode refactor sạch — không còn
//     side effect (gán biến ngoài) trong setCart updater, không còn
//     dead code (check maxQty dư thừa).
//   - Giữ nguyên: logic toppings/size, buy now, render UI.
// ============================================================

import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Star, Plus, ShoppingBag, Save, X } from "lucide-react";
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

// ============================================================
// HELPERS
// ============================================================

function getMaxQty(item) {
  if (!item) return 0;
  if (typeof item.stock === "number") {
    return Math.max(0, item.stock);
  }
  return DEFAULT_MAX_QTY;
}

// 🔧 FIX: ưu tiên `id` — khớp với backend
// (backend menuById = Map(String(m.id)); KHÔNG dùng _id)
function getItemId(item) {
  if (!item) return undefined;
  return item.id ?? item._id;
}

function sortToppings(toppings) {
  if (!Array.isArray(toppings)) return [];
  return [...toppings].sort();
}

// ============================================================
// MAIN COMPONENT
// ============================================================

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
}) {
  const { t, tData } = useI18n();
  const navigate = useNavigate();

  const [selectedToppings, setSelectedToppings] = useState([]);
  const [selectedSize, setSelectedSize] = useState("S");
  const [totalWithToppings, setTotalWithToppings] = useState(
    item?.price || 0
  );
  const [qty, setQty] = useState(1);

  const maxQty = useMemo(() => getMaxQty(item), [item]);
  const isOutOfStock = maxQty === 0;
  const itemId = getItemId(item);

  // ---------- Init khi đổi món ----------
  useEffect(() => {
    if (!item) return;

    const initToppings = Array.isArray(initialToppings)
      ? initialToppings
      : [];
    const initSize = initialSize || "S";
    const initQtyRaw = Number(initialQty) || 1;
    const max = getMaxQty(item);
    const safeQty = max === 0 ? 1 : Math.min(initQtyRaw, max);

    setSelectedToppings(initToppings);
    setSelectedSize(initSize);
    setQty(safeQty);
    setTotalWithToppings(Number(item.price) || 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // Clamp qty khi maxQty thay đổi
  useEffect(() => {
    if (isOutOfStock) return;
    setQty((q) => Math.min(Math.max(1, q), maxQty));
  }, [maxQty, isOutOfStock]);

  // ESC đóng modal
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock scroll body
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ---------- Derived ----------
  const sortedToppings = useMemo(
    () => sortToppings(selectedToppings),
    [selectedToppings]
  );

  const buildKey = useCallback(() => {
    const id = itemId || "";
    return `${id}-${selectedSize}-${sortedToppings.join(",")}`;
  }, [itemId, selectedSize, sortedToppings]);

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

  // ---------- Build cart entry ----------
  const buildCartEntry = useCallback(
    (quantity) => ({
      ...item,
      name: buildName(),
      price: Number(totalWithToppings) || Number(item.price) || 0,
      qty: quantity,
      stock: item.stock ?? DEFAULT_MAX_QTY,
      _originalId: itemId,
      _toppings: selectedToppings,
      _size: selectedSize,
    }),
    [item, buildName, totalWithToppings, itemId, selectedToppings, selectedSize]
  );

  // ============================================================
  // HANDLE ADD TO CART — edit mode + add mode
  // 🔧 FIX: tách hẳn 2 nhánh, không side effect trong setCart updater
  // ============================================================
  const handleAddToCart = () => {
    if (isOutOfStock) {
      toast(t("Hết hàng"), "error");
      return;
    }
    if (qty > maxQty) {
      toast(`${t("Chỉ còn")} ${maxQty} ${t("phần")}`, "error");
      return;
    }

    const newKey = buildKey();
    const newEntry = buildCartEntry(qty);

    // ========== EDIT MODE ==========
    if (editingKey) {
      // A. Chỉ đổi qty (key mới = key cũ) → ghi đè
      if (newKey === editingKey) {
        setCart((c) => ({ ...c, [editingKey]: newEntry }));
        toast(`${t("Đã cập nhật")} ${newEntry.name}`, "success");
        onClose?.();
        return;
      }

      const existing = cart?.[newKey];

      // B. Key mới đã tồn tại (món khác cùng cấu hình) → gộp
      if (existing) {
        const existQty = Number(existing.qty) || 0;
        if (existQty + qty > maxQty) {
          toast(
            `${t("Chỉ còn")} ${Math.max(0, maxQty - existQty)} ${t("phần")}`,
            "error"
          );
          return;
        }
        const combined = existQty + qty;
        setCart((c) => {
          const next = { ...c };
          next[newKey] = { ...existing, qty: combined };
          delete next[editingKey];
          return next;
        });
        toast(
          `${t("Đã gộp")} ${combined} ${t("phần")} ${newEntry.name}`,
          "success"
        );
        onClose?.();
        return;
      }

      // C. Key mới chưa có → xoá key cũ, thêm key mới
      setCart((c) => {
        const next = { ...c };
        delete next[editingKey];
        next[newKey] = newEntry;
        return next;
      });
      toast(`${t("Đã cập nhật")} ${newEntry.name}`, "success");
      onClose?.();
      return;
    }

    // ========== ADD MODE ==========
    const existing = cart?.[newKey];
    const currentQty = Number(existing?.qty) || 0;

    if (currentQty + qty > maxQty) {
      toast(
        `${t("Chỉ còn")} ${Math.max(0, maxQty - currentQty)} ${t("phần")}`,
        "error"
      );
      return;
    }

    const newQty = currentQty + qty;
    setCart((c) => ({ ...c, [newKey]: buildCartEntry(newQty) }));
    toast(`${t("Đã thêm")} ${newEntry.name} ${t("vào giỏ")}`, "success");
    onClose?.();
  };

  // ============================================================
  // HANDLE BUY NOW
  // ============================================================
  const handleBuyNow = () => {
    if (isOutOfStock) {
      toast(t("Hết hàng"), "error");
      return;
    }

    if (qty > maxQty) {
      toast(`${t("Chỉ còn")} ${maxQty} ${t("phần")}`, "error");
      return;
    }

    const buyNowItem = buildCartEntry(qty);

    onClose?.();
    navigate("/customer/checkout", { state: { buyNowItem } });
  };

  // ---------- Qty handlers ----------
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

  // ---------- Derived values ----------
  const unitPrice = Number(totalWithToppings) || Number(item.price) || 0;
  const grandTotal = unitPrice * qty;
  const atMax = qty >= maxQty;
  const atMin = qty <= 1;

  // ============================================================
  // RENDER
  // ============================================================
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
        {/* ===== HEADER ===== */}
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
            type="button"
            onClick={onClose}
            aria-label={t("Đóng")}
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

        {/* ===== IMAGE ===== */}
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

        {/* ===== DESCRIPTION ===== */}
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

        {/* ===== PRICE + STOCK ===== */}
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
                color: isOutOfStock
                  ? "#ef4444"
                  : "var(--text-light, #8993a3)",
                fontWeight: isOutOfStock ? 700 : 400,
              }}
            >
              {isOutOfStock
                ? t("Hết hàng")
                : `${t("Còn")} ${item.stock} ${t("phần")}`}
            </span>
          )}
        </div>

        {/* ===== RATING ===== */}
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

        {/* ===== TOPPING + SIZE ===== */}
        <ToppingSelector
          category={item.category}
          basePrice={item.price}
          onToppingsChange={setSelectedToppings}
          onSizeChange={setSelectedSize}
          onTotalChange={setTotalWithToppings}
          initialToppings={initialToppings}
          initialSize={initialSize}
        />

        {/* ===== QTY ===== */}
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

        {/* ===== TOTAL ===== */}
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

        {/* ===== REVIEWS ===== */}
        <ReviewSection menuItemId={itemId} currentUser={user} />

        {/* ===== ACTION BUTTONS ===== */}
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
              type="button"
              disabled
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
              type="button"
              onClick={handleBuyNow}
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
              type="button"
              onClick={handleAddToCart}
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
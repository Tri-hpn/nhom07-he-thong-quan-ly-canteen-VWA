// ============================================================
// TOPPINGSELECTOR.JSX — Chọn size + topping cho món ăn
// ============================================================
// 🔧 FIX #42: mở rộng TOPPING_GROUPS_BY_CATEGORY + fallback rộng
//   - Thêm category: Bữa sáng/trưa/tối, Bánh mì - Xôi, Combo...
//   - resolveToppingGroups: fallback trả [key] + nhóm mặc định
//   - Filter topping có applies_to rỗng (áp dụng mọi món) — giữ nguyên

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Check, Loader2,
} from "lucide-react";
import { api } from "../api";
import { money } from "./UI";
import { useI18n } from "../hooks/useI18n";

function normalizeId(id) {
  return id === null || id === undefined ? "" : String(id);
}

function isSameIdArray(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const setA = new Set(a.map(normalizeId));
  const setB = new Set(b.map(normalizeId));
  if (setA.size !== setB.size) return false;
  for (const id of setA) {
    if (!setB.has(id)) return false;
  }
  return true;
}

// Ánh xạ danh mục món (menu khách) → nhóm topping (`applies_to` do admin cấu hình).
// Hai bên dùng tên nhóm khác nhau nên phải map, nếu không món thuộc các danh mục
// Đồ uống / Bún - Phở - Cháo / Ăn vặt… sẽ không có topping nào để chọn.
//
// 🔧 FIX #42: bổ sung category còn thiếu để đồng bộ với menu thực tế.
const TOPPING_GROUPS_BY_CATEGORY = {
  // Món chính
  "Cơm": ["Cơm", "Món mặn"],
  "Bún - Phở - Cháo": ["Món mặn", "Cơm"],
  "Bánh mì - Xôi": ["Món mặn", "Cơm"],
  "Món mặn": ["Món mặn", "Cơm"],
  "Món chay": ["Món chay"],
  "Đồ chay": ["Món chay"],
  "Món phụ": ["Món phụ", "Cơm"],

  // Ăn nhẹ / ăn vặt
  "Ăn vặt": ["Đồ ăn nhanh"],
  "Đồ ăn nhanh": ["Đồ ăn nhanh"],
  "Tráng miệng": ["Đồ uống", "Đồ ăn nhanh"],

  // Đồ uống
  "Coffee & Tea": ["Đồ uống"],
  "Nước ép - Sinh tố": ["Đồ uống"],
  "Đồ uống": ["Đồ uống"],

  // Combo
  "Combo": ["Cơm", "Món mặn"],
  "Combo 1 người": ["Cơm", "Món mặn"],
  "Combo siêu hời": ["Cơm", "Món mặn"],

  // 🔧 FIX #42: Bữa sáng/trưa/tối map về nhóm món mặn + cơm
  "Bữa sáng": ["Cơm", "Món mặn"],
  "Bữa trưa": ["Cơm", "Món mặn"],
  "Bữa tối": ["Cơm", "Món mặn"],
};

// 🔧 FIX #42: nhóm fallback khi category không có trong map
//   → vẫn cho phép hiển thị topping, tránh mất selector.
const FALLBACK_GROUPS = ["Cơm", "Món mặn", "Món phụ", "Đồ uống", "Đồ ăn nhanh"];

function resolveToppingGroups(category) {
  if (!category) return [];
  const key = String(category).trim();
  const mapped = TOPPING_GROUPS_BY_CATEGORY[key];
  if (mapped && mapped.length > 0) return mapped;

  // 🔧 FIX #42: fallback — trả [key] (để match chính xác applies_to)
  //   + FALLBACK_GROUPS (để match nhóm phổ biến) → không bao giờ mất topping.
  return [key, ...FALLBACK_GROUPS];
}

export default function ToppingSelector({
  category,
  onToppingsChange,
  onSizeChange,
  onTotalChange,
  basePrice,
  initialToppings,
  initialSize,
}) {
  const { t } = useI18n();
  const [toppings, setToppings] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedToppings, setSelectedToppings] = useState([]);
  const [selectedSize, setSelectedSize] = useState("S");

  const reqIdRef = useRef(0);

  const lastFiredToppingsRef = useRef(null);
  const lastFiredSizeRef = useRef(null);
  const lastFiredTotalRef = useRef(null);

  const safeBasePrice = useMemo(() => {
    const n = Number(basePrice);
    return isFinite(n) && n >= 0 ? n : 0;
  }, [basePrice]);

  useEffect(() => {
    const myReqId = ++reqIdRef.current;
    setLoading(true);

    (async () => {
      try {
        // Lấy TOÀN BỘ topping rồi tự lọc theo nhóm phù hợp với danh mục món.
        // (Nếu để backend lọc theo đúng tên danh mục menu thì rất nhiều món —
        // đồ uống, bún/phở, ăn vặt… — không khớp nhóm nào và selector biến mất.)
        const [toppingsRes, sizesRes] = await Promise.all([
          api.toppings.list().catch(() => []),
          api.sizes.list().catch(() => []),
        ]);

        if (myReqId !== reqIdRef.current) return;

        const all = Array.isArray(toppingsRes) ? toppingsRes : [];
        const groups = resolveToppingGroups(category);

        const matched = groups.length
          ? all.filter((tp) => {
              const appliesTo = Array.isArray(tp.applies_to) ? tp.applies_to : [];
              // Topping không giới hạn nhóm → áp dụng cho mọi món
              if (appliesTo.length === 0) return true;
              return appliesTo.some((g) => groups.includes(g));
            })
          : [];

        // Không khớp nhóm nào → vẫn hiện đủ topping để khách chọn (không bao giờ mất)
        setToppings(matched.length > 0 ? matched : all);
        setSizes(Array.isArray(sizesRes) ? sizesRes : []);
      } finally {
        if (myReqId === reqIdRef.current) setLoading(false);
      }
    })();
  }, [category]);

  useEffect(() => {
    if (Array.isArray(initialToppings)) {
      setSelectedToppings(initialToppings);
    }
  }, [initialToppings]);

  useEffect(() => {
    if (initialSize) {
      setSelectedSize(initialSize);
    }
  }, [initialSize]);

  useEffect(() => {
    if (toppings.length === 0) return;

    setSelectedToppings((cur) => {
      const validIds = new Set(toppings.map((tp) => normalizeId(tp.id)));
      const filtered = cur.filter((id) => validIds.has(normalizeId(id)));

      if (filtered.length === cur.length) return cur;
      return filtered;
    });
  }, [toppings]);

  const toppingsTotal = useMemo(() => {
    if (!Array.isArray(selectedToppings) || selectedToppings.length === 0) {
      return 0;
    }

    const selectedSet = new Set(selectedToppings.map(normalizeId));

    return toppings.reduce((sum, tp) => {
      const id = normalizeId(tp.id);
      if (!selectedSet.has(id)) return sum;
      const price = Number(tp.price);
      return sum + (isFinite(price) ? price : 0);
    }, 0);
  }, [selectedToppings, toppings]);

  const sizeExtra = useMemo(() => {
    if (!Array.isArray(sizes) || sizes.length === 0) return 0;

    const targetId = normalizeId(selectedSize);
    const size = sizes.find((s) => normalizeId(s.id) === targetId);
    const extra = Number(size?.extra_price);
    return isFinite(extra) ? extra : 0;
  }, [selectedSize, sizes]);

  const total = useMemo(
    () => safeBasePrice + toppingsTotal + sizeExtra,
    [safeBasePrice, toppingsTotal, sizeExtra]
  );

  useEffect(() => {
    if (!onToppingsChange) return;
    if (isSameIdArray(lastFiredToppingsRef.current, selectedToppings)) return;
    lastFiredToppingsRef.current = selectedToppings;
    onToppingsChange(selectedToppings);
  }, [selectedToppings, onToppingsChange]);

  useEffect(() => {
    if (!onSizeChange) return;
    if (lastFiredSizeRef.current === selectedSize) return;
    lastFiredSizeRef.current = selectedSize;
    onSizeChange(selectedSize);
  }, [selectedSize, onSizeChange]);

  useEffect(() => {
    if (!onTotalChange) return;
    if (lastFiredTotalRef.current === total) return;
    lastFiredTotalRef.current = total;
    onTotalChange(total);
  }, [total, onTotalChange]);

  const toggleTopping = useCallback((id) => {
    setSelectedToppings((cur) => {
      const idStr = normalizeId(id);
      const exists = cur.some((x) => normalizeId(x) === idStr);

      if (exists) {
        return cur.filter((x) => normalizeId(x) !== idStr);
      }
      return [...cur, id];
    });
  }, []);

  const selectSize = useCallback((id) => {
    setSelectedSize(id);
  }, []);

  if (loading) {
    return (
      <div
        style={{
          marginTop: 16,
          paddingTop: 16,
          borderTop: "1px dashed var(--border-color, #eef2f7)",
          textAlign: "center",
          color: "var(--text-light, #8993a3)",
          fontSize: 13,
          padding: "16px 0",
        }}
      >
        <Loader2
          size={18}
          style={{
            animation: "toppingSpin 1s linear infinite",
            marginBottom: 6,
          }}
        />
        <div>{t("Đang tải tuỳ chọn món...")}</div>
        <style>{`
          @keyframes toppingSpin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (toppings.length === 0 && sizes.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: 16,
        paddingTop: 16,
        borderTop: "1px dashed var(--border-color, #eef2f7)",
      }}
    >
      {sizes.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4
            style={{
              margin: "0 0 10px",
              fontSize: 13,
              color: "var(--text-primary, #172033)",
              fontWeight: 600,
            }}
          >
            {t("Chọn kích cỡ")}
          </h4>

          <div
            role="radiogroup"
            aria-label={t("Chọn kích cỡ")}
            style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
          >
            {sizes.map((s) => {
              const active =
                normalizeId(selectedSize) === normalizeId(s.id);
              const extra = Number(s.extra_price) || 0;

              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={
                    extra > 0
                      ? t("Chọn kích cỡ {name}, phụ thu {extra}", {
                          name: s.name,
                          extra: money(extra),
                        })
                      : t("Chọn kích cỡ {name}", { name: s.name })
                  }
                  onClick={() => selectSize(s.id)}
                  style={{
                    padding: "8px 16px",
                    background: active
                      ? "#2634d5"
                      : "var(--card-bg, #fff)",
                    color: active
                      ? "#fff"
                      : "var(--text-primary, #172033)",
                    border: active
                      ? "1px solid #2634d5"
                      : "1px solid var(--border-color, #e5e9ef)",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 13,
                    transition: "all 0.15s",
                  }}
                >
                  {s.name}
                  {extra > 0 && (
                    <span
                      style={{
                        fontSize: 11,
                        opacity: active ? 0.9 : 0.8,
                        marginLeft: 4,
                      }}
                    >
                      +{money(extra)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {toppings.length > 0 && (
        <div>
          <h4
            style={{
              margin: "0 0 10px",
              fontSize: 13,
              color: "var(--text-primary, #172033)",
              fontWeight: 600,
            }}
          >
            {t("Thêm topping cho món")}
          </h4>

          <div
            role="group"
            aria-label={t("Thêm topping cho món")}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 8,
            }}
          >
            {toppings.map((tp) => {
              const idStr = normalizeId(tp.id);
              const active = selectedToppings.some(
                (x) => normalizeId(x) === idStr
              );
              const price = Number(tp.price) || 0;

              return (
                <button
                  key={tp.id}
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  aria-label={t("Chọn {name}, thêm {price}", {
                    name: tp.name,
                    price: money(price),
                  })}
                  onClick={() => toggleTopping(tp.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    background: active
                      ? "rgba(38, 52, 213, 0.08)"
                      : "var(--card-bg, #fff)",
                    border: active
                      ? "2px solid #2634d5"
                      : "2px solid var(--border-color, #e5e9ef)",
                    borderRadius: 10,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                  }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: active
                        ? "0"
                        : "2px solid var(--border-color, #cbd5e1)",
                      background: active ? "#2634d5" : "transparent",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    {active && <Check size={12} color="#fff" />}
                  </div>

                  <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--text-primary, #172033)",
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tp.name}
                    </div>
                  </div>

                  <b
                    style={{
                      fontSize: 12,
                      color: "#18a967",
                      flexShrink: 0,
                    }}
                  >
                    +{money(price)}
                  </b>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
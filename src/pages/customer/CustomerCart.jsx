// ============================================================
// CUSTOMERCART.JSX — Giỏ hàng (V5 - FINAL + i18n)
// ============================================================
// V5 (2026-10):
//   - 🔧 FIX #27: setSyncedKeys debounce timer cleanup đúng cách
//                 khi unmount (tránh setState sau unmount)
//   - Giữ nguyên toàn bộ logic còn lại
// ============================================================

import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  memo,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ShoppingCart, Plus, Minus, Trash2, Check, ArrowRight, Store, Pencil,
  Home, ChevronRight, Info, AlertCircle, Clock, Utensils, Tag, Shield,
  Sparkles, Soup, ChevronLeft, X, Loader2, ShoppingBag, RefreshCw,
  CreditCard,
} from "lucide-react";
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import { useCrossTabSync } from "../../hooks/useCrossTabSync";
import FoodDetailModal from "../../components/FoodDetailModal";
import ConfirmDialog from "../../components/ConfirmDialog";

const STORAGE_KEY = "canteen_cart_selected";
const DEFAULT_MAX_QTY = 99;
const CROSS_TAB_DEBOUNCE_MS = 300;

const FALLBACK_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
      <rect fill='#f5f7fb' width='100' height='100'/>
      <text x='50' y='58' font-size='40' text-anchor='middle'>🍽️</text>
    </svg>`
  );

function getMaxQty(item) {
  if (typeof item?.stock === "number") {
    return Math.max(1, item.stock);
  }
  return DEFAULT_MAX_QTY;
}

function readSavedSelection(cartKeys) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const arr = JSON.parse(saved);
      if (Array.isArray(arr)) {
        const valid = arr.filter((k) => cartKeys.includes(k));
        if (valid.length > 0) return valid;
      }
    }
  } catch {}
  return cartKeys;
}

// ============================================================
// SUB: CartItemRow — memo để tránh re-render
// ============================================================

const CartItemRow = memo(function CartItemRow({
  item,
  checked,
  onToggle,
  onQtyChange,
  onRemove,
  onEdit,
  t,
  tData,
}) {
  const m = item;
  const maxQty = getMaxQty(m);
  const atMax = m.qty >= maxQty;
  const atMin = m.qty <= 1;
  const stockLeft = typeof m.stock === "number" ? m.stock : null;
  const isLowStock = stockLeft !== null && stockLeft <= 5;

  return (
    <div className={`cart-item ${checked ? "cart-item--checked" : ""}`}>
      <span
        role="checkbox"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onToggle(m._key)}
        onKeyDown={(e) =>
          (e.key === " " || e.key === "Enter") && onToggle(m._key)
        }
        className={`cart-checkbox ${checked ? "checked" : ""}`}
      >
        {checked && <Check size={13} />}
      </span>

      <div className="cart-item__img" onClick={() => onToggle(m._key)}>
        {m.image ? (
          <img
            src={m.image}
            alt={m.name}
            loading="lazy"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = FALLBACK_IMG;
            }}
          />
        ) : (
          <Soup size={26} />
        )}
      </div>

      <div className="cart-item__info">
        <b className="cart-item__name">{tData(m, "name")}</b>
        <div className="cart-item__meta">
          <span className="cart-item__price">{money(m.price)}</span>
          {typeof m._size === "string" && m._size && (
            <span className="cart-item__tag">
              {t("Size")} {m._size}
            </span>
          )}
          {Array.isArray(m._toppings) && m._toppings.length > 0 && (
            <span className="cart-item__tag">
              +{m._toppings.length} {t("topping")}
            </span>
          )}
        </div>
        {stockLeft !== null && (
          <span
            className={`cart-item__stock ${
              isLowStock ? "cart-item__stock--low" : ""
            }`}
          >
            <Clock size={11} />
            {t("Còn")} {stockLeft}
          </span>
        )}
      </div>

      <div className="cart-qty">
        <button
          type="button"
          onClick={() => onQtyChange(m._key, -1)}
          disabled={atMin}
          aria-label={t("Giảm")}
        >
          <Minus size={14} />
        </button>
        <span>{m.qty}</span>
        <button
          type="button"
          onClick={() => onQtyChange(m._key, 1)}
          disabled={atMax}
          aria-label={t("Tăng")}
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="cart-item__total">
        {money(m.price * m.qty)}
      </div>

      <div className="cart-item__actions">
        <button
          type="button"
          className="cart-item__action cart-item__action--edit"
          onClick={() => onEdit({ key: m._key, item: m })}
          title={t("Sửa món")}
          aria-label={t("Sửa")}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className="cart-item__action cart-item__action--delete"
          onClick={() => onRemove(m._key)}
          title={t("Xoá khỏi giỏ")}
          aria-label={t("Xoá")}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
});

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function CustomerCart({ cart, setCart }) {
  const { t, tData } = useI18n();
  const navigate = useNavigate();

  const [syncedKeys, setSyncedKeysRaw] = useCrossTabSync(STORAGE_KEY, null);

  const safeCart = useMemo(() => cart || {}, [cart]);

  const lines = useMemo(
    () =>
      Object.entries(safeCart).map(([key, item]) => ({
        ...item,
        _key: key,
      })),
    [safeCart]
  );

  const cartKeys = useMemo(() => Object.keys(safeCart), [safeCart]);

  const [editingItem, setEditingItem] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState(() =>
    readSavedSelection(Object.keys(cart || {}))
  );
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearing, setClearing] = useState(false);

  const prevKeysRef = useRef(cartKeys);
  const crossTabTimerRef = useRef(null);
  const mountedRef = useRef(true); // 🔧 FIX #27

  // 🔧 FIX #27: track mount state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Cleanup timer khi unmount
      if (crossTabTimerRef.current) {
        clearTimeout(crossTabTimerRef.current);
        crossTabTimerRef.current = null;
      }
    };
  }, []);

  // 🔧 FIX #27: setSyncedKeys có debounce + guard mounted
  const setSyncedKeys = useCallback(
    (value) => {
      if (crossTabTimerRef.current) {
        clearTimeout(crossTabTimerRef.current);
      }
      crossTabTimerRef.current = setTimeout(() => {
        crossTabTimerRef.current = null;
        if (!mountedRef.current) return;
        setSyncedKeysRaw(value);
      }, CROSS_TAB_DEBOUNCE_MS);
    },
    [setSyncedKeysRaw]
  );

  // Persist selectedKeys → localStorage
  useEffect(() => {
    try {
      if (selectedKeys.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedKeys));
      }
    } catch {}
  }, [selectedKeys]);

  // Sync từ crossTab
  useEffect(() => {
    if (syncedKeys === null) return;
    if (!Array.isArray(syncedKeys)) return;

    setSelectedKeys((prev) => {
      const a = JSON.stringify([...prev].sort());
      const b = JSON.stringify([...syncedKeys].sort());
      if (a === b) return prev;
      return syncedKeys;
    });
  }, [syncedKeys]);

  // Sync selectedKeys khi cart đổi
  useEffect(() => {
    const prevKeys = prevKeysRef.current;
    const newKeys = cartKeys.filter((k) => !prevKeys.includes(k));
    const removedSet = new Set(
      prevKeys.filter((k) => !cartKeys.includes(k))
    );

    if (cartKeys.length === 0) {
      setSelectedKeys([]);
      prevKeysRef.current = cartKeys;
      return;
    }

    if (newKeys.length === 0 && removedSet.size === 0) return;

    setSelectedKeys((prev) => {
      const kept = prev.filter((k) => !removedSet.has(k));
      const toAdd = newKeys.filter((k) => !kept.includes(k));
      return [...kept, ...toAdd];
    });

    prevKeysRef.current = cartKeys;
  }, [cartKeys]);

  const allSelected = useMemo(
    () =>
      lines.length > 0 &&
      lines.every((m) => selectedKeys.includes(m._key)),
    [lines, selectedKeys]
  );

  const selectedLines = useMemo(
    () => lines.filter((m) => selectedKeys.includes(m._key)),
    [lines, selectedKeys]
  );

  const total = useMemo(
    () =>
      selectedLines.reduce(
        (s, m) => s + (Number(m.price) || 0) * (Number(m.qty) || 0),
        0
      ),
    [selectedLines]
  );

  const totalQty = useMemo(
    () => selectedLines.reduce((s, m) => s + (Number(m.qty) || 0), 0),
    [selectedLines]
  );

  const toggleItem = useCallback(
    (key) => {
      setSelectedKeys((prev) => {
        const next = prev.includes(key)
          ? prev.filter((k) => k !== key)
          : [...prev, key];
        setSyncedKeys(next);
        return next;
      });
    },
    [setSyncedKeys]
  );

  const toggleAll = useCallback(() => {
    setSelectedKeys((prev) => {
      const next =
        prev.length === lines.length ? [] : lines.map((m) => m._key);
      setSyncedKeys(next);
      return next;
    });
  }, [lines, setSyncedKeys]);

  const updateQty = useCallback(
    (key, delta) => {
      const item = safeCart[key];
      if (!item) return;

      const maxQty = getMaxQty(item);
      const currentQty = Number(item.qty) || 1;

      if (delta > 0 && currentQty >= maxQty) {
        toast(
          t("Chỉ còn {n} phần trong kho").replace("{n}", maxQty),
          "error"
        );
        return;
      }

      const newQty = Math.max(1, Math.min(maxQty, currentQty + delta));
      if (newQty === currentQty) return;

      setCart((c) => ({ ...c, [key]: { ...c[key], qty: newQty } }));
    },
    [safeCart, setCart, t]
  );

  const removeItem = useCallback(
    (key) => {
      const item = safeCart[key];
      if (!item) return;
      setConfirmRemove({ key, name: item.name });
    },
    [safeCart]
  );

  const executeRemove = useCallback(() => {
    if (!confirmRemove) return;
    const { key } = confirmRemove;

    setCart((c) => {
      const n = { ...c };
      delete n[key];
      return n;
    });

    setSelectedKeys((prev) => {
      const next = prev.filter((k) => k !== key);
      setSyncedKeys(next);
      return next;
    });

    setConfirmRemove(null);
  }, [confirmRemove, setCart, setSyncedKeys]);

  const openClearAllConfirm = useCallback(() => {
    if (lines.length === 0) return;
    setConfirmClearAll(true);
  }, [lines.length]);

  const executeClearAll = useCallback(async () => {
    if (clearing) return;
    setClearing(true);

    try {
      setCart({});
      setSelectedKeys([]);
      setSyncedKeys([]);
      setConfirmClearAll(false);
      toast(t("Đã xoá toàn bộ giỏ hàng"), "success");
    } finally {
      setClearing(false);
    }
  }, [clearing, setCart, setSyncedKeys, t]);

  const goCheckout = useCallback(() => {
    if (!selectedLines.length) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedKeys));
    } catch {}
    navigate("/customer/checkout");
  }, [selectedLines.length, selectedKeys, navigate]);

  const handleEdit = useCallback((payload) => {
    setEditingItem(payload);
  }, []);

  if (!lines.length) {
    return (
      <div className="cart-v2">
        <section className="cart-header">
          <div className="cart-header__top">
            <nav className="cart-breadcrumb">
              <Link to="/customer/home" className="cart-breadcrumb__link">
                <Home size={14} />
                {t("Trang chủ")}
              </Link>
              <ChevronRight size={14} className="cart-breadcrumb__sep" />
              <span className="cart-breadcrumb__current">
                {t("Giỏ hàng")}
              </span>
            </nav>
          </div>

          <div className="cart-stepper">
            <div className="cart-stepper__item cart-stepper__item--active">
              <div className="cart-stepper__icon cart-stepper__icon--active">
                <Utensils size={16} />
              </div>
              <div>
                <span className="cart-stepper__label cart-stepper__label--active">{t("BƯỚC 1")}</span>
                <b className="cart-stepper__label--active">{t("Chọn món")}</b>
              </div>
            </div>
            <div className="cart-stepper__item cart-stepper__item--active">
              <div className="cart-stepper__icon cart-stepper__icon--active">
                <ShoppingBag size={16} />
              </div>
              <div>
                <span className="cart-stepper__label cart-stepper__label--active">
                  {t("BƯỚC 2")}
                </span>
                <b className="cart-stepper__label--active">
                  {t("Giỏ & Tùy chọn")}
                </b>
              </div>
            </div>
            <div className="cart-stepper__item cart-stepper__item--pending">
              <div className="cart-stepper__icon">
                <CreditCard size={16} />
              </div>
              <div>
                <span className="cart-stepper__label">{t("BƯỚC 3")}</span>
                <b>{t("Thanh toán")}</b>
              </div>
            </div>
            <div className="cart-stepper__item cart-stepper__item--pending">
              <div className="cart-stepper__icon">
                <Store size={16} />
              </div>
              <div>
                <span className="cart-stepper__label">{t("BƯỚC 4")}</span>
                <b>{t("Nhận tại quầy")}</b>
              </div>
            </div>
          </div>
        </section>

        <div className="cart-empty">
          <div className="cart-empty__icon">
            <ShoppingCart size={56} />
          </div>
          <h2>{t("Giỏ hàng đang trống")}</h2>
          <p>{t("Hãy chọn món ăn bạn yêu thích để bắt đầu.")}</p>
          <Link to="/customer/menu" className="cart-empty__btn">
            <Store size={16} />
            {t("Khám phá thực đơn")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-v2">
      <section className="cart-header">
        <div className="cart-header__top">
          <nav className="cart-breadcrumb">
            <Link to="/customer/home" className="cart-breadcrumb__link">
              <Home size={14} />
              {t("Trang chủ")}
            </Link>
            <ChevronRight size={14} className="cart-breadcrumb__sep" />
            <span className="cart-breadcrumb__current">
              {t("Giỏ hàng")}
            </span>
          </nav>

          <div className="cart-header__meta">
            <span className="cart-header__count">
              {lines.length} {t("món")} •{" "}
              {lines.reduce((s, m) => s + (Number(m.qty) || 0), 0)}{" "}
              {t("phần")}
            </span>
          </div>
        </div>

        <div className="cart-stepper">
          <div className={`cart-stepper__item ${selectedLines.length > 0 ? "cart-stepper__item--done" : "cart-stepper__item--active"}`}>
              <div className={`cart-stepper__icon ${selectedLines.length === 0 ? "cart-stepper__icon--active" : ""}`}>
                {selectedLines.length > 0 ? <Check size={16} /> : <Utensils size={16} />}
              </div>
              <div>
                <span className={`cart-stepper__label ${selectedLines.length === 0 ? "cart-stepper__label--active" : ""}`}>
                  {t("BƯỚC 1")}
                </span>
                <b className={selectedLines.length === 0 ? "cart-stepper__label--active" : ""}>
                  {t("Chọn món")}
                </b>
              </div>
            </div>

          <div className="cart-stepper__item cart-stepper__item--active">
            <div className="cart-stepper__icon cart-stepper__icon--active">
              <ShoppingBag size={16} />
            </div>
            <div>
              <span className="cart-stepper__label cart-stepper__label--active">
                {t("BƯỚC 2")}
              </span>
              <b className="cart-stepper__label--active">
                {t("Giỏ & Tùy chọn")}
              </b>
            </div>
          </div>

          <div className="cart-stepper__item cart-stepper__item--pending">
            <div className="cart-stepper__icon">
              <CreditCard size={16} />
            </div>
            <div>
              <span className="cart-stepper__label">{t("BƯỚC 3")}</span>
              <b>{t("Thanh toán")}</b>
            </div>
          </div>

          <div className="cart-stepper__item cart-stepper__item--pending">
            <div className="cart-stepper__icon">
              <Store size={16} />
            </div>
            <div>
              <span className="cart-stepper__label">{t("BƯỚC 4")}</span>
              <b>{t("Nhận tại quầy")}</b>
            </div>
          </div>
        </div>
      </section>

      <div className="cart-grid">
        <div className="cart-left">
          <div className="cart-toolbar">
            <label className="cart-toolbar__select-all">
              <span
                role="checkbox"
                aria-checked={allSelected}
                tabIndex={0}
                onClick={toggleAll}
                onKeyDown={(e) =>
                  (e.key === " " || e.key === "Enter") && toggleAll()
                }
                className={`cart-checkbox ${allSelected ? "checked" : ""}`}
              >
                {allSelected && <Check size={13} />}
              </span>
              <b>
                {t("Chọn tất cả")} ({lines.length} {t("món")})
              </b>
            </label>

            <div className="cart-toolbar__right">
              <span className="cart-toolbar__selected">
                {t("Đã chọn")}: <b>{selectedLines.length}</b>/{lines.length}
              </span>
              {lines.length > 0 && (
                <button
                  type="button"
                  className="cart-toolbar__clear"
                  onClick={openClearAllConfirm}
                >
                  <Trash2 size={13} />
                  {t("Xoá tất cả")}
                </button>
              )}
            </div>
          </div>

          <div className="cart-list">
            {lines.map((m) => (
              <CartItemRow
                key={m._key}
                item={m}
                checked={selectedKeys.includes(m._key)}
                onToggle={toggleItem}
                onQtyChange={updateQty}
                onRemove={removeItem}
                onEdit={handleEdit}
                t={t}
                tData={tData}
              />
            ))}
          </div>

          <Link to="/customer/menu" className="cart-continue">
            <ChevronLeft size={16} />
            {t("Tiếp tục chọn món")}
          </Link>
        </div>

        <div className="cart-right">
          <div className="cart-summary">
            <h3 className="cart-summary__title">
              <Tag size={18} />
              {t("Tóm tắt đơn hàng")}
            </h3>

            <div className="cart-summary__selected">
              <span className="cart-summary__selected-label">
                {t("Đã chọn")}
              </span>
              {selectedLines.length === 0 ? (
                <span className="cart-summary__selected-empty">
                  {t("Chưa chọn món nào")}
                </span>
              ) : (
                <span className="cart-summary__selected-value">
                  <b>{selectedLines.length}</b> {t("món")} •{" "}
                  <b>{totalQty}</b> {t("phần")}
                </span>
              )}
            </div>

            <div className="cart-summary__rows">
              <div className="cart-summary__row">
                <span>{t("Tạm tính")}</span>
                <b>{money(total)}</b>
              </div>
              <div className="cart-summary__row">
                <span>{t("Phí dịch vụ")}</span>
                <b>{money(0)}</b>
              </div>
              <div className="cart-summary__row cart-summary__row--green">
                <span>
                  <Sparkles size={12} />
                  {t("Trợ giá SV (dự kiến)")}
                </span>
                <b>-10.000 đ</b>
              </div>
            </div>

            <div className="cart-summary__total">
              <div>
                <span>{t("TỔNG CỘNG")}</span>
                <small>{t("Đã bao gồm VAT & trợ giá")}</small>
              </div>
              <div className="cart-summary__total-value">
                {money(Math.max(0, total - 10000))}
              </div>
            </div>

            <button
              type="button"
              className="cart-summary__cta"
              onClick={goCheckout}
              disabled={!selectedLines.length}
            >
              {selectedLines.length ? (
                <>
                  {t("Tiến hành thanh toán")}
                  <ArrowRight size={16} />
                </>
              ) : (
                t("Chọn món để đặt")
              )}
            </button>
          </div>

          <div className="cart-note">
            <Info size={18} />
            <div>
              <b>{t("Lưu ý:")}</b>
              <p>
                {t("Đơn hàng sẽ được chuyển đến bếp ngay sau khi bạn thanh toán. Vui lòng chọn đúng khung giờ nhận món trong bước tiếp theo.")}
              </p>
            </div>
          </div>

          <div className="cart-security">
            <Shield size={20} />
            <div>
              <b>{t("Thanh toán bảo mật SSL / PCI-DSS")}</b>
              <span>
                {t("Hoàn tiền 100% nếu quầy hết món hoặc phát sinh lỗi")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {editingItem && (
        <FoodDetailModal
          item={editingItem.item}
          cart={safeCart}
          setCart={setCart}
          editingKey={editingItem.key}
          initialToppings={editingItem.item._toppings || []}
          initialSize={editingItem.item._size || "S"}
          initialQty={editingItem.item.qty}
          onUpdate={(oldKey, newKey, newItem) => {
            setCart((cc) => {
              const n = { ...cc };
              delete n[oldKey];
              n[newKey] = newItem;
              return n;
            });
            setSelectedKeys((prev) => {
              const next = prev.includes(oldKey)
                ? [...prev.filter((k) => k !== oldKey), newKey]
                : prev;
              setSyncedKeys(next);
              return next;
            });
          }}
          onClose={() => setEditingItem(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirmRemove}
        title={t("Xoá món khỏi giỏ hàng?")}
        message={
          confirmRemove
            ? `"${confirmRemove.name}" ${t(
                "sẽ bị xoá khỏi giỏ. Bạn có thể thêm lại bất cứ lúc nào."
              )}`
            : ""
        }
        confirmText={t("Xoá món")}
        cancelText={t("Giữ lại")}
        danger
        onConfirm={executeRemove}
        onClose={() => setConfirmRemove(null)}
      />

      <ConfirmDialog
        open={confirmClearAll}
        title={t("Xoá toàn bộ giỏ hàng?")}
        message={
          lines.length > 0
            ? t(
                "Bạn sắp xoá {n} món khỏi giỏ. Hành động này không thể hoàn tác."
              ).replace("{n}", lines.length)
            : ""
        }
        confirmText={t("Xoá tất cả")}
        cancelText={t("Giữ lại")}
        danger
        loading={clearing}
        onConfirm={executeClearAll}
        onClose={() => !clearing && setConfirmClearAll(false)}
      />
    </div>
  );
}
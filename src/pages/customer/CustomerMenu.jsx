// ============================================================
// CUSTOMERMENU.JSX — Thực đơn (V4 - STICKY SIDEBAR + SCROLL GRID)
// ============================================================
// ✅ SOURCE-TEXT I18N
// ✅ Card món: ảnh vuông 96px + info + nút Thêm (giống HomeFoodCard)
// ✅ Layout: grid 2 cột có header full-width — 2 cột không lệch
// ✅ V4: Bộ lọc trái + Sắp xếp đứng im, chỉ vùng món cuộn
// ============================================================

import { SkeletonCard } from "../../components/Skeleton";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle, RefreshCw, Star, Search, SlidersHorizontal, Check, Shield,
  Lightbulb, Sparkles, Zap, ChevronLeft, ChevronRight, Grid3x3, List,
  RotateCcw, ShoppingCart, ArrowRight, Flame,
} from "lucide-react";
import { toast } from "../../components/Effects";
import { api } from "../../api";
import { money } from "../../components/UI";
import { useI18n } from "../../hooks/useI18n";
import FoodDetailModal from "../../components/FoodDetailModal";
import ChatBotWidget from "../../components/ChatBotWidget";

// ============================================================
// CONSTANTS
// ============================================================

const ALL_CATEGORY = "Tất cả";
const PAGE_SIZE = 15;

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=70";

const CATEGORY_ICONS = {
  "Bữa sáng": "", "Bữa trưa": "", "Bữa tối": "", "Món chay": "🥗",
  "Đồ uống": "", "Đồ ăn nhanh": "", "Tráng miệng": "",
};

const CATEGORY_LABEL_TRANSLATIONS = {
  "Bữa sáng": "Breakfast",
  "Bữa trưa": "Lunch",
  "Bữa tối": "Dinner",
  "Đồ ăn nhanh": "Fast Food",
  "Món chay": "Vegetarian",
  "Đồ uống": "Drink",
  "Tráng miệng": "Dessert",
  "Món mặn": "Savory",
};

const FAST_CATEGORIES = ["Đồ ăn nhanh"];
const HEALTHY_CATEGORIES = ["Món chay", "Đồ chay"];
const COOL_CATEGORIES = ["Đồ uống", "Nước ép - Sinh tố", "Coffee & Tea"];
const FAST_PREP_MINUTES = 10;

const PRIORITY_FILTERS = [
  { key: "fast", icon: "⚡", label: "Phục vụ nhanh" },
  { key: "healthy", icon: "🥗", label: "Lành mạnh" },
  { key: "cool", icon: "❄️", label: "Mát lạnh" },
  { key: "noSpicy", icon: "", label: "Không cay" },
];

const CALORIE_RANGES = [
  { value: "all", label: "Tất cả" },
  { value: "under-400", label: "< 400 kcal" },
  { value: "400-650", label: "400 - 650 kcal" },
  { value: "over-650", label: "> 650 kcal" },
];

const SORT_OPTIONS = [
  { value: "all", label: "Tất cả" },
  { value: "popular", label: "Bán chạy nhất" },
  { value: "discount", label: "Đang giảm giá" },
  { value: "price-asc", label: "Giá thấp → cao" },
  { value: "price-desc", label: "Giá cao → thấp" },
  { value: "fastest", label: "Nhanh nhất" },
];

function translateCategory(name, t) {
  const source = CATEGORY_LABEL_TRANSLATIONS[name];
  if (!source) return name;
  return t(source);
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function CustomerMenu({ cart, setCart, user }) {
  const { t, tData } = useI18n();
  const navigate = useNavigate();

  // ✅ V4: Thêm class để CSS áp dụng layout cố định sidebar + scrollable grid
  useEffect(() => {
    document.body.classList.add("menu-v3-active");
    return () => {
      document.body.classList.remove("menu-v3-active");
    };
  }, []);

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState([ALL_CATEGORY]);
  const [activeTab, setActiveTab] = useState(ALL_CATEGORY);
  const [priceRange, setPriceRange] = useState({ min: 0, max: 500000 });
  const [priceQuickFilter, setPriceQuickFilter] = useState("all");
  const [priorities, setPriorities] = useState({});
  const [calorieFilter, setCalorieFilter] = useState("all");
  const [sortBy, setSortBy] = useState("all");
  const [viewMode, setViewMode] = useState("grid");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState("cart");
  const [quantities, setQuantities] = useState({});
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputRef = useRef(null);

  const priceBounds = { min: 0, max: 500000 };
  const priceSpan = priceBounds.max - priceBounds.min;

  useEffect(() => {
    setPriceRange({ ...priceBounds });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceBounds.min, priceBounds.max]);

  const load = useCallback(
    async (silent = false) => {
      setError("");
      try {
        const [menuRes, catRes] = await Promise.all([
          api.menu.listActive("", ALL_CATEGORY, "popular").catch(() => []),
          api.categories.list().catch(() => []),
        ]);
        const rawList = Array.isArray(menuRes) ? menuRes : [];
        setItems(rawList.filter((m) => m.active));
        setCategories(Array.isArray(catRes) ? catRes : []);
      } catch (e) {
        if (!silent) setError(e.message || t("Không tải được thực đơn"));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = searchParams.get("q") || "";
    const cat = searchParams.get("category") || "";
    if (q) setSearch(q);
    if (cat) setSelectedCategories([cat]);
  }, [searchParams.toString()]);

  useEffect(() => {
    setActiveTab(
      selectedCategories.length === 1 ? selectedCategories[0] : ALL_CATEGORY
    );
  }, [selectedCategories]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const categoryList = useMemo(() => {
    const fromApi = categories.map((cat) => ({
      id: cat.name,
      label: tData(cat, "name"),
      count: items.filter((m) => m.category === cat.name).length,
    }));
    if (fromApi.length === 0 && items.length > 0) {
      const groups = {};
      items.forEach((m) => {
        const c = m.category || "Khác";
        groups[c] = (groups[c] || 0) + 1;
      });
      return Object.entries(groups).map(([name, count]) => ({
        id: name,
        label: translateCategory(name, t),
        count,
      }));
    }
    return fromApi;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, items, t, tData]);

  const filtered = useMemo(() => {
    let list = items;

    const activeCats = selectedCategories.filter((c) => c !== ALL_CATEGORY);
    if (activeCats.length > 0) {
      list = list.filter((m) => activeCats.includes(m.category));
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((m) => {
        const name = (m.name || "").toLowerCase();
        const cat = (m.category || "").toLowerCase();
        return name.includes(q) || cat.includes(q);
      });
    }

    list = list.filter((m) => {
      const p = Number(m.price) || 0;
      return p >= priceRange.min && p <= priceRange.max;
    });

    if (priceQuickFilter === "under-25") list = list.filter((m) => (m.price || 0) < 25000);
    else if (priceQuickFilter === "25-45") list = list.filter((m) => (m.price || 0) >= 25000 && (m.price || 0) <= 45000);
    else if (priceQuickFilter === "over-45") list = list.filter((m) => (m.price || 0) > 45000);

    if (priorities.fast) {
      list = list.filter(
        (m) =>
          (m.prep_time || 999) <= FAST_PREP_MINUTES ||
          FAST_CATEGORIES.includes(m.category)
      );
    }
    if (priorities.healthy) {
      list = list.filter((m) => m.is_healthy || HEALTHY_CATEGORIES.includes(m.category));
    }
    if (priorities.cool) {
      list = list.filter((m) => m.is_cool || COOL_CATEGORIES.includes(m.category));
    }
    if (priorities.noSpicy) list = list.filter((m) => !m.is_spicy);

    if (calorieFilter === "under-400") list = list.filter((m) => (m.calories || 0) < 400);
    else if (calorieFilter === "400-650") list = list.filter((m) => (m.calories || 0) >= 400 && (m.calories || 0) <= 650);
    else if (calorieFilter === "over-650") list = list.filter((m) => (m.calories || 0) > 650);

    if (sortBy === "discount") {
      list = list.filter((m) => Number(m.original_price) > Number(m.price));
    } else if (sortBy === "price-asc") {
      list = [...list].sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (sortBy === "price-desc") {
      list = [...list].sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (sortBy === "fastest") {
      list = [...list].sort((a, b) => (a.prep_time || 999) - (b.prep_time || 999));
    } else if (sortBy === "popular") {
      list = list
        .filter((m) => Number(m.sold || 0) >= 50)
        .sort((a, b) => (Number(b.sold) || 0) - (Number(a.sold) || 0));
    } else {
      list = [...list];
    }

    return list;
  }, [
    items, selectedCategories, search, priceRange, priceQuickFilter,
    priorities, calorieFilter, sortBy,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => {
    setPage(1);
  }, [search, selectedCategories, priceRange, priceQuickFilter, priorities, calorieFilter, sortBy]);

  const toggleCategory = (id) => {
    if (id === ALL_CATEGORY) {
      setSelectedCategories([ALL_CATEGORY]);
      return;
    }
    setSelectedCategories((prev) => {
      const withoutAll = prev.filter((c) => c !== ALL_CATEGORY);
      if (withoutAll.includes(id)) {
        const next = withoutAll.filter((c) => c !== id);
        return next.length === 0 ? [ALL_CATEGORY] : next;
      }
      return [...withoutAll, id];
    });
  };

  const selectCategoryTab = (id) => {
    setActiveTab(id);
    setSelectedCategories([id]);

    const next = {};
    searchParams.forEach((value, key) => {
      next[key] = value;
    });
    if (id === ALL_CATEGORY) delete next.category;
    else next.category = id;
    setSearchParams(next, { replace: true });
  };

  const togglePriority = (key) => {
    setPriorities((p) => ({ ...p, [key]: !p[key] }));
  };

  const resetAllFilters = () => {
    setSearch("");
    setSelectedCategories([ALL_CATEGORY]);
    setPriceRange({ ...priceBounds });
    setPriceQuickFilter("all");
    setPriorities({});
    setCalorieFilter("all");
    setSortBy("all");
    setSearchParams({});
    setPage(1);
  };

  const hasActiveFilters =
    search.trim() !== "" ||
    selectedCategories.some((category) => category !== ALL_CATEGORY) ||
    priceQuickFilter !== "all" ||
    (items.length > 0 && (priceRange.min > priceBounds.min || priceRange.max < priceBounds.max)) ||
    Object.values(priorities).some(Boolean) ||
    calorieFilter !== "all";
  const setQty = (id, delta) => {
    setQuantities((q) => {
      const cur = q[id] || 1;
      const next = Math.max(1, cur + delta);
      return { ...q, [id]: next };
    });
  };

  const openModal = (item) => {
    setMode("cart");
    setSelected(item);
  };

  const buyNowFromCard = (item, requestedQty = 1) => {
    const id = item?._id || item?.id;
    const available = typeof item?.stock === "number" ? item.stock : 99;
    const quantity = Math.max(1, Number(requestedQty) || 1);

    if (!id || available <= 0) {
      toast(t("Hết hàng"), "error");
      return;
    }

    const key = `${id}-S-`;
    const currentQty = Number(cart?.[key]?.qty) || 0;

    if (currentQty + quantity > available) {
      toast(`${t("Chỉ còn")} ${Math.max(0, available - currentQty)} ${t("phần")}`, "error");
      return;
    }

    const entry = {
      ...item,
      name: item.name,
      price: Number(item.price) || 0,
      qty: currentQty + quantity,
      stock: item.stock ?? available,
      _originalId: id,
      _toppings: [],
      _size: "S",
    };

    setCart((currentCart) => {
      const actualQty = Number(currentCart?.[key]?.qty) || 0;
      return {
        ...currentCart,
        [key]: { ...entry, qty: actualQty + quantity },
      };
    });

    navigate("/customer/checkout");
  };

  const openBuyModal = (item) => {
    setMode("buy");
    setSelected(item);
  };

  // ============================================================
  // RENDER FOOD CARD — dùng layout giống HomeFoodCard
  // ============================================================

  const renderFoodCard = (m) => {
    const id = m._id || m.id;
    const isOutOfStock = m.stock === 0;
    const isHot = (m.sold || 0) >= 50;
    const hasDiscount = m.original_price > m.price;
    const rating = (m.rating || 4.5 + ((m.sold || 0) % 5) * 0.1).toFixed(1);
    const prepTime = m.prep_time || 6;
    const qty = quantities[id] || 1;

    if (viewMode === "list") {
      return (
        <div
          key={id}
          className="menu-food-card menu-food-card--list"
          onClick={() => !isOutOfStock && openModal(m)}
        >
          <div className="menu-food-card__img-wrap-sq">
            <img
              src={m.image || FALLBACK_IMG}
              alt={m.name}
              loading="lazy"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = FALLBACK_IMG;
              }}
            />
            {isHot && (
              <span className="menu-food-card__badge--inline">
                🔥 {t("Best Seller")}
              </span>
            )}
          </div>
          <div className="menu-food-card__info-sq">

            <h4 className="menu-food-card__name-sq">{tData(m, "name")}</h4>
            <p className="menu-food-card__desc-sq">
              {m.description || t("Món ăn ngon tại Canteen VWA")}
            </p>
            <div className="menu-food-card__meta-row">
              <span>⭐ {rating}</span>

              <span>⏱ {prepTime} {t("phút")}</span>
            </div>
            <div className="menu-food-card__price-row-sq">
              <span className="menu-food-card__price-sq">{money(m.price)}</span>
              {hasDiscount && (
                <s className="menu-food-card__price-old-sq">
                  {money(m.original_price)}
                </s>
              )}
            </div>

            <div
            className="menu-qty-stepper"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setQty(id, -1)}
              aria-label={t("Giảm")}
              disabled={qty <= 1}
            >
              −
            </button>
            <span>{qty}</span>
            <button onClick={() => setQty(id, 1)} aria-label={t("Tăng")}>
              +
            </button>
          </div>
          </div>
          <div className="menu-food-card__actions-col">
            <div
              className="menu-qty-stepper"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setQty(id, -1)}
                aria-label={t("Giảm")}
                disabled={qty <= 1}
              >
                −
              </button>
              <span>{qty}</span>
              <button onClick={() => setQty(id, 1)} aria-label={t("Tăng")}>
                +
              </button>
            </div>
            <div className="menu-food-card__button-group">
<button
              className="menu-food-card__add-sq"
              onClick={(e) => {
                e.stopPropagation();
                openModal(m);
              }}
              disabled={isOutOfStock}
            >
              <ShoppingCart size={15} />
              {t("Thêm")}
            </button>
<button
  type="button"
  className="menu-food-card__buy-sq"
  onClick={(e) => {
    e.stopPropagation();
    openBuyModal(m);
  }}
  disabled={isOutOfStock}
>
  <ArrowRight size={14} />
  {t("Mua")}
</button>
</div>
          </div>
        </div>
      );
    }

    // Grid mode — layout giống HomeFoodCard
    return (
      <div
        key={id}
        className="menu-food-card menu-food-card--home-style"
        onClick={() => !isOutOfStock && openModal(m)}
        style={{ cursor: isOutOfStock ? "not-allowed" : "pointer" }}
      >
        <div className="menu-food-card__row">
          <div className="menu-food-card__img-wrap-sq">
            <img
              src={m.image || FALLBACK_IMG}
              alt={m.name}
              loading="lazy"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = FALLBACK_IMG;
              }}
            />
            {isHot && (
              <span className="menu-food-card__badge--inline">
                🔥 {t("Best Seller")}
              </span>
            )}
            {hasDiscount && !isHot && (
              <span className="menu-food-card__badge--inline-right">
                -{Math.round((1 - m.price / m.original_price) * 100)}%
              </span>
            )}
            {isOutOfStock && (
              <span className="menu-food-card__badge--inline menu-food-card__badge--out">
                {t("Hết hàng")}
              </span>
            )}
          </div>

          <div className="menu-food-card__info-sq">

            <h4 className="menu-food-card__name-sq">{tData(m, "name")}</h4>
            <div className="menu-food-card__price-row-sq">
              <span className="menu-food-card__price-sq">
                {money(m.price)}
              </span>
              {hasDiscount && (
                <s className="menu-food-card__price-old-sq">
                  {money(m.original_price)}
                </s>
              )}
            </div>
            <div
              className="menu-qty-stepper"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setQty(id, -1)}
                aria-label={t("Giảm")}
                disabled={qty <= 1}
              >
                −
              </button>
              <span>{qty}</span>
              <button
                type="button"
                onClick={() => setQty(id, 1)}
                aria-label={t("Tăng")}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="menu-food-card__meta-row">
          <span>
            <Star size={11} fill="#F59E0B" color="#F59E0B" /> {rating}
          </span>

          <span>⏱ {prepTime} {t("phút")}</span>

          <div className="menu-food-card__button-group">
<button
            className="menu-food-card__add-sq"
            onClick={(e) => {
              e.stopPropagation();
              openModal(m);
            }}
            disabled={isOutOfStock}
          >
            <ShoppingCart size={15} />
            {t("Thêm")}
          </button>
<button
  type="button"
  className="menu-food-card__buy-sq"
  onClick={(e) => {
    e.stopPropagation();
    openBuyModal(m);
  }}
  disabled={isOutOfStock}
>
  <ArrowRight size={14} />
  {t("Mua")}
</button>
</div>
        </div>

      </div>
    );
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="customer-menu-v3">
      {error && (
        <div className="menu-v3-error">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={() => load(false)}>
            <RefreshCw size={12} /> {t("Thử lại")}
          </button>
        </div>
      )}

      {/* 2-COLUMN LAYOUT */}
      <div className="menu-v3-layout">
        <aside className="menu-v3-sidebar">
          <div className="menu-v3-sidebar__card">
            <div className="menu-v3-search">
              <label className="menu-v3-search__label">
                <svg viewBox="0 0 28 28" width="18" height="18" fill="none" stroke="#333333" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 4.5h22L16.2 13v8.4l-3.2 2V13L3 4.5z" />
                  {hasActiveFilters && (
                    <g>
                      <circle cx="21" cy="21" r="5.5" fill="#333333" stroke="none" />
                      <path d="m18.5 21 1.6 1.6 3.2-3.3" stroke="#ffffff" strokeWidth="1.5" />
                    </g>
                  )}
                </svg> {t("BỘ LỌC TÌM KIẾM")}
              </label>
              <div className="menu-v3-search__wrap">
                <Search size={16} className="menu-v3-search__icon" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("Gà áp chảo, phở bò, mì...")}
                  className="menu-v3-search__input"
                />
                <SlidersHorizontal size={14} className="menu-v3-search__filter-icon" />
              </div>
            </div>

            <div className="menu-v3-group">
              <div className="menu-v3-group__head">
                <h2>{t("Danh mục món")}</h2>
                <span className="menu-v3-group__count">
                  {categoryList.length} {t("nhóm")}
                </span>
              </div>
              <div className="menu-v3-checks">
                {categoryList.map((c) => {
                  const checked = selectedCategories.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className="menu-v3-check"
                      onClick={() => toggleCategory(c.id)}
                    >
                      <div className="menu-v3-check__left">
                        <span
                          className={`menu-v3-check__box ${
                            checked ? "checked" : ""
                          }`}
                        >
                          {checked && <Check size={11} />}
                        </span>
                        <span className="menu-v3-check__label">{c.label}</span>
                      </div>
                      <span className="menu-v3-check__count">{c.count}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="menu-v3-group">
              <div className="menu-v3-group__head">
                <h2>{t("Khoảng giá (VNĐ)")}</h2>
                <span className="menu-v3-group__range">
                  {money(priceRange.min)} - {money(priceRange.max)}
                </span>
              </div>

              <div className="menu-v3-price-slider">
                <div className="menu-v3-price-slider__control">
                  <div className="menu-v3-price-slider__track" aria-hidden="true">
                    <div
                      className="menu-v3-price-slider__fill"
                      style={{
                        left: `${((priceRange.min - priceBounds.min) / priceSpan) * 100}%`,
                        right: `${100 - ((priceRange.max - priceBounds.min) / priceSpan) * 100}%`,
                      }}
                    />
                  </div>
                  <input
                    type="range"
                    aria-label="Giá tối thiểu"
                    className="menu-v3-price-slider__range menu-v3-price-slider__range--min"
                    min={priceBounds.min}
                    max={Math.max(priceBounds.min, priceRange.max - 1000)}
                    step={1000}
                    value={priceRange.min}
                    style={{ zIndex: priceRange.min > priceBounds.max / 2 ? 5 : 3 }}
                    onChange={(e) => {
                      const nextMin = Number(e.target.value);
                      setPriceRange((prev) => ({
                        min: Math.min(nextMin, prev.max - 1000),
                        max: prev.max,
                      }));
                      setPriceQuickFilter("all");
                    }}
                  />
                  <input
                    type="range"
                    aria-label="Giá tối đa"
                    className="menu-v3-price-slider__range menu-v3-price-slider__range--max"
                    min={Math.min(priceBounds.max, priceRange.min + 1000)}
                    max={priceBounds.max}
                    step={1000}
                    value={priceRange.max}
                    style={{ zIndex: priceRange.max < priceBounds.max / 2 ? 5 : 4 }}
                    onChange={(e) => {
                      const nextMax = Number(e.target.value);
                      setPriceRange((prev) => ({
                        min: prev.min,
                        max: Math.max(nextMax, prev.min + 1000),
                      }));
                      setPriceQuickFilter("all");
                    }}
                  />
                </div>
                <div className="menu-v3-price-slider__labels">
                  <span>{money(priceBounds.min)}</span>
                  <span>{money(priceBounds.max)}</span>
                </div>
              </div>
            </div>

            <div className="menu-v3-group">
              <h2>{t("Tiêu chí ưu tiên")}</h2>
              <div className="menu-v3-checks">
                {PRIORITY_FILTERS.map((p) => (
                  <label
                    key={p.key}
                    className="menu-v3-check"
                    onClick={() => togglePriority(p.key)}
                  >
                    <div className="menu-v3-check__left">
                      <span className={`menu-v3-check__box ${priorities[p.key] ? "checked" : ""}`}>
                        {priorities[p.key] && <Check size={11} />}
                      </span>
                      <span className="menu-v3-check__label">
                        {p.icon} {t(p.label)}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <button className="menu-v3-reset" onClick={resetAllFilters}>
              <RotateCcw size={14} />
              {t("Đặt lại tất cả bộ lọc")}
            </button>
          </div>

          <div className="menu-v3-sidebar__badges">
          <div className="menu-v3-badge">
            <Zap size={16} />
            <span>
              {t("Tốc độ ra món TB:")} <b>6.8 {t("phút")}</b>
            </span>
          </div>
          <div className="menu-v3-badge">
            <Shield size={16} />
            <span>
              {t("Đảm bảo VSATTP:")} <b>{t("Chuẩn A+")}</b>
            </span>
          </div>
        </div>
        </aside>

        <main className="menu-v3-main">
          <div className="menu-v3-filter-bar">
            <div className="menu-v3-filter-bar__left">
              <span>{t("Hiển thị")}</span>
              <b>{filtered.length} {t("món ăn")}</b>
              <span>{t("sẵn sàng phục vụ")}</span>
              <Sparkles size={14} color="#2563EB" />
            </div>

            <div className="menu-v3-filter-bar__right">
              <div className="menu-v3-sort">
                <span>{t("Sắp xếp:")}</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {t(o.label)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="menu-v3-view-toggle">
                <button
                  className={viewMode === "grid" ? "active" : ""}
                  onClick={() => setViewMode("grid")}
                  aria-label={t("Lưới")}
                >
                  <Grid3x3 size={16} />
                </button>
                <button
                  className={viewMode === "list" ? "active" : ""}
                  onClick={() => setViewMode("list")}
                  aria-label={t("Danh sách")}
                >
                  <List size={16} />
                </button>
              </div>
            </div>
          </div>

          {loading && (
            <div className="menu-v3-grid">
              {Array.from({ length: 9 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="menu-v3-empty">
              <div className="menu-v3-empty__icon"></div>
              <h3>{t("Không tìm thấy món nào")}</h3>
              <p>{t("Thử điều chỉnh bộ lọc hoặc xóa từ khóa tìm kiếm.")}</p>
              <button onClick={resetAllFilters}>
                {t("Đặt lại bộ lọc")}
              </button>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="menu-v3-results-wrap">
              <div className={viewMode === "grid" ? "menu-v3-grid" : "menu-v3-list"}>
                {paginatedItems.map(renderFoodCard)}
              </div>

              {totalPages > 1 && (
  <div className="menu-v3-pagination-bar">
    <button
      type="button"
      className="menu-v3-page-btn menu-v3-page-btn--prev"
      onClick={() => {
        setPage((p) => Math.max(1, p - 1));
        const main = document.querySelector(".menu-v3-main");
        if (main) main.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      disabled={page === 1}
    >
      <ChevronLeft size={18} />
      <span>{t("Quay lại")}</span>
    </button>

    <div className="menu-v3-page-indicator">
      <span className="menu-v3-page-indicator__label">
        {t("Trang")}
      </span>
      <b className="menu-v3-page-indicator__current">{page}</b>
      <span className="menu-v3-page-indicator__sep">/</span>
      <span className="menu-v3-page-indicator__total">{totalPages}</span>
    </div>

    <button
      type="button"
      className="menu-v3-page-btn menu-v3-page-btn--next"
      onClick={() => {
        setPage((p) => Math.min(totalPages, p + 1));
        const main = document.querySelector(".menu-v3-main");
        if (main) main.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      disabled={page >= totalPages}
    >
      <span>{t("Tiếp tục")}</span>
      <ChevronRight size={18} />
    </button>
  </div>
)}
            </div>
          )}
        </main>
      </div>

      {selected && (
        <FoodDetailModal
          item={selected}
          cart={cart}
          setCart={setCart}
          user={user}
          mode={mode}
          onClose={() => setSelected(null)}
        />
      )}

      <ChatBotWidget cart={cart} setCart={setCart} user={user} />
    </div>
  );
}
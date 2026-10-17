// ============================================================
// CUSTOMERMENU.JSX â€” Thá»±c Ä‘Æ¡n (V3 - Ä‘á»“ng bá»™ card vá»›i trang chá»§)
// ============================================================
// âœ… SOURCE-TEXT I18N
// âœ… Card mÃ³n: áº£nh vuÃ´ng 96px + info + nÃºt ThÃªm (giá»‘ng HomeFoodCard)
// âœ… Layout: grid 2 cá»™t cÃ³ header full-width â€” 2 cá»™t khÃ´ng lá»‡ch
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

const ALL_CATEGORY = "Táº¥t cáº£";
const PAGE_SIZE = 15;

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=70";

const CATEGORY_ICONS = {
  "Bá»¯a sÃ¡ng": "ðŸŒ…", "Bá»¯a trÆ°a": "ðŸš", "Bá»¯a tá»‘i": "ðŸŒ™", "MÃ³n chay": "ðŸ¥—",
  "Äá»“ uá»‘ng": "ðŸ¥¤", "Äá»“ Äƒn nhanh": "ðŸ”", "TrÃ¡ng miá»‡ng": "ðŸ°",
};

const CATEGORY_LABEL_TRANSLATIONS = {
  "Bá»¯a sÃ¡ng": "Breakfast",
  "Bá»¯a trÆ°a": "Lunch",
  "Bá»¯a tá»‘i": "Dinner",
  "Äá»“ Äƒn nhanh": "Fast Food",
  "MÃ³n chay": "Vegetarian",
  "Äá»“ uá»‘ng": "Drink",
  "TrÃ¡ng miá»‡ng": "Dessert",
  "MÃ³n máº·n": "Savory",
};

const FAST_CATEGORIES = ["Äá»“ Äƒn nhanh"];
const HEALTHY_CATEGORIES = ["MÃ³n chay", "Äá»“ chay"];
const COOL_CATEGORIES = ["Äá»“ uá»‘ng", "NÆ°á»›c Ã©p - Sinh tá»‘", "Coffee & Tea"];
const FAST_PREP_MINUTES = 10;

const PRIORITY_FILTERS = [
  { key: "fast", icon: "âš¡", label: "Phá»¥c vá»¥ nhanh" },
  { key: "healthy", icon: "ðŸ¥—", label: "LÃ nh máº¡nh" },
  { key: "cool", icon: "â„ï¸", label: "MÃ¡t láº¡nh" },
  { key: "noSpicy", icon: "ðŸŒ¶ï¸", label: "KhÃ´ng cay" },
];

const CALORIE_RANGES = [
  { value: "all", label: "Táº¥t cáº£" },
  { value: "under-400", label: "< 400 kcal" },
  { value: "400-650", label: "400 - 650 kcal" },
  { value: "over-650", label: "> 650 kcal" },
];

const SORT_OPTIONS = [
  { value: "all", label: "Táº¥t cáº£" },
  { value: "popular", label: "BÃ¡n cháº¡y nháº¥t" },
  { value: "discount", label: "Äang giáº£m giÃ¡" },
  { value: "price-asc", label: "GiÃ¡ tháº¥p â†’ cao" },
  { value: "price-desc", label: "GiÃ¡ cao â†’ tháº¥p" },
  { value: "fastest", label: "Nhanh nháº¥t" },
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
        if (!silent) setError(e.message || t("KhÃ´ng táº£i Ä‘Æ°á»£c thá»±c Ä‘Æ¡n"));
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
        const c = m.category || "KhÃ¡c";
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
      toast(t("Háº¿t hÃ ng"), "error");
      return;
    }

    const key = `${id}-S-`;
    const currentQty = Number(cart?.[key]?.qty) || 0;

    if (currentQty + quantity > available) {
      toast(`${t("Chá»‰ cÃ²n")} ${Math.max(0, available - currentQty)} ${t("pháº§n")}`, "error");
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
  // RENDER FOOD CARD â€” dÃ¹ng layout giá»‘ng HomeFoodCard
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
                ðŸ”¥ {t("Best Seller")}
              </span>
            )}
          </div>
          <div className="menu-food-card__info-sq">

            <h4 className="menu-food-card__name-sq">{tData(m, "name")}</h4>
            <p className="menu-food-card__desc-sq">
              {m.description || t("MÃ³n Äƒn ngon táº¡i Canteen VWA")}
            </p>
            <div className="menu-food-card__meta-row">
              <span>â­ {rating}</span>

              <span>â± {prepTime} {t("phÃºt")}</span>
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
              aria-label={t("Giáº£m")}
              disabled={qty <= 1}
            >
              âˆ’
            </button>
            <span>{qty}</span>
            <button onClick={() => setQty(id, 1)} aria-label={t("TÄƒng")}>
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
                aria-label={t("Giáº£m")}
                disabled={qty <= 1}
              >
                âˆ’
              </button>
              <span>{qty}</span>
              <button onClick={() => setQty(id, 1)} aria-label={t("TÄƒng")}>
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
              {t("ThÃªm")}
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

    // Grid mode â€” layout giá»‘ng HomeFoodCard
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
                ðŸ”¥ {t("Best Seller")}
              </span>
            )}
            {hasDiscount && !isHot && (
              <span className="menu-food-card__badge--inline-right">
                -{Math.round((1 - m.price / m.original_price) * 100)}%
              </span>
            )}
            {isOutOfStock && (
              <span className="menu-food-card__badge--inline menu-food-card__badge--out">
                {t("Háº¿t hÃ ng")}
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
                aria-label={t("Giáº£m")}
                disabled={qty <= 1}
              >
                âˆ’
              </button>
              <span>{qty}</span>
              <button
                type="button"
                onClick={() => setQty(id, 1)}
                aria-label={t("TÄƒng")}
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

          <span>â± {prepTime} {t("phÃºt")}</span>

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
            {t("ThÃªm")}
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
            <RefreshCw size={12} /> {t("Thá»­ láº¡i")}
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
                </svg> {t("Bá»˜ Lá»ŒC TÃŒM KIáº¾M")}
              </label>
              <div className="menu-v3-search__wrap">
                <Search size={16} className="menu-v3-search__icon" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("GÃ  Ã¡p cháº£o, phá»Ÿ bÃ², mÃ¬...")}
                  className="menu-v3-search__input"
                />
                <SlidersHorizontal size={14} className="menu-v3-search__filter-icon" />
              </div>
            </div>

            <div className="menu-v3-group">
              <div className="menu-v3-group__head">
                <h2>{t("Danh má»¥c mÃ³n")}</h2>
                <span className="menu-v3-group__count">
                  {categoryList.length} {t("nhÃ³m")}
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
                <h2>{t("Khoáº£ng giÃ¡ (VNÄ)")}</h2>
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
                    aria-label="GiÃ¡ tá»‘i thiá»ƒu"
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
                    aria-label="GiÃ¡ tá»‘i Ä‘a"
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
              <h2>{t("TiÃªu chÃ­ Æ°u tiÃªn")}</h2>
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
              {t("Äáº·t láº¡i táº¥t cáº£ bá»™ lá»c")}
            </button>
          </div>

          <div className="menu-v3-sidebar__badges">
          <div className="menu-v3-badge">
            <Zap size={16} />
            <span>
              {t("Tá»‘c Ä‘á»™ ra mÃ³n TB:")} <b>6.8 {t("phÃºt")}</b>
            </span>
          </div>
          <div className="menu-v3-badge">
            <Shield size={16} />
            <span>
              {t("Äáº£m báº£o VSATTP:")} <b>{t("Chuáº©n A+")}</b>
            </span>
          </div>
        </div>
        </aside>

        <main className="menu-v3-main">
          <div className="menu-v3-filter-bar">
            <div className="menu-v3-filter-bar__left">
              <span>{t("Hiá»ƒn thá»‹")}</span>
              <b>{filtered.length} {t("mÃ³n Äƒn")}</b>
              <span>{t("sáºµn sÃ ng phá»¥c vá»¥")}</span>
              <Sparkles size={14} color="#2563EB" />
            </div>

            <div className="menu-v3-filter-bar__right">
              <div className="menu-v3-sort">
                <span>{t("Sáº¯p xáº¿p:")}</span>
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
                  aria-label={t("LÆ°á»›i")}
                >
                  <Grid3x3 size={16} />
                </button>
                <button
                  className={viewMode === "list" ? "active" : ""}
                  onClick={() => setViewMode("list")}
                  aria-label={t("Danh sÃ¡ch")}
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
              <div className="menu-v3-empty__icon">ðŸ½ï¸</div>
              <h3>{t("KhÃ´ng tÃ¬m tháº¥y mÃ³n nÃ o")}</h3>
              <p>{t("Thá»­ Ä‘iá»u chá»‰nh bá»™ lá»c hoáº·c xÃ³a tá»« khÃ³a tÃ¬m kiáº¿m.")}</p>
              <button onClick={resetAllFilters}>
                {t("Äáº·t láº¡i bá»™ lá»c")}
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
      <span>{t("Quay láº¡i")}</span>
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
      <span>{t("Tiáº¿p tá»¥c")}</span>
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

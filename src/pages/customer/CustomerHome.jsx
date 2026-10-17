// ============================================================
// CUSTOMERHOME.JSX â€” Trang chá»§ khÃ¡ch hÃ ng (V5 - FINAL + i18n)
// ============================================================
// V5 (2026-10):
//   - ðŸ”§ FIX #29: scheduleRefetch clear timer khi unmount
//                 + guard mountedRef trÆ°á»›c khi setState
//   - Giá»¯ nguyÃªn logic khÃ¡c tá»« V4
// ============================================================

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Clock, Utensils, Gift, Sparkles, Zap, AlertCircle, RefreshCw, Plus,
  Flame, Search, TrendingUp, Wallet, Info, ShoppingBag, ArrowRight,
  ShoppingCart, X, Star,
} from "lucide-react";
import { api } from "../../api";
import { money } from "../../components/UI";
import { SkeletonCard } from "../../components/Skeleton";
import FoodDetailModal from "../../components/FoodDetailModal";
import ChatBotWidget from "../../components/ChatBotWidget";
import { useI18n } from "../../hooks/useI18n";
import { toast } from "../../components/Effects";

const BEST_SELLERS_LIMIT = 6;
const NEW_ITEMS_LIMIT = 6;
const FLASH_PROMOS_LIMIT = 3;
const FLASH_QTY_MAX = 20;
const SIGNATURE_LIMIT = 6;
const SKELETON_COUNT = 6;

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_SUGGEST_LIMIT = 6;
const REFETCH_DEBOUNCE_MS = 800;

const FALLBACK_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
      <rect fill='#f5f7fb' width='100' height='100'/>
      <text x='50' y='58' font-size='40' text-anchor='middle'>ðŸ½ï¸</text>
    </svg>`
  );

const QUICK_SEARCH_CHIPS = [
  { label: "CÆ¡m táº¥m sÆ°á»n",     query: "CÆ¡m táº¥m sÆ°á»n" },
  { label: "BÃºn bÃ² Huáº¿",       query: "BÃºn bÃ² Huáº¿" },
  { label: "TrÃ  Ä‘Ã o cam sáº£",   query: "TrÃ  Ä‘Ã o cam sáº£" },
  { label: "BÃ¡nh mÃ¬ cháº£o",     query: "BÃ¡nh mÃ¬ cháº£o" },
  { label: "Combo 25k âš¡",      query: "Combo", highlight: true },
];

const HOME_CATEGORIES = [
  { id: "all",    label: "Táº¥t cáº£ mÃ³n",            icon: "ðŸ½ï¸", value: "" },
  { id: "com",    label: "CÆ¡m & MÃ³n chÃ­nh",       icon: "ðŸš", value: "CÆ¡m" },
  { id: "bun",    label: "BÃºn - Phá»Ÿ - MÃ¬",        icon: "ðŸœ", value: "BÃºn - Phá»Ÿ - ChÃ¡o" },
  { id: "anvat",  label: "Ä‚n váº·t & Fastfood",     icon: "ðŸ¥", value: "Äá»“ Äƒn nhanh" },
  { id: "douong", label: "Äá»“ uá»‘ng & TrÃ¡ng miá»‡ng", icon: "â˜•", value: "Äá»“ uá»‘ng" },
  { id: "chay",   label: "MÃ³n chay",              icon: "ðŸ¥—", value: "MÃ³n chay" },
];

function getFlashSaleStatus() {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const seconds = now.getSeconds();

  const lunchStart = 11 * 60;
  const lunchEnd = 14 * 60;

  if (minutes >= lunchStart && minutes < lunchEnd) {
    const end = new Date(now);
    end.setHours(14, 0, 0, 0);

    const remainingSeconds = Math.max(
      0,
      Math.floor((end.getTime() - now.getTime()) / 1000)
    );

    return {
      label: "Äang diá»…n ra ca trÆ°a",
      remainingSeconds,
      active: true,
    };
  }

  if (minutes < lunchStart) {
    const start = new Date(now);
    start.setHours(11, 0, 0, 0);

    return {
      label: "Flash Sale ca trÆ°a báº¯t Ä‘áº§u lÃºc 11:00",
      remainingSeconds: Math.max(
        0,
        Math.floor((start.getTime() - now.getTime()) / 1000)
      ),
      active: false,
    };
  }

  return {
    label: "Flash Sale ca trÆ°a Ä‘Ã£ káº¿t thÃºc",
    remainingSeconds: 0,
    active: false,
  };
}

function formatCountdown(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return [hours, minutes, secs]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}
function getItemId(m) {
  return m?._id || m?.id;
}

function normalizeVi(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ä‘/g, "d")
    .trim();
}

function HomeFoodCard({ m, qty = 1, onQtyChange, onAdd, onView, t, tData }) {
  const id = getItemId(m);
  const isOutOfStock = m.stock === 0;
  const isHot = (m.sold || 0) >= 50;
  const hasDiscount = m.discount_percent > 0 && m.original_price > m.price;
  const sold = Math.max(0, Number(m.sold) || 0);
  const remaining = Math.max(0, Number(m.stock ?? 0));
  const total = sold + remaining;
  const percent = Math.min(100, total > 0 ? (sold / total) * 100 : 0);

  return (
    <div
      className="home-flash-card"
      onClick={() => !isOutOfStock && onView(m)}
      style={{ cursor: isOutOfStock ? "not-allowed" : "pointer" }}
    >
      <div className="home-flash-card__row">
        <div className="home-flash-card__img-wrap">
          <img
            src={m.image || FALLBACK_IMG}
            alt={tData(m, "name")}
            loading="lazy"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = FALLBACK_IMG;
            }}
          />
          {hasDiscount && (
            <span className="home-flash-card__discount">
              -{m.discount_percent}%
            </span>
          )}
          {!hasDiscount && isHot && (
            <span className="home-flash-card__discount">
              <Flame size={10} /> HOT
            </span>
          )}
          {isOutOfStock && (
            <span
              className="home-flash-card__discount"
              style={{ background: "#6B7280" }}
            >
              {t("Háº¿t")}
            </span>
          )}
        </div>

        <div className="home-flash-card__info">
          <span className="home-flash-card__cat">
            {m.category || t("MÃ³n Äƒn")}
          </span>
          <h4 className="home-flash-card__name">{tData(m, "name")}</h4>
          <div className="home-flash-card__price">
            <span className="home-flash-card__price-now">
              {money(m.price)}
            </span>
            {hasDiscount && m.original_price > m.price && (
              <span className="home-flash-card__price-old">
                {money(m.original_price)}
              </span>
            )}
          </div>
        </div>
      </div>

      {!isOutOfStock ? (
        <>
          <div className="home-flash-card__progress-wrap">
            <div className="home-flash-card__progress-info">
              <span>
                {t("ÄÃ£ bÃ¡n")} {sold}/{total} {t("suáº¥t")}
              </span>
              <span className="home-flash-card__remain">
                {t("CÃ²n")} {remaining} {t("suáº¥t")}
              </span>
            </div>
            <div className="home-flash-card__progress-bar">
              <div
                className="home-flash-card__progress-fill"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <div className="home-flash-card__actions">
            <div
              className="home-flash-card__qty"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                aria-label={t("Giáº£m sá»‘ lÆ°á»£ng")}
                disabled={qty <= 1}
                onClick={() => onQtyChange(id, Math.max(1, qty - 1))}
              >
                âˆ’
              </button>
              <span>{qty}</span>
              <button
                type="button"
                aria-label={t("TÄƒng sá»‘ lÆ°á»£ng")}
                onClick={() =>
                  onQtyChange(id, Math.min(FLASH_QTY_MAX, qty + 1))
                }
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="home-flash-card__add"
              onClick={(e) => {
                e.stopPropagation();
                onAdd(m);
              }}
            >
              <ShoppingCart size={16} />
              {t("ThÃªm")}
            </button>
          </div>
        </>
      ) : (
        <div className="home-flash-card__progress-wrap">
          <div className="home-flash-card__progress-info">
            <span style={{ color: "#dc2626", fontWeight: 700 }}>
              {t("Táº¡m háº¿t mÃ³n")}
            </span>
            <span className="home-flash-card__remain">
              {t("Vui lÃ²ng chá»n mÃ³n khÃ¡c")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomerHome({ user, cart, setCart }) {
  const navigate = useNavigate();
  const { t, tData } = useI18n();

  const [flashSaleTick, setFlashSaleTick] = useState(0);
  const flashSaleStatus = getFlashSaleStatus();
  const flashSaleCountdown = formatCountdown(flashSaleStatus.remainingSeconds);

useEffect(() => {
  const timer = setInterval(() => {
    setFlashSaleTick((value) => value + 1);
  }, 1000);

  return () => clearInterval(timer);
}, []);

const [items, setItems] = useState([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [newItems, setNewItems] = useState([]);
  const [signatureItems, setSignatureItems] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [allMenu, setAllMenu] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState("cart");
  const [flashQty, setFlashQty] = useState({});

  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [countdown, setCountdown] = useState({ h: 1, m: 24, s: 15 });

  const inFlightRef = useRef(false);
  const searchBoxRef = useRef(null);
  const refetchTimerRef = useRef(null);
  const mountedRef = useRef(true);

  // ðŸ”§ FIX #29: mount tracking + cleanup refetch timer
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (refetchTimerRef.current) {
        clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = null;
      }
    };
  }, []);

  const load = useCallback(
    async (silent = false) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      if (!silent) setRefreshing(true);
      setError("");

      try {
        const [menuRes, promoRes, walletRes] = await Promise.all([
          api.menu.listActive("", "Táº¥t cáº£", "popular").catch(() => []),
          api.promotions.list().catch(() => []),
          api.wallet.me().catch(() => ({ balance: 0 })),
        ]);

        if (!mountedRef.current) return;

        const rawList = Array.isArray(menuRes) ? menuRes : [];
        const list = rawList.filter((m) => m.active);
        setAllMenu(list);

        const bestSellers = [...list]
          .filter((m) => (m.sold || 0) > 0)
          .sort((a, b) => (b.sold || 0) - (a.sold || 0))
          .slice(0, BEST_SELLERS_LIMIT);
        setItems(
          bestSellers.length > 0
            ? bestSellers
            : list.slice(0, BEST_SELLERS_LIMIT)
        );

        const sortedById = [...list].sort(
          (a, b) => (b.id || 0) - (a.id || 0)
        );
        setNewItems(sortedById.slice(0, NEW_ITEMS_LIMIT));

        const sig = list.filter((m) => m.is_signature === true);
        setSignatureItems(sig);

        setPromotions(Array.isArray(promoRes) ? promoRes : []);
        setWalletBalance(Number(walletRes?.balance) || 0);
      } catch (e) {
        if (mountedRef.current && !silent) {
          setError(e.message || t("KhÃ´ng táº£i Ä‘Æ°á»£c dá»¯ liá»‡u"));
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          if (!silent) setRefreshing(false);
        }
        inFlightRef.current = false;
      }
    },
    [t]
  );

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => {
        let { h, m, s } = c;
        if (s > 0) s--;
        else if (m > 0) { m--; s = 59; }
        else if (h > 0) { h--; m = 59; s = 59; }
        return { h, m, s };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [searchQuery]);

  useEffect(() => {
    const handler = (e) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const searchSuggestions = useMemo(() => {
    const q = normalizeVi(debouncedQuery);
    if (!q || q.length < 1) return [];
    return allMenu
      .filter((m) => {
        const name = normalizeVi(m.name || "");
        const cat = normalizeVi(m.category || "");
        return name.includes(q) || cat.includes(q);
      })
      .sort((a, b) => (b.sold || 0) - (a.sold || 0))
      .slice(0, SEARCH_SUGGEST_LIMIT);
  }, [debouncedQuery, allMenu]);

  const showSuggestions =
    searchFocused &&
    debouncedQuery.length >= 1 &&
    searchSuggestions.length > 0;

  const cartStats = useMemo(() => {
    const lines = Object.values(cart || {});
    const totalQty = lines.reduce((s, m) => s + (Number(m.qty) || 0), 0);
    const totalPrice = lines.reduce(
      (s, m) => s + (Number(m.price) || 0) * (Number(m.qty) || 0),
      0
    );
    const preview = lines
      .slice(0, 2)
      .map((m) => m.name)
      .join(" + ");
    return { totalQty, totalPrice, preview };
  }, [cart]);

  // ðŸ”§ FIX #29: clear timer cÅ© trÆ°á»›c khi set má»›i + guard mounted
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) {
      clearTimeout(refetchTimerRef.current);
      refetchTimerRef.current = null;
    }
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      if (mountedRef.current) load(true);
    }, REFETCH_DEBOUNCE_MS);
  }, [load]);

  const handleSearch = useCallback(
    (e) => {
      e?.preventDefault?.();
      const q = searchQuery.trim();
      if (!q) return;
      navigate(`/customer/menu?q=${encodeURIComponent(q)}`);
      setSearchFocused(false);
    },
    [searchQuery, navigate]
  );

  const handleQuickSearch = useCallback(
    (query) => {
      setSearchQuery(query);
      navigate(`/customer/menu?q=${encodeURIComponent(query)}`);
    },
    [navigate]
  );

  const handleSuggestionClick = useCallback((m) => {
    setSearchFocused(false);
    setMode("cart");
    setSelected(m);
  }, []);

  const openModal = useCallback((m) => {
    setMode("cart");
    setSelected(m);
  }, []);

  const addToCart = useCallback(
    (m) => {
      const id = getItemId(m);
      const key = `${id}-S-`;
      const qty = flashQty[id] || 1;
      const maxStock = typeof m.stock === "number" ? m.stock : 99;

      if (qty > maxStock) {
        toast(
          t("Chá»‰ cÃ²n {n} pháº§n trong kho").replace("{n}", maxStock),
          "error"
        );
        return;
      }

      let added = false;

      setCart((c) => {
        const existing = c[key];
        const currentQty = Number(existing?.qty) || 0;
        const newQty = Math.min(maxStock, currentQty + qty);

        if (existing && currentQty >= maxStock) return c;

        added = true;
        return {
          ...c,
          [key]: {
            ...m,
            name: m.name,
            price: m.price,
            qty: newQty,
            stock: m.stock ?? 99,
            _originalId: id,
          },
        };
      });

      if (added) {
        toast(
          t("ÄÃ£ thÃªm {name} vÃ o giá»").replace("{name}", m.name),
          "success"
        );
        scheduleRefetch();
      }

      setFlashQty((q) => {
        const next = { ...q, [id]: 1 };
        const keys = Object.keys(next);
        if (keys.length > 100) {
          const toDelete = keys.slice(0, keys.length - 100);
          toDelete.forEach((k) => delete next[k]);
        }
        return next;
      });
    },
    [flashQty, setCart, t, scheduleRefetch]
  );

  const handleQtyChange = useCallback((id, newQty) => {
    setFlashQty((q) => ({ ...q, [id]: newQty }));
  }, []);

  const handleCategoryClick = useCallback(
    (catId) => {
      const cat = HOME_CATEGORIES.find((c) => c.id === catId);
      if (!cat) return;
      if (cat.id === "all" || !cat.value) {
        navigate("/customer/menu");
      } else {
        navigate(
          `/customer/menu?category=${encodeURIComponent(cat.value)}`
        );
      }
    },
    [navigate]
  );

  return (
    <div className="customer-home-v2">
      {error && (
        <div className="home-error-banner">
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button
            type="button"
            onClick={() => load(false)}
            className="home-error-btn"
          >
            <RefreshCw size={12} /> {t("Thá»­ láº¡i")}
          </button>
        </div>
      )}

      <div className="home-welcome-hero">
        <div className="home-welcome-glow" />
        <div className="home-welcome-content">
          <div className="home-welcome-left">
            
            <h1 className="home-welcome-title">
              {t("Xin chÃ o,")}{" "}
              <span className="home-welcome-name">
                {user?.name || t("báº¡n")}
              </span>{" "}
              {user?.studentId && (
                <span className="home-welcome-id">
                  (MSSV: {user.studentId})
                </span>
              )}{" "}
              ðŸ‘‹
            </h1>
            <p className="home-welcome-desc">
              {t(
                "HÃ´m nay báº¡n muá»‘n thÆ°á»Ÿng thá»©c mÃ³n gÃ¬ táº¡i CÄƒng tin VWA? Äáº·t trÆ°á»›c ngay Ä‘á»ƒ nháº­n mÃ³n Ä‘Ãºng ca nghá»‰!"
              )}
            </p>
          </div>

          <div className="home-wallet-pill">
            <div className="home-wallet-icon">
              <Wallet size={22} />
            </div>
            <div className="home-wallet-info">
              <span className="home-wallet-label">
                {t("Tháº» sinh viÃªn VWA Pay")}
              </span>
              <span className="home-wallet-value">
                {money(walletBalance)}{" "}
                <span className="home-wallet-unit">VNÄ</span>
              </span>
            </div>
            <button
              type="button"
              className="home-wallet-add"
              title={t("Náº¡p thÃªm")}
              onClick={() => navigate("/customer/wallet")}
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        <div
          className="home-search-box"
          ref={searchBoxRef}
          style={{ position: "relative" }}
        >
          <form
            onSubmit={handleSearch}
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              position: "relative",
            }}
          >
            <Search className="home-search-icon" size={22} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              placeholder={t(
                "TÃ¬m mÃ³n ngon, cÆ¡m sinh viÃªn, phá»Ÿ, bÃºn cháº£, nÆ°á»›c Ã©p..."
              )}
              className="home-search-input"
              autoComplete="off"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSearchFocused(false);
                }}
                aria-label={t("XoÃ¡")}
                style={{
                  position: "absolute",
                  right: 130,
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  color: "#94a3b8",
                  padding: 4,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <X size={16} />
              </button>
            )}
            <button type="submit" className="home-search-btn">
              {t("TÃ¬m kiáº¿m")}
            </button>
          </form>

          {showSuggestions && (
            <div className="home-search-suggest" style={{ zIndex: 60 }}>
              <div className="home-search-suggest__head">
                <span>
                  {t("Gá»£i Ã½ cho")} "<b>{debouncedQuery}</b>"
                </span>
                <span className="home-search-suggest__count">
                  {searchSuggestions.length} {t("káº¿t quáº£")}
                </span>
              </div>

              {searchSuggestions.map((m) => {
                const id = getItemId(m);
                return (
                  <button
                    key={id}
                    type="button"
                    className="home-search-suggest__item"
                    onClick={() => handleSuggestionClick(m)}
                  >
                    <img
                      src={m.image || FALLBACK_IMG}
                      alt={m.name}
                      loading="lazy"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = FALLBACK_IMG;
                      }}
                    />
                    <div className="home-search-suggest__info">
                      <span className="home-search-suggest__name">
                        {tData(m, "name")}
                      </span>
                      <span className="home-search-suggest__meta">
                        {m.category} â€¢ {money(m.price)}
                      </span>
                    </div>
                    <ArrowRight
                      size={16}
                      className="home-search-suggest__arrow"
                    />
                  </button>
                );
              })}

              <button
                type="button"
                className="home-search-suggest__all"
                onClick={handleSearch}
              >
                {t("Xem táº¥t cáº£ káº¿t quáº£ cho")} "{debouncedQuery}"
                <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>

        <div className="home-quick-chips">
          <span className="home-quick-label">
            <TrendingUp size={14} />
            {t("Máº¹o gá»£i Ã½:")}
          </span>
          {QUICK_SEARCH_CHIPS.map((c, i) => (
            <button
              key={i}
              type="button"
              className={`home-quick-chip ${
                c.highlight ? "home-quick-chip--highlight" : ""
              }`}
              onClick={() => handleQuickSearch(c.query)}
            >
              {t(c.label)}
            </button>
          ))}
        </div>
      </div>

      {promotions.length > 0 && (
        <div className="home-flash-hero">
          <div className="home-flash-glow" />
          <div className="home-flash-content">
            <div className="home-flash-left">
              <div className="home-flash-badge">
                <Zap size={14} className="home-flash-badge-icon" />
                {t("Flash Sale Ca TrÆ°a Sinh ViÃªn")}
              </div>
              <h2 className="home-flash-title">
                {tData(promotions[0], "name")}
              </h2>
              <p className="home-flash-desc">
                {t(
                  "SÆ°á»n cá»‘t láº¿t táº©m Æ°á»›p máº­t ong nÆ°á»›ng than há»“ng, kÃ¨m cháº£ trá»©ng háº¥p, bÃ¬ tÆ°Æ¡i, canh rau dá»n thanh mÃ¡t. Chá»‰ Ã¡p dá»¥ng cho Ä‘Æ¡n Ä‘áº·t trÆ°á»›c 11:30!"
                )}
              </p>

              <div className="home-flash-bottom">
                <div className="home-flash-timer-wrap">
                  <span className="home-flash-timer-label">
                    {t("Káº¿t thÃºc sau:")}
                  </span>
                  <div className="home-flash-timer">
                    <span className="home-flash-timer-num">
                      {String(countdown.h).padStart(2, "0")}
                    </span>
                    <span>:</span>
                    <span className="home-flash-timer-num">
                      {String(countdown.m).padStart(2, "0")}
                    </span>
                    <span>:</span>
                    <span className="home-flash-timer-num">
                      {String(countdown.s).padStart(2, "0")}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="home-flash-cta"
                  onClick={() => { setMode("buy"); setSelected(promotions[0]); }}
                >
                  <ShoppingCart size={18} />
                  {t("Äáº·t mÃ³n ngay")} â€¢{" "}
                  {money(promotions[0]?.price || 28000)}
                </button>
              </div>
            </div>

            <div className="home-flash-right">
              <div className="home-flash-image-wrap">
                <img
                  src={promotions[0]?.image || FALLBACK_IMG}
                  alt={promotions[0]?.name || "Flash"}
                  className="home-flash-image"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = FALLBACK_IMG;
                  }}
                />
                <span className="home-flash-discount-badge">-{promotions[0]?.discount_percent || 0}% OFF</span>
                <span className="home-flash-stock-badge">
                  {t("\u0043\u00f2\u006e")} {Math.max(0, Number(promotions[0]?.stock ?? 0))} {t("\u0073\u0075\u1ea5\u0074")}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="home-advisory-box">
        <div className="home-advisory-icon">
          <Info size={24} />
        </div>
        <div className="home-advisory-content">
          <h4 className="home-advisory-title">
            {t("LÆ°u Ã½ nháº­n mÃ³n vÃ o giá» cao Ä‘iá»ƒm táº¡i CÄƒng tin VWA")}
          </h4>
          <p className="home-advisory-desc">
            {t("CÄƒng tin má»Ÿ cá»­a tá»«")} <b>06:30 - 18:30</b>.{" "}
            {t("Khung giá» nháº­n Ä‘Ã´ng nháº¥t:")}{" "}
            <b style={{ color: "#dc2626" }}>11:30 - 12:30</b>.{" "}
            {t(
              "Vui lÃ²ng Ä‘áº·t mÃ³n trÆ°á»›c tá»‘i thiá»ƒu 15 phÃºt Ä‘á»ƒ nhÃ  báº¿p chuáº©n bá»‹ sáºµn, khÃ´ng cáº§n xáº¿p hÃ ng Ä‘á»£i láº¥y sá»‘!"
            )}
          </p>
        </div>
        <Link to="/customer/orders" className="home-advisory-btn">
          {t("Kiá»ƒm tra Ä‘Æ¡n cá»§a tÃ´i")}
        </Link>
      </div>

      {promotions.length > 0 && flashSaleStatus.active && (
        <div className="home-flash-section">
          <div className="home-section-head home-flash-section-head">
  <div className="home-section-title-wrap">
    <span className="home-section-icon home-section-icon--error">
      <Flame size={20} />
    </span>

    <h3 className="home-section-title">
      {t("Flash Sale")}
    </h3>

    <div className="home-section-live">
      <span className="home-live-dot" />
      {t(flashSaleStatus.label)}
      <span className="home-flash-countdown">
        {flashSaleStatus.active
          ? `${t("Káº¿t thÃºc sau")} ${flashSaleCountdown}`
          : flashSaleStatus.remainingSeconds > 0
            ? `${t("Báº¯t Ä‘áº§u sau")} ${flashSaleCountdown}`
            : t("ÄÃ£ káº¿t thÃºc")}
      </span>
    </div>
  </div>

  <Link
    to="/customer/menu?promotion=flash-sale"
    className="home-section-link home-flash-view-all"
  >
    {t("Xem táº¥t cáº£")} <ArrowRight size={16} />
  </Link>
</div>
<div className="home-flash-grid">
            {promotions.slice(0, FLASH_PROMOS_LIMIT).map((m) => {
              const id = getItemId(m);
              return (
                <HomeFoodCard
                  key={id}
                  m={m}
                  qty={flashQty[id] || 1}
                  onQtyChange={handleQtyChange}
                  onAdd={addToCart}
                  onView={openModal}
                  t={t}
                  tData={tData}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="home-picks-section" id="signature-section">
        <div className="home-section-head">
          <div className="home-section-title-wrap">
            <span className="home-section-icon">
              <Star size={20} fill="#2563eb" color="#2563eb" />
            </span>
            <div>
              <h3 className="home-section-title">
                {t("MÃ³n ná»•i báº­t sinh viÃªn VWA pháº£i thá»­")}
              </h3>
              <p className="home-section-sub">
                {t("ÄÆ°á»£c bÃ¬nh chá»n vÃ  Ä‘áº·t nhiá»u nháº¥t trong thÃ¡ng qua")}
              </p>
            </div>
          </div>
          <Link to="/customer/menu" className="home-section-link">
            {t("Xem táº¥t cáº£")} <ArrowRight size={16} />
          </Link>
        </div>

        <div className="home-picks-grid home-picks-grid--flash-style">
          {loading && items.length === 0 && (
            <>
              {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                <SkeletonCard key={`sk-${i}`} />
              ))}
            </>
          )}
          {items.map((m) => {
            const id = getItemId(m);
            return (
              <HomeFoodCard
                key={id}
                m={m}
                qty={flashQty[id] || 1}
                onQtyChange={handleQtyChange}
                onAdd={addToCart}
                onView={openModal}
                t={t}
                tData={tData}
              />
            );
          })}
        </div>
      </div>

      {newItems.length > 0 && (
        <div className="home-picks-section">
          <div className="home-section-head">
            <div className="home-section-title-wrap">
              <span className="home-section-icon">
                <Sparkles size={20} color="#2563eb" />
              </span>
              <div>
                <h3 className="home-section-title">
                  {t("MÃ³n má»›i lÃªn ká»‡ hÃ´m nay")}
                </h3>
                <p className="home-section-sub">
                  {t("Nhá»¯ng mÃ³n vá»«a Ä‘Æ°á»£c cáº­p nháº­t vÃ o thá»±c Ä‘Æ¡n")}
                </p>
              </div>
            </div>
            <Link to="/customer/menu" className="home-section-link">
              {t("Xem táº¥t cáº£")} <ArrowRight size={16} />
            </Link>
          </div>

          <div className="home-picks-grid home-picks-grid--flash-style">
            {newItems.map((m) => {
              const id = getItemId(m);
              return (
                <HomeFoodCard
                  key={id}
                  m={m}
                  qty={flashQty[id] || 1}
                  onQtyChange={handleQtyChange}
                  onAdd={addToCart}
                  onView={openModal}
                  t={t}
                  tData={tData}
                />
              );
            })}
          </div>
        </div>
      )}

      {signatureItems.length > 0 && (
        <div className="home-picks-section">
          <div className="home-section-head">
            <div className="home-section-title-wrap">
              <span className="home-section-icon">
                <Gift size={20} color="#2563eb" />
              </span>
              <div>
                <h3 className="home-section-title">
                  {t("MÃ³n Signature cá»§a Canteen")}
                </h3>
                <p className="home-section-sub">
                  {t("Äáº·c sáº£n Ä‘Æ°á»£c Ä‘áº§u báº¿p chá»n lá»c má»—i ngÃ y")}
                </p>
              </div>
            </div>
            <Link to="/customer/menu" className="home-section-link">
              {t("Xem táº¥t cáº£")} <ArrowRight size={16} />
            </Link>
          </div>

          <div className="home-picks-grid home-picks-grid--flash-style">
            {signatureItems.slice(0, SIGNATURE_LIMIT).map((m) => {
              const id = getItemId(m);
              return (
                <HomeFoodCard
                  key={id}
                  m={m}
                  qty={flashQty[id] || 1}
                  onQtyChange={handleQtyChange}
                  onAdd={addToCart}
                  onView={openModal}
                  t={t}
                  tData={tData}
                />
              );
            })}
          </div>
        </div>
      )}

      {cartStats.totalQty > 0 && (
        <div className="home-sticky-cart">
          <div className="home-sticky-cart__inner">
            <div className="home-sticky-cart__left">
              <div className="home-sticky-cart__icon-wrap">
                <ShoppingBag size={24} />
                <span className="home-sticky-cart__badge">
                  {cartStats.totalQty}
                </span>
              </div>
              <div className="home-sticky-cart__info">
                <span className="home-sticky-cart__title">
                  {t("Giá» hÃ ng cá»§a báº¡n")}
                </span>
                <span className="home-sticky-cart__preview">
                  ({cartStats.preview || t("ChÆ°a cÃ³ mÃ³n")})
                </span>
                <div className="home-sticky-cart__total-row">
                  <span className="home-sticky-cart__label">
                    {t("Táº¡m tÃ­nh:")}
                  </span>
                  <b className="home-sticky-cart__total">
                    {money(cartStats.totalPrice)}
                  </b>
                  <span className="home-sticky-cart__tag">
                    {t("ÄÃ£ Ã¡p dá»¥ng trá»£ giÃ¡ SV")}
                  </span>
                </div>
              </div>
            </div>

            <div className="home-sticky-cart__right">
              <div className="home-sticky-cart__time">
                <span>{t("Khung giá» nháº­n Ä‘á» xuáº¥t")}</span>
                <b>11:45 - 12:00</b>
              </div>
              <Link to="/customer/cart" className="home-sticky-cart__cta">
                {t("Thanh toÃ¡n & Chá»n giá»")}
                <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <FoodDetailModal
          item={selected}
          cart={cart}
          setCart={setCart}
          user={user}
          mode={mode}
          initialQty={flashQty[getItemId(selected)] || 1}
          onClose={() => setSelected(null)}
        />
      )}

      <ChatBotWidget cart={cart} setCart={setCart} user={user} />
    </div>
  );
}
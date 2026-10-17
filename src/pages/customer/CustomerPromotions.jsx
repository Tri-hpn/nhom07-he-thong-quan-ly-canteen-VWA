// ============================================================
// CUSTOMERPROMOTIONS.JSX â€” Khuyáº¿n mÃ£i & Äá»•i Ä‘iá»ƒm (V4 - FINAL + i18n)
// ============================================================
// ðŸ”§ FIX:
//   - M16: Tab reward filter tháº­t
//   - F1: Filter fallback dá»±a vÃ o value
//   - F3: affordableOnly Æ°u tiÃªn user chÆ°a cÃ³ Ä‘iá»ƒm
//   - F4: KhÃ´ng refetch khi Ä‘á»•i ngÃ´n ngá»¯
//   - F5: Tab Voucher logic chÃ­nh xÃ¡c hÆ¡n
//   - F7: type="button" Ä‘áº§y Ä‘á»§
//
// ðŸŒ i18n: source-text tiáº¿ng Viá»‡t, tá»± dá»‹ch
// ============================================================

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Copy, Check, Gift, Sparkles, ArrowRight, Ticket, Leaf, TrendingUp,
  History, HelpCircle, Utensils, Recycle, PiggyBank, Star, QrCode,
  ExternalLink, ThumbsUp, Receipt, Lightbulb, Wallet, Plus, Loader2,
  AlertCircle, RefreshCw, X, Award,
} from "lucide-react";
import { api } from "../../api";
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import { QRCodeCanvas } from "qrcode.react";

// ============================================================
// CONSTANTS
// ============================================================

const COPY_FEEDBACK_MS = 1500;
const MIN_REDEEM = 100;
const POINT_TO_VND = 100;
const REDEEM_OPTIONS = [100, 200, 500, 1000];

const EARN_METHODS = [
  {
    key: "eat",
    icon: Utensils,
    color: "#2563EB",
    title: "Ä‚n táº¡i CÄƒng tin",
    badge: "HoÃ n 1%",
    desc: "Má»—i 10.000 Ä‘ thanh toÃ¡n táº¡i quáº§y hoáº·c á»©ng dá»¥ng nháº­n ngay 1 VWA Point tá»± Ä‘á»™ng.",
    cta: "QuÃ©t mÃ£ SV khi nháº­n mÃ³n",
  },
  {
    key: "eco",
    icon: Leaf,
    color: "#1D4ED8",
    title: "Sá»‘ng Xanh Há»c ÄÆ°á»ng",
    badge: "+10 pts/láº§n",
    desc: "Mang theo bÃ¬nh nÆ°á»›c cÃ¡ nhÃ¢n hoáº·c há»™p cÆ¡m riÃªng khi mua mang vá», nhÃ¢n viÃªn quáº§y quÃ©t cá»™ng ngay 10 Points.",
    cta: "Chung tay giáº£m Ä‘á»“ nhá»±a",
  },
  {
    key: "review",
    icon: Star,
    color: "#0051B1",
    title: "ÄÃ¡nh giÃ¡ mÃ³n Äƒn",
    badge: "+5 pts/láº§n",
    desc: "Äá»ƒ láº¡i nháº­n xÃ©t sao & gÃ³p Ã½ kháº©u vá»‹ trong má»¥c Lá»‹ch sá»­ Ä‘Æ¡n hÃ ng Ä‘á»ƒ cáº£i thiá»‡n cháº¥t lÆ°á»£ng phá»¥c vá»¥ bá»¯a Äƒn.",
    cta: "ÄÃ¡nh giÃ¡ Ä‘Æ¡n gáº§n nháº¥t",
  },
];

// ============================================================
// ðŸ”§ F1 + F5: REWARD_TABS vá»›i filter rÃµ rÃ ng
// ============================================================
// Logic phÃ¢n loáº¡i:
//   1. Náº¿u code chá»©a prefix rÃµ rÃ ng (COMBO, GIFT, FOOD, DRINK, ECO, GREEN) â†’ vÃ o tab tÆ°Æ¡ng á»©ng.
//   2. Náº¿u khÃ´ng cÃ³ prefix:
//      - value >= 10000 â†’ tab Voucher (giáº£m tiá»n)
//      - value < 10000 â†’ tab Food (quÃ  nhá»)
//   3. Tab "Voucher" = catch-all cho voucher KHÃ”NG khá»›p tab nÃ o khÃ¡c.
// ============================================================

function getCodeUpper(v) {
  return String(v?.code || "").toUpperCase();
}

function getValue(v) {
  return Number(v?.value) || 0;
}

function isComboCode(code) {
  return code.includes("COMBO");
}
function isEcoCode(code) {
  return code.includes("ECO") || code.includes("GREEN");
}
function isFoodCode(code) {
  return code.includes("FOOD") || code.includes("DRINK") || code.includes("GIFT");
}

const REWARD_TABS = [
  {
    id: "all",
    label: "Táº¥t cáº£ Æ°u Ä‘Ã£i",
    filter: () => true,
  },
  {
    id: "voucher",
    label: "Voucher Giáº£m Tiá»n Trá»±c Tiáº¿p",
    // ðŸ”§ F5: Voucher = KHÃ”NG match cÃ¡c tab khÃ¡c
    filter: (v) => {
      const code = getCodeUpper(v);
      if (isComboCode(code) || isEcoCode(code) || isFoodCode(code)) return false;
      return getValue(v) > 0;
    },
  },
  {
    id: "food",
    label: "Äá»•i MÃ³n Ä‚n & Äá»“ Uá»‘ng Miá»…n PhÃ­",
    filter: (v) => {
      const code = getCodeUpper(v);
      if (isFoodCode(code)) return true;
      // ðŸ”§ F1: Fallback â€” value nhá» thÆ°á»ng lÃ  mÃ³n/quÃ 
      if (isComboCode(code) || isEcoCode(code)) return false;
      const val = getValue(v);
      return val > 0 && val < 10000;
    },
  },
  {
    id: "combo",
    label: "Combo Suáº¥t Ä‚n Trá»£ GiÃ¡ SV",
    filter: (v) => isComboCode(getCodeUpper(v)),
  },
  {
    id: "eco",
    label: "QuÃ  Táº·ng Xanh & BÃ¬nh Giá»¯ Nhiá»‡t",
    filter: (v) => isEcoCode(getCodeUpper(v)),
  },
];

// ============================================================
// HELPERS
// ============================================================

function groupByValue(list) {
  const map = new Map();
  for (const v of list) {
    const key = String(v.value);
    if (!map.has(key)) {
      map.set(key, {
        value: v.value,
        count: 0,
        vouchers: [],
        used: 0,
        available: 0,
      });
    }
    const g = map.get(key);
    g.count++;
    g.vouchers.push(v);
    if (v.used) g.used++;
    else g.available++;
  }
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

function makeGroupKey(g) {
  return `grp-${g.value}-${g.available}-${g.used}-${g.count}`;
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("vi-VN");
  } catch {
    return "";
  }
}

function daysRemaining(iso) {
  if (!iso) return 0;
  try {
    const diff = new Date(iso).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  } catch {
    return 0;
  }
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function CustomerPromotions() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [vouchers, setVouchers] = useState([]);
  const [publicVouchers, setPublicVouchers] = useState([]);
  const [points, setPoints] = useState(0);
  const [pointHistory, setPointHistory] = useState([]);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [orderStatsLoaded, setOrderStatsLoaded] = useState(false);
  const [showPointHistory, setShowPointHistory] = useState(false);
  const [showPointRules, setShowPointRules] = useState(false);
  const [showPickupQrModal, setShowPickupQrModal] = useState(false);
  const [selectedPickupOrderCode, setSelectedPickupOrderCode] = useState("");
const [showEcoModal, setShowEcoModal] = useState(false);
  const [ecoOrderId, setEcoOrderId] = useState("");
  const [ecoMethod, setEcoMethod] = useState("bottle");
  const [ecoSubmitting, setEcoSubmitting] = useState(false);
  const [selectedReviewTarget, setSelectedReviewTarget] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [tab, setTab] = useState("active");
  const [rewardTab, setRewardTab] = useState("all");
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [claimingIds, setClaimingIds] = useState(() => new Set());
  const [openedGroup, setOpenedGroup] = useState(null);

  const [redeemPoints, setRedeemPoints] = useState(MIN_REDEEM);
  const [customRedeemPoints, setCustomRedeemPoints] = useState("250");
  const [redeemLoading, setRedeemLoading] = useState(false);

  const copyTimerRef = useRef(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  // ============================================================
  // Track mount
  // ============================================================
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // ============================================================
  // LOAD
  // ðŸ”§ F4: KhÃ´ng phá»¥ thuá»™c `t` Ä‘á»ƒ trÃ¡nh refetch khi Ä‘á»•i ngÃ´n ngá»¯
  // ============================================================
  const loadAll = useCallback(
    async (silent = false) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      if (!silent) setRefreshing(true);
      setError("");

      try {
        const [myRes, pubRes, pointsRes, ordersRes] = await Promise.all([
          api.vouchers.me().catch(() => []),
          api.vouchers.public().catch(() => []),
          api.points.me().catch(() => ({ points: 0 })),
          api.orders.myOrders().catch(() => null),
        ]);

        if (!mountedRef.current) return;

        setVouchers(Array.isArray(myRes) ? myRes : []);
        setPublicVouchers(Array.isArray(pubRes) ? pubRes : []);
        setPoints(Number(pointsRes?.points) || 0);
        setPointHistory(Array.isArray(pointsRes?.history) ? pointsRes.history : []);
        setCustomerOrders(Array.isArray(ordersRes) ? ordersRes : []);
        setOrderStatsLoaded(Array.isArray(ordersRes));
      } catch (e) {
        if (mountedRef.current && !silent) {
          setError(
            e.message || "KhÃ´ng táº£i Ä‘Æ°á»£c dá»¯ liá»‡u khuyáº¿n mÃ£i"
          );
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          if (!silent) setRefreshing(false);
        }
        inFlightRef.current = false;
      }
    },
    []
  );

  useEffect(() => {
    loadAll(false);
  }, [loadAll]);

  // Lam moi trang thai don trong luc modal QR dang mo.
  useEffect(() => {
    if (!showPickupQrModal) return undefined;

    let cancelled = false;

    const refreshPickupOrders = async () => {
      try {
        const data = await api.orders.myOrders();
        if (!cancelled && Array.isArray(data)) {
          setCustomerOrders(data);
        }
      } catch (_) {
        // Giu du lieu hien tai neu mang tam thoi loi.
      }
    };

    refreshPickupOrders();
    const timer = window.setInterval(refreshPickupOrders, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [showPickupQrModal]);

  // ============================================================
  // DERIVED
  // ============================================================
  const { active, used } = useMemo(() => {
    return {
      active: vouchers.filter((v) => !v.used),
      used: vouchers.filter((v) => v.used),
    };
  }, [vouchers]);
  // Thong ke tu lich su don hang va voucher da su dung
  const promoStats = useMemo(() => {
    const validOrders = customerOrders.filter((order) => {
      const status = String(order.status || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      return !/(huy|cancel|tu choi|reject|refund|hoan tien)/.test(status);
    });

    const voucherSavings = validOrders.reduce((sum, order) => {
      const code = String(order.voucher_code || order.voucherCode || "").trim();
      const discount = Number(order.discount) || 0;
      return code && discount > 0 ? sum + discount : sum;
    }, 0);

    // Chi dem voucher ECO/GREEN da duoc su dung, khong dem voucher chua dung
    const ecoUses = used.filter((voucher) =>
      voucher.used && isEcoCode(getCodeUpper(voucher))
    ).length;

    return {
      mealCount: validOrders.length,
      ecoUses,
      plasticSavedGrams: ecoUses * 20,
      voucherSavings,
    };
  }, [customerOrders, used]);

  const pickupOrders = useMemo(
    () => customerOrders
      .filter((order) =>
        order.code &&
        ["Chá» xÃ¡c nháº­n", "ÄÃ£ xÃ¡c nháº­n", "Äang chuáº©n bá»‹", "Sáºµn sÃ ng nháº­n"].includes(order.status)
      )
      .sort((a, b) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
      ),
    [customerOrders]
  );

  const selectedPickupOrder = useMemo(
    () => pickupOrders.find((order) => order.code === selectedPickupOrderCode) || null,
    [pickupOrders, selectedPickupOrderCode]
  );

  /**
   * ðŸ”§ M16 + F3: Lá»c theo tab reward + tab active/used.
   */
  const list = useMemo(() => {
    const source = tab === "active" ? active : used;

    const tabConfig = REWARD_TABS.find((rt) => rt.id === rewardTab);
    const filterFn = tabConfig?.filter || (() => true);

    let result = source.filter(filterFn);

    // ðŸ”§ F3: affordableOnly â€” náº¿u user chÆ°a cÃ³ Ä‘iá»ƒm, hiá»‡n háº¿t
    if (affordableOnly && points > 0) {
      result = result.filter((v) => {
        const usedPoints = Number(v.points_used) || 0;
        return usedPoints === 0 || usedPoints <= points;
      });
    }

    return result;
  }, [tab, active, used, rewardTab, affordableOnly, points]);

  const grouped = useMemo(() => groupByValue(list), [list]);
  const filteredPublicVouchers = useMemo(() => {
    const config = REWARD_TABS.find((rt) => rt.id === rewardTab);
    const filterFn = config?.filter || (() => true);
    return (Array.isArray(publicVouchers) ? publicVouchers : []).filter(filterFn);
  }, [publicVouchers, rewardTab]);
  const canRedeem = points >= redeemPoints && redeemPoints >= MIN_REDEEM;

  // Tier
  const tier = useMemo(() => {
    if (points >= 1000) {
      return { name: t("Báº¡ch Kim"), short: t("Platinum"), next: 1500 };
    }
    if (points >= 500) {
      return { name: t("VÃ ng"), short: t("Gold"), next: 1000 };
    }
    if (points >= 100) {
      return { name: t("Báº¡c"), short: t("Silver"), next: 500 };
    }
    return { name: t("Äá»“ng"), short: t("Bronze"), next: 100 };
  }, [points, t]);

  const tierProgress = Math.min(100, (points / tier.next) * 100);

  // ============================================================
  // HANDLERS
  // ============================================================
  const scrollToSection = useCallback((id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const doRedeem = async (pointsToRedeem = redeemPoints, flexible = false) => {
    if (redeemLoading) return;

    const amount = Number(pointsToRedeem);
    const minRequired = flexible ? 10 : MIN_REDEEM;

    if (!Number.isSafeInteger(amount) || amount < minRequired) {
      toast(
        t("Cáº§n Ã­t nháº¥t {value} Ä‘iá»ƒm Ä‘á»ƒ Ä‘á»•i").replace(
          "{value}",
          minRequired
        ),
        "error"
      );
      return;
    }

    if (amount > Number(points || 0)) {
      toast(t("KhÃ´ng Ä‘á»§ Ä‘iá»ƒm"), "error");
      return;
    }

    setRedeemLoading(true);
    try {
      const voucher = await api.points.redeem({ points: amount });
      toast(
        `${t("Äá»•i thÃ nh cÃ´ng!")} ${voucher.code} â€” ${money(voucher.value)}`,
        "success"
      );
      setRedeemPoints(MIN_REDEEM);
      await loadAll(true);
      setTab("active");
    } catch (e) {
      toast(e.message || t("KhÃ´ng Ä‘á»•i Ä‘Æ°á»£c voucher"), "error");
    } finally {
      setRedeemLoading(false);
    }
  };
  const copyCode = (v) => {
    try {
      navigator.clipboard.writeText(v.code);
    } catch {
      toast(t("KhÃ´ng sao chÃ©p Ä‘Æ°á»£c"), "error");
      return;
    }

    setCopiedId(v.id);
    toast(t("ÄÃ£ sao chÃ©p mÃ£"), "success");

    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      setCopiedId(null);
      copyTimerRef.current = null;
    }, COPY_FEEDBACK_MS);
  };

  const claimVoucher = async (v) => {
    if (claimingIds.has(v.id)) return;

    setClaimingIds((s) => new Set(s).add(v.id));
    try {
      await api.vouchers.claim(v.id);
      toast(`${t("ÄÃ£ nháº­n voucher!")} â€” ${money(v.value)}!`, "success");
      await loadAll(true);
      setTab("active");
    } catch (e) {
      toast(e.message || t("KhÃ´ng nháº­n Ä‘Æ°á»£c voucher"), "error");
    } finally {
      setClaimingIds((s) => {
        const n = new Set(s);
        n.delete(v.id);
        return n;
      });
    }
  };

  useEffect(() => {
    if (!openedGroup) return;
    const handler = (e) => {
      if (e.key === "Escape") setOpenedGroup(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openedGroup]);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="customer-promo-v2">
      {error && (
        <div className="promo-error">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button type="button" onClick={() => loadAll(false)}>
            <RefreshCw size={12} /> {t("Thá»­ láº¡i")}
          </button>
        </div>
      )}

      {/* HEADER */}
      <section className="promo-header">
        <div className="promo-header__row">

        </div>
      </section>

      {/* POINTS HERO */}
      <section className="promo-hero">
        <button
            type="button"
            className="promo-header__cta"
            onClick={() => scrollToSection("my-vouchers")}
          >
            <Ticket size={18} />
            {t("VÃ­ Voucher Cá»§a TÃ´i")} ({active.length})
          </button>
        <div className="promo-hero__glow-1" />
        <div className="promo-hero__glow-2" />

        <div className="promo-hero__content">
          <div className="promo-hero__left">
            <div className="promo-hero__badges">
              <span className="promo-hero__badge">
                <Award size={14} />
                {t("Háº¡ng")} {tier.name} ({tier.short} Member)
              </span>
              <span className="promo-hero__badge promo-hero__badge--eco">
                <Leaf size={14} />
                {t("VWA Eco Warrior")}
              </span>
            </div>

            <div className="promo-hero__user">
            </div>

            <div className="promo-hero__points">
              <div className="promo-hero__points-number">{points}</div>
              <div className="promo-hero__points-info">
                <span className="promo-hero__points-label">
                  {t("VWA Points kháº£ dá»¥ng")}
                </span>
                <span className="promo-hero__points-value">
                  â‰ˆ {money(points * POINT_TO_VND)} {t("giÃ¡ trá»‹ quy Ä‘á»•i")}
                </span>
              </div>
            </div>

            <div className="promo-hero__tier">
              <div className="promo-hero__tier-row">
                <span>
                  <TrendingUp size={14} />
                  {t("Tiáº¿n Ä‘á»™ thÄƒng Háº¡ng")} {tier.name}
                </span>
                <span>
                  <b>{points}</b> / {tier.next} pts
                </span>
              </div>
              <div className="promo-hero__tier-bar">
                <div
                  className="promo-hero__tier-fill"
                  style={{ width: `${tierProgress}%` }}
                />
              </div>
              <p className="promo-hero__tier-note">
                {t("Äáº¡t Háº¡ng VÃ ng: Nháº­n Ä‘áº·c quyá»n x1.5 Ä‘iá»ƒm tÃ­ch lÅ©y & miá»…n phÃ­ 01 CÃ  phÃª má»«ng sinh nháº­t.")}
              </p>
            </div>

            <div className="promo-hero__actions">
              <button
                type="button"
                className="promo-hero__action promo-hero__action--solid" onClick={() => scrollToSection("points-activity")}>
                <History size={16} />
                {t("Lá»‹ch sá»­ tÃ­ch/Ä‘á»•i Ä‘iá»ƒm")}
              </button>
              <button
                type="button"
                className="promo-hero__action promo-hero__action--ghost"
               onClick={() => setShowPointRules(true)}>
                <HelpCircle size={16} />
                {t("Quy táº¯c tÃ­ch Ä‘iá»ƒm")}
              </button>
              <span className="promo-hero__expiry">
                {t("Háº¡n Ä‘iá»ƒm:")} <b>30/06/2025</b>
              </span>
            </div>
          </div>

          <div className="promo-hero__right">
            <div className="promo-achievement">
              <div className="promo-achievement__icon">
                <Utensils size={22} />
              </div>
              <div className="promo-achievement__body">
                <b>{orderStatsLoaded ? promoStats.mealCount : "â€”"}</b> {t("bá»¯a")}
                <span>{t("Ä‚n uá»‘ng tÃ­ch Ä‘iá»ƒm cÄƒng tin")}</span>
              </div>
            </div>
            <div className="promo-achievement">
              <div className="promo-achievement__icon">
                <Recycle size={22} />
              </div>
              <div className="promo-achievement__body">
                <b>{orderStatsLoaded ? promoStats.ecoUses : "â€”"}</b> {t("láº§n Eco")}
                <span>{t("Giáº£m ~240g rÃ¡c tháº£i nhá»±a").replace("240", String(promoStats.plasticSavedGrams))}</span>
              </div>
            </div>
            <div className="promo-achievement">
              <div className="promo-achievement__icon">
                <PiggyBank size={22} />
              </div>
              <div className="promo-achievement__body">
                <b>{orderStatsLoaded ? money(promoStats.voucherSavings) : "â€”"}</b>
                <span>{t("Tá»•ng giáº£m giÃ¡ tá»« voucher Ä‘Ã£ dÃ¹ng")}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* EARN POINTS */}
      <section className="promo-section">
        <div className="promo-section__head">
          <div>
            <h2 className="promo-section__title">
              {t("CÃ¡ch Nháº­n ThÃªm VWA Green Points")}
            </h2>

          </div>
          <Sparkles size={28} color="#2563EB" />
        </div>

        <div className="promo-earn-grid">
          {EARN_METHODS.map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.key} className="promo-earn-card">
                <div
                  className="promo-earn-card__icon"
                  style={{ background: `${m.color}15`, color: m.color }}
                >
                  <Icon size={24} />
                </div>
                <div className="promo-earn-card__body">
                  <div className="promo-earn-card__head">
                    <b>{t(m.title)}</b>
                    <span
                      className="promo-earn-card__badge"
                      style={{ background: `${m.color}15`, color: m.color }}
                    >
                      {t(m.badge)}
                    </span>
                  </div>
                  <p className="promo-earn-card__desc">{t(m.desc)}</p>
                  <button
                    type="button"
                    className="promo-earn-card__cta"
                    style={{
                      color: m.color,
                      border: 0,
                      background: "transparent",
                      padding: 0,
                      margin: 0,
                      font: "inherit",
                      textAlign: "left",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      cursor: "pointer",
                    }}
                    onClick={async () => {
                      if (m.key === "eat") {
                        const ready = customerOrders.find(
                          (o) => o.status === "Sáºµn sÃ ng nháº­n" && o.code
                        );
                        setSelectedPickupOrderCode(ready?.code || "");
                        setShowPickupQrModal(true);
                        return;
                      }

                      if (m.key === "eco") {
                        const readyOrders = customerOrders.filter(
                          (o) => o.status === "Sáºµn sÃ ng nháº­n"
                        );
                        const first = readyOrders[0];
                        setEcoOrderId(
                          first ? String(first.id || first._id || "") : ""
                        );
                        setEcoMethod("bottle");
                        setShowEcoModal(true);
                        return;
                      }

                      if (m.key === "review") {
                        try {
                          const completedOrders = customerOrders
                            .filter((o) => o.status === "HoÃ n thÃ nh")
                            .sort(
                              (a, b) =>
                                new Date(b.created_at || 0).getTime() -
                                new Date(a.created_at || 0).getTime()
                            );

                          if (completedOrders.length === 0) {
                            toast(
                              t("Báº¡n chÆ°a cÃ³ Ä‘Æ¡n hoÃ n thÃ nh Ä‘á»ƒ Ä‘Ã¡nh giÃ¡."),
                              "error"
                            );
                            return;
                          }

                          const reviews = await api.reviews.me();
                          const reviewed = new Set(
                            (Array.isArray(reviews) ? reviews : []).map(
                              (r) => String(r.menu_item_id)
                            )
                          );

                          let target = null;
                          for (const order of completedOrders) {
                            const item = (order.items || []).find(
                              (it) =>
                                it.menu_item_id &&
                                !reviewed.has(String(it.menu_item_id))
                            );
                            if (item) {
                              target = { order, item };
                              break;
                            }
                          }

                          if (!target) {
                            toast(
                              t("Báº¡n Ä‘Ã£ Ä‘Ã¡nh giÃ¡ cÃ¡c mÃ³n trong Ä‘Æ¡n hoÃ n thÃ nh gáº§n Ä‘Ã¢y."),
                              "error"
                            );
                            return;
                          }

                          setSelectedReviewTarget(target);
                          setReviewRating(5);
                          setReviewComment("");
                        } catch (e) {
                          toast(
                            e.message || t("KhÃ´ng táº£i Ä‘Æ°á»£c danh sÃ¡ch Ä‘Ã¡nh giÃ¡."),
                            "error"
                          );
                        }
                      }
                    }}
                  >
                    {t(m.cta)} <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* REDEEM HUB */}
      <section className="promo-section">
        <div className="promo-section__head">
          <div>
            <h2 className="promo-section__title">
              {t("Kho QuÃ  & Voucher Äá»•i Äiá»ƒm")}
            </h2>

          </div>
          <div className="promo-redeem-controls">

          </div>
        </div>

        {/* ðŸ”§ M16: Tab filter giá» hoáº¡t Ä‘á»™ng tháº­t */}

        {/* Äá»•i Ä‘iá»ƒm */}
                <div className="promo-redeem-area">

          <div className="promo-redeem-lower">
          <div className="promo-redeem-cards">
            {REDEEM_OPTIONS.map((p) => {
              const disabled = points < p;
              const value = p * POINT_TO_VND;

              return (
                <article
                  key={p}
                  className={`promo-redeem-card ${disabled ? "is-locked" : ""}`}
                >
                  <div className="promo-redeem-card__top">
                    <span>ðŸ’° {p} pts</span>
                  </div>

                  <div className="promo-redeem-card__ticket">
                    <span>VOUCHER</span>
                    <b>{Math.round(value / 1000)}K</b>
                  </div>

                  <div className="promo-redeem-card__description">
                    <b>{t("Voucher giáº£m")} {money(value)}</b>
                    <span>{t("Trá»« ngay hÃ³a Ä‘Æ¡n")}</span>
                  </div>

                  <button
                    type="button"
                    className="promo-redeem-card__button"
                    disabled={redeemLoading || disabled}
                    onClick={() => {
                      setRedeemPoints(p);
                      doRedeem(p);
                    }}
                  >
                    {redeemLoading ? (
                      <>
                        <Loader2 size={14} className="promo-spin" />
                        {t("Äang Ä‘á»•i...")}
                      </>
                    ) : disabled ? (
                      <>ðŸ”’ {t("ChÆ°a Ä‘á»§ Ä‘iá»ƒm")}</>
                    ) : (
                      <>
                        <Gift size={14} />
                        {t("Äá»•i ngay")}
                      </>
                    )}
                  </button>
                </article>
              );
            })}
          </div>

          <div className="promo-redeem-custom">
  <div className="promo-redeem-custom__title">
    <Gift size={17} color="#2563EB" />
    <strong>{t("Äá»”I ÄIá»‚M LINH HOáº T THEO Ã MUá»N")}</strong>
  </div>

  <p className="promo-redeem-custom__balance">
    {t("Báº¡n Ä‘ang cÃ³:")}{" "}
    <b>{Number(points || 0).toLocaleString("vi-VN")} {t("Ä‘iá»ƒm")}</b>
    {" "}({t("TÆ°Æ¡ng Ä‘Æ°Æ¡ng:")}{" "}
    <b>{money(Number(points || 0) * POINT_TO_VND)}</b>)
  </p>

  <label className="promo-redeem-custom__label" htmlFor="custom-redeem-points">
    {t("Nháº­p sá»‘ Ä‘iá»ƒm muá»‘n Ä‘á»•i:")}
  </label>

  <input
    id="custom-redeem-points"
    className="promo-redeem-custom__input"
    type="number"
    min="10"
    max={Number(points || 0)}
    step="1"
    inputMode="numeric"
    value={customRedeemPoints}
    onChange={(e) => setCustomRedeemPoints(e.target.value)}
  />

  <div className="promo-redeem-custom__value">
    <span>{t("Sá»‘ tiá»n nháº­n Ä‘Æ°á»£c:")}</span>
    <b>{money(Math.max(0, Number(customRedeemPoints) || 0) * POINT_TO_VND)}</b>
  </div>

  <small className="promo-redeem-custom__hint">
    {t("Tá»‘i thiá»ƒu 10 Ä‘iá»ƒm")} Â· {t("100 Ä‘iá»ƒm = 10.000Ä‘")}
  </small>

  {Number(customRedeemPoints) > Number(points || 0) && (
    <small className="promo-redeem-custom__error">
      {t("KhÃ´ng Ä‘á»§ Ä‘iá»ƒm")}
    </small>
  )}

  <button
    type="button"
    className="promo-redeem-custom__button"
    disabled={
      redeemLoading ||
      !Number.isSafeInteger(Number(customRedeemPoints)) ||
      Number(customRedeemPoints) < 10 ||
      Number(customRedeemPoints) > Number(points || 0)
    }
    onClick={() => doRedeem(Number(customRedeemPoints), true)}
  >
    {redeemLoading ? (
      <>
        <Loader2 size={14} className="promo-spin" />
        {t("Äang Ä‘á»•i...")}
      </>
    ) : (
      t("Äá»”I Sá» ÄIá»‚M ÄÃƒ NHáº¬P")
    )}
  </button>
</div>
        </div>

        </div>
        {/* Public vouchers */}
        {publicVouchers.length > 0 && (
          <div className="promo-public-section">
            <div className="promo-public-section__head">
              <Ticket size={18} />
              <b>
                {t("Æ¯u Ä‘Ã£i toÃ n há»‡ thá»‘ng")} ({filteredPublicVouchers.length})
              </b>
            </div>
            <div className="promo-public-grid">
              {filteredPublicVouchers.map((v) => {
                const isClaiming = claimingIds.has(v.id);
                const anyClaiming = claimingIds.size > 0;
                return (
                  <div key={v.id} className="promo-public-card">
                    <div className="promo-public-card__value">
                      {money(v.value)}
                    </div>
                    <div className="promo-public-card__code">{v.code}</div>
                    <button
                      type="button"
                      className="promo-public-card__btn"
                      disabled={isClaiming || anyClaiming}
                      onClick={() => claimVoucher(v)}
                    >
                      {isClaiming ? (
                        <>
                          <Loader2 size={13} className="promo-spin" />
                          {t("Äang nháº­n...")}
                        </>
                      ) : (
                        <>
                          <Plus size={14} />
                          {t("Nháº­n ngay")}
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* WALLET + ACTIVITY */}
      <section className="promo-section" id="my-vouchers">
        <div className="promo-split">
          {/* Wallet */}
          <div className="promo-split__left">
            <div className="promo-split__head">
              <div>
                <h2 className="promo-section__title">
                  {t("VÃ­ Voucher ÄÃ£ Äá»•i")} ({grouped.length})
                </h2>

              </div>

            </div>

            {loading && (
              <div className="promo-wallet-loading">
                <Loader2 size={24} className="promo-spin" />
                <span>{t("Äang táº£i voucher...")}</span>
              </div>
            )}

            {!loading && grouped.length === 0 && (
              <div className="promo-wallet-empty">
                <Ticket size={40} />
                <b>{t("KhÃ´ng cÃ³ voucher trong má»¥c nÃ y")}</b>
                <p>
                  {rewardTab !== "all"
                    ? t("Thá»­ chá»n tab khÃ¡c hoáº·c báº¥m Táº¥t cáº£ Æ°u Ä‘Ã£i.")
                    : t(
                        "Äá»•i Ä‘iá»ƒm hoáº·c nháº­n voucher tá»« má»¥c Æ¯u Ä‘Ã£i toÃ n há»‡ thá»‘ng."
                      )}
                </p>
              </div>
            )}

            {!loading && grouped.length > 0 && (
              <div className="promo-wallet-list">
                {grouped.slice(0, 4).map((g) => {
                  const isUsed = g.available === 0;
                  const firstVoucher = g.vouchers[0];
                  const days = daysRemaining(firstVoucher?.expires_at);
                  const isCopied = copiedId === firstVoucher?.id;

                  return (
                    <div
                      key={makeGroupKey(g)}
                      className={`promo-wallet-card ${
                        isUsed ? "promo-wallet-card--used" : ""
                      }`}
                    >
                      <div className="promo-wallet-card__top">
                        <div className="promo-wallet-card__icon">
                          <Ticket size={22} />
                        </div>
                        <div className="promo-wallet-card__info">
                          <span className="promo-wallet-card__tag">
                            {t("Voucher")} {money(g.value)}
                          </span>
                          <b className="promo-wallet-card__name">
                            {t("Giáº£m")} {money(g.value)}{" "}
                            {g.available > 1 && `Ã—${g.available}`}
                          </b>
                          <div className="promo-wallet-card__code">
                            {firstVoucher?.code}
                          </div>
                        </div>
                        {!isUsed && days > 0 && (
                          <span className="promo-wallet-card__days">
                            {t("CÃ²n")} {days} {t("ngÃ y")}
                          </span>
                        )}
                      </div>

                      <div className="promo-wallet-card__bottom">
                        <div className="promo-wallet-card__meta">
                          <QrCode size={14} />
                          {t("Ãp dá»¥ng táº¡i quáº§y")}
                        </div>
                        {!isUsed && (
                          <div className="promo-wallet-card__actions">
                            <button
                              type="button"
                              className="promo-wallet-card__icon-btn"
                              onClick={() => copyCode(firstVoucher)}
                              title={t("Sao chÃ©p mÃ£")}
                            >
                              {isCopied ? (
                                <Check size={14} />
                              ) : (
                                <Copy size={14} />
                              )}
                            </button>
                            <button
                              type="button"
                              className="promo-wallet-card__use"
                              onClick={() =>
                                navigate("/customer/checkout")
                              }
                            >
                              <QrCode size={14} />
                              {t("DÃ¹ng ngay")}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {grouped.length > 4 && (
                  <button
                    type="button"
                    className="promo-wallet-see-more"
                    onClick={() => scrollToSection("my-vouchers")}
                  >
                    {t("Xem táº¥t cáº£")} ({grouped.length}){" "}
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            )}

            <div className="promo-wallet-note">
              <HelpCircle size={18} />
              <p>
                {t("Voucher Ä‘á»•i Ä‘iá»ƒm khÃ´ng cÃ³ giÃ¡ trá»‹ quy Ä‘á»•i thÃ nh tiá»n máº·t vÃ  Ã¡p dá»¥ng tá»‘i Ä‘a 01 voucher/Ä‘Æ¡n hÃ ng táº¡i quáº§y.")}
              </p>
            </div>
          </div>

          {/* Activity */}
          {/* ðŸ”§ F2: Data máº«u â€” sáº½ thay báº±ng api.points.me().history khi BE sáºµn sÃ ng */}
          <div id="points-activity" className="promo-split__right" style={{ scrollMarginTop: "24px" }}>
            <div className="promo-split__head">
              <div className="promo-activity-heading"><Wallet size={24} color="#2563EB" /><div><h2 className="promo-section__title">
                  {t("Biáº¿n Äá»™ng Äiá»ƒm ThÆ°á»Ÿng")}
                </h2>
</div></div>

            </div>

            <div className="promo-activity-table">
              <div className="promo-activity-table__head">
                <div>{t("Thá»i gian")}</div>
                <div>{t("Ná»™i dung hoáº¡t Ä‘á»™ng")}</div>
                <div className="right">{t("Äiá»ƒm sá»‘")}</div>
              </div>
              <div className="promo-activity-table__body">
  {Array.isArray(pointHistory) && pointHistory.length > 0 ? (
    pointHistory.slice(0, 5).map((item, index) => {
      const points = Number(item.points) || 0;
      const dateValue = item.date ? new Date(item.date) : null;
      const validDate = dateValue && !Number.isNaN(dateValue.getTime());
      const dateLabel = validDate
        ? dateValue.toLocaleDateString("vi-VN")
        : "â€”";
      const timeLabel = validDate
        ? dateValue.toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit"
          })
        : "";

      return (
        <ActivityRow
          key={`${item.type || "point"}-${item.code || index}-${item.date || index}`}
          date={dateLabel}
          time={timeLabel}
          icon={
            item.type === "review"
              ? <ThumbsUp size={18} />
              : <Lightbulb size={18} />
          }
          iconColor={points < 0 ? "#DC2626" : "#2563EB"}
          title={
            item.title ||
            (item.type === "redeem"
              ? t("Äá»•i Ä‘iá»ƒm láº¥y voucher")
              : item.type === "review"
                ? t("ThÆ°á»Ÿng Ä‘Ã¡nh giÃ¡ mÃ³n Äƒn")
                : item.type === "pickup"
                  ? t("ThÆ°á»Ÿng nháº­n mÃ³n")
                  : t("TÃ­ch Ä‘iá»ƒm Ä‘Æ¡n hÃ ng"))
          }
          sub={item.detail || (item.code ? `#${item.code}` : t("Giao dá»‹ch Ä‘iá»ƒm thÆ°á»Ÿng"))}
          delta={`${points > 0 ? "+" : ""}${points}`}
          deltaType={points < 0 ? "down" : "up"}
          highlight={points < 0}
        />
      );
    })
  ) : (
    <p style={{ padding: "16px", textAlign: "center", color: "#64748b" }}>
      ChÆ°a cÃ³ biáº¿n Ä‘á»™ng Ä‘iá»ƒm thÆ°á»Ÿng.
    </p>
  )}
</div>
            <button
  type="button"
  className="promo-activity-see-all--below"
  onClick={() => {
    setShowPointHistory(true);
    loadAll();
  }}
>
  {t("Xem táº¥t cáº£")} ({pointHistory.length}) <ArrowRight size={14} />
</button>
</div>

<div className="promo-activity-tip">
  <Lightbulb size={20} color="#2563EB" />
  <span>Äiá»ƒm thÆ°á»Ÿng Ä‘Æ°á»£c tá»•ng há»£p tá»« cÃ¡c giao dá»‹ch thá»±c táº¿ Ä‘Ã£ ghi nháº­n.</span>
  <button type="button" onClick={() => loadAll()}>LÃ m má»›i</button>
</div>
          </div>
        </div>
      </section>

      {/* POINT RULES MODAL */}
      {showPointRules && (
        <div
          className="promo-modal-overlay"
          onClick={() => setShowPointRules(false)}
        >
          <div
            className="promo-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t("Quy táº¯c tÃ­ch Ä‘iá»ƒm")}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(620px, calc(100vw - 28px))",
              maxHeight: "85vh",
              overflowY: "auto",
              position: "relative",
              boxSizing: "border-box",
            }}
          >
            <div className="promo-modal__head">
              <div>
                <h3>{t("Quy táº¯c tÃ­ch Ä‘iá»ƒm vÃ  Ä‘á»•i Ä‘iá»ƒm")}</h3>
                <p>{t("TÃ­ch lÅ©y VWA Points vÃ  Ä‘á»•i thÃ nh voucher Æ°u Ä‘Ã£i")}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPointRules(false)}
                aria-label={t("ÄÃ³ng")}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: "8px 20px 22px", display: "grid", gap: 18 }}>
              <section>
                <h4 style={{ margin: "0 0 12px", color: "#1d4ed8" }}>
                  {t("CÃCH TÃCH ÄIá»‚M")}
                </h4>

                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  <Utensils size={22} color="#2563eb" />
                  <div>
                    <strong>{t("Mua hÃ ng táº¡i CÄƒng tin")}</strong>
                    <p style={{ margin: "5px 0", color: "#64748b", lineHeight: 1.6 }}>
                      {t("Má»—i 10.000Ä‘ thá»±c tráº£ Ä‘Æ°á»£c cá»™ng 1 VWA Point. Äiá»ƒm Ä‘Æ°á»£c lÃ m trÃ²n xuá»‘ng sá»‘ nguyÃªn.")}
                    </p>
                    <small style={{ color: "#2563eb" }}>
                      {t("VÃ­ dá»¥: Ä‘Æ¡n 27.500Ä‘ Ä‘Æ°á»£c 2 Ä‘iá»ƒm.")}
                    </small>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  <Leaf size={22} color="#16a34a" />
                  <div>
                    <strong>{t("Sá»‘ng Xanh Há»c ÄÆ°á»ng â€” +10 Ä‘iá»ƒm/láº§n")}</strong>
                    <p style={{ margin: "5px 0", color: "#64748b", lineHeight: 1.6 }}>
                      {t("Mang bÃ¬nh nÆ°á»›c cÃ¡ nhÃ¢n hoáº·c há»™p cÆ¡m riÃªng khi mua mang vá». NhÃ¢n viÃªn quáº§y xÃ¡c nháº­n há»£p lá»‡ Ä‘á»ƒ cá»™ng 10 Points; tá»‘i Ä‘a má»™t láº§n thÆ°á»Ÿng xanh cho má»—i Ä‘Æ¡n.")}
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <Star size={22} color="#d97706" />
                  <div>
                    <strong>{t("ÄÃ¡nh giÃ¡ mÃ³n Äƒn â€” +5 Ä‘iá»ƒm/láº§n")}</strong>
                    <p style={{ margin: "5px 0", color: "#64748b", lineHeight: 1.6 }}>
                      {t("Gá»­i Ä‘Ã¡nh giÃ¡ sao vÃ  gÃ³p Ã½ cho mÃ³n Ä‘Ã£ mua sau khi Ä‘Æ¡n hoÃ n thÃ nh. Má»—i tÃ i khoáº£n chá»‰ Ä‘Æ°á»£c Ä‘Ã¡nh giÃ¡ má»™t láº§n cho má»—i mÃ³n.")}
                    </p>
                  </div>
                </div>
              </section>

              <div style={{ height: 1, background: "#e2e8f0" }} />

              <section>
                <h4 style={{ margin: "0 0 12px", color: "#1d4ed8" }}>
                  {t("QUY Táº®C Äá»”I ÄIá»‚M")}
                </h4>

                <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                  <Wallet size={22} color="#7c3aed" />
                  <div>
                    <strong>{t("Tá»· lá»‡ quy Ä‘á»•i")}</strong>
                    <p style={{ margin: "5px 0", color: "#64748b", lineHeight: 1.6 }}>
                      {t("100 Ä‘iá»ƒm Ä‘á»•i Ä‘Æ°á»£c voucher trá»‹ giÃ¡ 10.000Ä‘. TÆ°Æ¡ng Ä‘Æ°Æ¡ng 1 Ä‘iá»ƒm = 100Ä‘ giÃ¡ trá»‹ voucher.")}
                    </p>
                  </div>
                </div>

                <div style={{
                  border: "1px solid #dbeafe",
                  borderRadius: 12,
                  padding: 12,
                  background: "#eff6ff",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}>
                  {[
                    ["100 Ä‘iá»ƒm", "10.000Ä‘"],
                    ["200 Ä‘iá»ƒm", "20.000Ä‘"],
                    ["500 Ä‘iá»ƒm", "50.000Ä‘"],
                    ["1.000 Ä‘iá»ƒm", "100.000Ä‘"],
                  ].map(([pts, value]) => (
                    <div key={pts}>
                      <strong style={{ color: "#1d4ed8" }}>{pts}</strong>
                      <div style={{ color: "#475569", fontSize: 13 }}>
                        {t("Voucher")} {value}
                      </div>
                    </div>
                  ))}
                </div>

                <ul style={{ paddingLeft: 20, color: "#475569", lineHeight: 1.7 }}>
                  <li>{t("Má»—i láº§n Ä‘á»•i tá»‘i thiá»ƒu 100 Ä‘iá»ƒm; pháº£i cÃ³ Ä‘á»§ Ä‘iá»ƒm trong tÃ i khoáº£n.")}</li>
                  <li>{t("Äiá»ƒm bá»‹ trá»« khi Ä‘á»•i thÃ nh cÃ´ng vÃ  voucher Ä‘Æ°á»£c thÃªm vÃ o VÃ­ Voucher cá»§a tÃ´i.")}</li>
                  <li>{t("Voucher khÃ´ng quy Ä‘á»•i thÃ nh tiá»n máº·t; tá»‘i Ä‘a má»™t voucher cho má»—i Ä‘Æ¡n vÃ  khÃ´ng cá»™ng dá»“n vá»›i voucher khÃ¡c.")}</li>
                  <li>{t("Má»—i tÃ i khoáº£n cÃ³ tá»‘i Ä‘a 50 voucher chÆ°a sá»­ dá»¥ng.")}</li>
                  <li>{t("ÄÆ¡n bá»‹ há»§y hoáº·c hoÃ n tiá»n sáº½ Ä‘Æ°á»£c xá»­ lÃ½ Ä‘iá»ƒm theo tráº¡ng thÃ¡i Ä‘Æ¡n; khÃ´ng giá»¯ Ä‘iá»ƒm thÆ°á»Ÿng cá»§a giao dá»‹ch bá»‹ há»§y.")}</li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}
      {/* POINT HISTORY MODAL */}
      {showPointHistory && (
        <div
          className="promo-modal-overlay"
          onClick={() => setShowPointHistory(false)}
        >
          <div
            className="promo-modal promo-point-history-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="promo-modal__head">
              <div>
                <h3>{t("Lá»‹ch sá»­ tÃ­ch/Ä‘á»•i Ä‘iá»ƒm")}</h3>
                <p>{t("Theo dÃµi cÃ¡c láº§n cá»™ng vÃ  sá»­ dá»¥ng Ä‘iá»ƒm cá»§a báº¡n")}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPointHistory(false)}
                aria-label={t("ÄÃ³ng")}
              >
                <X size={20} />
              </button>
            </div>

            <div className="promo-point-history-list">
              {pointHistory.length === 0 ? (
                <div className="promo-point-history-empty">
                  <History size={32} />
                  <p>{t("ChÆ°a cÃ³ lá»‹ch sá»­ tÃ­ch/Ä‘á»•i Ä‘iá»ƒm")}</p>
                </div>
              ) : (
                pointHistory.map((item, index) => {
                  const isRedeem =
                    item.type === "redeem" || Number(item.points) < 0;
                  const date = item.date
                    ? new Date(item.date).toLocaleDateString("vi-VN")
                    : "-";
                  const time = item.date
                    ? new Date(item.date).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "";

                  return (
                    <div
                      className="promo-point-history-item"
                      key={`${item.code || "history"}-${item.date || index}-${index}`}
                    >
                      <div
                        className={`promo-point-history-icon ${isRedeem ? "down" : "up"}`}
                      >
                        {isRedeem ? <Gift size={18} /> : <Receipt size={18} />}
                      </div>
                      <div className="promo-point-history-info">
                        <b>
                          {isRedeem
                            ? t("Äá»•i voucher")
                            : t("TÃ­ch Ä‘iá»ƒm Ä‘Æ¡n hÃ ng")}
                        </b>
                        <span>
                          {item.code ? `#${item.code}` : t("KhÃ´ng cÃ³ mÃ£")}
                        </span>
                        <small>{date} {time}</small>
                      </div>
                      <strong className={isRedeem ? "down" : "up"}>
                        {Number(item.points) > 0 ? "+" : ""}
                        {Number(item.points) || 0} pts
                      </strong>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* PICKUP QR MODAL â€” Ä‘á»™c láº­p vá»›i lá»‹ch sá»­ Ä‘iá»ƒm */}
      {showPickupQrModal && (
        <div
          className="promo-modal-overlay"
          onClick={() => setShowPickupQrModal(false)}
          role="presentation"
        >
          <div
            className="promo-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t("QR nháº­n mÃ³n theo Ä‘Æ¡n hÃ ng")}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(760px, calc(100vw - 28px))",
              maxHeight: "88vh",
              overflowY: "auto",
              position: "relative",
              padding: 18,
              boxSizing: "border-box",
            }}
          >
            <button
              type="button"
              onClick={() => setShowPickupQrModal(false)}
              aria-label={t("ÄÃ³ng")}
              style={{
                position: "absolute",
                top: 18,
                right: 18,
                zIndex: 5,
                width: 32,
                height: 32,
                padding: 0,
                border: 0,
                background: "transparent",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              <X size={20} />
            </button>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(245px, 1fr))",
                gap: 14,
                paddingTop: 2,
              }}
            >
              <section>
                <h4
                  style={{
                    margin: "4px 44px 14px 0",
                    color: "#172033",
                    minHeight: 32,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {t("ÄÆ¡n hÃ ng cá»§a báº¡n")}
                </h4>

                {pickupOrders.length > 0 ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {pickupOrders.map((order) => {
                      const isSelected =
                        selectedPickupOrderCode === order.code;
                      const isReady = order.status === "Sáºµn sÃ ng nháº­n";

                      return (
                        <button
                          key={order.id || order._id || order.code}
                          type="button"
                          onClick={() =>
                            setSelectedPickupOrderCode(order.code)
                          }
                          aria-pressed={isSelected}
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            border: isSelected
                              ? "2px solid #2563eb"
                              : "1px solid #dbe3ef",
                            borderRadius: 12,
                            padding: 12,
                            background: isSelected ? "#eff6ff" : "#fff",
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) auto",
                            alignItems: "center",
                            gap: "6px 10px",
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                        >
                          <strong
                            style={{
                              color: "#1d4ed8",
                              overflowWrap: "anywhere",
                            }}
                          >
                            #{order.code}
                          </strong>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: isReady ? "#15803d" : "#64748b",
                              textAlign: "right",
                            }}
                          >
                            {t(order.status)}
                          </span>
                          <small
                            style={{
                              gridColumn: "1 / -1",
                              color: isReady ? "#15803d" : "#64748b",
                            }}
                          >
                            {t(
                              isReady
                                ? "Báº¥m Ä‘á»ƒ hiá»ƒn thá»‹ QR nháº­n mÃ³n"
                                : "QR sáº½ hiá»‡n khi Ä‘Æ¡n sáºµn sÃ ng nháº­n"
                            )}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ color: "#64748b", lineHeight: 1.6 }}>
                    {t("Báº¡n chÆ°a cÃ³ Ä‘Æ¡n hÃ ng Ä‘ang xá»­ lÃ½.")}
                  </p>
                )}
              </section>

              <section
                style={{
                  minHeight: 260,
                  border: "1px solid #e2e8f0",
                  borderRadius: 16,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  gap: 10,
                }}
              >
                {selectedPickupOrder?.status === "Sáºµn sÃ ng nháº­n" ? (
                  <>
                    <strong style={{ color: "#1d4ed8", overflowWrap: "anywhere" }}>
                      #{selectedPickupOrder.code}
                    </strong>
                    <div
                      style={{
                        background: "#fff",
                        padding: 10,
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                      }}
                    >
                      <QRCodeCanvas
                        value={`${window.location.origin}/order-qr/${encodeURIComponent(selectedPickupOrder.code)}`}
                        size={190}
                        level="H"
                        includeMargin
                      />
                    </div>
                    <span style={{ color: "#15803d", fontSize: 12, fontWeight: 700 }}>
                      {t("Sáºµn sÃ ng nháº­n")}
                    </span>
                    <strong style={{ color: "#0f172a" }}>
                      {(selectedPickupOrder.items || [])
                        .map((item) => item.name)
                        .filter(Boolean)
                        .slice(0, 3)
                        .join(", ") || t("ÄÆ¡n hÃ ng")}
                    </strong>
                    <span style={{ color: "#64748b" }}>
                      {money(Number(selectedPickupOrder.total) || 0)}
                    </span>
                  </>
                ) : selectedPickupOrder ? (
                  <>
                    <QrCode size={38} color="#2563eb" />
                    <strong style={{ color: "#172033" }}>
                      {t("ÄÆ¡n chÆ°a sáºµn sÃ ng nháº­n")}
                    </strong>
                    <span style={{ color: "#1d4ed8", overflowWrap: "anywhere" }}>
                      #{selectedPickupOrder.code}
                    </span>
                    <span style={{ color: "#64748b", fontSize: 13 }}>
                      {t(selectedPickupOrder.status)}
                    </span>
                    <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.6 }}>
                      {t("QR sáº½ xuáº¥t hiá»‡n táº¡i Ä‘Ã¢y khi nhÃ¢n viÃªn chuyá»ƒn Ä‘Æ¡n sang Sáºµn sÃ ng nháº­n.")}
                    </p>
                  </>
                ) : (
                  <>
                    <QrCode size={38} color="#2563eb" />
                    <strong style={{ color: "#172033" }}>
                      {t("Chá»n Ä‘Æ¡n hÃ ng Ä‘á»ƒ xem QR")}
                    </strong>
                    <p style={{ margin: 0, color: "#64748b", fontSize: 13, lineHeight: 1.6 }}>
                      {t("Báº¥m vÃ o má»™t Ä‘Æ¡n bÃªn trÃ¡i. QR riÃªng cá»§a Ä‘Æ¡n sáº½ xuáº¥t hiá»‡n táº¡i Ä‘Ã¢y khi Ä‘Æ¡n Sáºµn sÃ ng nháº­n.")}
                    </p>
                  </>
                )}
              </section>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowPickupQrModal(false);
                navigate("/customer/orders");
              }}
              className="promo-modal__close"
              style={{ marginTop: 16, width: "100%" }}
            >
              {t("Xem táº¥t cáº£ Ä‘Æ¡n hÃ ng")}
            </button>
          </div>
        </div>
      )}
      {/* ECO REWARD REQUEST MODAL */}
      {showEcoModal && (
        <div
          className="promo-modal-overlay"
          onClick={() => setShowEcoModal(false)}
          role="presentation"
        >
          <div
            className="promo-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t("Chung tay giáº£m Ä‘á»“ nhá»±a")}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(540px, calc(100vw - 28px))",
              maxHeight: "85vh",
              overflowY: "auto",
              boxSizing: "border-box",
            }}
          >
            <div className="promo-modal__head">
              <div>
                <h3>{t("Chung tay giáº£m Ä‘á»“ nhá»±a")}</h3>
                <p>{t("Gá»­i yÃªu cáº§u tham gia chÆ°Æ¡ng trÃ¬nh Sá»‘ng Xanh Há»c ÄÆ°á»ng.")}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowEcoModal(false)}
                aria-label={t("ÄÃ³ng")}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: "8px 20px 20px" }}>
              <div style={{
                background: "#f0fdf4",
                color: "#166534",
                borderRadius: 12,
                padding: 14,
                marginBottom: 14,
                lineHeight: 1.6,
              }}>
                <strong style={{ fontSize: 18 }}>+10 VWA Points</strong>
                <div style={{ fontSize: 13 }}>
                  {t("NhÃ¢n viÃªn sáº½ kiá»ƒm tra vÃ  duyá»‡t trÆ°á»›c khi cá»™ng Ä‘iá»ƒm. Má»—i Ä‘Æ¡n chá»‰ nháº­n thÆ°á»Ÿng Sá»‘ng Xanh má»™t láº§n.")}
                </div>
              </div>

              {customerOrders.some((o) => o.status === "Sáºµn sÃ ng nháº­n") ? (
                <>
                  <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
                    {t("Chá»n Ä‘Æ¡n hÃ ng")}
                  </label>
                  <select
                    value={ecoOrderId}
                    onChange={(e) => setEcoOrderId(e.target.value)}
                    disabled={ecoSubmitting}
                    style={{
                      width: "100%",
                      padding: 12,
                      border: "1px solid #cbd5e1",
                      borderRadius: 10,
                      marginBottom: 14,
                      background: "#fff",
                    }}
                  >
                    {customerOrders
                      .filter((o) => o.status === "Sáºµn sÃ ng nháº­n")
                      .map((o) => (
                        <option
                          key={o.id || o._id || o.code}
                          value={String(o.id || o._id)}
                        >
                          #{o.code} â€” {money(Number(o.total) || 0)}
                        </option>
                      ))}
                  </select>

                  <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
                    {t("Báº¡n mang theo")}
                  </label>
                  <select
                    value={ecoMethod}
                    onChange={(e) => setEcoMethod(e.target.value)}
                    disabled={ecoSubmitting}
                    style={{
                      width: "100%",
                      padding: 12,
                      border: "1px solid #cbd5e1",
                      borderRadius: 10,
                      marginBottom: 18,
                      background: "#fff",
                    }}
                  >
                    <option value="bottle">{t("BÃ¬nh nÆ°á»›c cÃ¡ nhÃ¢n")}</option>
                    <option value="container">{t("Há»™p cÆ¡m cÃ¡ nhÃ¢n")}</option>
                  </select>

                  <button
                    type="button"
                    disabled={ecoSubmitting || !ecoOrderId}
                    onClick={async () => {
                      if (ecoSubmitting || !ecoOrderId) return;
                      setEcoSubmitting(true);
                      try {
                        await api.ecoRewards.create({
                          orderId: ecoOrderId,
                          method: ecoMethod,
                        });
                        toast(
                          t("ÄÃ£ gá»­i yÃªu cáº§u Sá»‘ng Xanh. Chá» nhÃ¢n viÃªn xÃ¡c nháº­n Ä‘á»ƒ nháº­n 10 Ä‘iá»ƒm."),
                          "success"
                        );
                        setShowEcoModal(false);
                        await loadAll(true);
                      } catch (e) {
                        toast(
                          e.message || t("KhÃ´ng gá»­i Ä‘Æ°á»£c yÃªu cáº§u Sá»‘ng Xanh"),
                          "error"
                        );
                      } finally {
                        setEcoSubmitting(false);
                      }
                    }}
                    style={{
                      width: "100%",
                      border: 0,
                      borderRadius: 10,
                      padding: 13,
                      background: ecoSubmitting ? "#94a3b8" : "#15803d",
                      color: "#fff",
                      fontWeight: 800,
                      cursor: ecoSubmitting ? "wait" : "pointer",
                    }}
                  >
                    {ecoSubmitting ? t("Äang gá»­i...") : t("Gá»­i yÃªu cáº§u nháº­n 10 Ä‘iá»ƒm")}
                  </button>
                </>
              ) : (
                <>
                  <p style={{ color: "#64748b", lineHeight: 1.6 }}>
                    {t("Báº¡n chÆ°a cÃ³ Ä‘Æ¡n á»Ÿ tráº¡ng thÃ¡i Sáºµn sÃ ng nháº­n. Khi Ä‘Æ¡n sáºµn sÃ ng, báº¡n cÃ³ thá»ƒ gá»­i yÃªu cáº§u Sá»‘ng Xanh cho Ä‘Æ¡n Ä‘Ã³.")}
                  </p>
                  <button
                    type="button"
                    className="promo-modal__close"
                    onClick={() => {
                      setShowEcoModal(false);
                      navigate("/customer/orders");
                    }}
                    style={{ width: "100%" }}
                  >
                    {t("Xem Ä‘Æ¡n hÃ ng cá»§a tÃ´i")}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* REVIEW SUBMISSION MODAL */}
      {selectedReviewTarget && (
        <div
          className="promo-modal-overlay"
          onClick={() => !reviewSubmitting && setSelectedReviewTarget(null)}
          role="presentation"
        >
          <div
            className="promo-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t("ÄÃ¡nh giÃ¡ mÃ³n Äƒn")}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(540px, calc(100vw - 28px))",
              maxHeight: "85vh",
              overflowY: "auto",
              boxSizing: "border-box",
            }}
          >
            <div className="promo-modal__head">
              <div>
                <h3>{t("ÄÃ¡nh giÃ¡ mÃ³n Äƒn")}</h3>
                <p>
                  {t("ÄÆ¡n")} #{selectedReviewTarget.order.code}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReviewTarget(null)}
                disabled={reviewSubmitting}
                aria-label={t("ÄÃ³ng")}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: "8px 20px 20px" }}>
              <strong style={{ fontSize: 16 }}>
                {selectedReviewTarget.item.name || t("MÃ³n Äƒn")}
              </strong>

              <p style={{ color: "#64748b", lineHeight: 1.6, fontSize: 13 }}>
                {t("ÄÃ¡nh giÃ¡ mÃ³n báº¡n Ä‘Ã£ mua. Má»—i mÃ³n chá»‰ Ä‘Æ°á»£c Ä‘Ã¡nh giÃ¡ má»™t láº§n.")}
              </p>

              <div style={{
                display: "flex",
                justifyContent: "center",
                gap: 8,
                margin: "18px 0",
              }}>
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    disabled={reviewSubmitting}
                    onClick={() => setReviewRating(rating)}
                    aria-label={`${rating} ${t("sao")}`}
                    style={{
                      border: 0,
                      background: "transparent",
                      cursor: "pointer",
                      color: rating <= reviewRating ? "#f59e0b" : "#cbd5e1",
                      padding: 3,
                    }}
                  >
                    <Star
                      size={30}
                      fill={rating <= reviewRating ? "#f59e0b" : "none"}
                    />
                  </button>
                ))}
              </div>

              <div style={{ textAlign: "center", fontWeight: 700, marginBottom: 16 }}>
                {reviewRating}/5 {t("sao")}
              </div>

              <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
                {t("Nháº­n xÃ©t cá»§a báº¡n")}
              </label>
              <textarea
                rows={4}
                maxLength={1000}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                disabled={reviewSubmitting}
                placeholder={t("Chia sáº» cháº¥t lÆ°á»£ng mÃ³n Äƒn, hÆ°Æ¡ng vá»‹ vÃ  tráº£i nghiá»‡m cá»§a báº¡n...")}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: 12,
                  border: "1px solid #cbd5e1",
                  borderRadius: 10,
                  resize: "vertical",
                  marginBottom: 14,
                  font: "inherit",
                }}
              />

              <button
                type="button"
                disabled={reviewSubmitting}
                onClick={async () => {
                  if (reviewSubmitting || !selectedReviewTarget) return;
                  setReviewSubmitting(true);
                  try {
                    const result = await api.reviews.create({
                      menuItemId: selectedReviewTarget.item.menu_item_id,
                      rating: reviewRating,
                      comment: reviewComment.trim(),
                    });

                    toast(
                      `${t("Gá»­i Ä‘Ã¡nh giÃ¡ thÃ nh cÃ´ng")} â€¢ +${Number(result?.pointsEarned) || 5} ${t("Ä‘iá»ƒm")}`,
                      "success"
                    );

                    setSelectedReviewTarget(null);
                    setReviewComment("");
                    await loadAll(true);
                  } catch (e) {
                    toast(
                      e.message || t("KhÃ´ng gá»­i Ä‘Æ°á»£c Ä‘Ã¡nh giÃ¡"),
                      "error"
                    );
                  } finally {
                    setReviewSubmitting(false);
                  }
                }}
                style={{
                  width: "100%",
                  border: 0,
                  borderRadius: 10,
                  padding: 13,
                  background: reviewSubmitting ? "#94a3b8" : "#2563eb",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: reviewSubmitting ? "wait" : "pointer",
                }}
              >
                {reviewSubmitting
                  ? t("Äang gá»­i...")
                  : t("Gá»­i Ä‘Ã¡nh giÃ¡ vÃ  nháº­n 5 Ä‘iá»ƒm")}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL */}
      {openedGroup && (
        <GroupModal
          group={openedGroup}
          copiedId={copiedId}
          onCopy={copyCode}
          onClose={() => setOpenedGroup(null)}
          onUse={() => {
            setOpenedGroup(null);
            navigate("/customer/checkout");
          }}
          t={t}
        />
      )}

      <style>{`
        @keyframes promo-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .promo-spin { animation: promo-spin 1s linear infinite; }

.promo-point-history-modal {
  width: min(620px, calc(100vw - 32px));
  max-height: 80vh;
  overflow: hidden;
}

.promo-point-history-list {
  max-height: 58vh;
  overflow-y: auto;
  padding: 8px 20px 20px;
}

.promo-point-history-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 4px;
  border-bottom: 1px solid #E5E7EB;
}

.promo-point-history-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  flex: 0 0 40px;
}

.promo-point-history-icon.up {
  color: #16A34A;
  background: #DCFCE7;
}

.promo-point-history-icon.down {
  color: #EF4444;
  background: #FEE2E2;
}

.promo-point-history-info {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.promo-point-history-info b {
  font-size: 14px;
  color: #111827;
}

.promo-point-history-info span,
.promo-point-history-info small {
  color: #6B7280;
  font-size: 12px;
}

.promo-point-history-item > strong {
  font-size: 15px;
  white-space: nowrap;
}

.promo-point-history-item > strong.up {
  color: #16A34A;
}

.promo-point-history-item > strong.down {
  color: #EF4444;
}

.promo-point-history-empty {
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #6B7280;
}

.promo-point-history-empty p {
  margin: 0;
}
      `}</style>
    </div>
  );
}

// ============================================================
// SUB: ActivityRow
// ============================================================

function ActivityRow({
  date,
  time,
  icon,
  iconColor = "#2563EB",
  title,
  sub,
  delta,
  deltaType,
  highlight,
}) {
  return (
    <div className={`promo-activity-row ${highlight ? "highlight" : ""}`}>
      <div className="promo-activity-row__date">
        <b>{date}</b>
        <span>{time}</span>
      </div>
      <div className="promo-activity-row__content">
        <div
          className="promo-activity-row__title"
          style={{ color: deltaType === "down" ? "#EF4444" : undefined }}
        >
          <span style={{ color: iconColor }}>{icon}</span>
          {title}
        </div>
        <div className="promo-activity-row__sub">{sub}</div>
      </div>
      <div
        className={`promo-activity-row__delta ${
          deltaType === "down" ? "down" : "up"
        }`}
      >
        {delta} pts
      </div>
    </div>
  );
}

// ============================================================
// SUB: GroupModal
// ============================================================

function GroupModal({ group: g, copiedId, onCopy, onClose, onUse, t }) {
  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("Chá»n voucher")}
      className="promo-modal-overlay"
    >
      <div onClick={(e) => e.stopPropagation()} className="promo-modal">
        <div className="promo-modal__head">
          <h3>
            {t("Chá»n voucher {value}").replace("{value}", money(g.value))}
          </h3>
          <button type="button" onClick={onClose} aria-label={t("ÄÃ³ng")}>
            <X size={20} />
          </button>
        </div>

        <p className="promo-modal__desc">
          {t("Báº¡n cÃ³ {available} voucher kháº£ dá»¥ng cho má»‡nh giÃ¡ nÃ y. Chá»n 1 Ä‘á»ƒ sá»­ dá»¥ng.")
            .replace("{available}", g.available)}
        </p>

        <div className="promo-modal__list">
          {g.vouchers.map((v) => {
            const vUsed = v.used;
            const vCopied = copiedId === v.id;
            return (
              <div
                key={v.id}
                className={`promo-modal__item ${vUsed ? "used" : ""}`}
              >
                <div className="promo-modal__item-info">
                  <b>{v.code}</b>
                  <span>
                    {v.used_at
                      ? `${t("ÄÃ£ dÃ¹ng ngÃ y")} ${fmtDate(v.used_at)}`
                      : v.created_at
                      ? `${t("Nháº­n ngÃ y")} ${fmtDate(v.created_at)}`
                      : ""}
                  </span>
                </div>
                {!vUsed && (
                  <>
                    <button
                      type="button"
                      onClick={() => onCopy(v)}
                      className="promo-modal__copy"
                    >
                      {vCopied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={onUse}
                      className="promo-modal__use"
                    >
                      {t("DÃ¹ng")}
                    </button>
                  </>
                )}
                {vUsed && (
                  <span className="promo-modal__used-tag">
                    {t("ÄÃ£ dÃ¹ng")}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="promo-modal__close"
        >
          {t("ÄÃ³ng")}
        </button>
      </div>
    </div>
  );
}

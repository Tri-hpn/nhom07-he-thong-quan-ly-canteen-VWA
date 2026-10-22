// ============================================================
// CUSTOMERPROMOTIONS.JSX — Khuyến mãi & Đổi điểm (V4 - FINAL + i18n)
// ============================================================
// 🔧 FIX:
//   - M16: Tab reward filter thật
//   - F1: Filter fallback dựa vào value
//   - F3: affordableOnly ưu tiên user chưa có điểm
//   - F4: Không refetch khi đổi ngôn ngữ
//   - F5: Tab Voucher logic chính xác hơn
//   - F7: type="button" đầy đủ
//
//  i18n: source-text tiếng Việt, tự dịch
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
    title: "Hoàn thành đơn hàng",
    badge: "Hoàn 1%",
    desc: "Mỗi 10.000 đ thanh toán tại quầy hoặc ứng dụng nhận ngay 1 VWA Point tự động.",
    cta: "Quét mã SV khi nhận món",
  },
  {
    key: "eco",
    icon: Leaf,
    color: "#1D4ED8",
    title: "Sống Xanh Học Đường",
    badge: "+10 pts/lần",
    desc: "Mang theo bình nước cá nhân hoặc hộp cơm riêng khi mua mang về, nhân viên quầy quét cộng ngay 10 Points.",
    cta: "Chung tay giảm đồ nhựa",
  },
  {
      id: "subsidy",
      icon: "🎓",
      title: "Trợ giá sinh viên",
      desc: "Ưu đãi giảm giá đặc biệt dành riêng cho sinh viên VWA.",
      points: 100,
      active: true,
    },
    {
    key: "review",
    icon: Star,
    color: "#0051B1",
    title: "Đánh giá món Ēn",
    badge: "+5 pts/lần",
    desc: "Để lại nhận xét sao & góp ý khẩu vị trong mục Lịch sử đơn hàng để cải thiện chất lượng phục vụ bữa ăn.",
    cta: "Đánh giá đơn gần nhất",
  },
];

// ============================================================
// 🔧 F1 + F5: REWARD_TABS với filter rõ ràng
// ============================================================
// Logic phân loại:
//   1. Nếu code chứa prefix rõ ràng (COMBO, GIFT, FOOD, DRINK, ECO, GREEN) → vào tab tương ứng.
//   2. Nếu không có prefix:
//      - value >= 10000 → tab Voucher (giảm tiền)
//      - value < 10000 → tab Food (quà nhỏ)
//   3. Tab "Voucher" = catch-all cho voucher KHÔNG khớp tab nào khác.
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
    label: "Tất cả ưu đãi",
    filter: () => true,
  },
  {
    id: "voucher",
    label: "Voucher Giảm Tiền Trực Tiếp",
    // 🔧 F5: Voucher = KHÔNG match các tab khác
    filter: (v) => {
      const code = getCodeUpper(v);
      if (isComboCode(code) || isEcoCode(code) || isFoodCode(code)) return false;
      return getValue(v) > 0;
    },
  },
  {
    id: "food",
    label: "Đổi Món Ăn & Đồ Uống Miễn Phí",
    filter: (v) => {
      const code = getCodeUpper(v);
      if (isFoodCode(code)) return true;
      //  F1: Fallback — value nhỏ thường là món/quà
      if (isComboCode(code) || isEcoCode(code)) return false;
      const val = getValue(v);
      return val > 0 && val < 10000;
    },
  },
  {
    id: "combo",
    label: "Combo Suất Ăn Trợ Giá SV",
    filter: (v) => isComboCode(getCodeUpper(v)),
  },
  {
    id: "eco",
    label: "Quà Tặng Xanh & Bình Giữ Nhiệt",
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
  // 🔧 F4: Không phụ thuộc `t` để tránh refetch khi đổi ngôn ngữ
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
            e.message || "Không tải được dữ liệu khuyến mãi"
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
        ["Chờ xác nhận", "Đã xác nhận", "Đang chuẩn bị", "Sẵn sàng nhận"].includes(order.status)
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
   *  M16 + F3: Lọc theo tab reward + tab active/used.
   */
  const list = useMemo(() => {
    const source = tab === "active" ? active : used;

    const tabConfig = REWARD_TABS.find((rt) => rt.id === rewardTab);
    const filterFn = tabConfig?.filter || (() => true);

    let result = source.filter(filterFn);

    // 🔧 F3: affordableOnly — nếu user chưa có điểm, hiện hết
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
      return { name: t("Bạch Kim"), short: t("Platinum"), next: 1500 };
    }
    if (points >= 500) {
      return { name: t("Vàng"), short: t("Gold"), next: 1000 };
    }
    if (points >= 100) {
      return { name: t("Bạc"), short: t("Silver"), next: 500 };
    }
    return { name: t("Đồng"), short: t("Bronze"), next: 100 };
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
        t("Cần ít nhất {value} điểm để đổi").replace(
          "{value}",
          minRequired
        ),
        "error"
      );
      return;
    }

    if (amount > Number(points || 0)) {
      toast(t("Không đủ điểm"), "error");
      return;
    }

    setRedeemLoading(true);
    try {
      const voucher = await api.points.redeem({ points: amount });
      toast(
        `${t("Đổi thành công!")} ${voucher.code} — ${money(voucher.value)}`,
        "success"
      );
      setRedeemPoints(MIN_REDEEM);
      await loadAll(true);
      setTab("active");
    } catch (e) {
      toast(e.message || t("Không đổi được voucher"), "error");
    } finally {
      setRedeemLoading(false);
    }
  };
  const copyCode = (v) => {
    try {
      navigator.clipboard.writeText(v.code);
    } catch {
      toast(t("Không sao chép được"), "error");
      return;
    }

    setCopiedId(v.id);
    toast(t("Đã sao chép mã"), "success");

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
      toast(`${t("Đã nhận voucher!")} — ${money(v.value)}!`, "success");
      await loadAll(true);
      setTab("active");
    } catch (e) {
      toast(e.message || t("Không nhận được voucher"), "error");
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
            <RefreshCw size={12} /> {t("Thử lại")}
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
            {t("Ví Voucher Của Tôi")} ({active.length})
          </button>
        <div className="promo-hero__glow-1" />
        <div className="promo-hero__glow-2" />

        <div className="promo-hero__content">
          <div className="promo-hero__left">
            <div className="promo-hero__badges">
              <span className="promo-hero__badge">
                <Award size={14} />
                {t("Hạng")} {tier.name} ({tier.short} Member)
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
                  {t("VWA Points khả dụng")}
                </span>
                <span className="promo-hero__points-value">
                  ≈ {money(points * POINT_TO_VND)} {t("giá trị quy đổi")}
                </span>
              </div>
            </div>

            <div className="promo-hero__tier">
              <div className="promo-hero__tier-row">
                <span>
                  <TrendingUp size={14} />
                  {t("Tiến độ thăng Hạng")} {tier.name}
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
                {t("Đạt Hạng Vàng: Nhận đặc quyền x1.5 điểm tích lũy & miễn phí 01 Cà phê mừng sinh nhật.")}
              </p>
            </div>

            <div className="promo-hero__actions">
              <button
                type="button"
                className="promo-hero__action promo-hero__action--solid" onClick={() => scrollToSection("points-activity")}>
                <History size={16} />
                {t("Lịch sử tích/đổi điểm")}
              </button>
              <button
                type="button"
                className="promo-hero__action promo-hero__action--ghost"
               onClick={() => setShowPointRules(true)}>
                <HelpCircle size={16} />
                {t("Quy tắc tích điểm")}
              </button>
              <span className="promo-hero__expiry">
                {t("Hạn điểm:")} <b>30/06/2025</b>
              </span>
            </div>
          </div>

          <div className="promo-hero__right">
            <div className="promo-achievement">
              <div className="promo-achievement__icon">
                <Utensils size={22} />
              </div>
              <div className="promo-achievement__body">
                <b>{orderStatsLoaded ? promoStats.mealCount : "—"}</b> {t("bữa")}
                <span>{t("Ăn uống tích điểm căng tin")}</span>
              </div>
            </div>
            <div className="promo-achievement">
              <div className="promo-achievement__icon">
                <Recycle size={22} />
              </div>
              <div className="promo-achievement__body">
                <b>{orderStatsLoaded ? promoStats.ecoUses : "—"}</b> {t("lần Eco")}
                <span>{t("Giảm ~240g rác thải nhựa").replace("240", String(promoStats.plasticSavedGrams))}</span>
              </div>
            </div>
            <div className="promo-achievement">
              <div className="promo-achievement__icon">
                <PiggyBank size={22} />
              </div>
              <div className="promo-achievement__body">
                <b>{orderStatsLoaded ? money(promoStats.voucherSavings) : "—"}</b>
                <span>{t("Tổng giảm giá từ voucher đã dùng")}</span>
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
              {t("Cách Nhận Thêm VWA Green Points")}
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
                          (o) => o.status === "Sẵn sàng nhận" && o.code
                        );
                        setSelectedPickupOrderCode(ready?.code || "");
                        setShowPickupQrModal(true);
                        return;
                      }

                      if (m.key === "eco") {
                        const readyOrders = customerOrders.filter(
                          (o) => o.status === "Sẵn sàng nhận"
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
                            .filter((o) => o.status === "Hoàn thành")
                            .sort(
                              (a, b) =>
                                new Date(b.created_at || 0).getTime() -
                                new Date(a.created_at || 0).getTime()
                            );

                          if (completedOrders.length === 0) {
                            toast(
                              t("Bạn chưa có đơn hoàn thành để đánh giá."),
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
                              t("Bạn đã đánh giá các món trong đơn hoàn thành gần đây."),
                              "error"
                            );
                            return;
                          }

                          setSelectedReviewTarget(target);
                          setReviewRating(5);
                          setReviewComment("");
                        } catch (e) {
                          toast(
                            e.message || t("Không tải được danh sách công việc"),
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
              {t("Kho Quà & Voucher Đổi Điểm")}
            </h2>

          </div>
          <div className="promo-redeem-controls">

          </div>
        </div>

        {/*  M16: Tab filter giờ hoạt động thật */}

        {/* Đổi điểm */}
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
                    <span>💰 {p} pts</span>
                  </div>

                  <div className="promo-redeem-card__ticket">
                    <span>VOUCHER</span>
                    <b>{Math.round(value / 1000)}K</b>
                  </div>

                  <div className="promo-redeem-card__description">
                    <b>{t("Voucher giảm")} {money(value)}</b>
                    <span>{t("Trừ ngay hóa đơn")}</span>
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
                        {t("Đang đổi...")}
                      </>
                    ) : disabled ? (
                      <>🔒 {t("Chưa đủ điểm")}</>
                    ) : (
                      <>
                        <Gift size={14} />
                        {t("Đổi ngay")}
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
    <strong>{t("ĐỔI ĐIỂM LINH HOẠT THEO Ý MUỐN")}</strong>
  </div>

  <p className="promo-redeem-custom__balance">
    {t("Bạn đang có:")}{" "}
    <b>{Number(points || 0).toLocaleString("vi-VN")} {t("điểm")}</b>
    {" "}({t("Tương đương")}{" "}
    <b>{money(Number(points || 0) * POINT_TO_VND)}</b>)
  </p>

  <label className="promo-redeem-custom__label" htmlFor="custom-redeem-points">
    {t("Nhập số điểm muốn đổi:")}
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
    <span>{t("Số tiền nhận được:")}</span>
    <b>{money(Math.max(0, Number(customRedeemPoints) || 0) * POINT_TO_VND)}</b>
  </div>

  <small className="promo-redeem-custom__hint">
    {t("Tối thiểu 10 điểm")} · {t("100 điểm = 10.000đ")}
  </small>

  {Number(customRedeemPoints) > Number(points || 0) && (
    <small className="promo-redeem-custom__error">
      {t("Không đủ điểm")}
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
        {t("Đang đổi...")}
      </>
    ) : (
      t("ĐỔI SỐ ĐIỂM ĐÃ NHẬP")
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
                {t("Ưu đãi toàn hệ thống")} ({filteredPublicVouchers.length})
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
                          {t("Đang nhận...")}
                        </>
                      ) : (
                        <>
                          <Plus size={14} />
                          {t("Nhận ngay")}
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
                  {t("Ví Voucher Đã Đổi")} ({grouped.length})
                </h2>

              </div>

            </div>

            {loading && (
              <div className="promo-wallet-loading">
                <Loader2 size={24} className="promo-spin" />
                <span>{t("Đang tải voucher...")}</span>
              </div>
            )}

            {!loading && grouped.length === 0 && (
              <div className="promo-wallet-empty">
                <Ticket size={40} />
                <b>{t("Không có voucher trong mục này")}</b>
                <p>
                  {rewardTab !== "all"
                    ? t("Thử chọn tab khác hoặc bấm Tất cả ưu đãi.")
                    : t("Đổi điểm hoặc nhận voucher từ mục Ưu đãi toàn hệ thống."
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
                            {t("Giảm")} {money(g.value)}{" "}
                            {g.available > 1 && `×${g.available}`}
                          </b>
                          <div className="promo-wallet-card__code">
                            {firstVoucher?.code}
                          </div>
                        </div>
                        {!isUsed && days > 0 && (
                          <span className="promo-wallet-card__days">
                            {t("Còn")} {days} {t("ngày")}
                          </span>
                        )}
                      </div>

                      <div className="promo-wallet-card__bottom">
                        <div className="promo-wallet-card__meta">
                          <QrCode size={14} />
                          {t("Áp dụng tại quầy")}
                        </div>
                        {!isUsed && (
                          <div className="promo-wallet-card__actions">
                            <button
                              type="button"
                              className="promo-wallet-card__icon-btn"
                              onClick={() => copyCode(firstVoucher)}
                              title={t("Sao chép mã")}
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
                              {t("Dùng ngay")}
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
                    {t("Xem tất cả")} ({grouped.length}){" "}
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            )}

            <div className="promo-wallet-note">
              <HelpCircle size={18} />
              <p>
                {t("Voucher đổi điểm không có giá trị quy đổi thành tiền mặt và áp dụng tối đa 01 voucher/đơn hàng tại quầy.")}
              </p>
            </div>
          </div>

          {/* Activity */}
          {/* 🔧 F2: Data mẫu — sẽ thay bằng api.points.me().history khi BE sẵn sàng */}
          <div id="points-activity" className="promo-split__right" style={{ scrollMarginTop: "24px" }}>
            <div className="promo-split__head">
              <div className="promo-activity-heading"><Wallet size={24} color="#2563EB" /><div><h2 className="promo-section__title">
                  {t("Biến Động Điểm Thưởng")}
                </h2>
</div></div>

            </div>

            <div className="promo-activity-table">
              <div className="promo-activity-table__head">
                <div>{t("Thời gian")}</div>
                <div>{t("Nội dung hoạt động")}</div>
                <div className="right">{t("Điểm số")}</div>
              </div>
              <div className="promo-activity-table__body">
  {Array.isArray(pointHistory) && pointHistory.length > 0 ? (
    pointHistory.slice(0, 5).map((item, index) => {
      const points = Number(item.points) || 0;
      const dateValue = item.date ? new Date(item.date) : null;
      const validDate = dateValue && !Number.isNaN(dateValue.getTime());
      const dateLabel = validDate
        ? dateValue.toLocaleDateString("vi-VN")
        : "—";
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
              ? t("Đổi điểm lấy voucher")
              : item.type === "review"
                ? t("Thưởng đánh giá món ăn")
                : item.type === "pickup"
                  ? t("Thưởng nhận món")
                  : t("Tích điểm đơn hàng"))
          }
          sub={item.detail || (item.code ? `#${item.code}` : t("Giao dịch điểm thưởng"))}
          delta={`${points > 0 ? "+" : ""}${points}`}
          deltaType={points < 0 ? "down" : "up"}
          highlight={points < 0}
        />
      );
    })
  ) : (
    <p style={{ padding: "16px", textAlign: "center", color: "#64748b" }}>
      Chưa có biến động điểm thưởng.
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
  {t("Xem tất cả")} ({pointHistory.length}) <ArrowRight size={14} />
</button>
</div>

<div className="promo-activity-tip">
  <Lightbulb size={20} color="#2563EB" />
  <span>Điểm thưởng được tổng hợp từ các giao dịch thực tế đã ghi nhận.</span>
  <button type="button" onClick={() => loadAll()}>Làm mới</button>
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
            aria-label={t("Quy tắc tích điểm")}
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
                <h3>{t("Quy tắc tích điểm và đổi điểm")}</h3>
                <p>{t("Tích lũy VWA Points và đổi thành voucher ưu đãi")}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPointRules(false)}
                aria-label={t("Đóng")}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: "8px 20px 22px", display: "grid", gap: 18 }}>
              <section>
                <h4 style={{ margin: "0 0 12px", color: "#1d4ed8" }}>
                  {t("CÁCH TÍCH ĐIỂM")}
                </h4>

                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  <Utensils size={22} color="#2563eb" />
                  <div>
                    <strong>{t("Mua hàng tại Căng tin")}</strong>
                    <p style={{ margin: "5px 0", color: "#64748b", lineHeight: 1.6 }}>
                      {t("Mỗi 10.000đ thực trả được cộng 1 VWA Point. Điểm được làm tròn xuống số nguyên.")}
                    </p>
                    <small style={{ color: "#2563eb" }}>
                      {t("Ví dụ: đơn 27.500đ được 2 điểm.")}
                    </small>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                  <Leaf size={22} color="#16a34a" />
                  <div>
                    <strong>{t("Sống Xanh Học Đường — +10 điểm/lần")}</strong>
                    <p style={{ margin: "5px 0", color: "#64748b", lineHeight: 1.6 }}>
                      {t("Mang bình nước cá nhân hoặc hộp cơm riêng khi mua mang về. Nhân viên quầy xác nhận hợp lệ để cộng 10 Points; tối đa một lần thưởng xanh cho mỗi đơn.")}
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <Star size={22} color="#d97706" />
                  <div>
                    <strong>{t("Đánh giá món ăn — +5 điểm/lần")}</strong>
                    <p style={{ margin: "5px 0", color: "#64748b", lineHeight: 1.6 }}>
                      {t("Gửi đánh giá sao và góp ý cho món đã mua sau khi đơn hoàn thành. Mỗi tài khoản chỉ được đánh giá một lần cho mỗi món.")}
                    </p>
                  </div>
                </div>
              </section>

              <div style={{ height: 1, background: "#e2e8f0" }} />

              <section>
                <h4 style={{ margin: "0 0 12px", color: "#1d4ed8" }}>
                  {t("QUY TẮC ĐỔI ĐIỂM")}
                </h4>

                <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                  <Wallet size={22} color="#7c3aed" />
                  <div>
                    <strong>{t("Tỷ lệ quy đổi")}</strong>
                    <p style={{ margin: "5px 0", color: "#64748b", lineHeight: 1.6 }}>
                      {t("100 điểm đổi được voucher trị giá 10.000đ. Tương đương 1 điểm = 100đ giá trị voucher.")}
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
                    ["100 điểm", "10.000đ"],
                    ["200 điểm", "20.000đ"],
                    ["500 điểm", "50.000đ"],
                    ["1.000 điểm", "100.000đ"],
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
                  <li>{t("Mỗi lần đổi tối thiểu 100 điểm; phải có đủ điểm trong tài khoản.")}</li>
                  <li>{t("Điểm bị trừ khi đổi thành công và voucher được thêm vào Ví Voucher của tôi.")}</li>
                  <li>{t("Voucher không quy đổi thành tiền mặt; tối đa một voucher cho mỗi đơn và không cộng dồn với voucher khác.")}</li>
                  <li>{t("Mỗi tài khoản có tối đa 50 voucher chưa sử dụng.")}</li>
                  <li>{t("Đơn bị hủy hoặc hoàn tiền sẽ được xử lý điểm theo trạng thái đơn; không giữ điểm thưởng của giao dịch bị hủy.")}</li>
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
                <h3>{t("Lịch sử tích/đổi điểm")}</h3>
                <p>{t("Theo dõi các lần cộng và sử dụng điểm của bạn")}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPointHistory(false)}
                aria-label={t("Đóng")}
              >
                <X size={20} />
              </button>
            </div>

            <div className="promo-point-history-list">
              {pointHistory.length === 0 ? (
                <div className="promo-point-history-empty">
                  <History size={32} />
                  <p>{t("Chưa có lịch sử tích/đổi điểm")}</p>
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
                            ? t("Đổi voucher")
                            : t("Tích điểm đơn hàng")}
                        </b>
                        <span>
                          {item.code ? `#${item.code}` : t("Không có mã")}
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

      {/* PICKUP QR MODAL — độc lập với lịch sử điểm */}
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
            aria-label={t("QR nhận món theo đơn hàng")}
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
              aria-label={t("Đóng")}
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
                  {t("Giỏ hàng của bạn")}
                </h4>

                {pickupOrders.length > 0 ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {pickupOrders.map((order) => {
                      const isSelected =
                        selectedPickupOrderCode === order.code;
                      const isReady = order.status === "Sẵn sàng nhận";

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
                                ? "Bấm để hiển thị QR nhận món"
                                : "QR sẽ hiện khi đơn sẵn sàng nhận"
                            )}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ color: "#64748b", lineHeight: 1.6 }}>
                    {t("Bạn chưa có đơn hàng đang xử lý.")}
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
                {selectedPickupOrder?.status === "Sẵn sàng nhận" ? (
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
                      {t("Sẵn sàng nhận")}
                    </span>
                    <strong style={{ color: "#0f172a" }}>
                      {(selectedPickupOrder.items || [])
                        .map((item) => item.name)
                        .filter(Boolean)
                        .slice(0, 3)
                        .join(", ") || t("Đơn hàng")}
                    </strong>
                    <span style={{ color: "#64748b" }}>
                      {money(Number(selectedPickupOrder.total) || 0)}
                    </span>
                  </>
                ) : selectedPickupOrder ? (
                  <>
                    <QrCode size={38} color="#2563eb" />
                    <strong style={{ color: "#172033" }}>
                      {t("Đơn chưa sẵn sàng nhận")}
                    </strong>
                    <span style={{ color: "#1d4ed8", overflowWrap: "anywhere" }}>
                      #{selectedPickupOrder.code}
                    </span>
                    <span style={{ color: "#64748b", fontSize: 13 }}>
                      {t(selectedPickupOrder.status)}
                    </span>
                    <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.6 }}>
                      {t("QR sẽ xuất hiện tại đây khi nhân viên chuyển đơn sang Sẵn sàng nhận.")}
                    </p>
                  </>
                ) : (
                  <>
                    <QrCode size={38} color="#2563eb" />
                    <strong style={{ color: "#172033" }}>
                      {t("Chọn đơn hàng để xem QR")}
                    </strong>
                    <p style={{ margin: 0, color: "#64748b", fontSize: 13, lineHeight: 1.6 }}>
                      {t("Bấm vào một đơn bên trái. QR riêng của đơn sẽ xuất hiện tại đây khi đơn Sẵn sàng nhận.")}
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
              {t("Xem tất cả đơn hàng")}
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
            aria-label={t("Chung tay giảm đồ nhựa")}
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
                <h3>{t("Chung tay giảm đồ nhựa")}</h3>
                <p>{t("Gửi yêu cầu tham gia chương trình Sống Xanh Học Đường.")}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowEcoModal(false)}
                aria-label={t("Đóng")}
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
                  {t("Nhân viên sẽ kiểm tra và duyệt trước khi cộng điểm. Mỗi đơn chỉ nhận thưởng Sống Xanh một lần.")}
                </div>
              </div>

              {customerOrders.some((o) => o.status === "Sẵn sàng nhận") ? (
                <>
                  <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
                    {t("Chọn đơn hàng")}
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
                      .filter((o) => o.status === "Sẵn sàng nhận")
                      .map((o) => (
                        <option
                          key={o.id || o._id || o.code}
                          value={String(o.id || o._id)}
                        >
                          #{o.code} — {money(Number(o.total) || 0)}
                        </option>
                      ))}
                  </select>

                  <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
                    {t("Bạn mang theo")}
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
                    <option value="bottle">{t("Bình nước cá nhân")}</option>
                    <option value="container">{t("Hộp cơm cá nhân")}</option>
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
                          t("Đã gửi yêu cầu Sống Xanh. Chờ nhân viên xác nhận để nhận 10 điểm."),
                          "success"
                        );
                        setShowEcoModal(false);
                        await loadAll(true);
                      } catch (e) {
                        toast(
                          e.message || t("Không gửi được yêu cầu Sống Xanh"),
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
                    {ecoSubmitting ? t("Đang gửi...") : t("Gửi yêu cầu nhận 10 điểm")}
                  </button>
                </>
              ) : (
                <>
                  <p style={{ color: "#64748b", lineHeight: 1.6 }}>
                    {t("Bạn chưa có đơn ở trạng thái Sẵn sàng nhận. Khi đơn sẵn sàng, bạn có thể gửi yêu cầu Sống Xanh cho đơn đó.")}
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
                    {t("Xem đơn hàng của tôi")}
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
            aria-label={t("Đánh giá món ăn")}
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
                <h3>{t("Đánh giá món ăn")}</h3>
                <p>
                  {t("Đơn")} #{selectedReviewTarget.order.code}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReviewTarget(null)}
                disabled={reviewSubmitting}
                aria-label={t("Đóng")}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: "8px 20px 20px" }}>
              <strong style={{ fontSize: 16 }}>
                {selectedReviewTarget.item.name || t("Món ăn")}
              </strong>

              <p style={{ color: "#64748b", lineHeight: 1.6, fontSize: 13 }}>
                {t("Đánh giá món bạn đã mua. Mỗi món chỉ được đánh giá một lần.")}
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
                {t("Nhận xét của bạn")}
              </label>
              <textarea
                rows={4}
                maxLength={1000}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                disabled={reviewSubmitting}
                placeholder={t("Chia sẻ chất lượng món ăn, hương vị và trải nghiệm của bạn...")}
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
                      `${t("Gửi đánh giá thành công")} • +${Number(result?.pointsEarned) || 5} ${t("điểm")}`,
                      "success"
                    );

                    setSelectedReviewTarget(null);
                    setReviewComment("");
                    await loadAll(true);
                  } catch (e) {
                    toast(
                      e.message || t("Không gửi được đánh giá"),
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
                  ? t("Đang gửi...")
                  : t("Gửi đánh giá và nhận 5 điểm")}
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
      aria-label={t("Chọn voucher")}
      className="promo-modal-overlay"
    >
      <div onClick={(e) => e.stopPropagation()} className="promo-modal">
        <div className="promo-modal__head">
          <h3>
            {t("Chọn voucher {value}").replace("{value}", money(g.value))}
          </h3>
          <button type="button" onClick={onClose} aria-label={t("Đóng")}>
            <X size={20} />
          </button>
        </div>

        <p className="promo-modal__desc">
          {t("Bạn có {available} voucher khả dụng cho mệnh giá này. Chọn 1 để sử dụng.")
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
                      ? `${t("Đã dùng ngày")} ${fmtDate(v.used_at)}`
                      : v.created_at
                      ? `${t("Nhận ngày")} ${fmtDate(v.created_at)}`
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
                      {t("Dùng")}
                    </button>
                  </>
                )}
                {vUsed && (
                  <span className="promo-modal__used-tag">
                    {t("Đã dùng")}
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
          {t("Đóng")}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// CUSTOMERPROMOTIONS.JSX — Khuyến mãi & Đổi điểm (V4 - FINAL + i18n)
// ============================================================
// 🔧 FIX:
//   - FIX CRASH: Đổi emoji string trong EARN_METHODS thành Lucide Icon
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
  AlertCircle, RefreshCw, X, Award, Info,
} from "lucide-react";
import { api } from "../../api";
import RulesModal from "../../components/RulesModal";
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import { QRCodeCanvas } from "qrcode.react";

// ============================================================
// CONSTANTS
// ============================================================

const COPY_FEEDBACK_MS = 1500;
const MIN_REDEEM = 100;
const POINT_TO_VND = 1;
const REDEEM_OPTIONS = [100, 200, 500, 1000];

const EARN_METHODS = [
  {
    key: "eat",
    icon: Utensils,
    color: "#2563EB",
    title: "Hoàn thành đơn hàng",
    badge: "Hoàn 1%",
    desc: "Mỗi 10.000 đ thanh toán tại quầy hoặc ứng dụng nhận ngay 1 VWA Point tự động.",
    cta: "Xem hạn mức và quyền lợi trợ giá",
  },
  {
    key: "subsidy",
    icon: Award, // 🔧 Đã sửa: Dùng Icon thay vì emoji string
    color: "#F59E0B", // 🔧 Đã sửa: Thêm màu
    title: "Trợ giá sinh viên",
    badge: "Học kỳ II",
    desc: "Ưu đãi giảm giá đặc biệt dành riêng cho sinh viên VWA.",
    cta: "Xem hạn mức trợ giá",
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
    key: "review",
    icon: Star,
    color: "#0051B1",
    title: "Đánh giá món ăn",
    badge: "+5 pts/lần",
    desc: "Để lại nhận xét sao & góp ý khẩu vị trong mục Lịch sử đơn hàng để cải thiện chất lượng phục vụ bữa ăn.",
    cta: "Đánh giá đơn gần nhất",
  },
];

// ============================================================
// REWARD_TABS với filter rõ ràng
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
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [publicVouchers, setPublicVouchers] = useState([]);
  const [points, setPoints] = useState(0);
  const [pointHistory, setPointHistory] = useState([]);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [orderStatsLoaded, setOrderStatsLoaded] = useState(false);
  const [showPointHistory, setShowPointHistory] = useState(false);
  const [showVoucherWallet, setShowVoucherWallet] = useState(false);
  const [showStudentSubsidyModal, setShowStudentSubsidyModal] = useState(false);
  const [autoSubsidyRenew, setAutoSubsidyRenew] = useState(true);
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
  const [redeemOptionLoading, setRedeemOptionLoading] = useState(null);

  const copyTimerRef = useRef(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

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
          setError(e.message || "Không tải được dữ liệu khuyến mãi");
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

  const { active, used } = useMemo(() => {
    return {
      active: vouchers.filter((v) => !v.used),
      used: vouchers.filter((v) => v.used),
    };
  }, [vouchers]);

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

  const list = useMemo(() => {
    const source = tab === "active" ? active : used;

    const tabConfig = REWARD_TABS.find((rt) => rt.id === rewardTab);
    const filterFn = tabConfig?.filter || (() => true);

    let result = source.filter(filterFn);

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

  const completedSpent = useMemo(() => {
    return customerOrders.reduce((sum, order) => {
      if (order.status !== "Hoàn thành") return sum;
      return sum + (Number(order.total) || 0);
    }, 0);
  }, [customerOrders]);

  const tier = useMemo(() => {
    if (completedSpent >= 10000000) {
      return { name: t("Kim cương"), short: t("Diamond"), next: 10000000, isMax: true };
    }
    if (completedSpent >= 3000000) {
      return { name: t("Vàng"), short: t("Gold"), next: 10000000, isMax: false };
    }
    if (completedSpent >= 1000000) {
      return { name: t("Bạc"), short: t("Silver"), next: 3000000, isMax: false };
    }
    return { name: t("Đồng"), short: t("Bronze"), next: 1000000, isMax: false };
  }, [completedSpent, t]);

  const tierProgress = tier.isMax
    ? 100
    : Math.min(100, (completedSpent / tier.next) * 100);

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
        `${t("Đã nhận voucher thành công!")} ${voucher.code} — ${money(voucher.value)}`,
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
            onClick={() => setShowVoucherWallet(true)}
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
                  {tier.isMax ? (
                    <b>Đã đạt hạng cao nhất</b>
                  ) : (
                    <>
                      <b>{money(completedSpent)}</b> / {money(tier.next)}
                    </>
                  )}
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
                className="promo-hero__action promo-hero__action--solid" onClick={() => { setShowPointHistory(true); loadAll(); }}>
                <History size={16} />
                {t("Lịch sử tích/đổi điểm")}
              </button>
              <button
  type="button"
  className="promo-hero__action promo-hero__action--ghost"
  onClick={() => setShowRulesModal(true)}
>
  <Info size={16} />
  Quy tắc Xu
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
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
      
    </div>
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
                      style={m.key === "eat" ? { background: "#dcfce7", color: "#15803d" } : { background: `${m.color}15`, color: m.color }}
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
                      // 🔧 Sửa logic: Cả "eat" và "subsidy" đều mở modal Trợ giá
                      if (m.key === "eat" || m.key === "subsidy") {
                        setShowStudentSubsidyModal(true);
                        return;
                      }

                      if (m.key === "eco") { setShowEcoModal(true); return; }

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
  </div>

  {/* Public vouchers */}
  {filteredPublicVouchers.length > 0 && (
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
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
      
    </div>
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
{/* WALLET + ACTIVITY */}{/* WALLET + ACTIVITY */}
      <section className="promo-section" id="my-vouchers">
        <div className="promo-split">
          {/* Voucher wallet popup */}
          {showVoucherWallet && (
            <div
              className="promo-modal-overlay"
              onClick={() => setShowVoucherWallet(false)}
            >
              <div
                className="promo-modal promo-voucher-wallet-modal"
                role="dialog"
                aria-modal="true"
                aria-label={t("Ví Voucher Đã Đổi")}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "min(760px, calc(100vw - 28px))",
                  maxWidth: 760,
                  maxHeight: "88vh",
                  overflowY: "auto",
                  position: "relative",
                  boxSizing: "border-box",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowVoucherWallet(false)}
                  aria-label={t("Đóng")}
                  style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    border: 0,
                    background: "transparent",
                    padding: 8,
                    cursor: "pointer",
                    zIndex: 1,
                  }}
                >
                  <X size={20} />
                </button>
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
                {grouped.map((g) => {
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
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
      
    </div>
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
              </div>
            )}

            <div className="promo-wallet-note">
              <HelpCircle size={18} />
              <p>
                {t("Voucher đổi điểm không có giá trị quy đổi thành tiền mặt và áp dụng tối đa 01 voucher/đơn hàng tại quầy.")}
              </p>
            </div>
          </div>

              </div>
            </div>
          )}          
        </div>
      </section>
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
                <h3>{t("Biến Động Điểm Thưởng")}</h3>
                <p>{t("Theo dõi thời gian, nội dung và điểm số của các giao dịch")}</p>
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
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
      
    </div>
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

      {/* STUDENT SUBSIDY MODAL */}
    {showStudentSubsidyModal && (
      <div
        className="promo-modal-overlay"
        role="presentation"
        onClick={() => setShowStudentSubsidyModal(false)}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          background: "rgba(15, 23, 42, 0.48)",
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Trợ Giá Sinh Viên Kỳ II"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 432,
            minHeight: 0,
            boxSizing: "border-box",
            padding: 22,
            borderRadius: 20,
            background: "#fff",
            color: "#172033",
            boxShadow: "0 20px 60px rgba(15,23,42,.22)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div>
              <span style={{
                display: "inline-block",
                padding: "4px 9px",
                borderRadius: 20,
                background: "#eff6ff",
                color: "#2563eb",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: ".3px",
              }}>
                QUỸ HỌC ĐƯỜNG
              </span>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
  <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.3 }}>
    Trợ Giá Sinh Viên Kỳ II
  </h2>
  <span style={{ position: "absolute", right: 22, top: 68, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>Năm học 2024 - 2025</span>
</div>
            </div>
            <button
              type="button"
              aria-label="Đóng"
              onClick={() => setShowStudentSubsidyModal(false)}
              style={{
                flexShrink: 0,
                width: 36,
                height: 36,
                border: 0,
                borderRadius: 10,
                background: "#eff6ff",
                color: "#2563eb",
                fontSize: 23,
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>

          <div style={{ marginTop: 0 }}>
  <div style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  }}>
    <span style={{ fontSize: 14, color: "#64748b" }}>
      Hạn mức trợ giá còn lại:
    </span>
    <strong style={{ fontSize: 20, color: "#16a36a" }}>
      220.000đ
    </strong>
  </div>
  <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
    Tương đương <strong style={{ color: "#16a36a" }}>22 suất ăn</strong>
    {" "}(10.000đ/suất học viên hỗ trợ)
  </div><p style={{ margin: "10px 0 6px", fontSize: 14, color: "#64748b" }}>
              Đã sử dụng trong tháng: 18/40 suất
            </p>
            <div
              role="progressbar"
              aria-label="Tiến độ sử dụng trợ giá"
              aria-valuenow={45}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                height: 7,
                borderRadius: 10,
                background: "#e2e8f0",
                overflow: "hidden",
              }}
            >
              <div style={{
                width: "45%",
                height: "100%",
                borderRadius: 10,
                background: "linear-gradient(90deg, #16a34a, #20c779)",
              }} />
            </div>
            <div style={{ textAlign: "right", marginTop: 0, fontSize: 12, color: "#64748b" }}>
              45%
            </div>
          </div>

          <div style={{
            display: "flex",
            gap: 9,
            alignItems: "center",
            marginTop: -18,
            padding: 12,
            borderRadius: 12,
            
            background: "#f0fdf4",
            color: "#166534",
            fontSize: 14,
            lineHeight: 1.55,
          }}>
            <span aria-hidden="true">✦</span>
            <span>
              Trợ giá tối đa 10.000đ cho mỗi phần cơm/trợ bữa phí 25.000đ trở lên khi quẹt mã tại quầy.
            </span>
          </div>

          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            marginTop: 4,
            paddingTop: 4,
            borderTop: "1px solid #e2e8f0",
          }}>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              Chu kỳ làm mới: 01/04/2025
            </div>
            <label style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 700,
              color: "#2563eb",
              cursor: "pointer",
            }}>
              <input
                type="checkbox"
                checked={autoSubsidyRenew}
                onChange={(e) => setAutoSubsidyRenew(e.target.checked)}
              />
              Tự động cộng lại
            </label>
          </div>
        </div>
      </div>
    )}

      {/* VWA GREEN POINTS MODAL */}
      {showEcoModal && (
        <div
          className="promo-modal-overlay"
          onClick={() => setShowEcoModal(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="VWA Green Points"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "min(390px, calc(100vw - 28px))",
              boxSizing: "border-box",
              padding: 16,
              borderRadius: 20,
              background: "linear-gradient(145deg, #f0fdf4, #ffffff 75%)",
              border: "1px solid #d1fae5",
              boxShadow: "0 18px 50px rgba(15, 100, 55, 0.16)",
              color: "#172033",
            }}
          >
            <button
              type="button"
              onClick={() => setShowEcoModal(false)}
              aria-label="Đóng"
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                width: 30,
                height: 30,
                border: 0,
                borderRadius: "50%",
                background: "#dcfce7",
                color: "#15803d",
                fontSize: 20,
                cursor: "pointer",
              }}
            >
              ×
            </button>

            <div
              style={{
                display: "inline-flex",
                padding: "4px 10px",
                borderRadius: 20,
                background: "#16a34a",
                color: "#fff",
                fontSize: 9,
                fontWeight: 800,
              }}
            >
              SINH THÁI HỌC ĐƯỜNG
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                marginTop: 7,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 850 }}>
                VWA Green Points
              </h2>
              <span style={{ fontSize: 23, color: "#16a34a" }}>✧</span>
            </div>

            <p style={{ margin: "4px 0 14px", color: "#64748b", fontSize: 11 }}>
              Tích điểm khi mang bình nước / dùng khay tái chế
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              <div
                style={{
                  padding: 11,
                  border: "1px solid #dbe5e7",
                  borderRadius: 12,
                  background: "#fff",
                  minWidth: 0,
                }}
              >
                <div style={{ color: "#64748b", fontSize: 10 }}>
                  Điểm tích lũy
                </div>
                <div style={{ marginTop: 3, fontSize: 22, fontWeight: 850 }}>
                  {Number(points || 0).toLocaleString("vi-VN")}
                </div>
                <div style={{ color: "#64748b", fontSize: 9, marginTop: 3 }}>
                  VWA Points hiện có
                </div>
              </div>

              <div
                style={{
                  padding: 11,
                  border: "1px solid #dbe5e7",
                  borderRadius: 12,
                  background: "#fff",
                  minWidth: 0,
                }}
              >
                <div style={{ color: "#64748b", fontSize: 10 }}>
                  Giá trị quy đổi
                </div>
                <div
                  style={{
                    marginTop: 3,
                    fontSize: 20,
                    fontWeight: 850,
                    overflowWrap: "anywhere",
                  }}
                >
                  {money(Number(points || 0) * POINT_TO_VND)}
                </div>
                <div style={{ color: "#64748b", fontSize: 9, marginTop: 3 }}>
                  Theo tỷ lệ quy đổi điểm
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 10,
                padding: 12,
                border: "1px solid #dcfce7",
                borderRadius: 12,
                background: "#fff",
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  flexShrink: 0,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 10,
                  background: "#fef3c7",
                  fontSize: 18,
                }}
              >
                ☕
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800 }}>
                  Voucher Giảm 20.000đ Đồ Uống
                </div>
                <div style={{ marginTop: 3, color: "#64748b", fontSize: 10 }}>
                  Quy đổi với 100 Green Points
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowEcoModal(false);
                document.getElementById("my-vouchers")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                width: "100%",
                marginTop: 10,
                padding: "12px 10px",
                border: 0,
                borderRadius: 11,
                background: "#16a34a",
                color: "#fff",
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              <span>＋</span>
              Đổi điểm nhận quà &amp; voucher ưu đãi
            </button>
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
      {showRulesModal && <RulesModal isAdmin={false} onClose={() => setShowRulesModal(false)} />}
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
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
      
    </div>
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
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
      
    </div>
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
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
      
    </div>
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

// ============================================================
// CUSTOMERPROMOTIONS.JSX — Khuyến mãi & Đổi điểm (V2 - đồng bộ)
// ============================================================
// ✅ GIỮ NGUYÊN: logic, state, hooks, API calls, i18n
// 🎨 THAY ĐỔI:
//   - Breadcrumb đã ẩn qua CSS toàn cục (styles-customer.css)
//   - Header đồng bộ với trang chủ (font, màu, spacing)
//   - Xoá "Món đang giảm giá" — trùng với Flash Sale ở Home
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
    title: "Ăn tại Căng tin",
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
    key: "review",
    icon: Star,
    color: "#0051B1",
    title: "Đánh giá món ăn",
    badge: "+5 pts/lần",
    desc: "Để lại nhận xét sao & góp ý khẩu vị trong mục Lịch sử đơn hàng để cải thiện chất lượng phục vụ bữa ăn.",
    cta: "Đánh giá đơn gần nhất",
  },
];

const REWARD_TABS = [
  { id: "all", label: "Tất cả ưu đãi" },
  { id: "voucher", label: "Voucher Giảm Tiền Trực Tiếp" },
  { id: "food", label: "Đổi Món Ăn & Đồ Uống Miễn Phí" },
  { id: "combo", label: "Combo Suất Ăn Trợ Giá SV" },
  { id: "eco", label: "Quà Tặng Xanh & Bình Giữ Nhiệt" },
];

// ============================================================
// HELPERS
// ============================================================

function groupByValue(list) {
  const map = new Map();
  for (const v of list) {
    const key = String(v.value);
    if (!map.has(key)) {
      map.set(key, { value: v.value, count: 0, vouchers: [], used: 0, available: 0 });
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
  const [redeemLoading, setRedeemLoading] = useState(false);

  const copyTimerRef = useRef(null);
  const inFlightRef = useRef(false);

  // ---------- Load ----------
  const loadAll = useCallback(
    async (silent = false) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      if (!silent) setRefreshing(true);
      setError("");

      try {
        const [myRes, pubRes, pointsRes] = await Promise.all([
          api.vouchers.me().catch(() => []),
          api.vouchers.public().catch(() => []),
          api.points.me().catch(() => ({ points: 0 })),
        ]);

        setVouchers(Array.isArray(myRes) ? myRes : []);
        setPublicVouchers(Array.isArray(pubRes) ? pubRes : []);
        setPoints(Number(pointsRes?.points) || 0);
      } catch (e) {
        if (!silent) setError(e.message || t("Không tải được dữ liệu khuyến mãi"));
      } finally {
        setLoading(false);
        if (!silent) setRefreshing(false);
        inFlightRef.current = false;
      }
    },
    [t]
  );

  useEffect(() => {
    loadAll(false);
  }, [loadAll]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // ---------- Derived ----------
  const { active, used } = useMemo(() => {
    return {
      active: vouchers.filter((v) => !v.used),
      used: vouchers.filter((v) => v.used),
    };
  }, [vouchers]);

  const list = tab === "active" ? active : used;
  const grouped = useMemo(() => groupByValue(list), [list]);
  const canRedeem = points >= redeemPoints && redeemPoints >= MIN_REDEEM;

  const tier = useMemo(() => {
    if (points >= 1000) return { name: t("Bạch Kim"), short: t("Platinum"), next: 1500 };
    if (points >= 500) return { name: t("Vàng"), short: t("Gold"), next: 1000 };
    if (points >= 100) return { name: t("Bạc"), short: t("Silver"), next: 500 };
    return { name: t("Đồng"), short: t("Bronze"), next: 100 };
  }, [points, t]);
  const tierProgress = Math.min(100, (points / tier.next) * 100);

  // ---------- Handlers ----------
  const scrollToSection = useCallback((id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const doRedeem = async () => {
    if (redeemLoading) return;
    if (redeemPoints < MIN_REDEEM) {
      toast(
        t("Cần ít nhất {value} điểm để đổi").replace("{value}", MIN_REDEEM),
        "error"
      );
      return;
    }
    if (redeemPoints > points) {
      toast(t("Không đủ điểm"), "error");
      return;
    }

    setRedeemLoading(true);
    try {
      const voucher = await api.points.redeem({ points: redeemPoints });
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
          <button onClick={() => loadAll(false)}>
            <RefreshCw size={12} /> {t("Thử lại")}
          </button>
        </div>
      )}

      {/* ===== HEADER (breadcrumb đã ẩn qua CSS) ===== */}
      <section className="promo-header">
        <div className="promo-header__row">
          <div className="promo-header__left">
            <div className="promo-header__eyebrow">
              <Leaf size={14} />
              {t("Chương Trình Sống Xanh Học Đường")}
            </div>
            <h1 className="promo-title">
              {t("Khuyến Mãi & Đổi Điểm Thưởng")}
            </h1>
            <p className="promo-subtitle">
              {t("Tích lũy điểm VWA Green sau mỗi bữa ăn tại căng tin, dùng bình nước cá nhân hoặc mang hộp cơm để đổi voucher giảm giá, món ăn và quà tặng sinh thái học viện.")}
            </p>
          </div>

          <button
            className="promo-header__cta"
            onClick={() => scrollToSection("my-vouchers")}
          >
            <Ticket size={18} />
            {t("Ví Voucher Của Tôi")} ({active.length})
          </button>
        </div>
      </section>

      {/* ===== POINTS HERO ===== */}
      <section className="promo-hero">
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
              <div className="promo-hero__user-name">
                {t("Xin chào, bạn!")}
              </div>
              <div className="promo-hero__user-meta">
                {t("Thành viên Canteen VWA")}
              </div>
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
              <button className="promo-hero__action promo-hero__action--solid">
                <History size={16} />
                {t("Lịch sử tích/đổi điểm")}
              </button>
              <button className="promo-hero__action promo-hero__action--ghost">
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
                <b>18</b> {t("bữa")}
                <span>{t("Ăn uống tích điểm căng tin")}</span>
              </div>
            </div>
            <div className="promo-achievement">
              <div className="promo-achievement__icon">
                <Recycle size={22} />
              </div>
              <div className="promo-achievement__body">
                <b>12</b> {t("lần Eco")}
                <span>{t("Giảm ~240g rác thải nhựa")}</span>
              </div>
            </div>
            <div className="promo-achievement">
              <div className="promo-achievement__icon">
                <PiggyBank size={22} />
              </div>
              <div className="promo-achievement__body">
                <b>{money(580000)}</b>
                <span>{t("Tiết kiệm từ voucher & trợ giá")}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== EARN POINTS ===== */}
      <section className="promo-section">
        <div className="promo-section__head">
          <div>
            <h2 className="promo-section__title">
              {t("Cách Nhận Thêm VWA Green Points")}
            </h2>
            <p className="promo-section__sub">
              {t("Tích điểm chủ động mỗi ngày qua thói quen ăn uống văn minh")}
            </p>
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
                  <span
                    className="promo-earn-card__cta"
                    style={{ color: m.color }}
                  >
                    {t(m.cta)} <ArrowRight size={14} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== REDEEM HUB ===== */}
      <section className="promo-section">
        <div className="promo-section__head">
          <div>
            <h2 className="promo-section__title">
              {t("Kho Quà & Voucher Đổi Điểm")}
            </h2>
            <p className="promo-section__sub">
              {t("Sử dụng điểm tích lũy của bạn để áp dụng trực tiếp cho bữa ăn kế tiếp")}
            </p>
          </div>
          <div className="promo-redeem-controls">
            <label className="promo-redeem-check">
              <input
                type="checkbox"
                checked={affordableOnly}
                onChange={(e) => setAffordableOnly(e.target.checked)}
              />
              <span>
                {t("Chỉ hiện quà đủ điểm đổi")} (≤ {points} pts)
              </span>
            </label>
          </div>
        </div>

        <div className="promo-reward-tabs">
          {REWARD_TABS.map((tItem) => (
            <button
              key={tItem.id}
              className={`promo-reward-tab ${
                rewardTab === tItem.id ? "active" : ""
              }`}
              onClick={() => setRewardTab(tItem.id)}
            >
              {t(tItem.label)}
            </button>
          ))}
        </div>

        <div className="promo-redeem-options">
          <div className="promo-redeem-options__left">
            <span className="promo-redeem-options__label">
              {t("Đổi điểm lấy voucher:")}
            </span>
            {REDEEM_OPTIONS.map((p) => {
              const disabled = points < p;
              const isActive = redeemPoints === p;
              return (
                <button
                  key={p}
                  className={`promo-redeem-opt ${
                    isActive ? "active" : ""
                  }`}
                  disabled={disabled}
                  onClick={() => setRedeemPoints(p)}
                >
                  {p}
                </button>
              );
            })}
          </div>
          <div className="promo-redeem-options__right">
            <span className="promo-redeem-options__value">
              {t("Nhận voucher")}:{" "}
              <b>{money(redeemPoints * POINT_TO_VND)}</b>
            </span>
            <button
              className="promo-redeem-btn"
              disabled={redeemLoading || !canRedeem}
              onClick={doRedeem}
            >
              {redeemLoading ? (
                <>
                  <Loader2 size={14} className="promo-spin" />
                  {t("Đang đổi...")}
                </>
              ) : (
                <>
                  <Gift size={15} />
                  {t("Đổi ngay")}
                </>
              )}
            </button>
          </div>
        </div>

        {publicVouchers.length > 0 && (
          <div className="promo-public-section">
            <div className="promo-public-section__head">
              <Ticket size={18} />
              <b>
                {t("Ưu đãi toàn hệ thống")} ({publicVouchers.length})
              </b>
            </div>
            <div className="promo-public-grid">
              {publicVouchers.map((v) => {
                const isClaiming = claimingIds.has(v.id);
                const anyClaiming = claimingIds.size > 0;
                return (
                  <div key={v.id} className="promo-public-card">
                    <div className="promo-public-card__value">
                      {money(v.value)}
                    </div>
                    <div className="promo-public-card__code">{v.code}</div>
                    <button
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

        {/* ĐÃ XOÁ: Khối "Món đang giảm giá" — trùng với Flash Sale ở Home */}
      </section>

      {/* ===== WALLET + ACTIVITY ===== */}
      <section className="promo-section" id="my-vouchers">
        <div className="promo-split">
          <div className="promo-split__left">
            <div className="promo-split__head">
              <div>
                <h2 className="promo-section__title">
                  {t("Ví Voucher Đã Đổi")} ({grouped.length})
                </h2>
                <p className="promo-section__sub">
                  {t("Sẵn sàng xuất trình mã barcode/QR tại quầy thanh toán")}
                </p>
              </div>
              <Wallet size={24} color="#2563EB" />
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
                <b>{t("Chưa có voucher nào")}</b>
                <p>
                  {t("Đổi điểm hoặc nhận voucher từ mục Ưu đãi toàn hệ thống.")}
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
                              className="promo-wallet-card__use"
                              onClick={() => navigate("/customer/checkout")}
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
                    className="promo-wallet-see-more"
                    onClick={() => scrollToSection("my-vouchers")}
                  >
                    {t("Xem tất cả")} ({grouped.length}) <ArrowRight size={14} />
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

          <div className="promo-split__right">
            <div className="promo-split__head">
              <div>
                <h2 className="promo-section__title">
                  {t("Biến Động Điểm Thưởng")}
                </h2>
                <p className="promo-section__sub">
                  {t("Lịch sử tích lũy và sử dụng VWA Green Points gần đây")}
                </p>
              </div>
              <button className="promo-activity-see-all">
                {t("Xem toàn bộ")} <ExternalLink size={13} />
              </button>
            </div>

            <div className="promo-activity-table">
              <div className="promo-activity-table__head">
                <div>{t("Thời gian")}</div>
                <div>{t("Nội dung hoạt động")}</div>
                <div className="right">{t("Điểm số")}</div>
              </div>
              <div className="promo-activity-table__body">
                <ActivityRow
                  date={t("Hôm nay")}
                  time="11:30"
                  icon={<Receipt size={18} />}
                  title={t("Tích điểm đơn hàng")}
                  sub={`${t("Mã đơn")}: #ORD-20250228-092`}
                  delta="+5"
                  deltaType="up"
                />
                <ActivityRow
                  date={t("Hôm nay")}
                  time="11:30"
                  icon={<Leaf size={18} />}
                  iconColor="#1D4ED8"
                  title={t("Thưởng mang bình cá nhân Eco Bonus")}
                  sub={t("Quét xác nhận tại máy pha chế quầy đồ uống")}
                  delta="+10"
                  deltaType="up"
                  highlight
                />
                <ActivityRow
                  date="27/02/2025"
                  time="12:15"
                  icon={<Receipt size={18} />}
                  title={t("Tích điểm đơn hàng")}
                  sub={`${t("Mã đơn")}: #ORD-20250227-081`}
                  delta="+4"
                  deltaType="up"
                />
                <ActivityRow
                  date="25/02/2025"
                  time="18:40"
                  icon={<Gift size={18} />}
                  iconColor="#EF4444"
                  title={t("Đổi Voucher Giảm 10k Cơm Trưa")}
                  sub={`${t("Mã voucher tạo mới")}: #VWA-2025-LUNCH10`}
                  delta="-100"
                  deltaType="down"
                  highlight
                />
                <ActivityRow
                  date="24/02/2025"
                  time="13:05"
                  icon={<ThumbsUp size={18} />}
                  title={t("Thưởng đánh giá chất lượng món ăn")}
                  sub={t("Phản hồi món Bò kho bánh mì kèm ảnh chụp")}
                  delta="+5"
                  deltaType="up"
                />
              </div>
            </div>

            <div className="promo-activity-tip">
              <Lightbulb size={20} color="#2563EB" />
              <span>
                {t("Bạn chỉ cần thêm")} <b>15 {t("lần sống xanh")}</b>{" "}
                {t("nữa để đạt Hạng Vàng danh dự.")}
              </span>
              <button>{t("Tìm hiểu thêm")}</button>
            </div>
          </div>
        </div>
      </section>

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
      `}</style>
    </div>
  );
}

// ============================================================
// SUB: ActivityRow
// ============================================================

function ActivityRow({ date, time, icon, iconColor = "#2563EB", title, sub, delta, deltaType, highlight }) {
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
      <div
        onClick={(e) => e.stopPropagation()}
        className="promo-modal"
      >
        <div className="promo-modal__head">
          <h3>
            {t("Chọn voucher {value}").replace("{value}", money(g.value))}
          </h3>
          <button onClick={onClose} aria-label={t("Đóng")}>
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
                      onClick={() => onCopy(v)}
                      className="promo-modal__copy"
                    >
                      {vCopied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    <button onClick={onUse} className="promo-modal__use">
                      {t("Dùng")}
                    </button>
                  </>
                )}
                {vUsed && (
                  <span className="promo-modal__used-tag">{t("Đã dùng")}</span>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={onClose} className="promo-modal__close">
          {t("Đóng")}
        </button>
      </div>
    </div>
  );
}
// ============================================================
// CUSTOMERWALLET.JSX â€” VÃ­ Canteen VWA Pay (V2 - design má»›i)
// ============================================================
// âœ… GIá»® NGUYÃŠN: logic, state, hooks, API calls, i18n
// ðŸŽ¨ THAY Äá»”I: cáº¥u trÃºc JSX render theo design má»›i
// ============================================================

import { Skeleton, SkeletonList, SkeletonStats } from "../../components/Skeleton";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Wallet, Plus, Minus, Link as LinkIcon, CreditCard, QrCode, Banknote, Clock, CheckCircle2, ArrowDownCircle, ArrowUpCircle, ShoppingBag, X, Building2, History, AlertTriangle, Loader2, AlertCircle, RefreshCw, Home, ChevronRight, BadgeCheck, Shield, Zap, Utensils, ArrowDown, ArrowUp, RotateCcw, Download, Lock, Headset, Search, Coffee, Soup, Store, Sandwich, Sparkles,
} from "lucide-react";
import { api } from "../../api";
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import { usePointsConfig } from "../../hooks/usePointsConfig";

// ============================================================
// CONSTANTS
// ============================================================

const MODAL_Z = 2147483600;

const BANKS = [
  { code: "VCB",  name: "Vietcombank" },
  { code: "TCB",  name: "Techcombank" },
  { code: "VIB",  name: "VIB" },
  { code: "MBB",  name: "MB Bank" },
  { code: "ACB",  name: "ACB" },
  { code: "TPB",  name: "TPBank" },
  { code: "VPB",  name: "VPBank" },
  { code: "STB",  name: "Sacombank" },
  { code: "BIDV", name: "BIDV" },
  { code: "ICB",  name: "Vietinbank" },
  { code: "AGB",  name: "Agribank" },
];

const MIN_DEPOSIT = 10000;
const MIN_WITHDRAW = 20000;
const QUICK_DEPOSIT = [10000, 20000, 50000, 100000, 200000, 500000];
const QUICK_WITHDRAW = [50000, 100000, 200000];

const EMPTY_WALLET = {
  balance: 0,
  bank_name: "",
  bank_account: "",
  bank_account_name: "",
  linked_at: "",
};

// ============================================================
// HELPERS
// ============================================================

function fmtDateTime(iso) {
  if (!iso) return "â€”";
  try {
    return new Date(iso).toLocaleString("vi-VN");
  } catch {
    return "â€”";
  }
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("vi-VN");
  } catch {
    return "";
  }
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function CustomerWallet({ user }) {
  const ptsCfg = usePointsConfig();
  const { t } = useI18n();

  const [wallet, setWallet] = useState(EMPTY_WALLET);
  const [transactions, setTransactions] = useState([]);
  const [settings, setSettings] = useState(null);
  const [points, setPoints] = useState(0); 

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [tab, setTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [showDeposit, setShowDeposit] = useState(false);
  const [topupAmount, setTopupAmount] = useState(100000);
  const [customTopupInput, setCustomTopupInput] = useState("");
  const [selectedTopupPreset, setSelectedTopupPreset] = useState(null);
  const [topupSubmitting, setTopupSubmitting] = useState(false);
  const [pendingTopupTx, setPendingTopupTx] = useState(null);
  const [topupMethod, setTopupMethod] = useState("QR");
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showLinkBank, setShowLinkBank] = useState(false);

  // QR countdown (design cÃ³ auto-refresh)
  const [qrTimer, setQrTimer] = useState(60);
  const [autoSubsidy, setAutoSubsidy] = useState(true);
  // Sá»‘ giao dá»‹ch Ä‘ang hiá»ƒn thá»‹ (nÃºt "Xem thÃªm lá»‹ch sá»­ cÅ© hÆ¡n")
  const [visibleTx, setVisibleTx] = useState(8);

  const reqIdRef = useRef(0);
  const inFlightRef = useRef(false);

  // ---------- TX config (GIá»® NGUYÃŠN) ----------
  const TX_CONFIG = useMemo(
    () => ({
      deposit:  { icon: ArrowDownCircle, color: "#18a967", bg: "#e8f9f1", label: t("Náº¡p tiá»n"),    sign: "+" },
      withdraw: { icon: ArrowUpCircle,   color: "#f59e0b", bg: "#fef3c7", label: t("RÃºt tiá»n"),    sign: "âˆ’" },
      payment:  { icon: ShoppingBag,     color: "#8b5cf6", bg: "#ede9fe", label: t("Thanh toÃ¡n"),  sign: "âˆ’" },
    }),
    [t]
  );

  const STATUS_CONFIG = useMemo(
    () => ({
      pending:  { label: t("Chá» duyá»‡t"), color: "#f59e0b", bg: "#fef3c7" },
      approved: { label: t("ThÃ nh cÃ´ng"), color: "#18a967", bg: "#e8f9f1" },
      rejected: { label: t("Tá»« chá»‘i"),    color: "#ef4444", bg: "#fee2e2" },
    }),
    [t]
  );

  // ---------- Load (GIá»® NGUYÃŠN) ----------
  const loadAll = useCallback(async (silent = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const myReqId = ++reqIdRef.current;
    if (!silent) setRefreshing(true);
    setError("");

    try {
      const [w, txs, st] = await Promise.all([
        api.wallet.me().catch(() => null),
        api.wallet.transactions().catch(() => []),
        api.settings.get().catch(() => null),
      ]);

      if (myReqId !== reqIdRef.current) return;

      if (w) setWallet({ ...EMPTY_WALLET, ...w });
      setTransactions(Array.isArray(txs) ? txs : []);
      if (st) setSettings(st);
    } catch (e) {
      if (myReqId === reqIdRef.current) {
        setError(e.message || t("KhÃ´ng táº£i Ä‘Æ°á»£c dá»¯ liá»‡u vÃ­"));
      }
    } finally {
      if (myReqId === reqIdRef.current) {
        setLoading(false);
        if (!silent) setRefreshing(false);
      }
      inFlightRef.current = false;
    }
  }, [t]);

  useEffect(() => {
    loadAll(false);
  }, [loadAll]);

  // QR countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setQrTimer((s) => (s <= 1 ? 60 : s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ---------- Derived (GIá»® NGUYÃŠN) ----------
  const filtered = useMemo(() => {
    let list = transactions;
    if (tab !== "all") {
      list = list.filter((tx) => tx.type === tab);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((tx) => {
        const code = (tx.code || "").toLowerCase();
        const note = (tx.note || "").toLowerCase();
        return code.includes(q) || note.includes(q);
      });
    }
    return list;
  }, [transactions, tab, searchQuery]);

  const stats = useMemo(() => {
    let deposited = 0;
    let withdrawn = 0;
    let paid = 0;
    let pending = 0;

    for (const tx of transactions) {
      if (tx.status === "pending") pending++;
      if (tx.status !== "approved") continue;
      const amt = Number(tx.amount) || 0;
      if (tx.type === "deposit") deposited += amt;
      else if (tx.type === "withdraw") withdrawn += amt;
      else if (tx.type === "payment") paid += amt;
    }
    return { deposited, withdrawn, paid, pending };
  }, [transactions]);

  const isLinked = !!wallet.bank_account;
  const canWithdraw = isLinked && wallet.balance >= MIN_WITHDRAW;

  const handleSuccessModal = useCallback(async () => {
    setShowDeposit(false);
    setShowWithdraw(false);
    setShowLinkBank(false);
    await loadAll(true);
  }, [loadAll]);

  const handleDirectTopup = useCallback(async () => {
    if (topupSubmitting) return;

    const requestedAmount = Number(topupAmount);
    if (!Number.isFinite(requestedAmount) || requestedAmount < MIN_DEPOSIT) {
      toast(
        t("Sá»‘ tiá»n náº¡p tá»‘i thiá»ƒu {value}").replace("{value}", money(MIN_DEPOSIT)),
        "error"
      );
      return;
    }

    if (!Number.isInteger(requestedAmount)) {
      toast(t("Sá»‘ tiá»n náº¡p pháº£i lÃ  sá»‘ nguyÃªn há»£p lá»‡."), "error");
      return;
    }

    if (
      topupMethod === "QR" &&
      pendingTopupTx?.code &&
      Number(pendingTopupTx.amount) === requestedAmount
    ) {
      toast(
        t("Chuyá»ƒn khoáº£n thÃ nh cÃ´ng. Äang chá» duyá»‡t"),
        "info"
      );
      return;
    }

    setTopupSubmitting(true);
    try {
      const result = await api.wallet.deposit({
        amount: requestedAmount,
        method: topupMethod,
        note: "",
      });

      const transaction = result?.transaction;
      if (!transaction) {
        throw new Error(t("KhÃ´ng táº¡o Ä‘Æ°á»£c yÃªu cáº§u náº¡p tiá»n."));
      }

      if (topupMethod === "CASH") {
        setPendingTopupTx(null);
        toast(t("ÄÃ£ táº¡o yÃªu cáº§u náº¡p tiá»n máº·t. Vui lÃ²ng thanh toÃ¡n táº¡i quáº§y."), "success");
        await handleSuccessModal();
      } else {
        setPendingTopupTx(transaction);
        setShowDeposit(true);
        toast(t("Chuyá»ƒn khoáº£n thÃ nh cÃ´ng. Äang chá» duyá»‡t"), "info");
      }
    } catch (error) {
      toast(error?.message || t("KhÃ´ng táº¡o Ä‘Æ°á»£c yÃªu cáº§u náº¡p tiá»n"), "error");
    } finally {
      setTopupSubmitting(false);
    }
  }, [
    topupSubmitting,
    topupAmount,
    topupMethod,
    pendingTopupTx,
    t,
    handleSuccessModal,
  ]);
  const handleSelectTopupMethod = useCallback(async (method) => {
    setTopupMethod(method);

    if (method !== "QR" || topupSubmitting) return;

    const requestedAmount = Number(topupAmount);

    if (!Number.isFinite(requestedAmount) || requestedAmount < MIN_DEPOSIT) {
      toast(
        t("Sá»‘ tiá»n náº¡p tá»‘i thiá»ƒu {value}").replace("{value}", money(MIN_DEPOSIT)),
        "error"
      );
      return;
    }

    if (!Number.isInteger(requestedAmount)) {
      toast(t("Sá»‘ tiá»n náº¡p pháº£i lÃ  sá»‘ nguyÃªn há»£p lá»‡."), "error");
      return;
    }

    if (
      pendingTopupTx?.code &&
      Number(pendingTopupTx.amount) === requestedAmount
    ) {
      return;
    }

    setTopupSubmitting(true);

    try {
      const result = await api.wallet.deposit({
        amount: requestedAmount,
        method: "QR",
        note: "",
      });

      const transaction = result?.transaction;

      if (!transaction?.code) {
        throw new Error(t("KhÃ´ng táº¡o Ä‘Æ°á»£c yÃªu cáº§u náº¡p tiá»n."));
      }

      setPendingTopupTx(transaction);
      toast(t("MÃ£ QR náº¡p tiá»n Ä‘Ã£ sáºµn sÃ ng."), "success");
    } catch (error) {
      toast(
        error?.message || t("KhÃ´ng táº¡o Ä‘Æ°á»£c yÃªu cáº§u náº¡p tiá»n"),
        "error"
      );
    } finally {
      setTopupSubmitting(false);
    }
  }, [
    topupSubmitting,
    topupAmount,
    pendingTopupTx,
    t,
  ]);
  // TX tabs config
  const TABS = [
    { id: "all",      label: t("Táº¥t cáº£") },
    { id: "deposit",  label: t("Náº¡p tiá»n (+)") },
    { id: "payment",  label: t("Thanh toÃ¡n mÃ³n (âˆ’)") },
    { id: "withdraw", label: t("Trá»£ giÃ¡ & HoÃ n tiá»n") },
  ];

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="customer-wallet-v2">
      {/* ERROR BANNER */}
      {error && (
        <div className="wallet-error-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={() => loadAll(false)}>
            <RefreshCw size={12} /> {t("Thá»­ láº¡i")}
          </button>
        </div>
      )}

      {/* ============================================== */}
      {/* 1. BREADCRUMB + HEADER                          */}
      {/* ============================================== */}
      <section className="wallet-header">
        <nav className="wallet-breadcrumb">
          <a href="/customer/home" className="wallet-breadcrumb__link">
            {t("Canteen VWA")}
          </a>
          <ChevronRight size={14} className="wallet-breadcrumb__sep" />
          <span>{t("TÃ i khoáº£n")}</span>
          <ChevronRight size={14} className="wallet-breadcrumb__sep" />
          <span className="wallet-breadcrumb__current">
            {t("VÃ­ Canteen & Tháº» Sinh ViÃªn")}
          </span>
        </nav>

        <div className="wallet-header__row">
          <div className="wallet-header__left" aria-hidden="true" style={{ flex: "1 1 auto", minWidth: 0 }} />
          <div className="wallet-header__card">
            <div className="wallet-header__icon">
              <BadgeCheck size={22} />
            </div>
            <div className="wallet-header__info">
              <div className="wallet-header__name-row">
                <b>{t("Tháº» SV")} â€¢ {t("Sinh viÃªn")}</b>
                <BadgeCheck size={16} className="wallet-header__verified" />
              </div>
              <div className="wallet-header__meta">
                <span>MSSV: {user?.student_code || t("ChÆ°a liÃªn káº¿t")}</span>
                <span className="wallet-header__dot" />
                <span className="wallet-header__sso">
                  {user?.student_code
                    ? t("ÄÃ£ xÃ¡c thá»±c SSO Há»c viá»‡n")
                    : t("ChÆ°a liÃªn káº¿t MSSV")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================== */}
      {/* 2. 3-COLUMN BENTO (Card + Subsidy + Points)    */}
      {/* ============================================== */}
      <section className="wallet-bento">
        {/* Card 1: VWA Smart Pay */}
        <div className="wallet-card-physical">
          <div className="wallet-card-physical__glow-1" />
          <div className="wallet-card-physical__glow-2" />

          <div className="wallet-card-physical__top">
            <div className="wallet-card-physical__brand">
              <div className="wallet-card-physical__brand-icon">
                <Wallet size={18} />
              </div>
              <b>{t("VWA Smart Pay")}</b>
            </div>
            <Wallet size={26} style={{ opacity: 0.8 }} />
          </div>

          {/* Chip */}
          <div className="wallet-card-physical__chip-row">
            <div className="wallet-card-physical__chip">
              <div className="wallet-card-physical__chip-inner" />
            </div>
            <span className="wallet-card-physical__chip-label">
              {t("THáºº SINH VIÃŠN ÄA NÄ‚NG")}
            </span>
          </div>

          {/* Balance */}
          <div className="wallet-card-physical__balance">
            <span className="wallet-card-physical__balance-label">
              {t("Sá» DÆ¯ VÃ KHáº¢ Dá»¤NG")}
            </span>
            <div className="wallet-card-physical__balance-value">
              {loading ? (
                <Loader2 size={32} className="wallet-spin" />
              ) : (
                <>
                  {money(wallet.balance || 0).replace("Ä‘", "")}
                  <span className="wallet-card-physical__balance-unit">Ä‘</span>
                </>
              )}
            </div>
          </div>

          {/* Bottom: cardholder + actions */}
          <div className="wallet-card-physical__bottom">
            <div className="wallet-card-physical__holder">
              <div>
                <span className="wallet-card-physical__holder-label">
                  {t("Chá»§ tháº»")}
                </span>
                <b>{String(user?.name || user?.full_name || "Sinh viÃªn").trim().toLocaleUpperCase("vi-VN")}</b>
              </div>
              <div className="wallet-card-physical__holder-right">
                <span className="wallet-card-physical__holder-label">
                  {t("MSSV / MÃ£ tháº»")}
                </span>
                <b>
                  {(user?.student_code || user?.student_id || user?.mssv)
                    ? `â€¢â€¢â€¢â€¢ ${String(user.student_code || user.student_id || user.mssv).replace(/\D/g, "").slice(-4)}`
                    : t("ChÆ°a liÃªn káº¿t MSSV")}
                </b>
              </div>
            </div>

            <div className="wallet-card-physical__actions">
              <button
                className="wallet-card-physical__action wallet-card-physical__action--solid"
                onClick={() => setShowDeposit(true)}
              >
                <Plus size={16} />
                {t("Náº¡p tiá»n")}
              </button>
              <button
                className="wallet-card-physical__action wallet-card-physical__action--ghost"
                onClick={() => {
                  const el = document.getElementById("qr-pos-card");
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                <QrCode size={16} />
                {t("MÃ£ QR quáº§y")}
              </button>
            </div>
          </div>
        </div>

        {/* Card 2: Trá»£ giÃ¡ SV Ká»³ II */}
        <div className="wallet-subsidy-card">
          <div className="wallet-subsidy-card__head">
            <div>
              <span className="wallet-subsidy-card__tag">
                {t("Quá»¹ Há»c ÄÆ°á»ng")}
              </span>
              <h2>{t("Trá»£ GiÃ¡ Sinh ViÃªn Ká»³ II")}</h2>
              <p>{t("NÄƒm há»c 2024 - 2025")}</p>
            </div>
            <div className="wallet-subsidy-card__icon">
              <Wallet size={22} />
            </div>
          </div>

          <div className="wallet-subsidy-card__quota">
            <div className="wallet-subsidy-card__quota-row">
              <span>{t("Háº¡n má»©c trá»£ giÃ¡ cÃ²n láº¡i:")}</span>
              <b>{money(220000)}</b>
            </div>
            <div className="wallet-subsidy-card__quota-note">
              <Utensils size={14} />
              <span>
                {t("TÆ°Æ¡ng Ä‘Æ°Æ¡ng")} <b>22 {t("suáº¥t Äƒn")}</b>{" "}
                ({t("10.000Ä‘/suáº¥t há»c viá»‡n há»— trá»£")})
              </span>
            </div>
          </div>

          <div className="wallet-subsidy-card__progress">
            <div className="wallet-subsidy-card__progress-row">
              <span>
                {t("ÄÃ£ sá»­ dá»¥ng trong thÃ¡ng:")} <b>18/40 {t("suáº¥t")}</b>
              </span>
              <b>45%</b>
            </div>
            <div className="wallet-subsidy-card__bar">
              <div
                className="wallet-subsidy-card__fill"
                style={{ width: "45%" }}
              />
            </div>
          </div>

          <div className="wallet-subsidy-card__info">
            <Zap size={16} />
            <p>
              {t("Tá»± Ä‘á»™ng trá»«")}{" "}
              <b>10.000Ä‘</b>{" "}
              {t("cho má»—i pháº§n cÆ¡m trÆ°a/bÃºn phá»Ÿ tá»« 25.000Ä‘ trá»Ÿ lÃªn khi quÃ©t mÃ£ táº¡i quáº§y.")}
            </p>
          </div>

          <div className="wallet-subsidy-card__foot">
            <span>
              <RefreshCw size={14} />
              {t("Chu ká»³ lÃ m má»›i: 01/04/2025")}
            </span>
            <span className="wallet-subsidy-card__foot-link">
              {t("Tá»± Ä‘á»™ng cá»™ng láº¡i")}
            </span>
          </div>
        </div>

        {/* Card 3: VWA Green Points */}
        <div className="wallet-points-card">
          <div className="wallet-points-card__head">
            <div>
              <span className="wallet-points-card__tag">
                {t("Sinh ThÃ¡i Há»c ÄÆ°á»ng")}
              </span>
              <h2>{t("VWA Green Points")}</h2>
              <p>
                {t("TÃ­ch Ä‘iá»ƒm khi mang bÃ¬nh nÆ°á»›c / dÃ¹ng khay tÃ¡i cháº¿")}
              </p>
            </div>
            <div className="wallet-points-card__icon">
              <Sparkles size={22} />
            </div>
          </div>

          <div className="wallet-points-card__stats">
            <div className="wallet-points-card__stat">
              <span>{t("Äiá»ƒm tÃ­ch lÅ©y")}</span>
              <b>{stats.points || 350}</b>
              <small>{t("Äá»§ Ä‘á»•i 01 ly TrÃ  Sen")}</small>
            </div>
            <div className="wallet-points-card__stat">
              <span>{t("ÄÃ£ tiáº¿t kiá»‡m ká»³ nÃ y")}</span>
              <b>{money(580000)}</b>
              <small>{t("Nhá» trá»£ giÃ¡ & voucher")}</small>
            </div>
          </div>

          <div className="wallet-points-card__reward">
            <div className="wallet-points-card__reward-icon">
              <Coffee size={22} />
            </div>
            <div>
              <b>{t("Voucher Giáº£m 20.000Ä‘ Äá»“ Uá»‘ng")}</b>
              <small>{t("Quy Ä‘á»•i ngay vá»›i")} {ptsCfg?.redeem?.min_points || 100} {t("Green Points")}</small>
            </div>
          </div>

          <button
            className="wallet-points-card__cta"
            onClick={() => window.location.href = "/customer/promotions"}
          >
            <Plus size={16} />
            {t("Äá»•i Ä‘iá»ƒm nháº­n quÃ  & voucher Æ°u Ä‘Ã£i")}
          </button>
        </div>
      </section>

      {/* ============================================== */}
      {/* 3. ACTION CENTER (Top-up + QR)                  */}
      {/* ============================================== */}
      <section className="wallet-action-grid">
        {/* LEFT: Top-up */}
        <div className="wallet-topup" id="topup-container">
          <div className="wallet-topup__head">
            <div>
              <h2>
                <Plus size={22} />
                {t("Náº¡p tiá»n nhanh vÃ o VÃ­ (Instant Top-up)")}
              </h2>
              <p>
                {t("Tiá»n náº¡p vÃ o vÃ­ Ä‘Æ°á»£c Ã¡p dá»¥ng ngay láº­p tá»©c táº¡i toÃ n bá»™ quáº§y dá»‹ch vá»¥ Canteen VWA")}
              </p>
            </div>
            <span className="wallet-topup__free-badge">
              {t("Miá»…n phÃ­ 100%")}
            </span>
          </div>

          {/* Preset amounts */}
          <div className="wallet-topup__presets">
            <label>{t("Chá»n má»‡nh giÃ¡ náº¡p:")}</label>
            <div className="wallet-topup__preset-grid">
              {QUICK_DEPOSIT.map((a, i) => (
                <button
                  key={a}
                  type="button"
                  className={`wallet-preset-btn ${selectedTopupPreset === a ? "wallet-preset-btn--selected" : ""}`}
                  onClick={() => { setTopupAmount(a); setCustomTopupInput(""); setSelectedTopupPreset(a); setPendingTopupTx(null); }}
                >
                  <span>{a.toLocaleString("vi-VN")} Ä‘</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom amount */}
          <div className="wallet-topup__custom">
            <div className="wallet-topup__custom-wrap">
              <Wallet size={20} className="wallet-topup__custom-icon" />
              <input
                type="text"
                inputMode="numeric"
                value={customTopupInput}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  setCustomTopupInput(digits);
                  setSelectedTopupPreset(null);
                  setPendingTopupTx(null);
                  setTopupAmount(digits ? Number(digits) : 0);
                }}
                placeholder={t("Hoáº·c nháº­p sá»‘ tiá»n tÃ¹y Ã½ (tá»‘i thiá»ƒu 10.000Ä‘)")}
                className="wallet-topup__custom-input"
              />
              <span className="wallet-topup__custom-unit">VNÄ</span>
            </div>
          </div>

          {/* Method preview */}
          <div className="wallet-topup__method">
            <label>{t("PhÆ°Æ¡ng thá»©c náº¡p tiá»n:")}</label>

            <div
              className="wallet-topup__method-options"
              role="radiogroup"
              aria-label={t("PhÆ°Æ¡ng thá»©c náº¡p tiá»n")}
            >
              {/* CASH FIRST */}
              <button
                type="button"
                role="radio"
                aria-checked={topupMethod === "CASH"}
                className={`wallet-topup__method-card ${topupMethod === "CASH" ? "wallet-topup__method-card--active" : ""}`}
                onClick={() => handleSelectTopupMethod("CASH")}
              >
                <div className="wallet-topup__method-left">
                  <div className={`wallet-topup__method-radio ${topupMethod === "CASH" ? "wallet-topup__method-radio--selected" : ""}`} />
                  <div className="wallet-topup__method-icon">
                    <Banknote size={20} />
                  </div>
                  <div>
                    <div className="wallet-topup__method-name">
                      {t("Thanh toÃ¡n tiá»n máº·t táº¡i quáº§y")}
                    </div>
                    <div className="wallet-topup__method-desc">
                      {t("Ná»™p tiá»n trá»±c tiáº¿p cho nhÃ¢n viÃªn. VÃ­ chá»‰ Ä‘Æ°á»£c cá»™ng sau khi xÃ¡c nháº­n.")}
                    </div>
                  </div>
                </div>
                <Banknote size={18} style={{ color: topupMethod === "CASH" ? "var(--c-primary)" : "var(--c-text-light)" }} />
              </button>

              {/* VIETQR SECOND */}
              <button
                type="button"
                role="radio"
                aria-checked={topupMethod === "QR"}
                className={`wallet-topup__method-card ${topupMethod === "QR" ? "wallet-topup__method-card--active" : ""}`}
                onClick={() => handleSelectTopupMethod("QR")}
              >
                <div className="wallet-topup__method-left">
                  <div className={`wallet-topup__method-radio ${topupMethod === "QR" ? "wallet-topup__method-radio--selected" : ""}`} />
                  <div className="wallet-topup__method-icon">
                    <QrCode size={20} />
                  </div>
                  <div>
                    <div className="wallet-topup__method-name">
                      {t("Chuyá»ƒn khoáº£n VietQR PRO 24/7")}
                      <span className="wallet-topup__method-recommend">
                        {t("KhuyÃªn dÃ¹ng")}
                      </span>
                    </div>
                    <div className="wallet-topup__method-desc">
                      {t("Cá»™ng tiá»n sau khi xÃ¡c nháº­n giao dá»‹ch VietQR.")}
                    </div>
                  </div>
                </div>
                <Zap size={18} style={{ color: topupMethod === "QR" ? "var(--c-primary)" : "var(--c-text-light)" }} />
              </button>
            </div>
          </div>
          {topupMethod === "QR" &&
            (topupSubmitting ||
              (pendingTopupTx?.code &&
               Number(pendingTopupTx.amount) === Number(topupAmount))) && (
              <div className="wallet-topup__qr-inline">
                {topupSubmitting ? (
                  <div className="wallet-topup__qr-inline-loading">
                    <Loader2 size={22} className="checkout-spin" />
                    <span>{t("Äang táº¡o mÃ£ QR thanh toÃ¡n...")}</span>
                  </div>
                ) : (
                  <>
                    <div className="wallet-topup__qr-inline-head">
                      <div>
                        <b>{t("QuÃ©t mÃ£ VietQR Ä‘á»ƒ náº¡p vÃ o vÃ­")}</b>
                        <p>{t("Sá»­ dá»¥ng á»©ng dá»¥ng ngÃ¢n hÃ ng Ä‘á»ƒ quÃ©t mÃ£ bÃªn dÆ°á»›i.")}</p>
                      </div>
                      <strong>{money(pendingTopupTx.amount)}</strong>
                    </div>

                    {settings?.account ? (
                      <img
                        className="wallet-topup__qr-inline-image"
                        src={`https://img.vietqr.io/image/${settings?.bank || "VCB"}-${settings.account}-compact2.png?amount=${pendingTopupTx.amount}&addInfo=${encodeURIComponent(pendingTopupTx.code)}&accountName=${encodeURIComponent(settings?.accountName || "CANTEEN VWA")}`}
                        alt={t("MÃ£ QR náº¡p tiá»n VietQR")}
                      />
                    ) : (
                      <div className="wallet-topup__qr-inline-warning">
                        {t("ChÆ°a cáº¥u hÃ¬nh tÃ i khoáº£n ngÃ¢n hÃ ng nháº­n tiá»n.")}
                      </div>
                    )}

                    <div className="wallet-topup__qr-inline-code">
                      <span>{t("Ná»™i dung chuyá»ƒn khoáº£n")}</span>
                      <code>{pendingTopupTx.code}</code>
                    </div>

                    <button
                  type="button"
                  className="wallet-topup__qr-save"
                  onClick={async () => {
                    const qrImage = document.querySelector(".wallet-topup__qr-inline-image");

                    if (!qrImage?.src) {
                      toast(t("KhÃ´ng tÃ¬m tháº¥y mÃ£ QR Ä‘á»ƒ lÆ°u."), "error");
                      return;
                    }

                    const safeCode = String(pendingTopupTx?.code || "CanteenVWA")
                      .replace(/[^a-zA-Z0-9_-]/g, "_");

                    try {
                      const response = await fetch(qrImage.src, {
                        mode: "cors",
                        cache: "no-store",
                      });

                      if (!response.ok) {
                        throw new Error("Khong tai duoc anh QR.");
                      }

                      const blob = await response.blob();

                      if (!blob.size) {
                        throw new Error("Anh QR rong.");
                      }

                      const objectUrl = URL.createObjectURL(blob);
                      const link = document.createElement("a");

                      link.href = objectUrl;
                      link.download = "VietQR-nap-tien-" + safeCode + ".png";
                      document.body.appendChild(link);
                      link.click();
                      link.remove();

                      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);

                      toast(t("LÆ°u thÃ nh cÃ´ng!"), "success");
                    } catch (error) {
                      const fallbackLink = document.createElement("a");
                      fallbackLink.href = qrImage.src;
                      fallbackLink.target = "_blank";
                      fallbackLink.rel = "noopener noreferrer";
                      document.body.appendChild(fallbackLink);
                      fallbackLink.click();
                      fallbackLink.remove();

                      toast(
                        t("TrÃ¬nh duyá»‡t khÃ´ng cho táº£i trá»±c tiáº¿p. MÃ£ QR Ä‘Ã£ má»Ÿ á»Ÿ tab má»›i; hÃ£y nháº¥p pháº£i áº£nh vÃ  chá»n LÆ°u hÃ¬nh áº£nh thÃ nh."),
                        "info"
                      );
                    }
                  }}
                >
                  <span aria-hidden="true">â†“</span>
                  {t("LÆ°u")}
                </button>
                  </>
                )}
              </div>
            )}
          {/* CTA */}
          <button
            className="wallet-topup__cta"
            onClick={handleDirectTopup}
            disabled={topupSubmitting}
          >
            {topupMethod === "CASH" ? <Banknote size={16} /> : <Lock size={16} />}
            {topupSubmitting
              ? t("Äang táº¡o yÃªu cáº§u...")
              : topupMethod === "CASH"
                ? t("XÃ¡c nháº­n náº¡p tiá»n máº·t táº¡i quáº§y")
                : t("XÃ¡c nháº­n chuyá»ƒn khoáº£n / Náº¡p tiá»n")}
          </button>
          <p className="wallet-topup__secure">
            <Shield size={14} />
            {t("Báº£o máº­t SSL 256-bit qua Cá»•ng thanh toÃ¡n Quá»‘c gia Napas & SSO Há»c viá»‡n")}
          </p>
        </div>

        {/* RIGHT: QR POS */}
        <div className="wallet-qr-pos" id="qr-pos-card">
          <div className="wallet-qr-pos__head">
            <div className="wallet-qr-pos__eyebrow">
              <QrCode size={14} />
              {t("MÃƒ THANH TOÃN Táº I QUáº¦Y CANTEEN")}
            </div>
            <h2>{t("Dynamic QR Code 1-Cháº¡m")}</h2>
            <p>
              {t("ÄÆ°a mÃ£ vÃ o Ä‘áº§u Ä‘á»c táº¡i Quáº§y 01, Quáº§y 02 hoáº·c Quáº§y nÆ°á»›c")}
            </p>
          </div>

          <div className="wallet-qr-pos__box">
            <div className="wallet-qr-pos__status">
              <span className="wallet-qr-pos__status-live">
                <span className="wallet-qr-pos__dot" />
                {t("Äang hoáº¡t Ä‘á»™ng")}
              </span>
              <span className="wallet-qr-pos__timer">
                <Clock size={12} />
                {t("Tá»± lÃ m má»›i sau:")} <b>{qrTimer}s</b>
              </span>
            </div>

            {/* QR visual */}
            <div className="wallet-qr-pos__qr-wrap">
              <svg
                className="wallet-qr-pos__qr"
                viewBox="0 0 200 200"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Corner finders */}
                <rect fill="#131b2e" height="50" rx="8" width="50" x="10" y="10" />
                <rect fill="#fff" height="30" rx="4" width="30" x="20" y="20" />
                <rect fill="#004ac6" height="16" rx="2" width="16" x="27" y="27" />

                <rect fill="#131b2e" height="50" rx="8" width="50" x="140" y="10" />
                <rect fill="#fff" height="30" rx="4" width="30" x="150" y="20" />
                <rect fill="#004ac6" height="16" rx="2" width="16" x="157" y="27" />

                <rect fill="#131b2e" height="50" rx="8" width="50" x="10" y="140" />
                <rect fill="#fff" height="30" rx="4" width="30" x="20" y="150" />
                <rect fill="#004ac6" height="16" rx="2" width="16" x="27" y="157" />

                {/* Data modules */}
                {[
                  [70, 15], [90, 15], [110, 15], [70, 35], [110, 35],
                  [15, 70], [35, 70], [55, 70], [75, 70], [95, 70], [115, 70], [135, 70], [155, 70], [175, 70],
                  [15, 90], [35, 90], [55, 90], [135, 90], [155, 90], [175, 90],
                  [15, 110], [55, 110], [135, 110], [175, 110],
                  [70, 135], [90, 135], [110, 135], [135, 135], [155, 135],
                  [70, 155], [90, 155], [110, 155], [155, 155], [175, 155],
                  [70, 175], [110, 175], [135, 175], [155, 175],
                ].map(([x, y], i) => (
                  <rect
                    key={i}
                    fill={i % 3 === 0 ? "#004ac6" : "#131b2e"}
                    height="12"
                    rx="2"
                    width="12"
                    x={x}
                    y={y}
                  />
                ))}

                {/* Center VWA */}
                <rect fill="#004ac6" height="50" rx="12" width="50" x="75" y="75" />
                <text
                  fill="#fff"
                  fontFamily="'Plus Jakarta Sans', sans-serif"
                  fontSize="14"
                  fontWeight="700"
                  textAnchor="middle"
                  x="100"
                  y="105"
                >
                  VWA
                </text>
              </svg>
            </div>

            {/* Backup PIN */}
            <div className="wallet-qr-pos__pin">
              <span className="wallet-qr-pos__pin-label">
                {t("MÃ£ PIN dá»± phÃ²ng náº¿u camera quáº§y lá»—i:")}
              </span>
              <div className="wallet-qr-pos__pin-value">8826 - 4921</div>
            </div>
          </div>

          {/* Auto subsidy toggle */}
          <div className="wallet-qr-pos__controls">
            <label className="wallet-qr-pos__toggle">
              <div className="wallet-qr-pos__toggle-left">
                <Sparkles size={18} />
                <div>
                  <b>{t("Tá»± Ä‘á»™ng Ã¡p dá»¥ng Trá»£ giÃ¡ SV")}</b>
                  <span>{t("Trá»« ngay 10.000Ä‘ khi Ä‘á»§ Ä‘iá»u kiá»‡n Ä‘Æ¡n")}</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={autoSubsidy}
                onChange={(e) => setAutoSubsidy(e.target.checked)}
              />
            </label>

            <button
              className="wallet-qr-pos__refresh"
              onClick={() => setQrTimer(60)}
            >
              <RefreshCw size={16} />
              {t("LÃ m má»›i mÃ£ thanh toÃ¡n ngay")}
            </button>
          </div>
        </div>
      </section>

      {/* ============================================== */}
      {/* 4. TRANSACTION HISTORY                          */}
      {/* ============================================== */}
      <section className="wallet-history">
        <div className="wallet-history__head">
          <div>
            <h2>
              <History size={22} />
              {t("Lá»‹ch sá»­ giao dá»‹ch & Biáº¿n Ä‘á»™ng sá»‘ dÆ°")}
            </h2>
            <p>
              {t("Tra cá»©u chi tiáº¿t cÃ¡c láº§n thanh toÃ¡n, náº¡p tiá»n vÃ  tiá»n trá»£ giÃ¡ há»c viá»‡n")}
            </p>
          </div>
          <button className="wallet-history__export">
            <Download size={16} />
            {t("Táº£i sao kÃª PDF / Excel")}
          </button>
        </div>

        <div className="wallet-history__filters">
          <div className="wallet-history__tabs">
            {TABS.map((tItem) => (
              <button
                key={tItem.id}
                className={`wallet-history__tab ${
                  tab === tItem.id ? "active" : ""
                }`}
                onClick={() => setTab(tItem.id)}
              >
                {tItem.label}
              </button>
            ))}
          </div>

          <div className="wallet-history__search">
            <Search size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("TÃ¬m theo mÃ£ Ä‘Æ¡n, quáº§y...")}
            />
          </div>
        </div>

        {/* List */}
        {loading && (
          <div className="wallet-history__skeleton">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonList key={i} />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="wallet-history__empty">
            <Wallet size={40} />
            <b>{t("ChÆ°a cÃ³ giao dá»‹ch nÃ o")}</b>
            <p>
              {tab === "all"
                ? t("Báº¯t Ä‘áº§u náº¡p tiá»n hoáº·c Ä‘áº·t mÃ³n Ä‘á»ƒ cÃ³ giao dá»‹ch Ä‘áº§u tiÃªn.")
                : t("KhÃ´ng cÃ³ giao dá»‹ch loáº¡i nÃ y.")}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="wallet-history__list">
            {filtered.slice(0, visibleTx).map((tx) => (
              <WalletTransactionRow
                key={tx.id}
                tx={tx}
                TX_CONFIG={TX_CONFIG}
                STATUS_CONFIG={STATUS_CONFIG}
                t={t}
              />
            ))}
          </div>
        )}

        {!loading && filtered.length > visibleTx && (
          <div className="wallet-history__more">
            <span>
              {t("Hiá»ƒn thá»‹")} {Math.min(visibleTx, filtered.length)}{" "}
              {t("trÃªn tá»•ng sá»‘")} {filtered.length} {t("giao dá»‹ch")}
            </span>
            <button
              type="button"
              onClick={() => setVisibleTx((n) => n + 8)}
            >
              {t("Xem thÃªm lá»‹ch sá»­ cÅ© hÆ¡n")}
            </button>
          </div>
        )}
      </section>

      {/* ============================================== */}
      {/* 5. SECURITY BANNER                              */}
      {/* ============================================== */}
      <section className="wallet-security">
        <div className="wallet-security__left">
          <div className="wallet-security__icon">
            <Shield size={26} />
          </div>
          <div>
            <h3>{t("TiÃªu chuáº©n An toÃ n & Báº£o máº­t Há»c Ä‘Æ°á»ng")}</h3>
            <p>
              {t("Chá»©ng chá»‰ báº£o máº­t thanh toÃ¡n tiÃªu chuáº©n quá»‘c táº¿ PCI-DSS Level 1. Há»‡ thá»‘ng tÃ­ch há»£p xÃ¡c thá»±c SSO an toÃ n cÃ¹ng cÆ¡ cháº¿ tá»± khÃ³a sá»‘ dÆ° khi máº¥t tháº» sinh viÃªn.")}
            </p>
          </div>
        </div>
        <div className="wallet-security__actions">
          <button className="wallet-security__btn wallet-security__btn--ghost">
            <Lock size={16} />
            {t("KhÃ³a tháº» kháº©n cáº¥p")}
          </button>
          <button
            type="button"
            className="wallet-security__btn wallet-security__btn--primary"
            onClick={() => {
              window.location.href = "tel:19006868";
            }}
          >
            <Headset size={16} />
            {t("Hotline: 1900 6868")}
          </button>
        </div>
      </section>

      {/* ============================================== */}
      {/* MODALS (GIá»® NGUYÃŠN)                             */}
      {/* ============================================== */}
      {showDeposit && (
        <DepositModal
          settings={settings}
          initialMethod={topupMethod}
          initialAmount={topupAmount}
          initialStep={pendingTopupTx ? 2 : 1}
          initialTx={pendingTopupTx}
          onClose={() => {
            setShowDeposit(false);
            setPendingTopupTx(null);
          }}
          onSuccess={handleSuccessModal}
        />
      )}
      {showWithdraw && (
        <WithdrawModal
          balance={wallet.balance}
          bank={{
            name: wallet.bank_name,
            account: wallet.bank_account,
            accountName: wallet.bank_account_name,
          }}
          onClose={() => setShowWithdraw(false)}
          onSuccess={handleSuccessModal}
        />
      )}
      {showLinkBank && (
        <LinkBankModal
          wallet={wallet}
          onClose={() => setShowLinkBank(false)}
          onSuccess={handleSuccessModal}
        />
      )}

      <style>{`
        @keyframes wallet-spin-anim {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .wallet-spin { animation: wallet-spin-anim 1s linear infinite; }
      `}</style>
    </div>
  );
}

// ============================================================
// SUB: WalletTransactionRow
// ============================================================

function WalletTransactionRow({ tx, TX_CONFIG, STATUS_CONFIG, t }) {
  const config = TX_CONFIG[tx.type] || {
    icon: Wallet,
    color: "#2563EB",
    bg: "#EFF6FF",
    label: "â€”",
    sign: "",
  };
  const statusCfg = STATUS_CONFIG[tx.status] || {
    label: "â€”",
    color: "#64748b",
    bg: "#f1f5f9",
  };
  const Icon = config.icon;
  const isDeposit = tx.type === "deposit";

  return (
    <div className="wallet-tx-row">
      <div className="wallet-tx-row__left">
        <div
          className="wallet-tx-row__icon"
          style={{
            background: isDeposit ? "rgba(37, 99, 235, 0.1)" : "var(--c-surface-low)",
            color: isDeposit ? "#2563EB" : "#434655",
          }}
        >
          <Icon size={20} />
        </div>
        <div className="wallet-tx-row__info">
          <div className="wallet-tx-row__title-row">
            <b className="wallet-tx-row__title">
              {config.label} {tx.code && `#${tx.code}`}
            </b>
            {tx.counter && (
              <span className="wallet-tx-row__counter">{tx.counter}</span>
            )}
          </div>
          <p className="wallet-tx-row__desc">
            {tx.note || tx.description || config.label}
            {tx.created_at && ` â€¢ ${fmtDateTime(tx.created_at)}`}
          </p>
          {tx.discount > 0 && (
            <span className="wallet-tx-row__subsidy">
              <Sparkles size={12} />
              {t("ÄÃ£ trá»« trá»£ giÃ¡ SV:")} -{money(tx.discount)}
            </span>
          )}
        </div>
      </div>

      <div className="wallet-tx-row__right">
        <div
          className={`wallet-tx-row__amount ${
            isDeposit ? "wallet-tx-row__amount--plus" : ""
          }`}
        >
          {config.sign}
          {money(tx.amount || 0).replace("Ä‘", "")}{" "}
          <span className="wallet-tx-row__amount-unit">Ä‘</span>
        </div>
        {tx.balance_after !== undefined && (
          <div className="wallet-tx-row__balance">
            {t("Sá»‘ dÆ° cuá»‘i:")} {money(tx.balance_after)}
          </div>
        )}
        <span
          className="wallet-tx-row__status"
          style={{ background: statusCfg.bg, color: statusCfg.color }}
        >
          {tx.status === "approved" && <CheckCircle2 size={12} />}
          {statusCfg.label}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// MODAL WRAPPER (GIá»® NGUYÃŠN)
// ============================================================

function Modal({ children, onClose, busy = false, maxWidth = 460, label }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [busy, onClose]);

  return (
    <div
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="wallet-modal-overlay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="wallet-modal"
        style={{ maxWidth }}
      >
        {children}
      </div>
    </div>
  );
}

// ============================================================
// DEPOSIT MODAL (GIá»® NGUYÃŠN logic, Ä‘á»•i UI nháº¹)
// ============================================================

function DepositModal({ settings, onClose, onSuccess, initialMethod = "QR", initialAmount = 100000, initialStep = 1, initialTx = null }) {
  const { t } = useI18n();
  const [step, setStep] = useState(initialStep);
  const [amount, setAmount] = useState(initialAmount);
  const [method, setMethod] = useState(initialMethod === "CASH" ? "CASH" : "QR");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tx, setTx] = useState(initialTx || null);

  const busy = submitting;

  const submit = async () => {
    if (submitting) return;
    if (amount < MIN_DEPOSIT) {
      toast(
        t("Sá»‘ tiá»n náº¡p tá»‘i thiá»ƒu {value}").replace("{value}", money(MIN_DEPOSIT)),
        "error"
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.wallet.deposit({ amount, method, note });
      setTx(res.transaction);
      toast(t("ÄÃ£ táº¡o yÃªu cáº§u náº¡p tiá»n"), "success");

      if (method === "CASH") {
        onSuccess();
      } else {
        setStep(2);
      }
    } catch (e) {
      toast(e.message || t("KhÃ´ng táº¡o Ä‘Æ°á»£c yÃªu cáº§u náº¡p"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  // STEP 2: QR
  if (step === 2 && tx && method === "QR") {
    const bankCode = settings?.bank || "VCB";
    const bankAccount = settings?.account || "";
    const bankName = settings?.accountName || "CANTEEN VWA";

    const qrUrl = bankAccount
      ? `https://img.vietqr.io/image/${bankCode}-${bankAccount}-compact2.png?amount=${tx.amount}&addInfo=${encodeURIComponent(tx.code)}&accountName=${encodeURIComponent(bankName)}`
      : null;

    return (
      <Modal onClose={onClose} busy={busy} label={t("Náº¡p tiá»n qua VietQR")}>
        <div className="wallet-modal__head">
          <h3>{t("Náº¡p tiá»n qua VietQR")}</h3>
          <button onClick={onClose} disabled={busy}>
            <X size={20} />
          </button>
        </div>

        <div className="wallet-qr-modal">
          <div className="wallet-qr-modal__icon-wrap">
            <QrCode size={28} />
          </div>
          <p className="wallet-qr-modal__desc">
            {t("QuÃ©t mÃ£ QR Ä‘á»ƒ chuyá»ƒn {amount} cho Ä‘Æ¡n {code}")
              .replace("{amount}", money(tx.amount))
              .replace("{code}", tx.code)}
          </p>

          {qrUrl ? (
            <div className="wallet-qr-modal__img-wrap">
              <img
                src={qrUrl}
                alt="QR"
                onError={(e) => {
                  e.target.style.display = "none";
                }}
              />
            </div>
          ) : (
            <div className="wallet-qr-modal__warning">
              {t("ChÆ°a cáº¥u hÃ¬nh tÃ i khoáº£n nháº­n tiá»n")}
            </div>
          )}

          <div className="wallet-qr-modal__note">
            <AlertTriangle size={16} />
            <span>
              {t("Vui lÃ²ng chuyá»ƒn Ä‘Ãºng sá»‘ tiá»n vÃ  ná»™i dung. YÃªu cáº§u sáº½ Ä‘Æ°á»£c admin duyá»‡t trong vÃ i phÃºt.")}
            </span>
          </div>

          <button className="wallet-modal__primary" onClick={onSuccess}>
            {t("ÄÃ£ hiá»ƒu")}
          </button>
        </div>
      </Modal>
    );
  }

  // STEP 1: Form
  return (
    <Modal onClose={onClose} busy={busy} label={t("Náº¡p tiá»n")}>
      <div className="wallet-modal__head">
        <h3>
          <Plus size={20} style={{ color: "#18a967" }} />
          {t("Náº¡p tiá»n")}
        </h3>
        <button onClick={onClose} disabled={busy}>
          <X size={20} />
        </button>
      </div>

      <label className="wallet-modal__label">{t("Sá»‘ tiá»n")} *</label>
      <div className="wallet-modal__input-wrap">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(+e.target.value)}
          min={MIN_DEPOSIT}
          step={1000}
          disabled={busy}
          className="wallet-modal__input wallet-modal__input--amount"
        />
        <span className="wallet-modal__input-suffix">Ä‘</span>
      </div>

      <div className="wallet-modal__quick">
        {QUICK_DEPOSIT.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAmount(a)}
            disabled={busy}
            className={`wallet-modal__quick-btn ${
              amount === a ? "active" : ""
            }`}
          >
            {a.toLocaleString("vi-VN")}Ä‘
          </button>
        ))}
      </div>

      <label className="wallet-modal__label">{t("PhÆ°Æ¡ng thá»©c náº¡p")}</label>
      <div className="wallet-modal__method-summary">
        <div className="wallet-modal__method-summary-icon">
          {method === "QR" ? <QrCode size={22} /> : <Banknote size={22} />}
        </div>
        <div className="wallet-modal__method-summary-content">
          <b>
            {method === "QR"
              ? t("Chuyá»ƒn khoáº£n VietQR PRO 24/7")
              : t("Thanh toÃ¡n tiá»n máº·t táº¡i quáº§y")}
          </b>
          <span>
            {method === "QR"
              ? t("QuÃ©t mÃ£ vÃ  thá»±c hiá»‡n chuyá»ƒn khoáº£n theo hÆ°á»›ng dáº«n.")
              : t("Ná»™p tiá»n trá»±c tiáº¿p cho nhÃ¢n viÃªn. YÃªu cáº§u sáº½ chá» xÃ¡c nháº­n.")}
          </span>
        </div>
      </div>
      <label className="wallet-modal__label">{t("Ghi chÃº")}</label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("Ghi chÃº thÃªm (khÃ´ng báº¯t buá»™c)")}
        maxLength={200}
        disabled={busy}
        className="wallet-modal__input"
      />

      <div className="wallet-modal__actions">
        <button onClick={onClose} disabled={busy} className="wallet-modal__btn wallet-modal__btn--ghost">
          {t("Há»§y")}
        </button>
        <button
          onClick={submit}
          disabled={busy || amount < MIN_DEPOSIT}
          className="wallet-modal__btn wallet-modal__btn--primary"
        >
          {submitting ? (
            <>
              <Loader2 size={14} className="wallet-spin" />
              {t("Äang xá»­ lÃ½...")}
            </>
          ) : (
            `${t("Náº¡p tiá»n")} ${amount.toLocaleString("vi-VN")}Ä‘`
          )}
        </button>
      </div>
    </Modal>
  );
}

// ============================================================
// WITHDRAW MODAL (GIá»® NGUYÃŠN logic)
// ============================================================

function WithdrawModal({ balance, bank, onClose, onSuccess }) {
  const { t } = useI18n();
  const [amount, setAmount] = useState(50000);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const busy = submitting;

  const submit = async () => {
    if (submitting) return;
    if (amount < MIN_WITHDRAW) {
      toast(
        t("Sá»‘ tiá»n rÃºt tá»‘i thiá»ƒu {value}").replace("{value}", money(MIN_WITHDRAW)),
        "error"
      );
      return;
    }
    if (amount > balance) {
      toast(t("Sá»‘ dÆ° khÃ´ng Ä‘á»§"), "error");
      return;
    }

    setSubmitting(true);
    try {
      await api.wallet.withdraw({ amount, note });
      toast(t("ÄÃ£ gá»­i yÃªu cáº§u rÃºt tiá»n"), "success");
      onSuccess();
    } catch (e) {
      toast(e.message || t("KhÃ´ng gá»­i Ä‘Æ°á»£c yÃªu cáº§u rÃºt"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} busy={busy} label={t("RÃºt tiá»n")}>
      <div className="wallet-modal__head">
        <h3>
          <Minus size={20} style={{ color: "#f59e0b" }} />
          {t("RÃºt tiá»n")}
        </h3>
        <button onClick={onClose} disabled={busy}>
          <X size={20} />
        </button>
      </div>

      <div className="wallet-modal__info">
        <b>{t("Sá»‘ dÆ° kháº£ dá»¥ng")}:</b> {money(balance)}
      </div>

      <label className="wallet-modal__label">{t("Sá»‘ tiá»n")} *</label>
      <div className="wallet-modal__input-wrap">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(+e.target.value)}
          min={MIN_WITHDRAW}
          max={balance}
          step={1000}
          disabled={busy}
          className="wallet-modal__input wallet-modal__input--amount"
        />
        <span className="wallet-modal__input-suffix">Ä‘</span>
      </div>

      <div className="wallet-modal__quick">
        {QUICK_WITHDRAW.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAmount(a)}
            disabled={busy || a > balance}
            className={`wallet-modal__quick-btn ${
              amount === a ? "active" : ""
            }`}
          >
            {a.toLocaleString("vi-VN")}Ä‘
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setAmount(balance)}
        disabled={busy}
        className="wallet-modal__all-btn"
      >
        {t("RÃºt toÃ n bá»™")} {money(balance)}
      </button>

      <label className="wallet-modal__label">{t("TÃ i khoáº£n nháº­n tiá»n")}</label>
      <div className="wallet-modal__bank-info">
        <div className="wallet-modal__bank-row">
          <Building2 size={14} />
          <b>{bank.name}</b>
        </div>
        <div className="wallet-modal__bank-acc">
          {bank.account} Â· {bank.accountName}
        </div>
      </div>

      <label className="wallet-modal__label">{t("Ghi chÃº")}</label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("Ghi chÃº thÃªm (khÃ´ng báº¯t buá»™c)")}
        maxLength={200}
        disabled={busy}
        className="wallet-modal__input"
      />

      <div className="wallet-modal__actions">
        <button onClick={onClose} disabled={busy} className="wallet-modal__btn wallet-modal__btn--ghost">
          {t("Há»§y")}
        </button>
        <button
          onClick={submit}
          disabled={busy || amount < MIN_WITHDRAW || amount > balance}
          className="wallet-modal__btn wallet-modal__btn--primary"
        >
          {submitting ? (
            <>
              <Loader2 size={14} className="wallet-spin" />
              {t("Äang xá»­ lÃ½...")}
            </>
          ) : (
            t("Gá»­i yÃªu cáº§u rÃºt tiá»n")
          )}
        </button>
      </div>
    </Modal>
  );
}

// ============================================================
// LINK BANK MODAL (GIá»® NGUYÃŠN logic)
// ============================================================

function LinkBankModal({ wallet, onClose, onSuccess }) {
  const { t } = useI18n();
  const [bankName, setBankName] = useState(wallet.bank_name || "VCB");
  const [account, setAccount] = useState(wallet.bank_account || "");
  const [accountName, setAccountName] = useState(wallet.bank_account_name || "");
  const [submitting, setSubmitting] = useState(false);

  const busy = submitting;

  const submit = async () => {
    if (submitting) return;
    if (!account.trim() || account.trim().length < 6) {
      toast(t("Sá»‘ tÃ i khoáº£n khÃ´ng há»£p lá»‡"), "error");
      return;
    }
    if (!accountName.trim()) {
      toast(t("Vui lÃ²ng nháº­p tÃªn chá»§ tÃ i khoáº£n"), "error");
      return;
    }

    setSubmitting(true);
    try {
      await api.wallet.linkBank({
        bank_name: bankName,
        bank_account: account.trim(),
        bank_account_name: accountName.trim().toUpperCase(),
      });
      toast(t("ÄÃ£ liÃªn káº¿t ngÃ¢n hÃ ng"), "success");
      onSuccess();
    } catch (e) {
      toast(e.message || t("KhÃ´ng liÃªn káº¿t Ä‘Æ°á»£c ngÃ¢n hÃ ng"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} busy={busy} label={t("LiÃªn káº¿t ngÃ¢n hÃ ng")}>
      <div className="wallet-modal__head">
        <h3>
          <CreditCard size={20} style={{ color: "#2563EB" }} />
          {t("LiÃªn káº¿t ngÃ¢n hÃ ng")}
        </h3>
        <button onClick={onClose} disabled={busy}>
          <X size={20} />
        </button>
      </div>

      <div className="wallet-modal__note">
        <AlertTriangle size={16} />
        <span>
          {t("TÃ i khoáº£n nÃ y sáº½ dÃ¹ng Ä‘á»ƒ nháº­n tiá»n khi báº¡n rÃºt tá»« VÃ­ Canteen. HÃ£y kiá»ƒm tra ká»¹ trÆ°á»›c khi lÆ°u.")}
        </span>
      </div>

      <label className="wallet-modal__label">{t("NgÃ¢n hÃ ng")} *</label>
      <select
        value={bankName}
        onChange={(e) => setBankName(e.target.value)}
        disabled={busy}
        className="wallet-modal__select"
      >
        {BANKS.map((b) => (
          <option key={b.code} value={b.code}>
            {b.name} ({b.code})
          </option>
        ))}
      </select>

      <label className="wallet-modal__label">{t("Sá»‘ tÃ i khoáº£n")} *</label>
      <input
        value={account}
        onChange={(e) => setAccount(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder="1234567890"
        inputMode="numeric"
        maxLength={20}
        disabled={busy}
        className="wallet-modal__input wallet-modal__input--mono"
      />

      <label className="wallet-modal__label">{t("TÃªn chá»§ tÃ i khoáº£n")} *</label>
      <input
        value={accountName}
        onChange={(e) => setAccountName(e.target.value)}
        onBlur={() => setAccountName((s) => s.toUpperCase().trim())}
        placeholder="NGUYEN VAN A"
        maxLength={100}
        disabled={busy}
        className="wallet-modal__input"
      />

      <div className="wallet-modal__actions">
        <button onClick={onClose} disabled={busy} className="wallet-modal__btn wallet-modal__btn--ghost">
          {t("Há»§y")}
        </button>
        <button
          onClick={submit}
          disabled={
            busy || !account.trim() || !accountName.trim() || account.length < 6
          }
          className="wallet-modal__btn wallet-modal__btn--primary"
        >
          {submitting ? (
            <>
              <Loader2 size={14} className="wallet-spin" />
              {t("Äang lÆ°u...")}
            </>
          ) : (
            t("LÆ°u tÃ i khoáº£n")
          )}
        </button>
      </div>
    </Modal>
  );
}
// ============================================================
// CUSTOMERWALLET.JSX — Ví Canteen VWA Pay (V2 - design mới)
// ============================================================
// ✅ GIỮ NGUYÊN: logic, state, hooks, API calls, i18n
//  THAY ĐỔI: cấu trúc JSX render theo design mới
// ============================================================

import {Skeleton, SkeletonList, SkeletonStats } from "../../components/Skeleton";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Wallet, Plus, Minus, Link as LinkIcon, CreditCard, QrCode, Banknote, Clock, CheckCircle2, ArrowDownCircle, ArrowUpCircle, ShoppingBag, X, Building2, History, AlertTriangle, Loader2, AlertCircle, RefreshCw, Home, ChevronRight, BadgeCheck, Shield, Zap, Utensils, ArrowDown, ArrowUp, RotateCcw, Download, Lock, Headset, Search, Coffee, Soup, Store, Sandwich, Sparkles, Eye, EyeOff } from "lucide-react";
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
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN");
  } catch {
    return "—";
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
  const [showSensitiveInfo, setShowSensitiveInfo] = useState(false);
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

  // QR countdown (design có auto-refresh)
  const [qrTimer, setQrTimer] = useState(60);
  const [autoSubsidy, setAutoSubsidy] = useState(true);
  // Số giao dịch đang hiển thị (nút "Xem thêm lịch sử cũ hơn")
  const [visibleTx, setVisibleTx] = useState(8);

  const reqIdRef = useRef(0);
  const inFlightRef = useRef(false);

  // ---------- TX config (GIỮ NGUYÊN) ----------
  const TX_CONFIG = useMemo(
    () => ({
      deposit:  { icon: ArrowDownCircle, color: "#18a967", bg: "#e8f9f1", label: t("Nạp tiền"),    sign: "+" },
      withdraw: { icon: ArrowUpCircle,   color: "#f59e0b", bg: "#fef3c7", label: t("Rút tiền"),    sign: "−" },
      payment:  { icon: ShoppingBag,     color: "#8b5cf6", bg: "#ede9fe", label: t("Thanh toán"),  sign: "−" },
    }),
    [t]
  );

  const STATUS_CONFIG = useMemo(
    () => ({
      pending:  { label: t("Chờ duyệt"), color: "#f59e0b", bg: "#fef3c7" },
      approved: { label: t("Thành công"), color: "#18a967", bg: "#e8f9f1" },
      rejected: { label: t("Từ chối"),    color: "#ef4444", bg: "#fee2e2" },
    }),
    [t]
  );

  // ---------- Load (GIỮ NGUYÊN) ----------
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
        setError(e.message || t("Không tải được dữ liệu ví"));
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

  // ---------- Derived (GIỮ NGUYÊN) ----------
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
        t("Số tiền nạp tối thiểu {value}").replace("{value}", money(MIN_DEPOSIT)),
        "error"
      );
      return;
    }

    if (!Number.isInteger(requestedAmount)) {
      toast(t("Số tiền nạp phải là số nguyên hợp lệ."), "error");
      return;
    }

    if (
      topupMethod === "QR" &&
      pendingTopupTx?.code &&
      Number(pendingTopupTx.amount) === requestedAmount
    ) {
      toast(
        t("Chuyển khoản thành công. Đang chờ duyệt"),
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
        throw new Error(t("Không tạo được yêu cầu nạp tiền."));
      }

      if (topupMethod === "CASH") {
        setPendingTopupTx(null);
        toast(t("Đã tạo yêu cầu nạp tiền mặt. Vui lòng thanh toán tại quầy."), "success");
        await handleSuccessModal();
      } else {
        setPendingTopupTx(transaction);
        setShowDeposit(true);
        toast(t("Chuyển khoản thành công. Đang chờ duyệt"), "info");
      }
    } catch (error) {
      toast(error?.message || t("Không tạo được yêu cầu nạp"), "error");
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
        t("Số tiền nạp tối thiểu {value}").replace("{value}", money(MIN_DEPOSIT)),
        "error"
      );
      return;
    }

    if (!Number.isInteger(requestedAmount)) {
      toast(t("Số tiền nạp phải là số nguyên hợp lệ."), "error");
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
        throw new Error(t("Không tạo được yêu cầu nạp tiền."));
      }

      setPendingTopupTx(transaction);
      toast(t("Mã QR nạp tiền đã sẵn sàng."), "success");
    } catch (error) {
      toast(
        error?.message || t("Không tạo được yêu cầu nạp"),
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
    { id: "all",      label: t("Tất cả") },
    { id: "deposit",  label: t("Nạp tiền (+)") },
    { id: "payment",  label: t("Thanh toán món (−)") },
    { id: "withdraw", label: t("Trợ giá & Hoàn tiền") },
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
            <RefreshCw size={12} /> {t("Thử lại")}
          </button>
        </div>
      )}

      {/* ============================================== */}
      {/* 1. BREADCRUMB + HEADER                          */}
      {/* ============================================== */}
            {/* 1. HEADER */}
      <section className="wallet-header" style={{ display: 'none' }}>
      </section>

      {/* 2. CARD */}
      <section className="wallet-bento" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div className="vwa-card-final">
          <div className="vwa-card-final__bg"></div>
          
          <div className="vwa-card-final__top-right">
            <div className="vwa-card-final__logo">
              <Wallet size={18} />
              <b>VWA SMART PAY</b>
            </div>
          </div>

          <div className="vwa-card-final__center">
            <div className="vwa-card-final__title">
              <h2>VWA STUDENT CARD</h2>
              <p>by VWA & Canteen</p>
            </div>
          </div>

          <div className="vwa-card-final__bottom-info">
            <div className="vwa-card-final__balance">
              <span>SỐ DƯ KHẢ DỤNG</span>
              <b>
                {loading ? <Loader2 size={24} className="wallet-spin" /> : money(wallet.balance || 0)}
              </b>
            </div>

            <div className="vwa-card-final__holder">
              <div className="vwa-card-final__holder-item">
                <span>CHỦ THẺ</span>
                <b>{String(user?.name || user?.full_name || "CHUA C?P NH?T").trim().toLocaleUpperCase("vi-VN")}</b>
              </div>
              <div className="vwa-card-final__holder-item" style={{ textAlign: 'right' }}>
                <span>MÃ THẺ (MSSV)</span>
                <b>
                  {user?.student_code || user?.student_id || user?.mssv || "CHUA C?P NH?T"}
                </b>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="wallet-action-grid">
        {/* LEFT: Top-up */}
        <div className="wallet-topup" id="topup-container">
          <div className="wallet-topup__head">
            <div>
              <h2>
                <Plus size={22} />
                {t("Nạp tiền nhanh vào Ví (Instant Top-up)")}
              </h2>
              <p>
                {t("Tiền nạp vào ví được áp dụng ngay lập tức tại toàn bộ quầy dịch vụ Canteen VWA")}
              </p>
            </div>
            <span className="wallet-topup__free-badge">
              {t("Miễn phí 100%")}
            </span>
          </div>

          {/* Preset amounts */}
          <div className="wallet-topup__presets">
            <label>{t("Chọn mệnh giá nạp:")}</label>
            <div className="wallet-topup__preset-grid">
              {QUICK_DEPOSIT.map((a, i) => (
                <button
                  key={a}
                  type="button"
                  className={`wallet-preset-btn ${selectedTopupPreset === a ? "wallet-preset-btn--selected" : ""}`}
                  onClick={() => { setTopupAmount(a); setCustomTopupInput(""); setSelectedTopupPreset(a); setPendingTopupTx(null); }}
                >
                  <span>{a.toLocaleString("vi-VN")} đ</span>
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
                placeholder={t("Hoặc nhập số tiền tùy ý (tối thiểu 10.000đ)")}
                className="wallet-topup__custom-input"
              />
              <span className="wallet-topup__custom-unit">VNĐ</span>
            </div>
          </div>

          {/* Method preview */}
          <div className="wallet-topup__method">
            <label>{t("Phương thức nạp tiền:")}</label>

            <div
              className="wallet-topup__method-options"
              role="radiogroup"
              aria-label={t("Phương thức nạp tiền:")}
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
                      {t("Thanh toán tiền mặt tại quầy")}
                    </div>
                    <div className="wallet-topup__method-desc">
                      {t("Nộp tiền trực tiếp cho nhân viên. Ví chỉ được cộng sau khi xác nhận.")}
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
                      {t("Chuyển khoản VietQR PRO 24/7")}
                      <span className="wallet-topup__method-recommend">
                        {t("Khuyên dùng")}
                      </span>
                    </div>
                    <div className="wallet-topup__method-desc">
                      {t("Cộng tiền sau khi xác nhận giao dịch VietQR.")}
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
                    <span>{t("Đang tạo mã QR thanh toán...")}</span>
                  </div>
                ) : (
                  <>
                    <div className="wallet-topup__qr-inline-head">
                      <div>
                        <b>{t("Quét mã VietQR để nạp vào ví")}</b>
                        <p>{t("Sử dụng ứng dụng ngân hàng để quét mã bên dưới.")}</p>
                      </div>
                      <strong>{money(pendingTopupTx.amount)}</strong>
                    </div>

                    {settings?.account ? (
                      <img
                        className="wallet-topup__qr-inline-image"
                        src={`https://img.vietqr.io/image/${settings?.bank || "VCB"}-${settings.account}-compact2.png?amount=${pendingTopupTx.amount}&addInfo=${encodeURIComponent(pendingTopupTx.code)}&accountName=${encodeURIComponent(settings?.accountName || "CANTEEN VWA")}`}
                        alt={t("Mã QR nạp tiền VietQR")}
                      />
                    ) : (
                      <div className="wallet-topup__qr-inline-warning">
                        {t("Chưa cấu hình tài khoản ngân hàng nhận tiền.")}
                      </div>
                    )}

                    <div className="wallet-topup__qr-inline-code">
                      <span>{t("Nội dung chuyển khoản")}</span>
                      <code>{pendingTopupTx.code}</code>
                    </div>

                    <button
                  type="button"
                  className="wallet-topup__qr-save"
                  onClick={async () => {
                    const qrImage = document.querySelector(".wallet-topup__qr-inline-image");

                    if (!qrImage?.src) {
                      toast(t("Không tìm thấy mã QR để lưu."), "error");
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

                      toast(t("Đổi thành công!"), "success");
                    } catch (error) {
                      const fallbackLink = document.createElement("a");
                      fallbackLink.href = qrImage.src;
                      fallbackLink.target = "_blank";
                      fallbackLink.rel = "noopener noreferrer";
                      document.body.appendChild(fallbackLink);
                      fallbackLink.click();
                      fallbackLink.remove();

                      toast(
                        t("Trình duyệt không cho tải trực tiếp. Mã QR đã mở ở tab mới; hãy nhấp phải ảnh và chọn Lưu hình ảnh thành."),
                        "info"
                      );
                    }
                  }}
                >
                  <span aria-hidden="true">↓</span>
                  {t("Lưu")}
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
              ? t("Đang tạo yêu cầu...")
              : topupMethod === "CASH"
                ? t("Xác nhận nạp tiền mặt tại quầy")
                : t("Xác nhận chuyển khoản / Nạp tiền")}
          </button>
          <p className="wallet-topup__secure">
            <Shield size={14} />
            {t("Bảo mật SSL 256-bit qua Cổng thanh toán Quốc gia Napas & SSO Học viện")}
          </p>
        </div>

        {/* RIGHT: QR POS */}
        <div className="wallet-qr-pos" id="qr-pos-card">
          <div className="wallet-qr-pos__head">
            <div className="wallet-qr-pos__eyebrow">
              <QrCode size={14} />
              {t("MÃ THANH TOÁN TẠI QUẦY CANTEEN")}
            </div>
            <h2>{t("Dynamic QR Code 1-Chạm")}</h2>
            <p>
              {t("Đưa mã vào đầu đọc tại Quầy 01, Quầy 02 hoặc Quầy nước")}
            </p>
          </div>

          <div className="wallet-qr-pos__box">
            <div className="wallet-qr-pos__status">
              <span className="wallet-qr-pos__status-live">
                <span className="wallet-qr-pos__dot" />
                {t("Đang hoạt động")}
              </span>
              <span className="wallet-qr-pos__timer">
                <Clock size={12} />
                {t("Tự làm mới sau:")} <b>{qrTimer}s</b>
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
                {t("Mã PIN dự phòng nếu camera quầy lỗi:")}
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
                  <b>{t("Tự động áp dụng Trợ giá SV")}</b>
                  <span>{t("Trừ ngay 10.000đ khi đủ điều kiện đơn")}</span>
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
              {t("Làm mới mã thanh toán ngay")}
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
              {t("Lịch sử giao dịch & Biến động số dư")}
            </h2>
            <p>
              {t("Tra cứu chi tiết các lần thanh toán, nạp tiền và tiền trợ giá học viện")}
            </p>
          </div>
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
              placeholder={t("Tìm theo mã đơn, quầy...")}
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
            <b>{t("Chưa có giao dịch nào")}</b>
            <p>
              {tab === "all"
                ? t("Bắt đầu nạp tiền hoặc đặt món để có giao dịch đầu tiên.")
                : t("Không có giao dịch loại này.")}
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
              {t("Hiển thị")} {Math.min(visibleTx, filtered.length)}{" "}
              {t("trên tổng số")} {filtered.length} {t("giao dịch")}
            </span>
            <button
              type="button"
              onClick={() => setVisibleTx((n) => n + 8)}
            >
              {t("Xem thêm lịch sử cũ hơn")}
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
            <h3>{t("Tiêu chuẩn An toàn & Bảo mật Học đường")}</h3>
            <p>
              {t("Chứng chỉ bảo mật thanh toán tiêu chuẩn quốc tế PCI-DSS Level 1. Hệ thống tích hợp xác thực SSO an toàn cùng cơ chế tự khóa số dư khi mất thẻ sinh viên.")}
            </p>
          </div>
        </div>
        <div className="wallet-security__actions">
          <button className="wallet-security__btn wallet-security__btn--ghost">
            <Lock size={16} />
            {t("Khóa thẻ khẩn cấp")}
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
      {/* MODALS (GIỮ NGUYÊN)                             */}
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
    label: "—",
    sign: "",
  };
  const statusCfg = STATUS_CONFIG[tx.status] || {
    label: "—",
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
            {tx.created_at && ` • ${fmtDateTime(tx.created_at)}`}
          </p>
          {tx.discount > 0 && (
            <span className="wallet-tx-row__subsidy">
              <Sparkles size={12} />
              {t("Đã trừ trợ giá SV:")} -{money(tx.discount)}
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
          {money(tx.amount || 0).replace("đ", "")}{" "}
          <span className="wallet-tx-row__amount-unit">đ</span>
        </div>
        {tx.balance_after !== undefined && (
          <div className="wallet-tx-row__balance">
            {t("Số dư cuối:")} {money(tx.balance_after)}
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
// MODAL WRAPPER (GIỮ NGUYÊN)
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
// DEPOSIT MODAL (GIỮ NGUYÊN logic, đổi UI nhẹ)
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
        t("Số tiền nạp tối thiểu {value}").replace("{value}", money(MIN_DEPOSIT)),
        "error"
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.wallet.deposit({ amount, method, note });
      setTx(res.transaction);
      toast(t("Đã tạo yêu cầu nạp tiền"), "success");

      if (method === "CASH") {
        onSuccess();
      } else {
        setStep(2);
      }
    } catch (e) {
      toast(e.message || t("Không tạo được yêu cầu nạp"), "error");
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
      <Modal onClose={onClose} busy={busy} label={t("Nạp tiền qua VietQR")}>
        <div className="wallet-modal__head">
          <h3>{t("Nạp tiền qua VietQR")}</h3>
          <button onClick={onClose} disabled={busy}>
            <X size={20} />
          </button>
        </div>

        <div className="wallet-qr-modal">
          <div className="wallet-qr-modal__icon-wrap">
            <QrCode size={28} />
          </div>
          <p className="wallet-qr-modal__desc">
            {t("Quét mã QR để chuyển {amount} cho đơn {code}")
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
              {t("Chưa cấu hình tài khoản nhận tiền")}
            </div>
          )}

          <div className="wallet-qr-modal__note">
            <AlertTriangle size={16} />
            <span>
              {t("Vui lòng chuyển đúng số tiền và nội dung. Yêu cầu sẽ được admin duyệt trong vài phút.")}
            </span>
          </div>

          <button className="wallet-modal__primary" onClick={onSuccess}>
            {t("Đã hiểu")}
          </button>
        </div>
      </Modal>
    );
  }

  // STEP 1: Form
  return (
    <Modal onClose={onClose} busy={busy} label={t("Nạp tiền")}>
      <div className="wallet-modal__head">
        <h3>
          <Plus size={20} style={{ color: "#18a967" }} />
          {t("Nạp tiền")}
        </h3>
        <button onClick={onClose} disabled={busy}>
          <X size={20} />
        </button>
      </div>

      <label className="wallet-modal__label">{t("Số tiền")} *</label>
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
        <span className="wallet-modal__input-suffix">đ</span>
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
            {a.toLocaleString("vi-VN")}đ
          </button>
        ))}
      </div>

      <label className="wallet-modal__label">{t("Phương thức nạp")}</label>
      <div className="wallet-modal__method-summary">
        <div className="wallet-modal__method-summary-icon">
          {method === "QR" ? <QrCode size={22} /> : <Banknote size={22} />}
        </div>
        <div className="wallet-modal__method-summary-content">
          <b>
            {method === "QR"
              ? t("Chuyển khoản VietQR PRO 24/7")
              : t("Thanh toán tiền mặt tại quầy")}
          </b>
          <span>
            {method === "QR"
              ? t("Quét mã và thực hiện chuyển khoản theo hướng dẫn.")
              : t("Nộp tiền trực tiếp cho nhân viên. Yêu cầu sẽ chờ xác nhận.")}
          </span>
        </div>
      </div>
      <label className="wallet-modal__label">{t("Ghi chú")}</label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("Ghi chú thêm (không bắt buộc)")}
        maxLength={200}
        disabled={busy}
        className="wallet-modal__input"
      />

      <div className="wallet-modal__actions">
        <button onClick={onClose} disabled={busy} className="wallet-modal__btn wallet-modal__btn--ghost">
          {t("Hủy")}
        </button>
        <button
          onClick={submit}
          disabled={busy || amount < MIN_DEPOSIT}
          className="wallet-modal__btn wallet-modal__btn--primary"
        >
          {submitting ? (
            <>
              <Loader2 size={14} className="wallet-spin" />
              {t("Đang xử lý...")}
            </>
          ) : (
            `${t("Nạp tiền")} ${amount.toLocaleString("vi-VN")}đ`
          )}
        </button>
      </div>
    </Modal>
  );
}

// ============================================================
// WITHDRAW MODAL (GIỮ NGUYÊN logic)
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
        t("Số tiền rút tối thiểu {value}").replace("{value}", money(MIN_WITHDRAW)),
        "error"
      );
      return;
    }
    if (amount > balance) {
      toast(t("Số dư không đủ"), "error");
      return;
    }

    setSubmitting(true);
    try {
      await api.wallet.withdraw({ amount, note });
      toast(t("Đã gửi yêu cầu rút tiền"), "success");
      onSuccess();
    } catch (e) {
      toast(e.message || t("Không gửi được yêu cầu rút"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} busy={busy} label={t("Rút tiền")}>
      <div className="wallet-modal__head">
        <h3>
          <Minus size={20} style={{ color: "#f59e0b" }} />
          {t("Rút tiền")}
        </h3>
        <button onClick={onClose} disabled={busy}>
          <X size={20} />
        </button>
      </div>

      <div className="wallet-modal__info">
        <b>{t("Số dư khả dụng")}:</b> {money(balance)}
      </div>

      <label className="wallet-modal__label">{t("Số tiền")} *</label>
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
        <span className="wallet-modal__input-suffix">đ</span>
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
            {a.toLocaleString("vi-VN")}đ
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setAmount(balance)}
        disabled={busy}
        className="wallet-modal__all-btn"
      >
        {t("Rút toàn bộ")} {money(balance)}
      </button>

      <label className="wallet-modal__label">{t("Tài khoản nhận tiền")}</label>
      <div className="wallet-modal__bank-info">
        <div className="wallet-modal__bank-row">
          <Building2 size={14} />
          <b>{bank.name}</b>
        </div>
        <div className="wallet-modal__bank-acc">
          {bank.account} · {bank.accountName}
        </div>
      </div>

      <label className="wallet-modal__label">{t("Ghi chú")}</label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("Ghi chú thêm (không bắt buộc)")}
        maxLength={200}
        disabled={busy}
        className="wallet-modal__input"
      />

      <div className="wallet-modal__actions">
        <button onClick={onClose} disabled={busy} className="wallet-modal__btn wallet-modal__btn--ghost">
          {t("Hủy")}
        </button>
        <button
          onClick={submit}
          disabled={busy || amount < MIN_WITHDRAW || amount > balance}
          className="wallet-modal__btn wallet-modal__btn--primary"
        >
          {submitting ? (
            <>
              <Loader2 size={14} className="wallet-spin" />
              {t("Đang xử lý...")}
            </>
          ) : (
            t("Gửi yêu cầu rút tiền")
          )}
        </button>
      </div>
    </Modal>
  );
}

// ============================================================
// LINK BANK MODAL (GIỮ NGUYÊN logic)
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
      toast(t("Số tài khoản không hợp lệ"), "error");
      return;
    }
    if (!accountName.trim()) {
      toast(t("Vui lòng nhập tên chủ tài khoản"), "error");
      return;
    }

    setSubmitting(true);
    try {
      await api.wallet.linkBank({
        bank_name: bankName,
        bank_account: account.trim(),
        bank_account_name: accountName.trim().toUpperCase(),
      });
      toast(t("Đã liên kết ngân hàng"), "success");
      onSuccess();
    } catch (e) {
      toast(e.message || t("Không liên kết được ngân hàng"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} busy={busy} label={t("Liên kết ngân hàng")}>
      <div className="wallet-modal__head">
        <h3>
          <CreditCard size={20} style={{ color: "#2563EB" }} />
          {t("Liên kết ngân hàng")}
        </h3>
        <button onClick={onClose} disabled={busy}>
          <X size={20} />
        </button>
      </div>

      <div className="wallet-modal__note">
        <AlertTriangle size={16} />
        <span>
          {t("Tài khoản này sẽ dùng để nhận tiền khi bạn rút từ Ví Canteen. Hãy kiểm tra kỹ trước khi lưu.")}
        </span>
      </div>

      <label className="wallet-modal__label">{t("Ngân hàng")} *</label>
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

      <label className="wallet-modal__label">{t("Số tài khoản")} *</label>
      <input
        value={account}
        onChange={(e) => setAccount(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder="1234567890"
        inputMode="numeric"
        maxLength={20}
        disabled={busy}
        className="wallet-modal__input wallet-modal__input--mono"
      />

      <label className="wallet-modal__label">{t("Tên chủ tài khoản")} *</label>
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
          {t("Hủy")}
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
              {t("Đang lưu...")}
            </>
          ) : (
            t("Lưu tài khoản")
          )}
        </button>
      </div>
    </Modal>
  );
}
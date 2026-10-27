// ============================================================
// CUSTOMERWALLET.JSX — Ví Canteen VWA Pay (V3 - FIXED)
// ============================================================
// 🔧 V3 (2026-11) FIX:
//   #1 Xóa DUPLICATE tạo deposit (handleSelectTopupMethod không auto create)
//   #2 Xóa DepositModal — chỉ dùng inline QR (tránh trùng UX)
//   #3 Chặn đổi amount/preset/method khi có pendingTopupTx
//   #4 Fix message "Chuyển khoản thành công" → "Vui lòng quét QR"
//   #5 Thêm Quick Actions bar (Nạp / Rút / Đổi NH) — entry point cho 2 modal
//   #6 Thêm getToken() guard trong loadAll()
//   #7 Xóa dead imports (Skeleton, 15 icon unused)
//   #8 Reset visibleTx khi đổi tab/search
//   #9 Search mở rộng (amount, status)
//   + qrTimer chỉ chạy khi có pendingTopupTx
// ============================================================

import { SkeletonList } from "../../components/Skeleton";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Wallet, Plus, Minus, CreditCard, QrCode, Banknote, Clock,
  CheckCircle2, ArrowDownCircle, ArrowUpCircle, ShoppingBag, X, Building2,
  History, AlertTriangle, Loader2, AlertCircle, RefreshCw,
  Shield, Zap, Lock, Headset, Search, Sparkles,
} from "lucide-react";
import { api, getToken } from "../../api";
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";

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

function fmtDateTime(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("vi-VN"); } catch { return "—"; }
}

function fmtDate(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("vi-VN"); } catch { return ""; }
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function CustomerWallet({ user }) {
  const { t } = useI18n();

  const [wallet, setWallet] = useState(EMPTY_WALLET);
  const [transactions, setTransactions] = useState([]);
  const [settings, setSettings] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tab, setTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [topupAmount, setTopupAmount] = useState(100000);
  const [customTopupInput, setCustomTopupInput] = useState("");
  const [selectedTopupPreset, setSelectedTopupPreset] = useState(null);
  const [topupSubmitting, setTopupSubmitting] = useState(false);
  const [pendingTopupTx, setPendingTopupTx] = useState(null);
  const [topupMethod, setTopupMethod] = useState("QR");
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showLinkBank, setShowLinkBank] = useState(false);

  const [qrTimer, setQrTimer] = useState(60);
  const [autoSubsidy, setAutoSubsidy] = useState(true);
  const [visibleTx, setVisibleTx] = useState(8);

  const reqIdRef = useRef(0);
  const inFlightRef = useRef(false);

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

  const loadAll = useCallback(async (silent = false) => {
    // 🔧 FIX #6: Guard getToken chống spam 401
    if (!getToken()) {
      setLoading(false);
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const myReqId = ++reqIdRef.current;
    if (!silent) setLoading(true);
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
      if (myReqId === reqIdRef.current) setLoading(false);
      inFlightRef.current = false;
    }
  }, [t]);

  useEffect(() => { loadAll(false); }, [loadAll]);

  // QR POS countdown (giữ riêng — khác QR nạp tiền)
  useEffect(() => {
    const timer = setInterval(() => {
      setQrTimer((s) => (s <= 1 ? 60 : s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 🔧 FIX #8: Reset visibleTx khi đổi tab/search
  useEffect(() => {
    setVisibleTx(8);
  }, [tab, searchQuery]);

  const filtered = useMemo(() => {
    let list = transactions;
    if (tab !== "all") list = list.filter((tx) => tx.type === tab);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      // 🔧 FIX #9: Search rộng hơn
      list = list.filter((tx) => {
        const code = (tx.code || "").toLowerCase();
        const note = (tx.note || "").toLowerCase();
        const amountStr = String(tx.amount || "");
        const statusStr = (tx.status || "").toLowerCase();
        return (
          code.includes(q) ||
          note.includes(q) ||
          amountStr.includes(q) ||
          statusStr.includes(q)
        );
      });
    }
    return list;
  }, [transactions, tab, searchQuery]);

  const stats = useMemo(() => {
    let deposited = 0, withdrawn = 0, paid = 0, pending = 0;
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
  const hasPendingTopup = !!pendingTopupTx?.code;

  const handleSuccessModal = useCallback(async () => {
    setShowWithdraw(false);
    setShowLinkBank(false);
    await loadAll(true);
  }, [loadAll]);

  // 🔧 FIX #1: KHÔNG auto tạo tx khi chọn method
  const handleSelectTopupMethod = useCallback((method) => {
    if (hasPendingTopup) {
      toast(t("Bạn đang có yêu cầu nạp chờ duyệt. Vui lòng đợi admin xử lý trước."), "warning");
      return;
    }
    setTopupMethod(method);
  }, [hasPendingTopup, t]);

  // 🔧 FIX #3: Chặn đổi preset khi có pending
  const handleSelectPreset = useCallback((amount) => {
    if (hasPendingTopup) {
      toast(t("Bạn đang có yêu cầu nạp chờ duyệt. Vui lòng đợi admin xử lý trước."), "warning");
      return;
    }
    setTopupAmount(amount);
    setCustomTopupInput("");
    setSelectedTopupPreset(amount);
  }, [hasPendingTopup, t]);

  // 🔧 FIX #3: Chặn đổi custom amount khi có pending
  const handleCustomAmountChange = useCallback((e) => {
    if (hasPendingTopup) return;
    const digits = e.target.value.replace(/\D/g, "");
    setCustomTopupInput(digits);
    setSelectedTopupPreset(null);
    setTopupAmount(digits ? Number(digits) : 0);
  }, [hasPendingTopup]);

  // 🔧 FIX #1 + #2 + #4: Tạo tx duy nhất khi user bấm nút
  const handleDirectTopup = useCallback(async () => {
    if (topupSubmitting) return;
    if (hasPendingTopup) {
      toast(t("Bạn đang có yêu cầu nạp chờ duyệt. Vui lòng đợi admin xử lý trước."), "warning");
      return;
    }

    const requestedAmount = Number(topupAmount);
    if (!Number.isFinite(requestedAmount) || requestedAmount < MIN_DEPOSIT) {
      toast(t("Số tiền nạp tối thiểu {value}").replace("{value}", money(MIN_DEPOSIT)), "error");
      return;
    }
    if (!Number.isInteger(requestedAmount)) {
      toast(t("Số tiền nạp phải là số nguyên hợp lệ."), "error");
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
      if (!transaction?.code) {
        throw new Error(t("Không tạo được yêu cầu nạp tiền."));
      }

      if (topupMethod === "CASH") {
        toast(t("Đã tạo yêu cầu nạp tiền mặt. Vui lòng thanh toán tại quầy."), "success");
        // Reset form
        setTopupAmount(100000);
        setCustomTopupInput("");
        setSelectedTopupPreset(null);
        await loadAll(true);
      } else {
        // QR: chỉ hiển thị inline QR, không tạo thêm tx
        setPendingTopupTx(transaction);
        toast(t("Đã tạo mã QR. Vui lòng quét để hoàn tất thanh toán."), "success");
      }
    } catch (error) {
      toast(error?.message || t("Không tạo được yêu cầu nạp"), "error");
    } finally {
      setTopupSubmitting(false);
    }
  }, [topupSubmitting, hasPendingTopup, topupAmount, topupMethod, t, loadAll]);

  // Ẩn QR local (không cancel trên server vì chưa có API)
  const handleHideQR = useCallback(() => {
    const ok = window.confirm(
      t("Yêu cầu nạp sẽ vẫn treo trên hệ thống cho đến khi admin duyệt. Bạn có chắc muốn ẩn mã QR?")
    );
    if (!ok) return;
    setPendingTopupTx(null);
    toast(t("Đã ẩn mã QR. Yêu cầu nạp trước đó vẫn chờ admin duyệt."), "info");
  }, [t]);

  const handleOpenWithdraw = useCallback(() => {
    if (!isLinked) {
      toast(t("Vui lòng liên kết ngân hàng trước khi rút tiền."), "warning");
      setShowLinkBank(true);
      return;
    }
    if (wallet.balance < MIN_WITHDRAW) {
      toast(t("Số dư tối thiểu {value} để rút.").replace("{value}", money(MIN_WITHDRAW)), "warning");
      return;
    }
    setShowWithdraw(true);
  }, [isLinked, wallet.balance, t]);

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
      {error && (
        <div className="wallet-error-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={() => loadAll(false)}>
            <RefreshCw size={12} /> {t("Thử lại")}
          </button>
        </div>
      )}

      {/* CARD THẺ */}
      <section className="wallet-bento" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
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
              <span>{t("SỐ DƯ KHẢ DỤNG")}</span>
              <b>
                {loading ? (
                  <Loader2 size={24} className="wallet-spin" />
                ) : (
                  money(wallet.balance || 0)
                )}
              </b>
            </div>

            <div className="vwa-card-final__holder">
              <div className="vwa-card-final__holder-item">
                <span>{t("CHỦ THẺ")}</span>
                <b>{String(user?.name || user?.full_name || t("CHƯA CẬP NHẬT")).trim().toLocaleUpperCase("vi-VN")}</b>
              </div>
              <div className="vwa-card-final__holder-item" style={{ textAlign: "right" }}>
                <span>{t("MÃ THẺ (MSSV)")}</span>
                <b>{user?.student_code || user?.student_id || user?.mssv || t("CHƯA CẬP NHẬT")}</b>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 🔧 FIX #5: QUICK ACTIONS — entry point cho Rút tiền & LinkBank */}
      <section
        className="wallet-quick-actions"
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => {
            document.getElementById("topup-container")?.scrollIntoView({ behavior: "smooth" });
          }}
          style={{
            flex: 1,
            minWidth: 140,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "12px 16px",
            background: "#18a967",
            color: "#fff",
            border: 0,
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          <Plus size={18} />
          {t("Nạp tiền")}
        </button>

        <button
          type="button"
          onClick={handleOpenWithdraw}
          disabled={!canWithdraw}
          style={{
            flex: 1,
            minWidth: 140,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "12px 16px",
            background: canWithdraw ? "#f59e0b" : "#e2e8f0",
            color: canWithdraw ? "#fff" : "#94a3b8",
            border: 0,
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 14,
            cursor: canWithdraw ? "pointer" : "not-allowed",
          }}
        >
          <Minus size={18} />
          {t("Rút tiền")}
        </button>

        <button
          type="button"
          onClick={() => setShowLinkBank(true)}
          style={{
            flex: 1,
            minWidth: 140,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "12px 16px",
            background: "#fff",
            color: "#2634d5",
            border: "1px solid #2634d5",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          <CreditCard size={18} />
          {isLinked ? t("Đổi ngân hàng") : t("Liên kết ngân hàng")}
        </button>
      </section>

      {/* 🔧 FIX #3: Banner pending deposit */}
      {hasPendingTopup && (
        <div
          style={{
            marginBottom: 20,
            padding: "14px 18px",
            background: "rgba(245, 158, 11, 0.12)",
            border: "2px solid #f59e0b",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <AlertTriangle size={22} style={{ color: "#f59e0b", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <b style={{ display: "block", color: "#92400e", fontSize: 14 }}>
              {t("Đang có yêu cầu nạp {amount} chờ duyệt")
                .replace("{amount}", money(pendingTopupTx.amount))}
            </b>
            <span style={{ fontSize: 12, color: "#78350f" }}>
              {t("Mã GD:")} <b>{pendingTopupTx.code}</b> ·{" "}
              {t("Vui lòng đợi admin xác nhận.")}
            </span>
          </div>
          <button
            type="button"
            onClick={handleHideQR}
            style={{
              padding: "8px 14px",
              background: "#fff",
              color: "#f59e0b",
              border: "1px solid #f59e0b",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {t("Ẩn QR")}
          </button>
        </div>
      )}

      <section className="wallet-action-grid">
        {/* NẠP TIỀN */}
        <div className="wallet-topup" id="topup-container">
          <div className="wallet-topup__head">
            <div>
              <h2>
                <Plus size={22} />
                {t("Nạp tiền nhanh vào Ví (Instant Top-up)")}
              </h2>
              <p>{t("Tiền nạp vào ví được áp dụng ngay lập tức tại toàn bộ quầy dịch vụ Canteen VWA")}</p>
            </div>
            <span className="wallet-topup__free-badge">{t("Miễn phí 100%")}</span>
          </div>

          {/* Preset amounts */}
          <div className="wallet-topup__presets">
            <label>{t("Chọn mệnh giá nạp:")}</label>
            <div className="wallet-topup__preset-grid">
              {QUICK_DEPOSIT.map((a) => (
                <button
                  key={a}
                  type="button"
                  disabled={hasPendingTopup}
                  className={`wallet-preset-btn ${selectedTopupPreset === a ? "wallet-preset-btn--selected" : ""}`}
                  onClick={() => handleSelectPreset(a)}
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
                onChange={handleCustomAmountChange}
                disabled={hasPendingTopup}
                placeholder={t("Hoặc nhập số tiền tùy ý (tối thiểu 10.000đ)")}
                className="wallet-topup__custom-input"
              />
              <span className="wallet-topup__custom-unit">VNĐ</span>
            </div>
          </div>

          {/* Method */}
          <div className="wallet-topup__method">
            <label>{t("Phương thức nạp tiền:")}</label>

            <div className="wallet-topup__method-options" role="radiogroup">
              <button
                type="button"
                role="radio"
                aria-checked={topupMethod === "CASH"}
                disabled={hasPendingTopup}
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

              <button
                type="button"
                role="radio"
                aria-checked={topupMethod === "QR"}
                disabled={hasPendingTopup}
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

          {/* Inline QR */}
          {topupMethod === "QR" &&
            (topupSubmitting || (hasPendingTopup && Number(pendingTopupTx.amount) === Number(topupAmount))) && (
              <div className="wallet-topup__qr-inline">
                {topupSubmitting ? (
                  <div className="wallet-topup__qr-inline-loading">
                    <Loader2 size={22} className="wallet-spin" />
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
                        const safeCode = String(pendingTopupTx?.code || "CanteenVWA").replace(/[^a-zA-Z0-9_-]/g, "_");

                        try {
                          const response = await fetch(qrImage.src, { mode: "cors", cache: "no-store" });
                          if (!response.ok) throw new Error("Khong tai duoc anh QR.");
                          const blob = await response.blob();
                          if (!blob.size) throw new Error("Anh QR rong.");
                          const objectUrl = URL.createObjectURL(blob);
                          const link = document.createElement("a");
                          link.href = objectUrl;
                          link.download = "VietQR-nap-tien-" + safeCode + ".png";
                          document.body.appendChild(link);
                          link.click();
                          link.remove();
                          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
                          toast(t("Đã lưu ảnh QR thành công!"), "success");
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
            disabled={topupSubmitting || hasPendingTopup}
          >
            {hasPendingTopup ? (
              <>
                <Clock size={16} />
                {t("Đang chờ admin duyệt")}
              </>
            ) : topupSubmitting ? (
              <>
                <Loader2 size={16} className="wallet-spin" />
                {t("Đang tạo yêu cầu...")}
              </>
            ) : topupMethod === "CASH" ? (
              <>
                <Banknote size={16} />
                {t("Xác nhận nạp tiền mặt tại quầy")}
              </>
            ) : (
              <>
                <Lock size={16} />
                {t("Xác nhận chuyển khoản / Nạp tiền")}
              </>
            )}
          </button>
          <p className="wallet-topup__secure">
            <Shield size={14} />
            {t("Bảo mật SSL 256-bit qua Cổng thanh toán Quốc gia Napas & SSO Học viện")}
          </p>
        </div>

        {/* QR POS (giữ nguyên) */}
        <div className="wallet-qr-pos" id="qr-pos-card">
          <div className="wallet-qr-pos__head">
            <div className="wallet-qr-pos__eyebrow">
              <QrCode size={14} />
              {t("MÃ THANH TOÁN TẠI QUẦY CANTEEN")}
            </div>
            <h2>{t("Dynamic QR Code 1-Chạm")}</h2>
            <p>{t("Đưa mã vào đầu đọc tại Quầy 01, Quầy 02 hoặc Quầy nước")}</p>
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

            <div className="wallet-qr-pos__qr-wrap">
              <svg className="wallet-qr-pos__qr" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                <rect fill="#131b2e" height="50" rx="8" width="50" x="10" y="10" />
                <rect fill="#fff" height="30" rx="4" width="30" x="20" y="20" />
                <rect fill="#004ac6" height="16" rx="2" width="16" x="27" y="27" />
                <rect fill="#131b2e" height="50" rx="8" width="50" x="140" y="10" />
                <rect fill="#fff" height="30" rx="4" width="30" x="150" y="20" />
                <rect fill="#004ac6" height="16" rx="2" width="16" x="157" y="27" />
                <rect fill="#131b2e" height="50" rx="8" width="50" x="10" y="140" />
                <rect fill="#fff" height="30" rx="4" width="30" x="20" y="150" />
                <rect fill="#004ac6" height="16" rx="2" width="16" x="27" y="157" />
                {[
                  [70, 15], [90, 15], [110, 15], [70, 35], [110, 35],
                  [15, 70], [35, 70], [55, 70], [75, 70], [95, 70], [115, 70], [135, 70], [155, 70], [175, 70],
                  [15, 90], [35, 90], [55, 90], [135, 90], [155, 90], [175, 90],
                  [15, 110], [55, 110], [135, 110], [175, 110],
                  [70, 135], [90, 135], [110, 135], [135, 135], [155, 135],
                  [70, 155], [90, 155], [110, 155], [155, 155], [175, 155],
                  [70, 175], [110, 175], [135, 175], [155, 175],
                ].map(([x, y], i) => (
                  <rect key={i} fill={i % 3 === 0 ? "#004ac6" : "#131b2e"} height="12" rx="2" width="12" x={x} y={y} />
                ))}
                <rect fill="#004ac6" height="50" rx="12" width="50" x="75" y="75" />
                <text fill="#fff" fontFamily="'Plus Jakarta Sans', sans-serif" fontSize="14" fontWeight="700" textAnchor="middle" x="100" y="105">
                  VWA
                </text>
              </svg>
            </div>

            <div className="wallet-qr-pos__pin">
              <span className="wallet-qr-pos__pin-label">
                {t("Mã PIN dự phòng nếu camera quầy lỗi:")}
              </span>
              <div className="wallet-qr-pos__pin-value">8826 - 4921</div>
            </div>
          </div>

          <div className="wallet-qr-pos__controls">
            <label className="wallet-qr-pos__toggle">
              <div className="wallet-qr-pos__toggle-left">
                <Sparkles size={18} />
                <div>
                  <b>{t("Tự động áp dụng Trợ giá SV")}</b>
                  <span>
                    {t("Hạn mức:")}{" "}
                    {new Intl.NumberFormat("vi-VN").format(user?.subsidy_remaining ?? 500000)}đ/tháng
                  </span>
                </div>
              </div>
              <input type="checkbox" checked={autoSubsidy} onChange={(e) => setAutoSubsidy(e.target.checked)} />
            </label>

            <button className="wallet-qr-pos__refresh" onClick={() => setQrTimer(60)}>
              <RefreshCw size={16} />
              {t("Làm mới mã thanh toán ngay")}
            </button>
          </div>
        </div>
      </section>

      {/* LỊCH SỬ GIAO DỊCH */}
      <section className="wallet-history">
        <div className="wallet-history__head">
          <div>
            <h2>
              <History size={22} />
              {t("Lịch sử giao dịch & Biến động số dư")}
            </h2>
            <p>{t("Tra cứu chi tiết các lần thanh toán, nạp tiền và tiền trợ giá học viện")}</p>
          </div>
        </div>

        <div className="wallet-history__filters">
          <div className="wallet-history__tabs">
            {TABS.map((tItem) => (
              <button
                key={tItem.id}
                className={`wallet-history__tab ${tab === tItem.id ? "active" : ""}`}
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
              placeholder={t("Tìm theo mã, ghi chú, số tiền, trạng thái...")}
            />
          </div>
        </div>

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
            <button type="button" onClick={() => setVisibleTx((n) => n + 8)}>
              {t("Xem thêm lịch sử cũ hơn")}
            </button>
          </div>
        )}
      </section>

      {/* SECURITY */}
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
          <button
            type="button"
            className="wallet-security__btn wallet-security__btn--primary"
            onClick={() => { window.location.href = "tel:19006868"; }}
          >
            <Headset size={16} />
            {t("Hotline: 1900 6868")}
          </button>
        </div>
      </section>

      {/* MODALS */}
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
  const config = TX_CONFIG[tx.type] || { icon: Wallet, color: "#2563EB", bg: "#EFF6FF", label: "—", sign: "" };
  const statusCfg = STATUS_CONFIG[tx.status] || { label: "—", color: "#64748b", bg: "#f1f5f9" };
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
            {tx.counter && <span className="wallet-tx-row__counter">{tx.counter}</span>}
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
        <div className={`wallet-tx-row__amount ${isDeposit ? "wallet-tx-row__amount--plus" : ""}`}>
          {config.sign}
          {money(tx.amount || 0).replace("đ", "")}{" "}
          <span className="wallet-tx-row__amount-unit">đ</span>
        </div>
        {tx.balance_after !== undefined && (
          <div className="wallet-tx-row__balance">
            {t("Số dư cuối:")} {money(tx.balance_after)}
          </div>
        )}
        <span className="wallet-tx-row__status" style={{ background: statusCfg.bg, color: statusCfg.color }}>
          {tx.status === "approved" && <CheckCircle2 size={12} />}
          {statusCfg.label}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// MODAL WRAPPER
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
      <div onClick={(e) => e.stopPropagation()} className="wallet-modal" style={{ maxWidth, maxHeight: "90vh", overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// WITHDRAW MODAL — giữ nguyên 100%
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
      toast(t("Số tiền rút tối thiểu {value}").replace("{value}", money(MIN_WITHDRAW)), "error");
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
        <button onClick={onClose} disabled={busy}><X size={20} /></button>
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
            className={`wallet-modal__quick-btn ${amount === a ? "active" : ""}`}
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
// LINK BANK MODAL — giữ nguyên 100%
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
        <button onClick={onClose} disabled={busy}><X size={20} /></button>
      </div>

      <div className="wallet-modal__note">
        <AlertTriangle size={16} />
        <span>{t("Tài khoản này sẽ dùng để nhận tiền khi bạn rút từ Ví Canteen. Hãy kiểm tra kỹ trước khi lưu.")}</span>
      </div>

      <label className="wallet-modal__label">{t("Ngân hàng")} *</label>
      <select value={bankName} onChange={(e) => setBankName(e.target.value)} disabled={busy} className="wallet-modal__select">
        {BANKS.map((b) => (
          <option key={b.code} value={b.code}>{b.name} ({b.code})</option>
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
          disabled={busy || !account.trim() || !accountName.trim() || account.length < 6}
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
// ============================================================
// OWNERWALLET.JSX — Quản lý Ví Canteen (Admin)
// ============================================================
// ✅ SOURCE-TEXT I18N: dùng tiếng Việt trực tiếp qua t("...")
// 🔧 FIX #93: datetime dùng Intl.DateTimeFormat cố định (VN, 24h)
// ============================================================

import { Skeleton, SkeletonList, SkeletonStats } from "../../components/Skeleton";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, ShoppingBag, Check, Ban, Search, AlertTriangle, Eye, Building2, X, Loader2, AlertCircle, RefreshCw, CheckSquare, Square, Clock,
} from "lucide-react";
import { api } from "../../api";
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import ConfirmDialog from "../../components/ConfirmDialog";

// ============================================================
// CONSTANTS
// ============================================================

const MODAL_Z = 2147483600;
const REFRESH_MS = 20000;

// 🔧 FIX #93: formatter cố định VN timezone, 24h
const DATETIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const TX_KEYS = {
  deposit:  { icon: ArrowDownCircle, color: "#18a967", bg: "#e8f9f1", sign: "+" },
  withdraw: { icon: ArrowUpCircle,   color: "#f59e0b", bg: "#fef3c7", sign: "−" },
  payment:  { icon: ShoppingBag,     color: "#8b5cf6", bg: "#ede9fe", sign: "−" },
};

const STATUS_KEYS = {
  pending:  { color: "#f59e0b", bg: "#fef3c7" },
  approved: { color: "#18a967", bg: "#e8f9f1" },
  rejected: { color: "#ef4444", bg: "#fee2e2" },
};

const METHOD_KEYS = {
  QR:     { color: "#2634d5", bg: "#eef2ff" },
  CASH:   { color: "#18a967", bg: "#e8f9f1" },
  BANK:   { color: "#f59e0b", bg: "#fef3c7" },
  WALLET: { color: "#8b5cf6", bg: "#ede9fe" },
};

const EMPTY_STATS = {
  totalBalance: 0, totalUsers: 0, totalDeposited: 0,
  totalWithdrawn: 0, totalPaid: 0, pendingCount: 0,
  pendingDepositCount: 0, pendingWithdrawCount: 0,
};

// ============================================================
// HELPERS
// ============================================================

/** Ngưỡng thời gian bắt đầu của range (ms). null = không filter */
function getRangeStart(rangeId, TIME_RANGES) {
  const r = TIME_RANGES.find((x) => x.id === rangeId);
  if (!r || !r.days) return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (r.days - 1));
  return d.getTime();
}

// 🔧 FIX #93: helper format datetime VN
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return DATETIME_FORMATTER.format(d);
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function OwnerWallet() {
  const { t } = useI18n();

  // Config (useMemo vì phụ thuộc t)
  const STATUS_TABS = useMemo(
    () => [
      { id: "pending",  label: t("Chờ duyệt"), color: "#f59e0b" },
      { id: "approved", label: t("Đã duyệt"),  color: "#18a967" },
      { id: "rejected", label: t("Từ chối"),   color: "#ef4444" },
      { id: "all",      label: t("Tất cả"),    color: "#2634d5" },
    ],
    [t]
  );

  const TYPE_OPTIONS = useMemo(
    () => [
      { id: "all",      label: t("Tất cả loại") },
      { id: "deposit",  label: t("Nạp tiền") },
      { id: "withdraw", label: t("Rút tiền") },
      { id: "payment",  label: t("Thanh toán") },
    ],
    [t]
  );

  const TIME_RANGES = useMemo(
    () => [
      { id: "today",  label: t("Hôm nay"), days: 1 },
      { id: "7d",     label: t("7 ngày"),  days: 7 },
      { id: "30d",    label: t("30 ngày"), days: 30 },
      { id: "all",    label: t("Tất cả"),  days: null },
    ],
    [t]
  );

  const TX_CONFIG = useMemo(
    () => ({
      deposit:  { ...TX_KEYS.deposit,  label: t("Nạp tiền") },
      withdraw: { ...TX_KEYS.withdraw, label: t("Rút tiền") },
      payment:  { ...TX_KEYS.payment,  label: t("Thanh toán") },
    }),
    [t]
  );

  const STATUS_CONFIG = useMemo(
    () => ({
      pending:  { ...STATUS_KEYS.pending,  label: t("Chờ duyệt") },
      approved: { ...STATUS_KEYS.approved, label: t("Thành công") },
      rejected: { ...STATUS_KEYS.rejected, label: t("Từ chối") },
    }),
    [t]
  );

  const METHOD_BADGES = useMemo(
    () => ({
      QR:     { ...METHOD_KEYS.QR,     label: t("VietQR") },
      CASH:   { ...METHOD_KEYS.CASH,   label: t("Tiền mặt") },
      BANK:   { ...METHOD_KEYS.BANK,   label: t("Bank") },
      WALLET: { ...METHOD_KEYS.WALLET, label: t("Ví") },
    }),
    [t]
  );

  // ---------- Data ----------
  const [allTx, setAllTx] = useState([]);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // ---------- Filters ----------
  const [tab, setTab] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [rangeFilter, setRangeFilter] = useState("all");
  const [q, setQ] = useState("");

  // ---------- Processing state ----------
  const [processing, setProcessing] = useState({});

  // ---------- Bulk selection ----------
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // ---------- Modals ----------
  const [detailTx, setDetailTx] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);

  // Confirm dialog
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Race-safe
  const reqIdRef = useRef(0);

  // ---------- Load ----------

  const load = useCallback(async (silent = false) => {
    const myReqId = ++reqIdRef.current;
    if (!silent) setRefreshing(true);
    setError("");

    try {
      const [txs, st] = await Promise.all([
        api.wallet.all().catch(() => []),
        api.wallet.stats().catch(() => null),
      ]);

      if (myReqId !== reqIdRef.current) return;

      setAllTx(Array.isArray(txs) ? txs : []);
      setStats(st || EMPTY_STATS);
    } catch (e) {
      if (myReqId === reqIdRef.current) {
        setError(e.message || t("Không tải được dữ liệu ví"));
      }
    } finally {
      if (myReqId === reqIdRef.current) {
        setLoading(false);
        if (!silent) setRefreshing(false);
      }
    }
  }, [t]);

  useEffect(() => {
    load(false);
  }, [load]);

  // Auto-refresh
  useEffect(() => {
    const timer = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  // ESC đóng modals
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (rejectModal) setRejectModal(null);
      else if (detailTx) setDetailTx(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [detailTx, rejectModal]);

  // Reset selection khi đổi tab/type/range
  useEffect(() => {
    setSelectedIds([]);
  }, [tab, typeFilter, rangeFilter]);

  // ---------- Computed ----------

  const filtered = useMemo(() => {
    let result = [...allTx];

    if (tab !== "all") result = result.filter((t) => t.status === tab);
    if (typeFilter !== "all") result = result.filter((t) => t.type === typeFilter);

    const rangeStart = getRangeStart(rangeFilter, TIME_RANGES);
    if (rangeStart !== null) {
      result = result.filter((t) => {
        const ts = new Date(t.created_at || 0).getTime();
        return ts >= rangeStart;
      });
    }

    if (q.trim()) {
      const s = q.toLowerCase().trim();
      result = result.filter(
        (t) =>
          (t.user_name || "").toLowerCase().includes(s) ||
          (t.user_email || "").toLowerCase().includes(s) ||
          (t.code || "").toLowerCase().includes(s)
      );
    }

    result.sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      if (tab === "pending") {
        return timeA - timeB; // Chờ duyệt: Cũ nhất lên đầu
      }
      return timeB - timeA; // Các tab khác: Mới nhất lên đầu
    });
    return result;
  }, [allTx, tab, typeFilter, rangeFilter, q]);

  const counts = useMemo(
    () => ({
      pending:  allTx.filter((t) => t.status === "pending").length,
      approved: allTx.filter((t) => t.status === "approved").length,
      rejected: allTx.filter((t) => t.status === "rejected").length,
      all:      allTx.length,
    }),
    [allTx]
  );

  const hasFilter =
    tab !== "pending" || typeFilter !== "all" || rangeFilter !== "all" || q.trim();

  const selectableTxs = useMemo(
    () => filtered.filter((t) => t.status === "pending"),
    [filtered]
  );

  const allSelected =
    selectableTxs.length > 0 &&
    selectableTxs.every((t) => selectedIds.includes(t.id));

  // ---------- Selection handlers ----------

  const toggleSelect = (id) => {
    setSelectedIds((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
    );
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectableTxs.map((t) => t.id));
    }
  };

  // ---------- Actions ----------

  const openApprove = (tx) => {
    if (processing[tx.id]) return;

    const action = tx.type === "deposit" ? t("nạp") : t("rút");
    const amount = money(tx.amount);

    setConfirm({
      title: `${t("Duyệt yêu cầu")} ${action}?`,
      message:
        `${t("Xác nhận duyệt")} ${action} ${amount} ${t("cho")} "${tx.user_name}".\n\n` +
        `${t("Mã GD")}: ${tx.code}\n` +
        t("Hành động này không thể hoàn tác."),
      confirmText: t("Duyệt"),
      cancelText: t("Hủy"),
      danger: false,
      onConfirm: async () => {
        setProcessing((p) => ({ ...p, [tx.id]: "approve" }));
        try {
          await api.wallet.approve(tx.id);
          toast(`${t("Đã duyệt")} ${tx.code}`, "success");
          setConfirm(null);
          load(true);
        } catch (e) {
          toast(e.message || t("Không duyệt được"), "error");
        } finally {
          setProcessing((p) => {
            const n = { ...p };
            delete n[tx.id];
            return n;
          });
        }
      },
    });
  };

  const openBulkApprove = () => {
    if (!selectedIds.length || bulkProcessing) return;

    const txs = allTx.filter((t) => selectedIds.includes(t.id));
    const depositCount = txs.filter((t) => t.type === "deposit").length;
    const withdrawCount = txs.filter((t) => t.type === "withdraw").length;
    const totalAmount = txs.reduce((s, t) => s + (t.amount || 0), 0);

    setConfirm({
      title: `${t("Duyệt")} ${txs.length} ${t("giao dịch đã chọn?")}`,
      message:
        `${t("Bao gồm")} ${depositCount} ${t("nạp và")} ${withdrawCount} ${t("rút.")} ` +
        `${t("Tổng giá trị")} ${money(totalAmount)}.\n\n` +
        t("Hành động này không thể hoàn tác."),
      confirmText: `${t("Duyệt")} ${txs.length}`,
      cancelText: t("Hủy"),
      danger: false,
      onConfirm: async () => {
        setBulkProcessing(true);
        let success = 0;
        let failed = 0;

        for (const id of selectedIds) {
          try {
            await api.wallet.approve(id);
            success++;
          } catch {
            failed++;
          }
        }

        setBulkProcessing(false);
        setConfirm(null);
        setSelectedIds([]);

        if (failed === 0) {
          toast(`${t("Đã duyệt thành công")} ${success} ${t("giao dịch")}`, "success");
        } else if (success === 0) {
          toast(t("Không duyệt được giao dịch nào"), "error");
        } else {
          toast(
            `${t("Đã duyệt")} ${success}, ${t("thất bại")} ${failed} ${t("giao dịch")}`,
            "warning"
          );
        }

        load(true);
      },
    });
  };

  const closeConfirm = () => {
    if (confirmBusy || bulkProcessing) return;
    setConfirm(null);
  };

  const runConfirm = async () => {
    if (!confirm || confirmBusy) return;
    setConfirmBusy(true);
    try {
      await confirm.onConfirm();
    } finally {
      setConfirmBusy(false);
    }
  };

  const openReject = (tx) => setRejectModal(tx);

  const confirmReject = async (tx, note) => {
    setProcessing((p) => ({ ...p, [tx.id]: "reject" }));
    setRejectModal(null);
    try {
      await api.wallet.reject(tx.id, note);
      toast(`${t("Đã từ chối")} ${tx.code}`, "success");
      load(true);
    } catch (e) {
      toast(e.message || t("Không từ chối được"), "error");
    } finally {
      setProcessing((p) => {
        const n = { ...p };
        delete n[tx.id];
        return n;
      });
    }
  };

  const clearFilters = () => {
    setTab("pending");
    setTypeFilter("all");
    setRangeFilter("all");
    setQ("");
  };

  return (
    <>
      <div>
        {/* STATS */}
        {loading ? (
          <div style={{ marginBottom: 20 }}>
            <SkeletonStats count={4} columns="repeat(auto-fit, minmax(200px, 1fr))" />
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 14,
              marginBottom: 20,
            }}
          >
            <StatBox
              icon={<Wallet size={20} />}
              label={t("Tổng số dư ví")}
              value={money(stats.totalBalance)}
              color="#2634d5"
            />
            <StatBox
              icon={<ArrowDownCircle size={20} />}
              label={t("Đã nạp")}
              value={money(stats.totalDeposited)}
              color="#18a967"
            />
            <StatBox
              icon={<ArrowUpCircle size={20} />}
              label={t("Đã rút")}
              value={money(stats.totalWithdrawn)}
              color="#f59e0b"
            />
            <StatBox
              icon={<ShoppingBag size={20} />}
              label={t("Đã thanh toán")}
              value={money(stats.totalPaid)}
              color="#8b5cf6"
            />
          </div>
        )}

        {/* PENDING ALERT */}
        {stats.pendingCount > 0 && (
          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(239, 68, 68, 0.08))",
              border: "2px solid #f59e0b",
              borderRadius: 12,
              padding: "14px 18px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "#f59e0b",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={22} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <b
                style={{
                  fontSize: 14,
                  color: "#92400e",
                  display: "block",
                  marginBottom: 2,
                }}
              >
                {t("Có")} {stats.pendingCount} {t("yêu cầu chờ duyệt")}
              </b>
              <span style={{ fontSize: 13, color: "#78350f" }}>
                {stats.pendingDepositCount} {t("nạp")} · {stats.pendingWithdrawCount} {t("rút")}{" "}
                — {t("vui lòng xử lý sớm")}
              </span>
            </div>
            <button
              onClick={() => {
                setTab("pending");
                setTypeFilter("all");
                setRangeFilter("all");
              }}
              style={{
                padding: "9px 16px",
                background: "#f59e0b",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {t("Xem ngay")}
            </button>
          </div>
        )}

        {/* ERROR BANNER */}
        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 16,
              color: "#ef4444",
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 13,
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{error}</span>
            <button
              onClick={() => load(false)}
              style={{
                padding: "6px 12px",
                background: "#ef4444",
                color: "#fff",
                border: 0,
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              {t("Thử lại")}
            </button>
          </div>
        )}

        {/* FILTERS */}
        <div
          style={{
            background: "var(--card-bg, #fff)",
            border: "1px solid var(--border-color, #e7ebf0)",
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            {/* Search */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--bg-tertiary, #f5f7fb)",
                border: "1px solid var(--border-color, #e5e9ef)",
                borderRadius: 8,
                padding: "8px 12px",
                flex: 1,
                minWidth: 200,
              }}
            >
              <Search size={16} style={{ color: "var(--text-light, #8993a3)" }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("Tìm theo tên, email, mã GD...")}
                style={{
                  flex: 1,
                  border: 0,
                  outline: "none",
                  background: "transparent",
                  color: "var(--text-primary, #172033)",
                  fontSize: 13,
                  minWidth: 0,
                }}
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  style={clearBtnStyle}
                  aria-label={t("Xoá tìm kiếm")}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Type filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={selectStyle}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>

            {/* Refresh */}
            <button
              onClick={() => load(false)}
              disabled={refreshing}
              title={t("Làm mới")}
              style={{
                padding: "9px 14px",
                background: "var(--bg-tertiary, #f5f7fb)",
                border: "1px solid var(--border-color, #e5e9ef)",
                borderRadius: 8,
                cursor: refreshing ? "not-allowed" : "pointer",
                fontSize: 13,
                color: "var(--text-primary, #172033)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                opacity: refreshing ? 0.7 : 1,
              }}
            >
              {refreshing ? (
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <RefreshCw size={14} />
              )}
              {t("Làm mới")}
            </button>

            {/* Clear */}
            {hasFilter && (
              <button
                onClick={clearFilters}
                style={{
                  padding: "9px 14px",
                  background: "transparent",
                  border: "1px solid #ef4444",
                  color: "#ef4444",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <X size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                {t("Xoá lọc")}
              </button>
            )}
          </div>

          {/* Time range chips */}
          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: "var(--text-muted, #64748b)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                marginRight: 4,
              }}
            >
              <Clock size={12} /> {t("Thời gian:")}
            </span>
            {TIME_RANGES.map((r) => {
              const active = rangeFilter === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => setRangeFilter(r.id)}
                  style={{
                    padding: "6px 12px",
                    background: active ? "#2634d5" : "var(--bg-tertiary, #f5f7fb)",
                    color: active ? "#fff" : "var(--text-muted, #475569)",
                    border: "1px solid " + (active ? "#2634d5" : "var(--border-color, #e5e9ef)"),
                    borderRadius: 16,
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          {/* Status tabs */}
          <div
            style={{
              display: "flex",
              gap: 4,
              background: "var(--bg-tertiary, #f5f7fb)",
              padding: 4,
              borderRadius: 10,
              flexWrap: "wrap",
            }}
          >
            {STATUS_TABS.map((s) => {
              const active = tab === s.id;
              const count = counts[s.id] || 0;
              return (
                <button
                  key={s.id}
                  onClick={() => setTab(s.id)}
                  style={{
                    padding: "9px 14px",
                    background: active ? s.color : "transparent",
                    color: active ? "#fff" : "var(--text-muted, #475569)",
                    border: 0,
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.label}
                  {count > 0 && (
                    <span
                      style={{
                        background: active
                          ? "rgba(255,255,255,0.3)"
                          : s.id === "pending"
                          ? "#ef4444"
                          : "var(--card-bg, #e2e8f0)",
                        color: active
                          ? "#fff"
                          : s.id === "pending"
                          ? "#fff"
                          : "var(--text-muted, #64748b)",
                        minWidth: 20,
                        height: 18,
                        padding: "0 6px",
                        borderRadius: 9,
                        fontSize: 10.5,
                        fontWeight: 800,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* BULK ACTION BAR */}
        {selectedIds.length > 0 && (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 16px",
              background:
                "linear-gradient(135deg, rgba(24, 169, 103, 0.12), rgba(38, 52, 213, 0.08))",
              border: "1px solid rgba(24, 169, 103, 0.3)",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#18a967",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <CheckSquare size={16} />
              {t("Đã chọn")} <b>{selectedIds.length}</b> {t("giao dịch")}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setSelectedIds([])}
                disabled={bulkProcessing}
                style={{
                  padding: "8px 14px",
                  background: "transparent",
                  border: "1px solid var(--border-color, #e5e9ef)",
                  color: "var(--text-muted, #64748b)",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: bulkProcessing ? "not-allowed" : "pointer",
                }}
              >
                {t("Bỏ chọn")}
              </button>
              <button
                onClick={openBulkApprove}
                disabled={bulkProcessing}
                style={{
                  padding: "8px 16px",
                  background: bulkProcessing ? "#94a3b8" : "#18a967",
                  color: "#fff",
                  border: 0,
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: bulkProcessing ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {bulkProcessing ? (
                  <>
                    <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                    {t("Đang duyệt...")}
                  </>
                ) : (
                  <>
                    <Check size={13} /> {t("Duyệt")} {selectedIds.length}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* TRANSACTIONS LIST */}
        <div
          style={{
            background: "var(--card-bg, #fff)",
            border: "1px solid var(--border-color, #e7ebf0)",
            borderRadius: 12,
            padding: 20,
          }}
        >
          {tab === "pending" && selectableTxs.length > 0 && !loading && (
            <div
              style={{
                marginBottom: 12,
                paddingBottom: 12,
                borderBottom: "1px dashed var(--border-color, #eef2f7)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <button
                onClick={toggleSelectAll}
                style={{
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  padding: 4,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--text-muted, #64748b)",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {allSelected ? (
                  <CheckSquare size={18} color="#18a967" />
                ) : (
                  <Square size={18} />
                )}
                {allSelected ? t("Bỏ chọn tất cả") : t("Chọn tất cả")}
              </button>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--text-light, #8993a3)",
                }}
              >
                ({selectableTxs.length} {t("giao dịch chờ duyệt trong view này")})
              </span>
            </div>
          )}

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonList key={i} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={emptyBoxStyle}>
              <Wallet size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
              <p style={{ margin: 0, fontSize: 13 }}>
                {hasFilter
                  ? t("Không có giao dịch nào khớp bộ lọc")
                  : tab === "pending"
                  ? t("Không có yêu cầu nào chờ duyệt")
                  : t("Chưa có giao dịch nào")}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map((tx) => (
                <TxRow
                  key={tx.id}
                  tx={tx}
                  TX_CONFIG={TX_CONFIG}
                  STATUS_CONFIG={STATUS_CONFIG}
                  METHOD_BADGES={METHOD_BADGES}
                  processing={processing[tx.id]}
                  selected={selectedIds.includes(tx.id)}
                  onToggleSelect={() => toggleSelect(tx.id)}
                  onApprove={() => openApprove(tx)}
                  onReject={() => openReject(tx)}
                  onView={() => setDetailTx(tx)}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>

        {/* MODALS */}
        {detailTx && (
          <DetailModal
            tx={detailTx}
            onClose={() => setDetailTx(null)}
            TX_CONFIG={TX_CONFIG}
            STATUS_CONFIG={STATUS_CONFIG}
            METHOD_BADGES={METHOD_BADGES}
            t={t}
          />
        )}

        {rejectModal && (
          <RejectModal
            tx={rejectModal}
            onClose={() => setRejectModal(null)}
            onConfirm={(note) => confirmReject(rejectModal, note)}
            t={t}
          />
        )}

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </div>

      {/* ConfirmDialog */}
      {confirm && (
        <ConfirmDialog
          open
          title={confirm.title}
          message={confirm.message}
          confirmText={confirm.confirmText}
          cancelText={confirm.cancelText}
          danger={confirm.danger}
          loading={confirmBusy || bulkProcessing}
          onConfirm={runConfirm}
          onClose={closeConfirm}
        />
      )}
    </>
  );
}

// ============================================================
// SUB-COMPONENT: TxRow
// ============================================================

function TxRow({
  tx, TX_CONFIG, STATUS_CONFIG, METHOD_BADGES,
  processing, selected, onToggleSelect,
  onApprove, onReject, onView, t,
}) {
  const config = TX_CONFIG[tx.type] || {
    icon: Wallet,
    color: "#2634d5",
    bg: "#eef2ff",
    label: t("Giao dịch"),
    sign: "",
  };
  const statusConfig = STATUS_CONFIG[tx.status] || {
    label: "—",
    color: "#64748b",
    bg: "#f1f5f9",
  };
  const methodBadge = METHOD_BADGES[tx.method];

  const Icon = config.icon;
  const isPending = tx.status === "pending";
  const isProcessing = !!processing;
  const canSelect = isPending;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 14,
        background: selected
          ? "rgba(24, 169, 103, 0.06)"
          : "var(--bg-tertiary, #f8fafc)",
        borderRadius: 10,
        border: selected
          ? "1px solid #18a967"
          : isPending
          ? `1px solid ${config.color}40`
          : "1px solid var(--border-color, #eef2f7)",
        opacity: isProcessing ? 0.6 : 1,
        transition: "all 0.2s",
      }}
    >
      {/* Checkbox khi pending */}
      {canSelect && (
        <button
          onClick={onToggleSelect}
          disabled={isProcessing}
          title={selected ? t("Bỏ chọn") : t("Chọn để duyệt hàng loạt")}
          style={{
            background: "transparent",
            border: 0,
            cursor: isProcessing ? "not-allowed" : "pointer",
            padding: 0,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          {selected ? (
            <CheckSquare size={22} color="#18a967" />
          ) : (
            <Square size={22} color="#94a3b8" />
          )}
        </button>
      )}

      {/* Icon */}
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 12,
          background: config.bg,
          color: config.color,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={22} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 3,
            flexWrap: "wrap",
          }}
        >
          <b style={{ fontSize: 13, color: "var(--text-primary, #172033)" }}>
            {tx.user_name || t("Khách")}
          </b>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 10,
              fontSize: 10,
              fontWeight: 700,
              background: statusConfig.bg,
              color: statusConfig.color,
            }}
          >
            {statusConfig.label}
          </span>
          {methodBadge && (
            <span
              style={{
                fontSize: 10,
                color: methodBadge.color,
                background: methodBadge.bg,
                padding: "2px 8px",
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              {methodBadge.label}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-light, #8993a3)",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontFamily: "monospace" }}>{tx.code}</span>
          <span>· {tx.user_email}</span>
          <span>
            {/* 🔧 FIX #93: dùng fmtDateTime cố định VN */}
            · {fmtDateTime(tx.created_at)}
          </span>
        </div>
        {tx.note && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted, #64748b)",
              marginTop: 3,
              fontStyle: "italic",
            }}
          >
            "{tx.note}"
          </div>
        )}
      </div>

      {/* Amount */}
      <div style={{ textAlign: "right", flexShrink: 0, marginRight: 8 }}>
        <b style={{ fontSize: 16, color: config.color, display: "block" }}>
          {config.sign}
          {money(tx.amount)}
        </b>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button
          onClick={onView}
          title={t("Chi tiết")}
          aria-label={t("Chi tiết")}
          style={iconBtnStyle}
        >
          <Eye size={14} />
        </button>

        {isPending && (
          <>
            <button
              onClick={onApprove}
              disabled={isProcessing}
              title={t("Duyệt")}
              aria-label={t("Duyệt")}
              style={{
                padding: "7px 12px",
                background: "#18a967",
                color: "#fff",
                border: 0,
                borderRadius: 7,
                cursor: isProcessing ? "not-allowed" : "pointer",
                fontWeight: 700,
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                opacity: isProcessing ? 0.5 : 1,
              }}
            >
              {processing === "approve" ? (
                <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <Check size={13} />
              )}
              {t("Duyệt")}
            </button>
            <button
              onClick={onReject}
              disabled={isProcessing}
              title={t("Từ chối")}
              aria-label={t("Từ chối")}
              style={{
                padding: "7px 12px",
                background: "var(--card-bg, #fff)",
                color: "#ef4444",
                border: "1px solid #ef4444",
                borderRadius: 7,
                cursor: isProcessing ? "not-allowed" : "pointer",
                fontWeight: 700,
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                opacity: isProcessing ? 0.5 : 1,
              }}
            >
              <Ban size={13} /> {t("Từ chối")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
// ============================================================
// SUB-COMPONENT: DetailModal
// ============================================================

function DetailModal({ tx, onClose, TX_CONFIG, STATUS_CONFIG, METHOD_BADGES, t }) {
  const config = TX_CONFIG[tx.type] || {
    icon: Wallet,
    color: "#2634d5",
    label: t("Giao dịch"),
  };
  const Icon = config.icon;

  const statusConfig = STATUS_CONFIG[tx.status] || {
    label: "—",
    color: "#64748b",
  };

  return (
    <Modal onClose={onClose} maxWidth={500}>
      <div style={modalHeaderStyle}>
        <h3 style={modalTitleStyle}>
          <Icon size={20} style={{ color: config.color }} /> {t("Chi tiết giao dịch")}
        </h3>
        <button onClick={onClose} style={modalCloseStyle} aria-label={t("Đóng")}>
          <X size={20} />
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <InfoRow label={t("Mã GD")} value={tx.code} mono />
        <InfoRow label={t("Loại")} value={config.label} />
        <InfoRow
          label={t("Số tiền")}
          value={money(tx.amount)}
          highlight={config.color}
        />
        <InfoRow label={t("Khách hàng")} value={tx.user_name || "—"} />
        <InfoRow label={t("Email")} value={tx.user_email || "—"} />
        <InfoRow
          label={t("Phương thức")}
          value={METHOD_BADGES[tx.method]?.label || tx.method || "—"}
        />
        <InfoRow label={t("Trạng thái")} value={statusConfig.label} />
        {/* 🔧 FIX #93: dùng fmtDateTime cố định VN */}
        <InfoRow
          label={t("Ngày tạo")}
          value={fmtDateTime(tx.created_at)}
        />
        {tx.approved_at && (
          <InfoRow
            label={t("Ngày duyệt")}
            value={fmtDateTime(tx.approved_at)}
          />
        )}
        {tx.approved_by && <InfoRow label={t("Người duyệt")} value={tx.approved_by} />}

        {tx.bank_name && (
          <div
            style={{
              background: "var(--bg-tertiary, #f5f7fb)",
              borderRadius: 10,
              padding: 12,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "var(--text-light, #8993a3)",
                marginBottom: 6,
                fontWeight: 600,
              }}
            >
              {t("THÔNG TIN NGÂN HÀNG")}
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 3,
              }}
            >
              <Building2 size={13} style={{ color: "#2634d5" }} />
              <b style={{ fontSize: 13 }}>{tx.bank_name}</b>
            </div>
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 13,
                color: "var(--text-muted, #64748b)",
              }}
            >
              {tx.bank_account}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted, #64748b)",
                marginTop: 2,
              }}
            >
              {tx.bank_account_name}
            </div>
          </div>
        )}

        {tx.note && (
          <div
            style={{
              background: "var(--bg-tertiary, #f5f7fb)",
              borderRadius: 10,
              padding: 12,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "var(--text-light, #8993a3)",
                marginBottom: 4,
                fontWeight: 600,
              }}
            >
              {t("GHI CHÚ CỦA KHÁCH")}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-primary, #172033)",
                fontStyle: "italic",
              }}
            >
              "{tx.note}"
            </div>
          </div>
        )}

        {tx.admin_note && (
          <div
            style={{
              background: "#fef3c7",
              borderRadius: 10,
              padding: 12,
              border: "1px solid #f59e0b40",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#92400e",
                marginBottom: 4,
                fontWeight: 600,
              }}
            >
              {t("GHI CHÚ CỦA ADMIN")}
            </div>
            <div style={{ fontSize: 13, color: "#92400e" }}>
              {tx.admin_note}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={onClose}
        style={{ ...btnPrimaryStyle, marginTop: 16, width: "100%" }}
      >
        {t("Đóng")}
      </button>
    </Modal>
  );
}
// ============================================================
// SUB-COMPONENT: RejectModal
// ============================================================

function RejectModal({ tx, onClose, onConfirm, t }) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = () => {
    setSubmitting(true);
    onConfirm(note.trim());
  };

  return (
    <Modal onClose={() => !submitting && onClose()} maxWidth={480}>
      <div style={modalHeaderStyle}>
        <h3 style={modalTitleStyle}>
          <Ban size={20} style={{ color: "#ef4444" }} /> {t("Từ chối giao dịch")}
        </h3>
        <button
          onClick={onClose}
          disabled={submitting}
          style={modalCloseStyle}
          aria-label={t("Đóng")}
        >
          <X size={20} />
        </button>
      </div>

      <div
        style={{
          background: "var(--bg-tertiary, #f5f7fb)",
          borderRadius: 10,
          padding: 14,
          marginBottom: 16,
          fontSize: 13,
        }}
      >
        <div style={{ marginBottom: 4 }}>
          <b>{tx.user_name || t("Khách")}</b> · {money(tx.amount)}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-light, #94a3b8)",
            fontFamily: "monospace",
          }}
        >
          {tx.code}
        </div>
      </div>

      <label style={labelStyle}>
        {t("Lý do từ chối (tùy chọn, sẽ hiển thị cho khách)")}
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("VD: Số tài khoản không hợp lệ, vui lòng liên hệ hỗ trợ...")}
        rows={3}
        autoFocus
        disabled={submitting}
        style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
      />

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button
          onClick={onClose}
          disabled={submitting}
          style={{ ...btnCancelStyle, flex: 1 }}
        >
          {t("Hủy")}
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          style={{
            ...btnPrimaryStyle,
            flex: 1,
            background: submitting ? "#94a3b8" : "#ef4444",
          }}
        >
          {submitting ? (
            <>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              {t("Đang từ chối...")}
            </>
          ) : (
            <>
              <Ban size={14} /> {t("Từ chối")}
            </>
          )}
        </button>
      </div>
    </Modal>
  );
}

// ============================================================
// SMALL SUB-COMPONENTS
// ============================================================

function InfoRow({ label, value, mono, highlight }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 0",
        borderBottom: "1px dashed var(--border-color, #eef2f7)",
        fontSize: 13,
        gap: 10,
      }}
    >
      <span style={{ color: "var(--text-muted, #64748b)" }}>{label}</span>
      <b
        style={{
          color: highlight || "var(--text-primary, #172033)",
          fontFamily: mono ? "monospace" : "inherit",
          fontSize: highlight ? 15 : 13,
          textAlign: "right",
          wordBreak: "break-word",
        }}
      >
        {value}
      </b>
    </div>
  );
}

function StatBox({ icon, label, value, color }) {
  return (
    <div
      style={{
        background: "var(--card-bg, #fff)",
        border: "1px solid var(--border-color, #e7ebf0)",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: color + "18",
            color,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <span
          style={{
            fontSize: 11.5,
            color: "var(--text-light, #8993a3)",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function Modal({ children, onClose, maxWidth = 500 }) {
  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: MODAL_Z,
        padding: 20,
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card-bg, #fff)",
          borderRadius: 14,
          padding: 24,
          width: "100%",
          maxWidth,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ============================================================
// STYLE CONSTANTS
// ============================================================

const inputStyle = {
  width: "100%",
  padding: 10,
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  outline: "none",
  background: "var(--bg-secondary, #fff)",
  color: "var(--text-primary, #172033)",
  fontSize: 13,
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
  color: "var(--text-muted, #475569)",
};

const selectStyle = {
  padding: "9px 12px",
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  outline: "none",
  background: "var(--bg-secondary, #fff)",
  color: "var(--text-primary, #172033)",
  fontSize: 13,
  cursor: "pointer",
};

const iconBtnStyle = {
  padding: 6,
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 6,
  background: "var(--card-bg, #fff)",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  color: "var(--text-primary, #172033)",
  width: 30,
  height: 30,
  flexShrink: 0,
};

const clearBtnStyle = {
  background: "transparent",
  border: 0,
  cursor: "pointer",
  color: "var(--text-light, #8993a3)",
  padding: 2,
};

const modalHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 16,
};

const modalTitleStyle = {
  margin: 0,
  color: "var(--text-primary, #172033)",
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 16,
};

const modalCloseStyle = {
  background: "transparent",
  border: 0,
  cursor: "pointer",
  color: "var(--text-light, #8993a3)",
  padding: 4,
  display: "grid",
  placeItems: "center",
};

const btnPrimaryStyle = {
  padding: 12,
  background: "#2634d5",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
};

const btnCancelStyle = {
  padding: 12,
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  background: "var(--card-bg, #fff)",
  cursor: "pointer",
  color: "var(--text-primary, #172033)",
  fontWeight: 600,
  fontSize: 13,
};

const emptyBoxStyle = {
  textAlign: "center",
  padding: 40,
  color: "var(--text-light, #8993a3)",
};
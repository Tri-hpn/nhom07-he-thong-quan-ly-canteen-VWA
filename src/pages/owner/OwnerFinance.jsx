// ============================================================
// OWNERFINANCE.JSX — Quản lý tài chính (Admin)
// ============================================================
// ✅ SOURCE-TEXT I18N: dùng tiếng Việt trực tiếp qua t("...")
// ============================================================

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Wallet, CreditCard, TrendingUp, Receipt, DollarSign, BarChart3, CheckCircle2, Download, Save, Plus, Pencil, X, Loader2, AlertCircle, Trash2, ArrowUpDown, Filter, CalendarDays, CalendarRange, Calendar,
} from "lucide-react";
import { api } from "../../api";
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import ConfirmDialog from "../../components/ConfirmDialog";

// ============================================================
// CONSTANTS
// ============================================================

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

// Status → màu badge giao dịch
const ORDER_STATUS_COLORS = {
  "Hoàn thành":  { bg: "#e8f9f1", fg: "#18a967" },
  "Đã hủy":      { bg: "#fee2e2", fg: "#ef4444" },
  "Chờ xác nhận":{ bg: "#fff4d8", fg: "#c47d10" },
  "Đã xác nhận": { bg: "#dbeafe", fg: "#1e40af" },
  "Đang chuẩn bị": { bg: "#ede9fe", fg: "#6d28d9" },
  "Sẵn sàng nhận": { bg: "#d1fae5", fg: "#065f46" },
};

// ============================================================
// HELPERS
// ============================================================

/** ✅ #7.4: format VNĐ đồng nhất */
const fmtMoney = (n) => money(n);

/** "YYYY-MM-DD" theo local time */
function getLocalDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dt = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dt}`;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function OwnerFinance() {
  const { t } = useI18n();
  const [tab, setTab] = useState("account");

  // Tabs config — useMemo vì phụ thuộc t
  const TABS = useMemo(
    () => [
      { id: "account",      label: t("Tài khoản nhận tiền"), icon: CreditCard },
      { id: "revenue",      label: t("Doanh thu"),           icon: TrendingUp },
      { id: "transactions", label: t("Giao dịch"),           icon: Receipt },
      { id: "expenses",     label: t("Chi phí"),             icon: DollarSign },
      { id: "stats",        label: t("Thống kê"),            icon: BarChart3 },
      { id: "reconcile",    label: t("Đối soát"),            icon: CheckCircle2 },
      { id: "export",       label: t("Xuất báo cáo"),        icon: Download },
    ],
    [t]
  );

  return (
    <div>
      {/* TAB BAR */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 20,
          overflowX: "auto",
          background: "var(--card-bg, #fff)",
          border: "1px solid var(--border-color, #e7ebf0)",
          borderRadius: 12,
          padding: 8,
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {TABS.map((tabItem) => {
          const Icon = tabItem.icon;
          const active = tab === tabItem.id;
          return (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              style={{
                padding: "10px 14px",
                background: active ? "#2634d5" : "transparent",
                color: active ? "#fff" : "var(--text-muted, #475569)",
                border: 0,
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
                flexShrink: 0,
                transition: "all 0.2s",
              }}
            >
              <Icon size={14} /> {tabItem.label}
            </button>
          );
        })}
        <style>{`
          div[style*="overflow-x: auto"]::-webkit-scrollbar { display: none; }
        `}</style>
      </div>

      {/* TAB CONTENT */}
      {tab === "account" && <AccountTab />}
      {tab === "revenue" && <RevenueTab />}
      {tab === "transactions" && <TransactionsTab />}
      {tab === "expenses" && <ExpensesTab />}
      {tab === "stats" && <StatsTab />}
      {tab === "reconcile" && <ReconcileTab />}
      {tab === "export" && <ExportTab />}
    </div>
  );
}

// ============================================================
// TAB 1: TÀI KHOẢN NHẬN TIỀN
// ============================================================

function AccountTab() {
  const { t } = useI18n();
  const [form, setForm] = useState({ bank: "VCB", account: "", accountName: "" });
  const [original, setOriginal] = useState({ bank: "VCB", account: "", accountName: "" });
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const d = await api.settings.get();
      const init = {
        bank: d.bank || "VCB",
        account: d.account || "",
        accountName: d.accountName || "",
      };
      setForm(init);
      setOriginal(init);
    } catch (e) {
      setError(e.message || t("Không tải được cài đặt"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(timer);
  }, [saved]);

  const updateField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const normalizeAccountName = () => {
    setForm((f) => ({ ...f, accountName: f.accountName.toUpperCase().trim() }));
  };

  const startEdit = () => {
    setIsEditing(true);
    setSaved(false);
    toast(t("Bấm Lưu để hoàn tất"), "info");
  };

  const cancelEdit = () => {
    setForm(original);
    setIsEditing(false);
    toast(t("Đã hủy thay đổi"), "info");
  };

  const save = async () => {
    if (!form.account.trim()) {
      return toast(t("Vui lòng nhập số tài khoản"), "error");
    }
    if (!/^[0-9]{6,20}$/.test(form.account.trim())) {
      return toast(t("Số tài khoản phải là 6-20 chữ số"), "error");
    }
    if (!form.accountName.trim()) {
      return toast(t("Vui lòng nhập tên chủ tài khoản"), "error");
    }

    setSaving(true);
    try {
      const payload = {
        bank: form.bank,
        account: form.account.trim(),
        accountName: form.accountName.trim().toUpperCase(),
      };
      await api.settings.update(payload);
      setOriginal(payload);
      setForm(payload);
      toast(t("Đã lưu tài khoản nhận tiền"), "success");
      setSaved(true);
      setIsEditing(false);
    } catch (e) {
      toast(e.message || t("Không lưu được"), "error");
    } finally {
      setSaving(false);
    }
  };

  const qrPreview = form.account
    ? `https://img.vietqr.io/image/${form.bank}-${form.account}-compact2.png?amount=35000&accountName=${encodeURIComponent(form.accountName || "CANTEEN VWA")}`
    : null;

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "var(--text-light, #8993a3)" }}>
        <Loader2 size={26} style={{ animation: "spin 1s linear infinite", marginBottom: 10 }} />
        <div>{t("Đang tải cài đặt...")}</div>
      </div>
    );
  }

  if (error) {
    return <ErrorBox message={error} onRetry={load} t={t} />;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
        gap: 20,
      }}
      className="finance-account-grid"
    >
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h3 style={{ ...h3Style, margin: 0 }}>
            <CreditCard size={18} /> {t("Tài khoản nhận tiền")}
          </h3>
          {!isEditing && (
            <button onClick={startEdit} style={btnGhostStyle}>
              <Pencil size={14} /> {t("Sửa")}
            </button>
          )}
        </div>

        {isEditing && (
          <div
            style={{
              padding: "8px 12px",
              background: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              color: "#92400e",
              borderRadius: 8,
              fontSize: 12,
              marginBottom: 14,
              fontWeight: 600,
            }}
          >
            ✏️ {t('Đang chỉnh sửa — bấm "Lưu" để hoàn tất hoặc "Hủy" để bỏ')}
          </div>
        )}

        <label style={labelStyle}>{t("Ngân hàng")}</label>
        <select
          value={form.bank}
          onChange={(e) => updateField("bank", e.target.value)}
          disabled={!isEditing}
          style={{ ...inputStyle, cursor: isEditing ? "pointer" : "not-allowed" }}
        >
          {BANKS.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name} ({b.code})
            </option>
          ))}
        </select>

        <label style={labelStyle}>{t("Số tài khoản")}</label>
        <input
          value={form.account}
          onChange={(e) =>
            updateField("account", e.target.value.replace(/[^0-9]/g, ""))
          }
          placeholder="1234567890"
          disabled={!isEditing}
          inputMode="numeric"
          style={inputStyle}
        />

        <label style={labelStyle}>{t("Chủ tài khoản")}</label>
        <input
          value={form.accountName}
          onChange={(e) => updateField("accountName", e.target.value)}
          onBlur={normalizeAccountName}
          placeholder="NGUYEN VAN A"
          disabled={!isEditing}
          style={inputStyle}
        />

        {isEditing ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
            <button
              onClick={cancelEdit}
              disabled={saving}
              style={btnDangerOutlineStyle(saving)}
            >
              <X size={16} /> {t("Hủy")}
            </button>
            <button
              onClick={save}
              disabled={saving}
              style={btnPrimaryStyle(saving)}
            >
              {saving ? (
                <>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  {t("Đang lưu...")}
                </>
              ) : (
                <>
                  <Save size={16} /> {t("Lưu")}
                </>
              )}
            </button>
          </div>
        ) : (
          saved && (
            <div
              style={{
                marginTop: 8,
                padding: 14,
                background: "#e8f9f1",
                color: "#18a967",
                borderRadius: 10,
                fontWeight: 700,
                textAlign: "center",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                width: "100%",
              }}
            >
              <CheckCircle2 size={18} /> {t("Đã lưu")}
            </div>
          )
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={h3Style}>{t("Preview QR")}</h3>
        <div
          style={{
            textAlign: "center",
            padding: 14,
            background: "var(--bg-tertiary, #f8fafc)",
            borderRadius: 10,
            minHeight: 228,
            display: "grid",
            placeItems: "center",
          }}
        >
          {qrPreview ? (
            <img
              src={qrPreview}
              alt={t("QR thanh toán")}
              style={{ width: 200, height: 200, objectFit: "contain" }}
              onError={(e) => {
                e.target.style.display = "none";
                e.target.nextSibling.style.display = "block";
              }}
            />
          ) : null}
          <div
            style={{
              display: qrPreview ? "none" : "block",
              color: "var(--text-light, #8993a3)",
              fontSize: 13,
            }}
          >
            {t("Nhập số tài khoản để xem trước QR")}
          </div>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-muted, #64748b)",
            marginTop: 12,
            textAlign: "center",
          }}
        >
          {t("QR này được dùng khi khách chọn thanh toán QR")}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ============================================================
// TAB 2: DOANH THU
// ============================================================

function RevenueTab() {
  const { t } = useI18n();
  const [period, setPeriod] = useState("day");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const PERIODS = useMemo(
    () => [
      { id: "day",   label: t("Ngày") },
      { id: "week",  label: t("Tuần") },
      { id: "month", label: t("Tháng") },
      { id: "year",  label: t("Năm") },
    ],
    [t]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api.reports
      .revenue(period)
      .then((res) => !cancelled && setData(res))
      .catch((e) => !cancelled && setError(e.message || t("Không tải được báo cáo")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [period, t]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          overflowX: "auto",
          paddingBottom: 4,
          scrollbarWidth: "none",
        }}
      >
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            style={{ ...chipStyle(period === p.id), flexShrink: 0 }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <KPI label={t("Tổng doanh thu")} value={fmtMoney(data?.totalRevenue || 0)} color="#18a967" />
        <KPI label={t("Số đơn")}         value={data?.totalOrders || 0}       color="#2634d5" />
        <KPI label={t("Giá trị TB/đơn")} value={fmtMoney(data?.avgOrder || 0)}    color="#f59e0b" />
      </div>

      <div style={cardStyle}>
        <h3 style={h3Style}>
          <TrendingUp size={18} /> {t("Chi tiết doanh thu")}
        </h3>

        {loading ? (
          <LoadingBox t={t} />
        ) : error ? (
          <ErrorBox message={error} t={t} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr style={theadStyle}>
                  <th style={thStyle}>{t("Kỳ")}</th>
                  <th style={thStyle}>{t("Thời gian")}</th>
                  <th style={thStyle}>{t("Số đơn")}</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>{t("Doanh thu")}</th>
                </tr>
              </thead>
              <tbody>
                {(data?.data || []).map((d, i) => (
                  <tr key={i} style={trStyle}>
                    <td style={tdStyle}><b>{d.label}</b></td>
                    <td style={tdStyle}>{d.date}</td>
                    <td style={tdStyle}>{d.orders}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <b style={{ color: "#18a967" }}>{fmtMoney(d.revenue)}</b>
                    </td>
                  </tr>
                ))}
                {!data?.data?.length && (
                  <tr>
                    <td colSpan="4" style={emptyTdStyle}>{t("Chưa có dữ liệu")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
// ============================================================
// TAB 3: GIAO DỊCH
// ============================================================

function TransactionsTab() {
  const { t } = useI18n();
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const FILTERS = useMemo(
    () => [
      { id: "all",       label: t("Tất cả") },
      { id: "paid",      label: t("Đã thanh toán") },
      { id: "cancelled", label: t("Đã hủy") },
    ],
    [t]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.orders
      .all("Tất cả")
      .then((d) => !cancelled && setOrders(Array.isArray(d) ? d : []))
      .catch((e) => !cancelled && setError(e.message || t("Không tải được giao dịch")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [t]);

  const filtered = useMemo(() => {
    if (filter === "paid") return orders.filter((o) => o.status === "Hoàn thành");
    if (filter === "cancelled") return orders.filter((o) => o.status === "Đã hủy");
    return orders;
  }, [orders, filter]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          overflowX: "auto",
          paddingBottom: 4,
          scrollbarWidth: "none",
        }}
      >
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{ ...chipStyle(filter === f.id), flexShrink: 0 }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={cardStyle}>
        <h3 style={h3Style}>
          <Receipt size={18} /> {t("Lịch sử giao dịch")} ({filtered.length})
        </h3>

        {loading ? (
          <LoadingBox t={t} />
        ) : error ? (
          <ErrorBox message={error} t={t} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr style={theadStyle}>
                  <th style={thStyle}>{t("Mã đơn")}</th>
                  <th style={thStyle}>{t("Khách")}</th>
                  <th style={thStyle}>{t("Ngày")}</th>
                  <th style={thStyle}>{t("PTTT")}</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>{t("Số tiền")}</th>
                  <th style={thStyle}>{t("Trạng thái")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o._id || o.id} style={trStyle}>
                    <td style={tdStyle}><b>{o.code}</b></td>
                    <td style={tdStyle}>{o.customer_name}</td>
                    <td style={tdStyle}>
                      {o.created_at
                        ? new Date(o.created_at).toLocaleString("vi-VN")
                        : "—"}
                    </td>
                    <td style={tdStyle}>{o.payment || t("Tiền mặt")}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <b>{fmtMoney(o.total)}</b>
                    </td>
                    <td style={tdStyle}>
                      <StatusBadge status={o.status} t={t} />
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan="6" style={emptyTdStyle}>{t("Chưa có giao dịch")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TAB 4: CHI PHÍ
// ============================================================

function ExpensesTab() {
  const { t } = useI18n();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    amount: "",
    category: "Nguyên liệu",
    note: "",
  });
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const EXPENSE_CATEGORIES = useMemo(
    () => [
      t("Nguyên liệu"),
      t("Nhập hàng"),
      t("Vận hành"),
      t("Lương"),
      t("Khác"),
    ],
    [t]
  );

  const EXPENSE_SORTS = useMemo(
    () => [
      { id: "newest",      label: t("Mới nhất") },
      { id: "oldest",      label: t("Cũ nhất") },
      { id: "amount-desc", label: t("Số tiền ↓") },
      { id: "amount-asc",  label: t("Số tiền ↑") },
    ],
    [t]
  );

  const [filterCat, setFilterCat] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.settings
      .get()
      .then((d) => setExpenses(Array.isArray(d.expenses) ? d.expenses : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const closeConfirm = () => {
    if (confirmBusy) return;
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

  const add = async () => {
    const title = form.title.trim();
    const amount = Number(form.amount);
    if (!title) return toast(t("Nhập tên khoản chi"), "error");
    if (!amount || amount <= 0) return toast(t("Số tiền phải lớn hơn 0"), "error");

    setSaving(true);
    const newItem = {
      id: Date.now(),
      title,
      amount,
      category: form.category,
      note: form.note.trim(),
      date: new Date().toISOString(),
    };
    const newList = [...expenses, newItem];

    try {
      await api.settings.update({ expenses: newList });
      setExpenses(newList);
      setForm({ title: "", amount: "", category: t("Nguyên liệu"), note: "" });
      setShowForm(false);
      toast(t("Đã thêm chi phí"), "success");
    } catch (e) {
      toast(e.message || t("Không lưu được"), "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = (id) => {
    const target = expenses.find((e) => e.id === id);
    if (!target) return;

    setConfirm({
      title: `${t("Xóa khoản chi")} "${target.title}"?`,
      message:
        `${t("Khoản chi")} ${fmtMoney(target.amount)} ${t("sẽ bị xóa vĩnh viễn.")} ` +
        t("Hành động này không thể hoàn tác."),
      confirmText: t("Xóa"),
      cancelText: t("Hủy"),
      danger: true,
      onConfirm: async () => {
        const newList = expenses.filter((e) => e.id !== id);
        try {
          await api.settings.update({ expenses: newList });
          setExpenses(newList);
          toast(t("Đã xóa"), "success");
          setConfirm(null);
        } catch (e) {
          toast(e.message || t("Không xóa được"), "error");
        }
      },
    });
  };

  const totalExpense = useMemo(
    () => expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [expenses]
  );

  const filteredExpenses = useMemo(() => {
    let result = [...expenses];

    if (filterCat) {
      result = result.filter((e) => e.category === filterCat);
    }

    switch (sortBy) {
      case "oldest":
        result.sort((a, b) => new Date(a.date) - new Date(b.date));
        break;
      case "amount-desc":
        result.sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
        break;
      case "amount-asc":
        result.sort((a, b) => (Number(a.amount) || 0) - (Number(b.amount) || 0));
        break;
      case "newest":
      default:
        result.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    return result;
  }, [expenses, filterCat, sortBy]);

  const filteredTotal = useMemo(
    () => filteredExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [filteredExpenses]
  );

  const hasFilter = filterCat !== "" || sortBy !== "newest";

  const clearFilters = () => {
    setFilterCat("");
    setSortBy("newest");
  };

  return (
    <>
      <div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <KPI
            label={hasFilter ? t("Tổng lọc") : t("Tổng chi phí")}
            value={fmtMoney(hasFilter ? filteredTotal : totalExpense)}
            color="#ef4444"
          />
          <div
            style={{
              ...cardStyle,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
            }}
          >
            <button
              onClick={() => setShowForm(!showForm)}
              style={btnPrimaryStyle(false)}
            >
              <Plus size={16} /> {showForm ? t("Đóng") : t("Thêm chi phí")}
            </button>
          </div>
        </div>

        {showForm && (
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <h3 style={h3Style}>{t("Thêm khoản chi")}</h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 12,
              }}
            >
              <div>
                <label style={labelStyle}>{t("Tên khoản chi")} *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder={t("VD: Nhập gạo 50kg")}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("Số tiền")} *</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="500000"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("Danh mục")}</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  style={inputStyle}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t("Ghi chú")}</label>
                <input
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder={t("Ghi chú thêm")}
                  style={inputStyle}
                />
              </div>
            </div>
            <button
              onClick={add}
              disabled={saving}
              style={{
                ...btnPrimaryStyle(saving),
                background: saving ? "#94a3b8" : "#18a967",
                marginTop: 12,
                padding: "12px 24px",
                width: "auto",
              }}
            >
              {saving ? t("Đang lưu...") : t("Lưu chi phí")}
            </button>
          </div>
        )}

        {expenses.length > 0 && (
          <div
            style={{
              ...cardStyle,
              marginBottom: 16,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Filter size={14} style={{ color: "var(--text-muted, #64748b)" }} />
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
              style={{ ...selectStyle, minWidth: 150 }}
            >
              <option value="">{t("Tất cả danh mục")}</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <ArrowUpDown size={14} style={{ color: "var(--text-muted, #64748b)" }} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ ...selectStyle, minWidth: 130 }}
            >
              {EXPENSE_SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>

            {hasFilter && (
              <button
                onClick={clearFilters}
                style={{
                  padding: "8px 14px",
                  background: "transparent",
                  border: "1px solid #ef4444",
                  color: "#ef4444",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <X size={13} /> {t("Xoá lọc")}
              </button>
            )}

            <span
              style={{
                marginLeft: "auto",
                fontSize: 12,
                color: "var(--text-muted, #64748b)",
              }}
            >
              {t("Hiển thị")} <b>{filteredExpenses.length}</b> / {expenses.length}
            </span>
          </div>
        )}

        <div style={cardStyle}>
          <h3 style={h3Style}>
            <DollarSign size={18} /> {t("Danh sách chi phí")} ({filteredExpenses.length})
          </h3>

          {loading ? (
            <LoadingBox t={t} />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr style={theadStyle}>
                    <th style={thStyle}>{t("Ngày")}</th>
                    <th style={thStyle}>{t("Khoản chi")}</th>
                    <th style={thStyle}>{t("Danh mục")}</th>
                    <th style={thStyle}>{t("Ghi chú")}</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>{t("Số tiền")}</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>{t("Thao tác")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((e) => (
                    <tr key={e.id} style={trStyle}>
                      <td style={tdStyle}>
                        {new Date(e.date).toLocaleDateString("vi-VN")}
                      </td>
                      <td style={tdStyle}><b>{e.title}</b></td>
                      <td style={tdStyle}>{e.category}</td>
                      <td style={tdStyle}>{e.note || "—"}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <b style={{ color: "#ef4444" }}>-{fmtMoney(e.amount)}</b>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <button
                          onClick={() => remove(e.id)}
                          title={t("Xóa")}
                          aria-label={t("Xóa chi phí")}
                          style={{
                            padding: 6,
                            background: "transparent",
                            color: "#ef4444",
                            border: "1px solid #ef4444",
                            borderRadius: 6,
                            cursor: "pointer",
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!filteredExpenses.length && (
                    <tr>
                      <td colSpan="6" style={emptyTdStyle}>
                        {hasFilter
                          ? t("Không có chi phí nào khớp bộ lọc")
                          : t("Chưa có chi phí")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {confirm && (
        <ConfirmDialog
          open
          title={confirm.title}
          message={confirm.message}
          confirmText={confirm.confirmText}
          cancelText={confirm.cancelText}
          danger={confirm.danger}
          loading={confirmBusy}
          onConfirm={runConfirm}
          onClose={closeConfirm}
        />
      )}
    </>
  );
}

// ============================================================
// TAB 5: THỐNG KÊ
// ============================================================

function StatsTab() {
  const { t } = useI18n();
  const [period, setPeriod] = useState("month");
  const [revenue, setRevenue] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);

  const PERIODS = useMemo(
    () => [
      { id: "day",   label: t("Ngày") },
      { id: "week",  label: t("Tuần") },
      { id: "month", label: t("Tháng") },
      { id: "year",  label: t("Năm") },
    ],
    [t]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.reports.revenue(period).catch(() => null),
      api.settings.get().catch(() => ({})),
    ])
      .then(([r, s]) => {
        if (cancelled) return;
        setRevenue(r);
        setExpenses(Array.isArray(s.expenses) ? s.expenses : []);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [period]);

  const totalExpense = useMemo(
    () => expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [expenses]
  );
  const totalRevenue = revenue?.totalRevenue || 0;
  const profit = totalRevenue - totalExpense;

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          overflowX: "auto",
          paddingBottom: 4,
          scrollbarWidth: "none",
        }}
      >
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            style={{ ...chipStyle(period === p.id), flexShrink: 0 }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
        }}
      >
        <KPI
          label={t("Tổng doanh thu")}
          value={loading ? "..." : fmtMoney(totalRevenue)}
          color="#18a967"
        />
        <KPI
          label={t("Tổng chi phí")}
          value={loading ? "..." : fmtMoney(totalExpense)}
          color="#ef4444"
        />
        <KPI
          label={t("Lợi nhuận")}
          value={loading ? "..." : fmtMoney(profit)}
          color={profit >= 0 ? "#2634d5" : "#ef4444"}
        />
      </div>
    </div>
  );
}
// ============================================================
// TAB 6: ĐỐI SOÁT
// ============================================================

function ReconcileTab() {
  const { t } = useI18n();
  const [orders, setOrders] = useState([]);
  const [actualInput, setActualInput] = useState("");

  useEffect(() => {
    api.orders
      .all("Tất cả")
      .then((d) => setOrders(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const systemTotal = useMemo(
    () =>
      orders
        .filter((o) => o.status === "Hoàn thành")
        .reduce((s, o) => s + (o.total || 0), 0),
    [orders]
  );

  const actual = Number(actualInput) || 0;
  const diff = actual - systemTotal;

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <KPI label={t("Tiền hệ thống")} value={fmtMoney(systemTotal)} color="#2634d5" />
        <KPI label={t("Tiền thực tế")}  value={fmtMoney(actual)}      color="#f59e0b" />
        <KPI
          label={t("Chênh lệch")}
          value={fmtMoney(diff)}
          color={diff === 0 ? "#18a967" : "#ef4444"}
        />
      </div>

      <div style={cardStyle}>
        <h3 style={h3Style}>
          <CheckCircle2 size={18} /> {t("Đối soát")}
        </h3>
        <p
          style={{
            color: "var(--text-muted, #64748b)",
            fontSize: 13,
            marginTop: 0,
          }}
        >
          {t("Nhập số tiền thực tế đã nhận (tiền mặt + chuyển khoản) để so sánh với hệ thống.")}
        </p>

        <label style={labelStyle}>{t("Số tiền thực tế")}</label>
        <input
          type="number"
          min="0"
          step="1000"
          value={actualInput}
          onChange={(e) => setActualInput(e.target.value)}
          placeholder={t("VD: 500000")}
          style={inputStyle}
        />

        {actualInput && (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 10,
              background: diff === 0 ? "#e8f9f1" : "#fde8e8",
              color: diff === 0 ? "#18a967" : "#ef4444",
              fontWeight: 700,
              fontSize: 14,
              textAlign: "center",
            }}
          >
            {diff === 0
              ? t("✅ Khớp chính xác!")
              : diff > 0
              ? `⚠️ ${t("Thừa")} ${fmtMoney(diff)}`
              : `⚠️ ${t("Thiếu")} ${fmtMoney(-diff)}`}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TAB 7: XUẤT BÁO CÁO
// ============================================================

function csvCell(v) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function ExportTab() {
  const { t } = useI18n();
  const [rangeId, setRangeId] = useState("30d");
  const [from, setFrom] = useState(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [to, setTo] = useState(getLocalDateStr());
  const [exporting, setExporting] = useState(false);

  const EXPORT_RANGES = useMemo(
    () => [
      { id: "7d",     label: t("7 ngày"),  days: 7 },
      { id: "30d",    label: t("30 ngày"), days: 30 },
      { id: "90d",    label: t("90 ngày"), days: 90 },
      { id: "custom", label: t("Tùy chọn"), days: null },
    ],
    [t]
  );

  const selectRange = (r) => {
    setRangeId(r.id);
    if (r.days) {
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(toDate.getDate() - r.days + 1);
      setFrom(getLocalDateStr(fromDate));
      setTo(getLocalDateStr(toDate));
    }
  };

  const handleExport = async () => {
    if (new Date(from) > new Date(to)) {
      return toast(t("Ngày bắt đầu phải trước ngày kết thúc"), "error");
    }

    setExporting(true);
    let url = null;
    let a = null;
    try {
      const orders = await api.orders.all("Tất cả");

      const fromDate = new Date(from);
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);

      const filteredOrders = (orders || []).filter((o) => {
        const d = new Date(o.created_at);
        return d >= fromDate && d <= toDate;
      });

      const rows = [
        ["CANTEEN VWA - BAO CAO TAI CHINH"],
        ["Tu ngay", from, "Den ngay", to],
        [],
        ["MA DON", "KHACH HANG", "NGAY", "PTTT", "TRANG THAI", "TONG TIEN"],
        ...filteredOrders.map((o) => [
          o.code,
          o.customer_name || "",
          o.created_at ? new Date(o.created_at).toLocaleString("vi-VN") : "",
          o.payment || t("Tiền mặt"),
          o.status,
          o.total || 0,
        ]),
        [],
        [
          "TONG DOANH THU",
          filteredOrders
            .filter((o) => o.status === "Hoàn thành")
            .reduce((s, o) => s + o.total, 0),
        ],
        ["SO DON", filteredOrders.length],
      ];

      const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");

      const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8",
      });
      url = URL.createObjectURL(blob);
      a = document.createElement("a");
      a.href = url;
      a.download = `canteen-baocao-${from}-to-${to}.csv`;
      document.body.appendChild(a);
      a.click();

      toast(t("Đã xuất báo cáo"), "success");
    } catch (e) {
      toast(e.message || t("Không xuất được"), "error");
    } finally {
      if (a && a.parentNode) a.parentNode.removeChild(a);
      if (url) URL.revokeObjectURL(url);
      setExporting(false);
    }
  };

  return (
    <div style={cardStyle}>
      <h3 style={h3Style}>
        <Download size={18} /> {t("Xuất báo cáo tài chính")}
      </h3>
      <p
        style={{
          color: "var(--text-muted, #64748b)",
          fontSize: 13,
          marginTop: 0,
        }}
      >
        {t("Xuất file CSV gồm: doanh thu, chi phí, giao dịch trong khoảng thời gian.")}
      </p>

      <label style={labelStyle}>{t("Khoảng thời gian")}</label>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        {EXPORT_RANGES.map((r) => {
          const active = rangeId === r.id;
          const Icon =
            r.id === "7d" ? Calendar : r.id === "30d" ? CalendarDays : CalendarRange;
          return (
            <button
              key={r.id}
              onClick={() => selectRange(r)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                background: active ? "#2634d5" : "var(--card-bg, #fff)",
                color: active ? "#fff" : "var(--text-muted, #475569)",
                border: "1px solid " + (active ? "#2634d5" : "var(--border-color, #e5e9ef)"),
                borderRadius: 20,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                transition: "all 0.15s",
              }}
            >
              {r.id !== "custom" && <Icon size={14} />}
              {r.label}
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        <div>
          <label style={labelStyle}>{t("Từ ngày")}</label>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value);
              setRangeId("custom");
            }}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>{t("Đến ngày")}</label>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => {
              setTo(e.target.value);
              setRangeId("custom");
            }}
            style={inputStyle}
          />
        </div>
      </div>

      <button
        onClick={handleExport}
        disabled={exporting}
        style={{
          ...btnPrimaryStyle(exporting),
          marginTop: 14,
          padding: "12px 24px",
          width: "auto",
        }}
      >
        {exporting ? (
          <>
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            {t("Đang xuất...")}
          </>
        ) : (
          <>
            <Download size={16} /> {t("Tải xuống CSV")}
          </>
        )}
      </button>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ============================================================
// SHARED SUB-COMPONENTS
// ============================================================

function KPI({ label, value, color }) {
  return (
    <div style={cardStyle}>
      <span style={{ fontSize: 12, color: "var(--text-light, #8993a3)" }}>
        {label}
      </span>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 6 }}>
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status, t }) {
  const c = ORDER_STATUS_COLORS[status] || { bg: "#e2e8f0", fg: "#475569" };
  return (
    <span
      style={{
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        background: c.bg,
        color: c.fg,
        whiteSpace: "nowrap",
      }}
    >
      {t(status)}
    </span>
  );
}

function LoadingBox({ t }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: 40,
        color: "var(--text-light, #8993a3)",
      }}
    >
      <Loader2
        size={24}
        style={{ animation: "spin 1s linear infinite", marginBottom: 8 }}
      />
      <div style={{ fontSize: 13 }}>{t("Đang tải...")}</div>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function ErrorBox({ message, onRetry, t }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: 30,
        background: "rgba(239, 68, 68, 0.08)",
        border: "1px solid rgba(239, 68, 68, 0.2)",
        borderRadius: 10,
        color: "#ef4444",
      }}
    >
      <AlertCircle size={24} style={{ marginBottom: 10 }} />
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {t("Không tải được dữ liệu")}
      </div>
      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: onRetry ? 12 : 0 }}>
        {message}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: "8px 16px",
            background: "#ef4444",
            color: "#fff",
            border: 0,
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          {t("Thử lại")}
        </button>
      )}
    </div>
  );
}

// ============================================================
// STYLE CONSTANTS
// ============================================================

const cardStyle = {
  background: "var(--card-bg, #fff)",
  border: "1px solid var(--border-color, #e7ebf0)",
  borderRadius: 12,
  padding: 20,
};

const h3Style = {
  marginTop: 0,
  marginBottom: 16,
  color: "var(--text-primary, #172033)",
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 15,
};

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
  color: "var(--text-muted, #475569)",
  marginTop: 4,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  marginBottom: 12,
  outline: "none",
  background: "var(--bg-secondary, #fff)",
  color: "var(--text-primary, #172033)",
  fontSize: 13,
  boxSizing: "border-box",
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

const tableStyle = { width: "100%", borderCollapse: "collapse" };
const theadStyle = { background: "var(--bg-tertiary, #f5f7fb)" };
const thStyle = {
  padding: 11,
  textAlign: "left",
  fontSize: 12,
  color: "var(--text-muted, #64748b)",
  fontWeight: 600,
  whiteSpace: "nowrap",
};
const trStyle = {
  borderBottom: "1px solid var(--border-color, #eef2f7)",
};
const tdStyle = {
  padding: 11,
  fontSize: 13,
  color: "var(--text-primary, #172033)",
};
const emptyTdStyle = {
  textAlign: "center",
  padding: 30,
  color: "var(--text-light, #8993a3)",
};

const btnGhostStyle = {
  padding: "8px 16px",
  background: "var(--bg-tertiary, #f5f7fb)",
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  cursor: "pointer",
  color: "var(--text-primary, #172033)",
  fontSize: 13,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const btnDangerOutlineStyle = (disabled) => ({
  padding: 14,
  background: "var(--card-bg, #fff)",
  color: "#ef4444",
  border: "1px solid #ef4444",
  borderRadius: 10,
  fontWeight: 700,
  cursor: disabled ? "not-allowed" : "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
});

const btnPrimaryStyle = (disabled) => ({
  padding: 14,
  background: disabled ? "#94a3b8" : "#2634d5",
  color: "#fff",
  border: 0,
  borderRadius: 10,
  fontWeight: 700,
  cursor: disabled ? "not-allowed" : "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  fontSize: 13,
});

const chipStyle = (active) => ({
  padding: "8px 16px",
  borderRadius: 20,
  background: active ? "#2634d5" : "var(--card-bg, #fff)",
  color: active ? "#fff" : "var(--text-muted, #475569)",
  border: "1px solid " + (active ? "#2634d5" : "var(--border-color, #e5e9ef)"),
  fontSize: 13,
  cursor: "pointer",
  fontWeight: active ? 700 : 500,
});
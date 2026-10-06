// ============================================================
// OWNERREPORTS.JSX — Báo cáo doanh thu + In biên bản (V2)
// ============================================================
// Layout theo design mới:
//   - Admin page head với title + actions
//   - KPI cards (Doanh thu / Đơn / Trung bình / Tỷ lệ hoàn thành)
//   - Filter bar
//   - Revenue table
//   - Print modal (Print Preview Engine) — theo HTML mẫu
// 🔧 FIX #94: datetime dùng Intl.DateTimeFormat cố định (VN, 24h)
// ============================================================

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  TrendingUp, TrendingDown, RefreshCw, Loader2, AlertCircle, Inbox, Download, CalendarDays, CalendarRange, Calendar, Clock, Percent, Printer, FileText, FileSpreadsheet, DollarSign, ShoppingBag, X, Search, ChevronDown, FileCheck, Hash, Check,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid,
} from "recharts";
import { api } from "../../api";
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";

// ============================================================
// CONSTANTS
// ============================================================

const QUICK_RANGES = [
  { id: "today",  label: "Hôm nay",     days: 1 },
  { id: "7d",     label: "7 ngày",      days: 7 },
  { id: "30d",    label: "30 ngày",     days: 30 },
  { id: "90d",    label: "90 ngày",     days: 90 },
  { id: "month",  label: "Tháng này",   months: 1 },
  { id: "year",   label: "Năm nay",     years: 1 },
  { id: "custom", label: "Tùy chọn",    custom: true },
];

// 🔧 FIX #94: formatter cố định VN timezone, 24h
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

// 🔧 FIX #94: helper format datetime VN
function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return DATETIME_FORMATTER.format(d);
}

// ============================================================
// HELPERS
// ============================================================

function getLocalDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dt = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dt}`;
}

function parseDateOnly(s) {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function startOfDay(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function endOfDay(d) {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

function inRange(iso, fromTs, toTs) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= fromTs && t <= toTs;
}

function resolveRange(rangeId, customFrom, customTo) {
  const today = startOfDay(new Date());
  const r = QUICK_RANGES.find((x) => x.id === rangeId);

  if (!r || r.custom) {
    const f = parseDateOnly(customFrom);
    const t = parseDateOnly(customTo);
    if (f && t && f <= t) {
      const todayEnd = endOfDay(today);
      const clampedTo = t > todayEnd ? todayEnd : endOfDay(t);
      return { from: startOfDay(f), to: clampedTo };
    }
    return { from: addDays(today, -29), to: endOfDay(today) };
  }

  if (r.days) {
    return { from: addDays(today, -(r.days - 1)), to: endOfDay(today) };
  }
  if (r.months) {
    const f = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: startOfDay(f), to: endOfDay(today) };
  }
  if (r.years) {
    const f = new Date(today.getFullYear(), 0, 1);
    return { from: startOfDay(f), to: endOfDay(today) };
  }
  return { from: addDays(today, -29), to: endOfDay(today) };
}

function calcDelta(current, previous) {
  if (previous === 0) return current > 0 ? { pct: 100, isUp: true } : null;
  const pct = ((current - previous) / previous) * 100;
  return { pct: Math.abs(pct), isUp: pct >= 0 };
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function OwnerReports() {
  const { t } = useI18n();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [rangeId, setRangeId] = useState("30d");
  const [customFrom, setCustomFrom] = useState(
    getLocalDateStr(addDays(new Date(), -29))
  );
  const [customTo, setCustomTo] = useState(getLocalDateStr());

  const [printOpen, setPrintOpen] = useState(false);

  const reqIdRef = useRef(0);

  // ---- LOAD ----
  const load = useCallback(
    async (silent = false) => {
      const myReqId = ++reqIdRef.current;
      if (!silent) setRefreshing(true);
      setError("");

      try {
        const data = await api.orders.all("Tất cả");
        if (myReqId !== reqIdRef.current) return;

        const list = Array.isArray(data) ? data : [];
        const sorted = [...list].sort(
          (a, b) =>
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
        );
        setOrders(sorted);
      } catch (e) {
        if (myReqId === reqIdRef.current) {
          setError(e.message || t("Không tải được báo cáo"));
        }
      } finally {
        if (myReqId === reqIdRef.current) {
          setLoading(false);
          if (!silent) setRefreshing(false);
        }
      }
    },
    [t]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  // ---- RANGE ----
  const currentRange = useMemo(
    () => resolveRange(rangeId, customFrom, customTo),
    [rangeId, customFrom, customTo]
  );

  const currentOrders = useMemo(() => {
    const fromTs = currentRange.from.getTime();
    const toTs = currentRange.to.getTime();
    return orders.filter((o) => inRange(o.created_at, fromTs, toTs));
  }, [orders, currentRange]);

  // ---- STATS ----
  const stats = useMemo(() => {
    const completed = currentOrders.filter((o) => o.status === "Hoàn thành");
    const cancelled = currentOrders.filter((o) => o.status === "Đã hủy");
    const revenue = completed.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const avgOrder =
      completed.length > 0 ? Math.round(revenue / completed.length) : 0;
    const onTimePct =
      currentOrders.length > 0
        ? ((completed.length / currentOrders.length) * 100).toFixed(1)
        : "0";

    return {
      revenue,
      totalOrders: currentOrders.length,
      completedCount: completed.length,
      cancelledCount: cancelled.length,
      avgOrder,
      onTimePct,
    };
  }, [currentOrders]);

  // ---- GROUP BY DAY ----
  const chartData = useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000;
    const startTs = startOfDay(currentRange.from).getTime();
    const endTs = startOfDay(currentRange.to).getTime();
    const days = Math.round((endTs - startTs) / dayMs) + 1;

    const buckets = {};
    for (let i = 0; i < days; i++) {
      const ts = startTs + i * dayMs;
      buckets[ts] = { ts, revenue: 0, orders: 0 };
    }

    currentOrders
      .filter((o) => o.status === "Hoàn thành")
      .forEach((o) => {
        const ts = startOfDay(new Date(o.created_at)).getTime();
        if (buckets[ts]) {
          buckets[ts].revenue += o.total || 0;
          buckets[ts].orders += 1;
        }
      });

    return Object.values(buckets)
      .sort((a, b) => a.ts - b.ts)
      .map((b) => {
        const d = new Date(b.ts);
        return {
          label: `${d.getDate()}/${d.getMonth() + 1}`,
          value: b.revenue,
          orders: b.orders,
          date: b.ts,
        };
      });
  }, [currentOrders, currentRange]);

  // ---- ACTIONS ----
  const handlePrint = () => {
    setPrintOpen(true);
  };

  const handleExportCSV = () => {
    if (!currentOrders.length) {
      return toast(t("Không có đơn nào trong khoảng thời gian này"), "error");
    }

    let url = null;
    let a = null;
    try {
      const rows = [
        ["CANTEEN VWA - BÁO CÁO DOANH THU"],
        ["Từ ngày", getLocalDateStr(currentRange.from), "Đến ngày", getLocalDateStr(currentRange.to)],
        [],
        ["MÃ ĐƠN", "KHÁCH", "NGÀY", "PTTT", "TRẠNG THÁI", "TỔNG TIỀN"],
        ...currentOrders.map((o) => [
          o.code,
          o.customer_name || "",
          // 🔧 FIX #94: dùng fmtDateTime cố định VN
          fmtDateTime(o.created_at),
          o.payment || t("Tiền mặt"),
          o.status,
          o.total || 0,
        ]),
        [],
        ["TỔNG DOANH THU (Hoàn thành)", stats.revenue],
        ["TỔNG ĐƠN", stats.totalOrders],
      ];

      const csv = rows
        .map((r) =>
          r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
        )
        .join("\n");

      const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8",
      });
      url = URL.createObjectURL(blob);
      a = document.createElement("a");
      a.href = url;
      a.download = `canteen-report-${getLocalDateStr(currentRange.from)}-to-${getLocalDateStr(currentRange.to)}.csv`;
      document.body.appendChild(a);
      a.click();
      toast(t("Đã xuất CSV"), "success");
    } catch (e) {
      toast(e.message || t("Không xuất được"), "error");
    } finally {
      if (a && a.parentNode) a.parentNode.removeChild(a);
      if (url) URL.revokeObjectURL(url);
    }
  };

  // ---- RENDER ----
  return (
    <>
      <div>
        {error && (
          <div
            style={{
              background: "var(--st-danger-bg)",
              border: "1px solid var(--st-danger-border)",
              borderRadius: "var(--st-radius-md)",
              padding: "12px 16px",
              marginBottom: 16,
              color: "var(--st-danger)",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <AlertCircle size={18} />
            <span style={{ flex: 1 }}>{error}</span>
            <button
              type="button"
              onClick={() => load(false)}
              style={{
                padding: "6px 12px",
                background: "var(--st-danger)",
                color: "#fff",
                border: 0,
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: "var(--st-font-head)",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {t("Thử lại")}
            </button>
          </div>
        )}

        {/* PAGE HEAD */}
        <div className="admin-page-head">
          <div className="admin-page-head__left">
            <span className="admin-page-head__eyebrow">
              <span className="admin-page-head__eyebrow-dot" />
              {t("Báo cáo & Phân tích • Quyết toán tháng")}
            </span>
            <h1 className="admin-page-head__title">
              {t("Báo cáo doanh thu & Biên bản nghiệm thu")}
            </h1>
            <p className="admin-page-head__desc">
              {t(
                "Phân tích doanh thu theo ngày, in biên bản nghiệm thu & đối soát quyết toán trợ giá sinh viên theo chuẩn ISO 216/A4."
              )}
            </p>
          </div>

          <div className="admin-page-head__actions">
            <button
              type="button"
              className="admin-page-head__btn"
              onClick={handleExportCSV}
            >
              <FileSpreadsheet size={18} />
              <span>{t("Xuất CSV")}</span>
            </button>

            <button
              type="button"
              className="admin-page-head__btn"
              onClick={() => load(false)}
              disabled={refreshing}
            >
              <RefreshCw
                size={18}
                style={{
                  animation: refreshing
                    ? "spin 1s linear infinite"
                    : "none",
                }}
              />
              <span>{t("Làm mới")}</span>
            </button>

            <button
              type="button"
              className="admin-page-head__btn admin-page-head__btn--primary"
              onClick={handlePrint}
            >
              <Printer size={18} />
              <span>{t("In biên bản quyết toán")}</span>
            </button>
          </div>
        </div>

        {/* KPI GRID */}
        <div className="admin-kpi-grid">
          <div className="admin-kpi admin-kpi--success">
            <div className="admin-kpi__head">
              <span className="admin-kpi__label">
                {t("Doanh thu")}
              </span>
              <div className="admin-kpi__icon">
                <DollarSign size={20} />
              </div>
            </div>
            <div className="admin-kpi__value-row">
              <span className="admin-kpi__value">
                {money(stats.revenue).replace("đ", "")}
              </span>
              <span className="admin-kpi__unit">đ</span>
            </div>
          </div>

          <div className="admin-kpi admin-kpi--info">
            <div className="admin-kpi__head">
              <span className="admin-kpi__label">
                {t("Tổng đơn trong kỳ")}
              </span>
              <div className="admin-kpi__icon">
                <ShoppingBag size={20} />
              </div>
            </div>
            <div className="admin-kpi__value-row">
              <span className="admin-kpi__value">
                {stats.totalOrders}
              </span>
              <span className="admin-kpi__unit">{t("đơn")}</span>
            </div>
          </div>

          <div className="admin-kpi">
            <div className="admin-kpi__head">
              <span className="admin-kpi__label">
                {t("Giá trị TB / đơn")}
              </span>
              <div className="admin-kpi__icon">
                <TrendingUp size={20} />
              </div>
            </div>
            <div className="admin-kpi__value-row">
              <span className="admin-kpi__value">
                {money(stats.avgOrder).replace("đ", "")}
              </span>
              <span className="admin-kpi__unit">đ</span>
            </div>
          </div>

          <div className="admin-kpi admin-kpi--warning">
            <div className="admin-kpi__head">
              <span className="admin-kpi__label">
                {t("Tỷ lệ hoàn thành")}
              </span>
              <div className="admin-kpi__icon">
                <Percent size={20} />
              </div>
            </div>
            <div className="admin-kpi__value-row">
              <span className="admin-kpi__value">{stats.onTimePct}</span>
              <span className="admin-kpi__unit">%</span>
            </div>
          </div>
        </div>

        {/* FILTER BAR */}
        <div className="admin-filter">
          <div className="admin-filter__left">
            {QUICK_RANGES.map((r) => {
              const active = rangeId === r.id;
              const Icon =
                r.id === "today" ? Clock
                : r.id === "custom" ? CalendarRange
                : r.days && r.days <= 7 ? Calendar
                : CalendarDays;
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`admin-filter__btn ${
                    active ? "admin-filter__btn--primary" : ""
                  }`}
                  onClick={() => setRangeId(r.id)}
                >
                  <Icon size={14} />
                  <span>{t(r.label)}</span>
                </button>
              );
            })}
          </div>

          <div className="admin-filter__right">
            {rangeId === "custom" && (
              <>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="admin-filter__select"
                  style={{ padding: "0 12px" }}
                />
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={getLocalDateStr()}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="admin-filter__select"
                  style={{ padding: "0 12px" }}
                />
              </>
            )}
          </div>
        </div>

        {/* CHART + DATA */}
        <div className="admin-table-card">
          <div className="admin-table-card__head">
            <h3 className="admin-table-card__title">
              <TrendingUp size={18} />
              {t("Doanh thu theo ngày")}
            </h3>
            <span className="admin-table-card__sub">
              {t("Đơn vị: VNĐ")}
            </span>
          </div>
          <div style={{ padding: 20 }}>
            {chartData.length === 0 ? (
              <div
                style={{
                  height: 260,
                  display: "grid",
                  placeItems: "center",
                  color: "var(--st-text-muted)",
                  background: "var(--st-surface-low)",
                  borderRadius: 12,
                }}
              >
                <Inbox size={36} style={{ opacity: 0.4 }} />
                <div>{t("Chưa có dữ liệu doanh thu")}</div>
              </div>
            ) : (
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--st-outline-light)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "var(--st-text-muted)" }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "var(--st-text-muted)" }}
                      tickFormatter={(v) =>
                        v >= 1000000
                          ? (v / 1000000).toFixed(1) + "M"
                          : (v / 1000).toFixed(0) + "k"
                      }
                    />
                    <Tooltip
                      formatter={(v) => [money(v), t("Doanh thu")]}
                      contentStyle={{
                        background: "var(--st-surface)",
                        border: "1px solid var(--st-outline-light)",
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    />
                    <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PRINT MODAL */}
      {printOpen && (
        <PrintPreviewModal
          orders={currentOrders}
          stats={stats}
          range={currentRange}
          onClose={() => setPrintOpen(false)}
          t={t}
        />
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
// ============================================================
// PRINT PREVIEW MODAL — theo HTML mẫu
// ============================================================

function PrintPreviewModal({ orders, stats, range, onClose, t }) {
  const [copies, setCopies] = useState(3);
  const [orientation, setOrientation] = useState("portrait");
  const [colorMode, setColorMode] = useState("color");

  const docCode = `VWA-REC-${String(
    Math.floor(Math.random() * 900) + 100
  )}`;

  const completed = orders.filter((o) => o.status === "Hoàn thành");
  const totalSubsidy = completed.length * 10000;

  const handlePrintNow = () => {
    window.print();
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="print-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="print-modal" onClick={(e) => e.stopPropagation()}>
        {/* SYSTEM BAR */}
        <div className="print-modal__bar">
          <div className="print-modal__bar-left">
            <div className="print-modal__bar-icon">
              <Printer size={20} />
            </div>
            <div className="print-modal__bar-info">
              <h1 className="print-modal__bar-title">
                {t("Hộp thoại In Tài liệu Hệ thống • Print Preview Engine")}
              </h1>
              <p className="print-modal__bar-sub">
                {t("Tài liệu:")} BB-NT-{docCode}.pdf • {t("Khổ giấy A4 ISO 216")}
              </p>
            </div>
          </div>
          <div className="print-modal__bar-right">
            <span className="print-modal__sha">
              <Check size={14} style={{ color: "var(--st-primary-dim)" }} />
              SHA-256: e87c3b29...f91a
            </span>
            <button
              type="button"
              className="print-modal__close"
              onClick={onClose}
              aria-label={t("Đóng")}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="print-modal__body">
          {/* LEFT: PAPER CANVAS */}
          <div className="print-canvas">
            <div className="print-canvas__toolbar">
              <div className="print-canvas__toolbar-left">
                <span className="print-canvas__page-badge">
                  {t("Trang")} 1 / 1
                </span>
                <span className="print-canvas__paper-badge">
                  {t("Khổ giấy A4 (Đứng)")}
                </span>
                <span className="print-canvas__css-badge">
                  CSS @media print: {t("ACTIVE (300 DPI CMYK)")}
                </span>
              </div>

              <div className="print-canvas__zoom">
                <button type="button" className="print-canvas__zoom-btn">
                  <Search size={16} />
                </button>
                <span className="print-canvas__zoom-value">100%</span>
                <button type="button" className="print-canvas__zoom-btn">
                  <Search size={16} />
                </button>
              </div>
            </div>

            {/* A4 SHEET */}
            <div className="print-canvas__stage">
              <div className="print-sheet">
                {/* HEADER */}
                <div className="print-sheet__header">
                  <span className="print-sheet__org">
                    {t("HỌC VIỆN PHỤ NỮ VIỆT NAM")}
                  </span>
                  <span className="print-sheet__dept">
                    {t("BAN QUẢN LÝ DỊCH VỤ CĂN TIN & HỖ TRỢ SINH VIÊN")}
                  </span>
                  <div className="print-sheet__underline" />
                  <div className="print-sheet__docnum">
                    {t("Số:")} {docCode}/BB-VWA-KDS •{" "}
                    {t("Hà Nội, ngày")}{" "}
                    {new Date().toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </div>
                </div>

                {/* TITLE */}
                <div className="print-sheet__title-block">
                  <h2 className="print-sheet__title">
                    {t("BIÊN BẢN NGHIỆM THU & ĐỐI SOÁT QUYẾT TOÁN")}
                  </h2>
                  <p className="print-sheet__subtitle">
                    {t("KINH PHÍ TRỢ GIÁ SUẤT ĂN SINH VIÊN")}
                  </p>
                  <p className="print-sheet__legal">
                    {t("(Căn cứ Hợp đồng phục vụ dịch vụ ăn uống và Quyết định trợ giá bữa ăn)")}
                  </p>
                </div>

                {/* PARTIES */}
                <div className="print-sheet__parties">
                  <div>
                    <b>{t("Đơn vị thụ hưởng:")}</b>{" "}
                    {t("Phòng Chăm sóc Sinh viên (CTSV)")}
                  </div>
                  <div>
                    <b>{t("Đơn vị kiểm toán:")}</b>{" "}
                    {t("Phòng Tài chính - Kế toán HVPNVN")}
                  </div>
                  <div>
                    <b>{t("Nhà vận hành:")}</b>{" "}
                    {t("Liên danh Dịch vụ Ẩm thực VWA")}
                  </div>
                  <div>
                    <b>{t("Thời gian đối soát:")}</b>{" "}
                    {getLocalDateStr(range.from)} – {getLocalDateStr(range.to)}
                  </div>
                </div>

                {/* TABLE */}
                <div className="print-sheet__table">
                  <div className="print-sheet__table-head">
                    <span>{t("STT")}</span>
                    <span>{t("Hạng mục chi phí trợ giá bữa ăn")}</span>
                    <span>{t("Số lượt")}</span>
                    <span>{t("Mức hỗ trợ")}</span>
                    <span>{t("Thành tiền")}</span>
                  </div>

                  <div className="print-sheet__row">
                    <span>01</span>
                    <span>
                      <b>{t("Suất ăn trưa tiêu chuẩn sinh viên")}</b>
                    </span>
                    <span>{completed.length.toLocaleString("vi-VN")}</span>
                    <span>10.000 đ</span>
                    <span>
                      <b>{totalSubsidy.toLocaleString("vi-VN")}</b>
                    </span>
                  </div>

                  <div className="print-sheet__row print-sheet__row--alt">
                    <span>02</span>
                    <span>
                      <b>{t("Suất ăn trưa tăng cường ca trực")}</b>
                    </span>
                    <span>0</span>
                    <span>10.000 đ</span>
                    <span>
                      <b>0</b>
                    </span>
                  </div>

                  <div className="print-sheet__row print-sheet__row--total">
                    <span className="print-sheet__total-label">
                      {t("Tổng cộng đối soát")}
                    </span>
                    <span />
                    <span className="print-sheet__total-value">
                      {completed.length.toLocaleString("vi-VN")} {t("lượt")}
                    </span>
                    <span />
                    <span className="print-sheet__total-value">
                      {totalSubsidy.toLocaleString("vi-VN")} đ
                    </span>
                  </div>
                </div>

                {/* CONCLUSION */}
                <div className="print-sheet__conclusion">
                  <p>
                    <b>{t("Bằng chữ:")}</b>{" "}
                    {t("Số tiền trợ giá theo biên bản nghiệm thu.")}
                  </p>
                  <p>
                    <b>{t("Kết luận:")}</b>{" "}
                    {t(
                      "Dữ liệu quét mã QR ID sinh viên trên máy POS bán hàng trùng khớp 100% với hệ thống KDS và dữ liệu xác thực Canteen VWA."
                    )}
                  </p>
                </div>

                {/* SIGNATURES */}
                <div className="print-sheet__signatures">
                  <div className="print-sheet__sig">
                    <span className="print-sheet__sig-role">
                      {t("ĐẠI DIỆN CANTEEN VWA")}
                    </span>
                    <span className="print-sheet__sig-hint">
                      ({t("Ký, đóng dấu & ghi rõ họ tên")})
                    </span>
                    <span className="print-sheet__sig-name">
                      NguyenDinhPhuc
                    </span>
                    <span className="print-sheet__sig-realname">
                      {t("Nguyễn Đình Phúc")}
                    </span>
                    <span className="print-sheet__sig-title">
                      {t("Giám đốc Điều hành")}
                    </span>
                  </div>

                  <div className="print-sheet__sig">
                    <span className="print-sheet__sig-role">
                      {t("PHÒNG TÀI CHÍNH - KẾ TOÁN")}
                    </span>
                    <span className="print-sheet__sig-hint">
                      ({t("Kiểm soát & Duyệt chi")})
                    </span>
                    <span className="print-sheet__sig-name">
                      TranThuTrang
                    </span>
                    <span className="print-sheet__stamp">
                      <span className="print-sheet__stamp-arc">
                        HV PHỤ NỮ VN
                      </span>
                      <span className="print-sheet__stamp-inner">
                        ĐÃ DUYỆT
                      </span>
                      <span className="print-sheet__stamp-arc">
                        TÀI CHÍNH
                      </span>
                    </span>
                    <span className="print-sheet__sig-realname">
                      {t("Trần Thu Trang")}
                    </span>
                    <span className="print-sheet__sig-title">
                      {t("Kế toán trưởng")}
                    </span>
                  </div>

                  <div className="print-sheet__sig">
                    <span className="print-sheet__sig-role">
                      {t("PHÒNG CHĂM SÓC SV")}
                    </span>
                    <span className="print-sheet__sig-hint">
                      ({t("Xác nhận đối tượng")})
                    </span>
                    <span className="print-sheet__sig-name">
                      LeMinhHoa
                    </span>
                    <span className="print-sheet__sig-realname">
                      {t("TS. Lê Minh Hoa")}
                    </span>
                    <span className="print-sheet__sig-title">
                      {t("Trưởng phòng CTSV")}
                    </span>
                  </div>
                </div>

                {/* FOOTER */}
                <div className="print-sheet__footer">
                  <div className="print-sheet__footer-left">
                    <FileCheck size={14} />
                    <span>
                      {t("Xác thực:")} portal.canteen.vwa.edu.vn/verify/
                      {docCode}
                    </span>
                  </div>
                  <div>
                    {/* 🔧 FIX #94: dùng fmtDateTime cố định VN thay toLocaleString */}
                    {t("In lúc:")} {fmtDateTime(new Date())} •{" "}
                    {t("Bản in số 01/03")}
                  </div>
                </div>
              </div>
            </div>

            {/* STATUS */}
            <div className="print-canvas__status">
              <div className="print-canvas__status-left">
                <span className="print-canvas__status-dot" />
                <span>
                  {t("Độ phân giải bản in: 1200 x 1200 DPI vector")}
                </span>
              </div>
              <div className="print-canvas__status-right">
                <span>210 x 297 mm</span>
                <span>•</span>
                <span>190 x 277 mm</span>
              </div>
            </div>
          </div>

          {/* RIGHT: INSPECTOR */}
          <div className="print-inspector">
            {/* HEAD */}
            <div className="print-inspector__head">
              <div className="print-inspector__head-left">
                <FileText size={20} />
                <span className="print-inspector__title">
                  {t("Cấu hình in ấn")}
                </span>
              </div>
              <span className="print-inspector__badge">
                {t("OS Print Engine v2")}
              </span>
            </div>

            {/* DESTINATION */}
            <div className="print-setting">
              <div className="print-setting__label">
                <span>{t("Máy in đích")}</span>
                <span className="print-setting__label-sub">
                  {t("Đang sẵn sàng")}
                </span>
              </div>
              <div className="print-setting__wrap">
                <Printer size={18} className="print-setting__select-icon" />
                <select className="print-setting__select" defaultValue="hp">
                  <option value="hp">
                    HP LaserJet MFP M528 • {t("Phòng Tài Chính")}
                  </option>
                  <option value="canon">
                    Canon imageRUNNER ADV • {t("Văn phòng BGH")}
                  </option>
                  <option value="pdf">{t("Lưu dưới dạng PDF")}</option>
                </select>
                <ChevronDown size={18} className="print-setting__select-arrow" />
              </div>
              <p className="print-setting__hint">
                <Inbox size={13} />
                {t("Khay giấy 2: Còn 250 tờ A4 • Mực đen: 82% • Mực màu: 94%")}
              </p>
            </div>

            {/* COPIES + PAGES */}
            <div className="print-setting__grid-2">
              <div className="print-setting">
                <span className="print-setting__label">
                  {t("Số bản sao")}
                </span>
                <div className="print-stepper">
                  <button
                    type="button"
                    className="print-stepper__btn"
                    onClick={() => setCopies((c) => Math.max(1, c - 1))}
                  >
                    −
                  </button>
                  <span className="print-stepper__value">
                    {String(copies).padStart(2, "0")}
                  </span>
                  <button
                    type="button"
                    className="print-stepper__btn"
                    onClick={() => setCopies((c) => Math.min(99, c + 1))}
                  >
                    +
                  </button>
                </div>
                <span className="print-setting__sub-hint">
                  {t("3 bên: Canteen - TC - CTSV")}
                </span>
              </div>

              <div className="print-setting">
                <span className="print-setting__label">{t("Trang in")}</span>
                <div className="print-setting__wrap">
                  <select
                    className="print-setting__select"
                    style={{ paddingLeft: 12 }}
                  >
                    <option>{t("Tất cả (Trang 1)")}</option>
                    <option>{t("Tùy chỉnh")}</option>
                    <option>{t("Chỉ trang chẵn")}</option>
                    <option>{t("Chỉ trang lẻ")}</option>
                  </select>
                  <ChevronDown size={18} className="print-setting__select-arrow" />
                </div>
                <label className="print-setting__hint" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    defaultChecked
                    style={{ accentColor: "var(--st-primary-container)" }}
                  />
                  {t("Chia bộ (Collate)")}
                </label>
              </div>
            </div>

            {/* LAYOUT + COLOR */}
            <div className="print-setting__grid-2">
              <div className="print-setting">
                <span className="print-setting__label">{t("Bố cục")}</span>
                <div className="print-segmented print-segmented--2">
                  <button
                    type="button"
                    className={`print-segmented__item ${
                      orientation === "portrait"
                        ? "print-segmented__item--active"
                        : ""
                    }`}
                    onClick={() => setOrientation("portrait")}
                  >
                    <FileText size={18} />
                    <span>{t("Đứng")}</span>
                  </button>
                  <button
                    type="button"
                    className={`print-segmented__item ${
                      orientation === "landscape"
                        ? "print-segmented__item--active"
                        : ""
                    }`}
                    onClick={() => setOrientation("landscape")}
                  >
                    <FileText size={18} style={{ transform: "rotate(90deg)" }} />
                    <span>{t("Ngang")}</span>
                  </button>
                </div>
              </div>

              <div className="print-setting">
                <span className="print-setting__label">{t("Hệ màu")}</span>
                <div className="print-segmented print-segmented--2">
                  <button
                    type="button"
                    className={`print-segmented__item ${
                      colorMode === "color"
                        ? "print-segmented__item--active-2"
                        : ""
                    }`}
                    onClick={() => setColorMode("color")}
                  >
                    <FileText size={18} />
                    <span>{t("Màu (Dấu)")}</span>
                  </button>
                  <button
                    type="button"
                    className={`print-segmented__item ${
                      colorMode === "bw"
                        ? "print-segmented__item--active-2"
                        : ""
                    }`}
                    onClick={() => setColorMode("bw")}
                  >
                    <FileText size={18} />
                    <span>{t("Đen trắng")}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ADVANCED */}
            <div className="print-advanced">
              <div className="print-advanced__head">
                <span className="print-advanced__title">
                  {t("Cài đặt nâng cao")}
                </span>
                <Hash size={18} style={{ color: "var(--st-text-muted)" }} />
              </div>

              <div className="print-advanced__row">
                <span className="print-advanced__row-label">
                  {t("Khổ giấy:")}
                </span>
                <select defaultValue="a4">
                  <option value="a4">A4 (210 x 297 mm)</option>
                  <option value="letter">Letter (8.5 x 11 in)</option>
                  <option value="a3">A3 (Báo cáo tổng)</option>
                </select>
              </div>

              <div className="print-advanced__row">
                <span className="print-advanced__row-label">
                  {t("Căn lề:")}
                </span>
                <select defaultValue="normal">
                  <option value="normal">{t("Tiêu chuẩn (20mm)")}</option>
                  <option value="min">{t("Tối thiểu (5mm)")}</option>
                  <option value="zero">{t("Không lề")}</option>
                </select>
              </div>

              <div className="print-advanced__row">
                <span className="print-advanced__row-label">
                  {t("Tỷ lệ thu phóng:")}
                </span>
                <select defaultValue="fit">
                  <option value="fit">{t("Vừa vùng in")}</option>
                  <option value="100">100%</option>
                  <option value="95">95%</option>
                </select>
              </div>

              <div className="print-advanced__checks">
                <label className="print-advanced__check">
                  <input type="checkbox" defaultChecked />
                  <span>{t("Đồ họa nền & Con dấu mộc đỏ")}</span>
                </label>
                <label className="print-advanced__check">
                  <input type="checkbox" />
                  <span>{t("In kèm Đầu trang / Chân trang")}</span>
                </label>
                <label className="print-advanced__check">
                  <input type="checkbox" defaultChecked />
                  <span>{t("Mã hóa bảo mật Watermark xác thực")}</span>
                </label>
              </div>
            </div>

            {/* COMPLIANCE */}
            <div className="print-compliance">
              <FileCheck size={18} />
              <span>
                {t("Lệnh in sẽ ghi log bảo mật vào hệ thống kiểm toán:")}{" "}
                <strong>#PRN-VWA-04-2025</strong>{" "}
                {t("kèm User ID Admin.")}
              </span>
            </div>

            {/* ACTIONS */}
            <div className="print-actions">
              <button
                type="button"
                className="print-actions__primary"
                onClick={handlePrintNow}
              >
                <Printer size={22} />
                <span>
                  {t("IN NGAY (PRINT •")} {String(copies).padStart(2, "0")}{" "}
                  {t("BẢN)")}
                </span>
              </button>

              <div className="print-actions__grid">
                <button type="button" className="print-actions__btn">
                  <Download size={16} />
                  <span>{t("Lưu file PDF")}</span>
                </button>
                <button
                  type="button"
                  className="print-actions__btn print-actions__btn--ghost"
                  onClick={onClose}
                >
                  <span>{t("Hủy bỏ (Esc)")}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
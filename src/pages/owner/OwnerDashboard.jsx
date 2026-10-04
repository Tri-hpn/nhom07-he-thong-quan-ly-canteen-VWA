// ============================================================
// OWNERDASHBOARD.JSX — Tổng quan hoạt động Canteen (Admin)
// ============================================================
// Tách nhiệm vụ với OwnerReports:
//   - LayoutDashboard: OPERATIONAL (cần xử lý gì hôm nay, trend nhanh)
//   - Reports: ANALYTICAL (báo cáo chuyên sâu, so sánh kỳ)
//
// ✅ SOURCE-TEXT I18N: dùng tiếng Việt trực tiếp qua t("...")
// ============================================================

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DollarSign, ShoppingBag, Users, AlertTriangle, Loader2, AlertCircle, RefreshCw, TrendingUp, TrendingDown, Check, ChevronRight, Package, Ticket, Utensils, BarChart3, ClipboardList, Warehouse, Wallet, ArrowRight,
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

const REFRESH_MS = 30000;
const RECENT_ORDERS_LIMIT = 5;

// Next status flow
const NEXT_STATUS = {
  "Chờ xác nhận": "Đã xác nhận",
  "Đã xác nhận": "Đang chuẩn bị",
};

const STATUS_COLORS = {
  "Chờ xác nhận": { bg: "#fef3c7", fg: "#92400e" },
  "Đã xác nhận": { bg: "#dbeafe", fg: "#1e40af" },
  "Đang chuẩn bị": { bg: "#ede9fe", fg: "#6d28d9" },
  "Sẵn sàng nhận": { bg: "#d1fae5", fg: "#065f46" },
  "Hoàn thành": { bg: "#e8f9f1", fg: "#18a967" },
  "Đã hủy": { bg: "#fee2e2", fg: "#991b1b" },
};

// ============================================================
// HELPERS
// ============================================================

function getLocalDateStr(input) {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dt = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dt}`;
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function calcDelta(current, previous) {
  if (previous === 0) return current > 0 ? { pct: 100, isUp: true } : null;
  const pct = ((current - previous) / previous) * 100;
  return { pct: Math.abs(pct), isUp: pct >= 0 };
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function OwnerDashboard() {
  const { t } = useI18n();

  // ---------- Quick actions (source-text) ----------
  const QUICK_ACTIONS = [
    { key: "orders",    label: t("Đơn hàng"),   icon: ClipboardList, to: "/owner/orders",   color: "#2634d5" },
    { key: "menu",      label: t("Thực đơn"),   icon: Utensils,      to: "/owner/menu",     color: "#0EA5E9" },
    { key: "inventory", label: t("Kho hàng"),   icon: Warehouse,     to: "/owner/inventory", color: "#18a967" },
    { key: "vouchers",  label: t("Voucher"),    icon: Ticket,        to: "/owner/vouchers", color: "#ec4899" },
    { key: "finance",   label: t("Tài chính"),  icon: Wallet,        to: "/owner/finance",  color: "#f59e0b" },
    { key: "reports",   label: t("Báo cáo"),    icon: BarChart3,     to: "/owner/reports",  color: "#8b5cf6" },
  ];

  // ---------- State ----------
  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [advancingId, setAdvancingId] = useState(null);

  const reqIdRef = useRef(0);
  const navigate = useNavigate();

  // ---------- Load ----------

  const loadAll = useCallback(async (silent = false) => {
    const myReqId = ++reqIdRef.current;
    if (!silent) setLoading(true);
    setRefreshing(true);
    setError("");

    try {
      const [statsRes, reportsRes, ordersRes] = await Promise.all([
        api.stats(),
        api.reports.revenue("day"),
        api.orders.all("Tất cả"),
      ]);

      if (myReqId !== reqIdRef.current) return;

      setStats(statsRes);
      setReports(reportsRes);

      const sortedOrders = [...(ordersRes || [])].sort(
        (a, b) =>
          new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );
      setOrders(sortedOrders);
      setLastUpdated(new Date());
    } catch (e) {
      if (myReqId === reqIdRef.current) {
        setError(e.message || t("Không tải được dữ liệu dashboard"));
      }
    } finally {
      if (myReqId === reqIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [t]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Auto-refresh 30s
  useEffect(() => {
    const timer = setInterval(() => loadAll(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadAll]);

  // ---------- Computed ----------

  // Bar chart data 7 ngày
  const revenueData = useMemo(() => {
    if (!reports?.data) return [];
    return reports.data.map((d) => ({
      day: d.label,
      value: d.revenue || 0,
      orders: d.orders || 0,
    }));
  }, [reports]);

  // Trend doanh thu hôm nay vs hôm qua
  const revenueTrend = useMemo(() => {
    if (revenueData.length < 2) return null;
    const today = revenueData[revenueData.length - 1].value;
    const yesterday = revenueData[revenueData.length - 2].value;
    return calcDelta(today, yesterday);
  }, [revenueData]);

  // Trend đơn hàng
  const orderTrend = useMemo(() => {
    if (revenueData.length < 2) return null;
    const today = revenueData[revenueData.length - 1].orders;
    const yesterday = revenueData[revenueData.length - 2].orders;
    return calcDelta(today, yesterday);
  }, [revenueData]);

  // Đơn cần xử lý
  const needAction = useMemo(() => {
    return orders.filter(
      (o) => o.status === "Chờ xác nhận" || o.status === "Đã xác nhận"
    );
  }, [orders]);

  // Đếm đơn chờ xác nhận (chỉ pending)
  const pendingCount = useMemo(
    () => orders.filter((o) => o.status === "Chờ xác nhận").length,
    [orders]
  );

  // Low stock
  const lowStockCount = stats?.lowStock ?? 0;

  // Recent orders (5 mới nhất)
  const recentOrders = useMemo(
    () => orders.slice(0, RECENT_ORDERS_LIMIT),
    [orders]
  );

  // ---------- Actions ----------

  const advanceOrder = async (o) => {
    const id = o._id || o.id;
    if (advancingId !== null) return;

    const next = NEXT_STATUS[o.status];
    if (!next) return;

    setAdvancingId(id);
    try {
      await api.orders.setStatus(id, next);
      toast(`"${o.code}" → "${next}"`, "success");
      await loadAll(true);
    } catch (e) {
      toast(e.message || t("Không chuyển được trạng thái"), "error");
    } finally {
      setAdvancingId(null);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  // Loading lần đầu
  if (loading && !stats) {
    return <DashboardSkeleton />;
  }

  // Error toàn trang
  if (error && !stats) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: 40,
          background: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          borderRadius: 12,
          color: "#ef4444",
        }}
      >
        <AlertCircle size={32} style={{ marginBottom: 12 }} />
        <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 15 }}>
          {t("Không tải được dashboard")}
        </div>
        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 16 }}>
          {error}
        </div>
        <button
          onClick={() => loadAll()}
          style={{
            padding: "10px 20px",
            background: "#ef4444",
            color: "#fff",
            border: 0,
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <RefreshCw size={14} /> {t("Thử lại")}
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* ============================================================
          HEADER — Realtime indicator + refresh
          ============================================================ */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "var(--text-light, #8993a3)",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#18a967",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
          <span>
            {t("Realtime")} · {t("Cập nhật mỗi")} {REFRESH_MS / 1000}s
            {lastUpdated && (
              <span style={{ marginLeft: 8, opacity: 0.7 }}>
                ({lastUpdated.toLocaleTimeString("vi-VN")})
              </span>
            )}
          </span>
        </div>

        <button
          onClick={() => loadAll()}
          disabled={refreshing}
          style={{
            padding: "6px 12px",
            background: "var(--bg-tertiary, #f5f7fb)",
            border: "1px solid var(--border-color, #e5e9ef)",
            borderRadius: 6,
            cursor: refreshing ? "not-allowed" : "pointer",
            fontSize: 12,
            color: "var(--text-primary, #172033)",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            opacity: refreshing ? 0.6 : 1,
          }}
        >
          <RefreshCw
            size={13}
            style={{
              animation: refreshing ? "spin 1s linear infinite" : "none",
            }}
          />
          {t("Làm mới")}
        </button>
      </div>

      {/* ============================================================
          KPI CARDS
          ============================================================ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <KPI
          icon={<DollarSign />}
          label={t("Doanh thu hôm nay")}
          value={money(stats?.revenue || 0)}
          trend={revenueTrend}
          color="#18a967"
        />
        <KPI
          icon={<ShoppingBag />}
          label={t("Đơn hàng hôm nay")}
          value={(stats?.orderCount || 0) + " " + t("đơn")}
          trend={orderTrend}
          color="#2634d5"
        />
        <KPI
          icon={<Users />}
          label={t("Tổng khách hàng")}
          value={(stats?.customerCount || 0) + " " + t("người")}
          color="#f59e0b"
        />
        <KPI
          icon={<AlertTriangle />}
          label={t("Sắp hết hàng")}
          value={lowStockCount + " " + t("món")}
          color="#ef4444"
          badge={
            lowStockCount > 0
              ? { text: t("Cần nhập"), color: "#ef4444" }
              : null
          }
        />
      </div>

      {/* ============================================================
          CẦN XỬ LÝ HÔM NAY
          ============================================================ */}
      {(pendingCount > 0 || lowStockCount > 0 || needAction.length > 0) && (
        <div
          style={{
            background:
              "linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(239, 68, 68, 0.06))",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            borderRadius: 12,
            padding: 18,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 14,
            }}
          >
            <AlertTriangle size={18} style={{ color: "#f59e0b" }} />
            <b
              style={{
                fontSize: 14,
                color: "var(--text-primary, #172033)",
              }}
            >
              {t("Cần xử lý hôm nay")}
            </b>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            {pendingCount > 0 && (
              <ActionCard
                icon={<ClipboardList size={18} />}
                label={t("Đơn chờ xác nhận")}
                value={pendingCount}
                color="#f59e0b"
                to="/owner/orders"
              />
            )}
            {needAction.length > pendingCount && (
              <ActionCard
                icon={<Utensils size={18} />}
                label={t("Đơn đang xử lý")}
                value={needAction.length - pendingCount}
                color="#2634d5"
                to="/owner/orders"
              />
            )}
            {lowStockCount > 0 && (
              <ActionCard
                icon={<Package size={18} />}
                label={t("Nguyên liệu sắp hết")}
                value={lowStockCount}
                color="#ef4444"
                to="/owner/inventory"
              />
            )}
          </div>
        </div>
      )}

      {/* ============================================================
          QUICK ACTIONS
          ============================================================ */}
      <div style={cardStyle}>
        <h3 style={{ ...cardTitleStyle, marginBottom: 14 }}>
          {t("Truy cập nhanh")}
        </h3>

        <div
          className="dashboard-quick-actions"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 10,
          }}
        >
          {QUICK_ACTIONS.map((a) => {
            const Icon = a.icon;
            // BadgeCheck cho orders nếu có pending
            const badge =
              a.key === "orders" && pendingCount > 0
                ? pendingCount
                : a.key === "inventory" && lowStockCount > 0
                ? lowStockCount
                : null;

            return (
              <Link
                key={a.key}
                to={a.to}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  padding: 14,
                  background: "var(--bg-tertiary, #f8fafc)",
                  border: "1px solid var(--border-color, #e5e9ef)",
                  borderRadius: 10,
                  textDecoration: "none",
                  transition: "all 0.2s",
                  position: "relative",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = a.color + "12";
                  e.currentTarget.style.borderColor = a.color;
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    "var(--bg-tertiary, #f8fafc)";
                  e.currentTarget.style.borderColor =
                    "var(--border-color, #e5e9ef)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: a.color + "18",
                    color: a.color,
                    display: "grid",
                    placeItems: "center",
                    position: "relative",
                  }}
                >
                  <Icon size={20} />
                  {badge && (
                    <span
                      style={{
                        position: "absolute",
                        top: -4,
                        right: -4,
                        minWidth: 18,
                        height: 18,
                        padding: "0 5px",
                        borderRadius: 9,
                        background: "#ef4444",
                        color: "#fff",
                        fontSize: 10,
                        fontWeight: 800,
                        display: "grid",
                        placeItems: "center",
                        border: "2px solid var(--card-bg, #fff)",
                        lineHeight: 1,
                      }}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </div>
                <b
                  style={{
                    fontSize: 12.5,
                    color: "var(--text-primary, #172033)",
                    textAlign: "center",
                  }}
                >
                  {a.label}
                </b>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ============================================================
          BAR CHART — Doanh thu 7 ngày
          ============================================================ */}
      <div style={{ ...cardStyle, marginTop: 18, marginBottom: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div>
            <h3 style={cardTitleStyle}>{t("Doanh thu 7 ngày")}</h3>
            <span style={cardSubtitleStyle}>{t("Đơn vị: VNĐ")}</span>
          </div>
          <Link
            to="/owner/reports"
            style={{
              fontSize: 12.5,
              color: "#2634d5",
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {t("Báo cáo chi tiết")} <ArrowRight size={12} />
          </Link>
        </div>

        {revenueData.length === 0 ? (
          <EmptyChart message={t("Chưa có dữ liệu doanh thu")} />
        ) : (
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-color, #eef2f7)"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 12,
                    fill: "var(--text-muted, #64748b)",
                  }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 12,
                    fill: "var(--text-muted, #64748b)",
                  }}
                  tickFormatter={(v) =>
                    v >= 1000000
                      ? (v / 1000000).toFixed(1) + "M"
                      : (v / 1000).toFixed(0) + "k"
                  }
                />
                <Tooltip
                  formatter={(v) => [money(v), t("Doanh thu")]}
                  contentStyle={{
                    background: "var(--card-bg, #fff)",
                    border: "1px solid var(--border-color, #e5e9ef)",
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="value" fill="#2634d5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ============================================================
          RECENT ORDERS TABLE — với quick action
          ============================================================ */}
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <h3 style={{ ...cardTitleStyle, margin: 0 }}>{t("Đơn hàng mới nhất")}</h3>
          <Link
            to="/owner/orders"
            style={{
              color: "#2634d5",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {t("Xem tất cả")} →
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: 40,
              color: "var(--text-light, #8993a3)",
              fontSize: 13,
            }}
          >
            <ShoppingBag
              size={36}
              style={{ opacity: 0.35, marginBottom: 10 }}
            />
            <div>{t("Chưa có đơn hàng nào")}</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              className="dashboard-recent-table"
              style={{ width: "100%", borderCollapse: "collapse" }}
            >
              <thead>
                <tr style={{ background: "var(--bg-tertiary, #f5f7fb)" }}>
                  <th style={thStyle}>{t("Mã đơn")}</th>
                  <th style={thStyle}>{t("Khách")}</th>
                  <th className="col-time" style={thStyle}>{t("Giờ")}</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>{t("Tổng tiền")}</th>
                  <th style={thStyle}>{t("Trạng thái")}</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>{t("Thao tác")}</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => {
                  const id = o._id || o.id;
                  const next = NEXT_STATUS[o.status];
                  const isAdvancing = advancingId === id;

                  return (
                    <tr
                      key={id}
                      style={{
                        borderBottom:
                          "1px solid var(--border-color, #eef2f7)",
                        opacity: isAdvancing ? 0.6 : 1,
                        transition: "opacity 0.15s",
                      }}
                    >
                      <td style={tdStyle}>
                        <Link
                          to="/owner/orders"
                          style={{
                            color: "#2634d5",
                            textDecoration: "none",
                            fontWeight: 700,
                            fontFamily: "monospace",
                            fontSize: 12,
                          }}
                        >
                          {o.code}
                        </Link>
                      </td>
                      <td style={tdStyle}>{o.customer_name}</td>
                      <td
                        className="col-time"
                        style={{
                          ...tdStyle,
                          fontSize: 12,
                          color: "var(--text-muted, #64748b)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmtTime(o.created_at)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <b>{money(o.total)}</b>
                      </td>
                      <td style={tdStyle}>
                        <OrderStatusBadge status={o.status} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {next ? (
                          <button
                            onClick={() => advanceOrder(o)}
                            disabled={advancingId !== null}
                            style={{
                              padding: "6px 12px",
                              background:
                                advancingId !== null ? "#94a3b8" : "#18a967",
                              color: "#fff",
                              border: 0,
                              borderRadius: 6,
                              cursor:
                                advancingId !== null
                                  ? "not-allowed"
                                  : "pointer",
                              fontSize: 12,
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {isAdvancing ? (
                              <>
                                <Loader2
                                  size={12}
                                  style={{
                                    animation: "spin 1s linear infinite",
                                  }}
                                />
                                {t("Đang xử lý")}
                              </>
                            ) : (
                              <>
                                <Check size={12} /> {t("Xác nhận")}
                              </>
                            )}
                          </button>
                        ) : (
                          <Link
                            to="/owner/orders"
                            style={{
                              fontSize: 12,
                              color: "var(--text-light, #8993a3)",
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 2,
                            }}
                          >
                            {t("Xem")} <ChevronRight size={12} />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inline animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// SUB-COMPONENT: KPI Card
// ============================================================

function KPI({ icon, label, value, trend, color, badge }) {
  return (
    <div
      style={{
        background: "var(--card-bg, #fff)",
        border: "1px solid var(--border-color, #e7ebf0)",
        borderRadius: 12,
        padding: 18,
        display: "flex",
        gap: 12,
        alignItems: "center",
        transition: "box-shadow 0.2s ease",
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 12,
          background: color + "18",
          color,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize: 12,
            color: "var(--text-light, #8993a3)",
            display: "block",
          }}
        >
          {label}
        </span>
        <div
          style={{
            margin: "4px 0",
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1.3,
            fontFamily: "var(--font-sans, inherit)",
            color: "var(--text-primary, #172033)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {value}
        </div>

        {trend && (
          <small
            style={{
              color: trend.isUp ? "#18a967" : "#ef4444",
              fontSize: 11,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            {trend.isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {trend.isUp ? "+" : "-"}
            {trend.pct.toFixed(1)}% {t("so hôm qua")}
          </small>
        )}

        {!trend && badge && (
          <small
            style={{
              color: badge.color,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {badge.text}
          </small>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SUB-COMPONENT: ActionCard (Cần xử lý)
// ============================================================

function ActionCard({ icon, label, value, color, to }) {
  return (
    <Link
      to={to}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 12,
        background: "var(--card-bg, #fff)",
        border: "1px solid " + color + "40",
        borderRadius: 10,
        textDecoration: "none",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = `0 6px 16px ${color}30`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize: 11.5,
            color: "var(--text-muted, #64748b)",
            display: "block",
          }}
        >
          {label}
        </span>
        <b
          style={{
            fontSize: 18,
            color,
            fontWeight: 800,
            display: "block",
            lineHeight: 1.2,
          }}
        >
          {value}
        </b>
      </div>
      <ChevronRight size={16} style={{ color, flexShrink: 0 }} />
    </Link>
  );
}

// ============================================================
// SUB-COMPONENT: Order Status BadgeCheck
// ============================================================

function OrderStatusBadge({ status }) {
  const c = STATUS_COLORS[status] || { bg: "#e2e8f0", fg: "#475569" };

  return (
    <span
      style={{
        display: "inline-flex",
        padding: "4px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        background: c.bg,
        color: c.fg,
        whiteSpace: "nowrap",
        fontFamily: "var(--font-sans, inherit)",
      }}
    >
      {status}
    </span>
  );
}

// ============================================================
// SUB-COMPONENT: Empty Chart
// ============================================================

function EmptyChart({ message }) {
  return (
    <div
      style={{
        height: 240,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-light, #8993a3)",
        fontSize: 13,
        background: "var(--bg-tertiary, #f8fafc)",
        borderRadius: 10,
      }}
    >
      <div style={{ fontSize: 36, opacity: 0.35, marginBottom: 8 }}>📊</div>
      <div>{message}</div>
    </div>
  );
}

// ============================================================
// SUB-COMPONENT: LayoutDashboard Skeleton
// ============================================================

function DashboardSkeleton() {
  return (
    <div>
      {/* KPI skeleton */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: "var(--card-bg, #fff)",
              border: "1px solid var(--border-color, #e7ebf0)",
              borderRadius: 12,
              padding: 18,
              display: "flex",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 12,
                background: "var(--bg-tertiary, #f5f7fb)",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  width: "60%",
                  height: 10,
                  borderRadius: 4,
                  background: "var(--bg-tertiary, #f5f7fb)",
                  marginBottom: 8,
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              />
              <div
                style={{
                  width: "80%",
                  height: 16,
                  borderRadius: 4,
                  background: "var(--bg-tertiary, #f5f7fb)",
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Chart skeleton */}
      <div
        style={{
          background: "var(--card-bg, #fff)",
          border: "1px solid var(--border-color, #e7ebf0)",
          borderRadius: 12,
          padding: 20,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            width: 150,
            height: 16,
            borderRadius: 4,
            background: "var(--bg-tertiary, #f5f7fb)",
            marginBottom: 16,
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
        <div
          style={{
            height: 260,
            background: "var(--bg-tertiary, #f8fafc)",
            borderRadius: 10,
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.5; }
        }
      `}</style>
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

const cardTitleStyle = {
  margin: 0,
  fontSize: 15,
  color: "var(--text-primary, #172033)",
};

const cardSubtitleStyle = {
  fontSize: 12,
  color: "var(--text-light, #8993a3)",
};

const thStyle = {
  padding: 11,
  textAlign: "left",
  fontSize: 12,
  color: "var(--text-muted, #64748b)",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: 11,
  color: "var(--text-primary, #172033)",
  fontSize: 13,
};
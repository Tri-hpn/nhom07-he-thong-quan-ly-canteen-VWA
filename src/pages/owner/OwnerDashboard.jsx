// ============================================================
// OWNERDASHBOARD.JSX — Dashboard Admin (V3 - B9.5a)
// ============================================================
// V3:
//   - Thêm useI18n — dịch toàn bộ UI text
//   - Fix sum + (o.total || 0) → sum + (Number(o.total) || 0)
//   - money() dùng locale từ useI18n

import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ShoppingBag, Utensils, Box, Ticket, PieChart, Users,
  ArrowUpRight, ArrowDownRight, Minus, AlertTriangle,
  ChevronRight, CheckCircle2,
} from "lucide-react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import { api, getToken } from "../../api";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";

function getLocalDateStr(input) {
  const d = new Date(input);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dt = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + dt;
}

export default function OwnerDashboard() {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(true);
  const [chartRange, setChartRange] = useState("7d");
  const [data, setData] = useState({
    orders: [], menu: [], users: [], vouchers: [], inventory: [],
  });

  const money = useMemo(
    () => (n) => (Number(n) || 0).toLocaleString(locale || "vi") + "đ",
    [locale]
  );

  useEffect(() => {
    const fetchData = async () => {
      if (!getToken()) { setLoading(false); return; }
      try {
        const [ordersRes, menuRes, usersRes, vouchersRes, inventoryRes] = await Promise.all([
          api.orders.all().catch(() => []),
          api.menu.list().catch(() => []),
          api.users.list().catch(() => []),
          api.vouchers.all().catch(() => []),
          api.inventory.list().catch(() => []),
        ]);
        setData({
          orders: ordersRes || [],
          menu: menuRes || [],
          users: usersRes || [],
          vouchers: vouchersRes || [],
          inventory: inventoryRes || [],
        });
      } catch (err) {
        toast(t("Lỗi tải dữ liệu Dashboard"), "error");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [t]);

  const stats = useMemo(() => {
    const today = getLocalDateStr(new Date());
    const yesterdayObj = new Date();
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterday = getLocalDateStr(yesterdayObj);

    const getOrdersByDate = (dateStr) =>
      data.orders.filter((o) => getLocalDateStr(o.created_at) === dateStr);
    const todayOrdersList = getOrdersByDate(today);
    const yesterdayOrdersList = getOrdersByDate(yesterday);

    const revenueToday = todayOrdersList
      .filter((o) => o.status === "Hoàn thành")
      .reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const revenueYesterday = yesterdayOrdersList
      .filter((o) => o.status === "Hoàn thành")
      .reduce((sum, o) => sum + (Number(o.total) || 0), 0);

    const ordersToday = todayOrdersList.length;
    const ordersYesterday = yesterdayOrdersList.length;

    const revGrowth =
      revenueYesterday === 0
        ? revenueToday > 0 ? 100 : 0
        : Math.round(((revenueToday - revenueYesterday) / revenueYesterday) * 100);
    const ordGrowth =
      ordersYesterday === 0
        ? ordersToday > 0 ? 100 : 0
        : Math.round(((ordersToday - ordersYesterday) / ordersYesterday) * 100);

    const pendingOrders = data.orders.filter((o) => o.status === "Chờ xác nhận").length;

    const lowStockMenu = data.menu.filter((m) => (Number(m.stock) || 0) <= 10);
    const lowStockInv = data.inventory.filter((i) => (Number(i.qty) || 0) <= (Number(i.min) || 0));
    const totalLowStock = lowStockMenu.length + lowStockInv.length;

    const lowStockNames = [
      ...lowStockInv.map((i) => i.name),
      ...lowStockMenu.map((m) => m.name),
    ].slice(0, 3);
    const lowStockText = lowStockNames.length > 0
      ? t("Cần bổ sung: {names}...", { names: lowStockNames.join(", ") })
      : t("Tồn kho đang ở mức an toàn.");

    const chartData = [];
    const daysToShow = chartRange === "today" ? 1 : chartRange === "7d" ? 7 : 30;

    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateStr(d);
      const dayOrders = data.orders.filter(
        (o) => o.status === "Hoàn thành" && getLocalDateStr(o.created_at) === dateStr
      );
      const dayRev = dayOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
      chartData.push({
        name: d.getDate() + "/" + (d.getMonth() + 1),
        revenue: dayRev,
        orders: dayOrders.length,
      });
    }

    const majorMap = {};
    data.users
      .filter((u) => u.role === "CUSTOMER")
      .forEach((u) => {
        const major = u.major_name || u.faculty || t("Chưa xác định");
        majorMap[major] = (majorMap[major] || 0) + 1;
      });
    const topMajors = Object.entries(majorMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const threeDaysLater = new Date();
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const expiringVouchers = data.vouchers.filter((v) => {
      if (!v.expires_at || v.used) return false;
      const exp = new Date(v.expires_at);
      return exp > new Date() && exp <= threeDaysLater;
    }).length;

    return {
      revenueToday, revGrowth, ordersToday, ordGrowth,
      pendingOrders, totalLowStock, lowStockText,
      chartData, topMajors, expiringVouchers,
    };
  }, [data, chartRange, t]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", fontWeight: 600, color: "#64748b" }}>
        {t("Đang tải dữ liệu thật...")}
      </div>
    );
  }

  const cardStyle = {
    background: "var(--card-bg, #fff)",
    borderRadius: 16, padding: 20,
    border: "1px solid var(--border-color, #e5e9ef)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
  };
  const flexRow = { display: "flex", alignItems: "center", gap: 12 };
  const kpiGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16, marginBottom: 24,
  };

  const renderGrowth = (val) => {
    if (val > 0) {
      return (
        <span style={{ color: "#10b981", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <ArrowUpRight size={14} /> {val}% {t("so với hôm qua")}
        </span>
      );
    }
    if (val < 0) {
      return (
        <span style={{ color: "#ef4444", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <ArrowDownRight size={14} /> {Math.abs(val)}% {t("so với hôm qua")}
        </span>
      );
    }
    return (
      <span style={{ color: "#94a3b8", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
        <Minus size={14} /> 0% {t("so với hôm qua")}
      </span>
    );
  };

  return (
    <div style={{ paddingBottom: 40 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: 12, marginBottom: 24,
        }}
      >
        {[
          { label: "Đơn hàng",   icon: ShoppingBag, path: "/owner/orders" },
          { label: "Thực đơn",   icon: Utensils,    path: "/owner/menu" },
          { label: "Kho hàng",   icon: Box,         path: "/owner/inventory" },
          { label: "Voucher",    icon: Ticket,      path: "/owner/vouchers" },
          { label: "Báo cáo",    icon: PieChart,    path: "/owner/finance" },
          { label: "Khách hàng", icon: Users,       path: "/owner/customers" },
        ].map((item, idx) => (
          <button
            key={idx}
            onClick={() => navigate(item.path)}
            style={{
              ...cardStyle, ...flexRow,
              justifyContent: "space-between",
              cursor: "pointer",
              border: "1px solid transparent",
            }}
          >
            <div style={{ ...flexRow, color: "var(--text-primary, #172033)", fontWeight: 600, fontSize: 13 }}>
              <item.icon size={16} color="#2634d5" /> {t(item.label)}
            </div>
            <ChevronRight size={14} color="#94a3b8" />
          </button>
        ))}
      </div>

      <div style={kpiGrid}>
        <div onClick={() => navigate("/owner/finance")} style={{ ...cardStyle, cursor: "pointer" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted, #64748b)", marginBottom: 8 }}>
            {t("Doanh thu hôm nay")}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#10b981", marginBottom: 4 }}>
            {money(stats.revenueToday)}
          </div>
          {renderGrowth(stats.revGrowth)}
        </div>
        <div onClick={() => navigate("/owner/orders")} style={{ ...cardStyle, cursor: "pointer" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted, #64748b)", marginBottom: 8 }}>
            {t("Đơn hàng hôm nay")}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#3b82f6", marginBottom: 4 }}>
            {stats.ordersToday} {t("đơn")}
          </div>
          {renderGrowth(stats.ordGrowth)}
        </div>
        <div onClick={() => navigate("/owner/orders")} style={{ ...cardStyle, cursor: "pointer" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted, #64748b)", marginBottom: 8 }}>
            {t("Đơn chờ xử lý")}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#f59e0b", marginBottom: 4 }}>
            {stats.pendingOrders} {t("đơn")}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-light, #94a3b8)" }}>
            {t("Cần xác nhận hoặc xử lý")}
          </div>
        </div>
        <div onClick={() => navigate("/owner/inventory")} style={{ ...cardStyle, cursor: "pointer" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted, #64748b)", marginBottom: 8 }}>
            {t("Cảnh báo kho")}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#ef4444", marginBottom: 4 }}>
            {stats.totalLowStock} {t("mặt hàng")}
          </div>
          <div style={{ fontSize: 12, color: "#ef4444" }}>
            {t("Sắp hết hoặc đã hết hàng")}
          </div>
        </div>
      </div>

      <div
        style={{
          background: "#f8fafc", padding: 20, borderRadius: 16,
          border: "1px solid #e2e8f0", marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "#1e293b" }}>
            <AlertTriangle size={18} color="#f59e0b" /> {t("Cần xử lý ngay")}
          </div>
          <Link
            to="/owner/orders"
            style={{ fontSize: 13, color: "#2634d5", fontWeight: 600, textDecoration: "none" }}
          >
            {t("Xem tất cả")} →
          </Link>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <div
            onClick={() => navigate("/owner/orders")}
            style={{ ...cardStyle, padding: 16, display: "flex", gap: 14, alignItems: "center", cursor: "pointer" }}
          >
            <div style={{ background: "#eff6ff", padding: 10, borderRadius: "50%" }}>
              <ShoppingBag size={20} color="#3b82f6" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#172033" }}>
                {t("Đơn hàng chờ xác nhận")}{" "}
                <span style={{ color: "#ef4444", background: "#fee2e2", padding: "2px 6px", borderRadius: 10, fontSize: 10 }}>
                  {stats.pendingOrders}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                {t("Các đơn hàng chưa được xử lý theo quy trình.")}
              </div>
            </div>
          </div>

          <div
            onClick={() => navigate("/owner/inventory")}
            style={{ ...cardStyle, padding: 16, display: "flex", gap: 14, alignItems: "center", cursor: "pointer" }}
          >
            <div style={{ background: "#fff7ed", padding: 10, borderRadius: "50%" }}>
              <Box size={20} color="#f59e0b" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#172033" }}>
                {t("Nguyên liệu sắp hết")}{" "}
                <span style={{ color: "#ef4444", background: "#fee2e2", padding: "2px 6px", borderRadius: 10, fontSize: 10 }}>
                  {stats.totalLowStock}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                {stats.lowStockText}
              </div>
            </div>
          </div>

          <div
            onClick={() => navigate("/owner/vouchers")}
            style={{ ...cardStyle, padding: 16, display: "flex", gap: 14, alignItems: "center", cursor: "pointer" }}
          >
            <div style={{ background: "#f5f3ff", padding: 10, borderRadius: "50%" }}>
              <Ticket size={20} color="#8b5cf6" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#172033" }}>
                {t("Voucher sắp hết hạn")}{" "}
                <span style={{ color: "#ef4444", background: "#fee2e2", padding: "2px 6px", borderRadius: 10, fontSize: 10 }}>
                  {stats.expiringVouchers}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                {t("Có {n} voucher hết hạn trong 3 ngày.", { n: stats.expiringVouchers })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
          gap: 24, alignItems: "start",
        }}
      >
        <div style={cardStyle}>
          <div
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 20, flexWrap: "wrap", gap: 12,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, color: "#172033" }}>
              {t("Doanh thu & đơn hàng")}
            </div>
            <div style={{ background: "#f1f5f9", padding: 4, borderRadius: 8, display: "flex", gap: 4 }}>
              {[
                { id: "today", label: "Hôm nay" },
                { id: "7d", label: "7 ngày" },
                { id: "30d", label: "30 ngày" },
              ].map((r) => (
                <button
                  key={r.id}
                  onClick={() => setChartRange(r.id)}
                  style={{
                    padding: "4px 12px",
                    background: chartRange === r.id ? "#fff" : "transparent",
                    border: chartRange === r.id ? "1px solid #e2e8f0" : "1px solid transparent",
                    borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: "pointer",
                    color: chartRange === r.id ? "#172033" : "#64748b",
                  }}
                >
                  {t(r.label)}
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: 300, width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={stats.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
                <YAxis
                  axisLine={false} tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  tickFormatter={(val) => val === 0 ? "0đ" : val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : `${val / 1000}k`}
                />
                <RechartsTooltip formatter={(value, name) => [name === t("Doanh thu") ? money(value) : value, name]} />
                <Area type="monotone" dataKey="revenue" name={t("Doanh thu")} stroke="#3b82f6" fillOpacity={0.1} fill="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="orders" name={t("Số đơn")} stroke="#10b981" strokeWidth={0} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#172033" }}>
              {t("Sinh viên theo ngành")}
            </div>
            <Link to="/owner/customers" style={{ fontSize: 13, color: "#2634d5", fontWeight: 600, textDecoration: "none" }}>
              {t("Quản lý khách hàng")} →
            </Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {stats.topMajors.length === 0 ? (
              <div style={{ color: "#94a3b8", fontSize: 13 }}>{t("Chưa có dữ liệu sinh viên")}</div>
            ) : null}
            {stats.topMajors.map((m, idx) => {
              const max = stats.topMajors[0]?.count || 1;
              const percent = (m.count / max) * 100;
              return (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: "#f1f5f9", color: "#64748b",
                      display: "grid", placeItems: "center",
                      fontSize: 11, fontWeight: 700,
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, color: "#172033" }}>{m.name}</span>
                      <span style={{ color: "#64748b" }}>{m.count}</span>
                    </div>
                    <div style={{ width: "100%", height: 6, background: "#f1f5f9", borderRadius: 4 }}>
                      <div style={{ width: `${percent}%`, height: "100%", background: "#8b5cf6", borderRadius: 4 }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 24, fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6 }}>
            <CheckCircle2 size={12} /> {t("Dữ liệu được cập nhật theo thông tin quản lý sinh viên.")}
          </div>
        </div>
      </div>
    </div>
  );
}
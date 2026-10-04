// ============================================================
// EMPLOYEEHOME.JSX — Trang Tổng quan ca làm việc (V3)
// ============================================================
// Layout:
//   - Hero banner (gộp từ StaffHero, tính dữ liệu thật)
//   - 4 KPI cards (doanh thu/trợ giá/đơn/thời gian tính thật)
//   - KDS Kanban board (3 columns)
//   - Inventory 86 list + VSATTP checklist (right column)
//   - Telemetry dock
// ============================================================

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingBag, Timer, Wallet, School, Package, HandCoins,
  Bell, Printer, AlertTriangle, BadgeCheck, Users,
} from "lucide-react";

import { api } from "../../api";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import { useAuth } from "../../contexts/AuthContext";

import StaffKPICard from "../../components/StaffKPICard";
import KDSTicket from "../../components/KDSTicket";
import Inventory86List from "../../components/Inventory86List";
import ShiftChecklist from "../../components/ShiftChecklist";
import TelemetryDock from "../../components/TelemetryDock";

const REFRESH_MS = 20000;
const SUBSIDY_PER_ITEM = 10000; // trợ giá 10k/suất

// VSATTP tasks mặc định
const DEFAULT_VSATTP_TASKS = [
  "Kiểm tra nhiệt độ tủ mát bảo quản thịt (Đạt 3.5°C)",
  "Kiểm tra que test nhanh dầu chiên (Chỉ số an toàn 1.8%)",
  "Bổ sung khay muỗng đũa tiệt trùng đợt 2 (Lúc 12:15)",
  "Kiểm kê số lượng cơm nóng nồi số 3",
];

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

function getLocalDateStr(input) {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dt = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dt}`;
}

function calcElapsedSeconds(order) {
  if (!order?.created_at) return 0;
  const created = new Date(order.created_at).getTime();
  if (isNaN(created)) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / 1000));
}

function genPickupNumber(id, prefix = "A") {
  const num = (Number(id) || 0) % 50 + 1;
  const letterIndex = Math.floor((Number(id) || 0) / 50) % 3;
  const letters = ["A", "B", "C"];
  return `${letters[letterIndex]}-${String(num).padStart(2, "0")}`;
}

function fmtDuration(ms) {
  if (!ms || ms < 0) return "00h 00m";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}

// Tính ca hiện tại dựa vào giờ
function getCurrentShiftInfo(now = new Date()) {
  const min = now.getHours() * 60 + now.getMinutes();
  const hhmm = (h, m) => h * 60 + m;

  // Ca sáng: 06:30 - 12:30
  // Ca trưa: 10:30 - 14:00
  // Ca chiều: 12:30 - 18:30
  if (min >= hhmm(10, 30) && min < hhmm(14, 0)) {
    return { title: "Ca Trưa", time: "10:30 - 14:00" };
  }
  if (min >= hhmm(6, 30) && min < hhmm(12, 30)) {
    return { title: "Ca Sáng", time: "06:30 - 12:30" };
  }
  if (min >= hhmm(12, 30) && min < hhmm(18, 30)) {
    return { title: "Ca Chiều", time: "12:30 - 18:30" };
  }
  return { title: "Ngoài giờ", time: "--:-- - --:--" };
}

// ------------------------------------------------------------------
// MAIN
// ------------------------------------------------------------------

export default function EmployeeHome() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [approvedShifts, setApprovedShifts] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState(null);

  const [now, setNow] = useState(new Date());

  const reqIdRef = useRef(0);
  const inFlightRef = useRef(false);

  // Clock 1s
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ---- LOAD ----
  const load = useCallback(
    async (silent = false) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      const myReqId = ++reqIdRef.current;
      if (!silent) setRefreshing(true);
      setError("");

      try {
        const [ordersRes, menuRes, shiftsRes, attRes] = await Promise.all([
          api.orders.all("Tất cả").catch(() => []),
          api.menu.list("", "Tất cả", "popular").catch(() => []),
          api.shifts.approvedToday().catch(() => []),
          api.attendance.today().catch(() => null),
        ]);

        if (myReqId !== reqIdRef.current) return;

        setOrders(Array.isArray(ordersRes) ? ordersRes : []);
        setMenuItems(
          (Array.isArray(menuRes) ? menuRes : []).filter((m) => m.active)
        );
        setApprovedShifts(Array.isArray(shiftsRes) ? shiftsRes : []);
        setTodayAttendance(attRes || null);
      } catch (e) {
        if (myReqId === reqIdRef.current && !silent) {
          setError(e.message || t("Không tải được dữ liệu"));
        }
      } finally {
        if (myReqId === reqIdRef.current) {
          setLoading(false);
          if (!silent) setRefreshing(false);
        }
        inFlightRef.current = false;
      }
    },
    [t]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  // ---- COMPUTED ----
  const todayStr = useMemo(() => getLocalDateStr(new Date()), []);

  const todayOrders = useMemo(
    () => orders.filter((o) => getLocalDateStr(o.created_at) === todayStr),
    [orders, todayStr]
  );

  const preparingOrders = useMemo(
    () => orders.filter((o) => o.status === "Đang chuẩn bị"),
    [orders]
  );

  const readyOrders = useMemo(
    () => orders.filter((o) => o.status === "Sẵn sàng nhận"),
    [orders]
  );

  const pendingOrders = useMemo(
    () =>
      orders.filter(
        (o) => o.status === "Chờ xác nhận" || o.status === "Đã xác nhận"
      ),
    [orders]
  );

  // ---- KPI ----
  const kpi = useMemo(() => {
    const completed = todayOrders.filter((o) => o.status === "Hoàn thành");
    const cancelled = todayOrders.filter((o) => o.status === "Đã hủy");
    const totalRevenue = completed.reduce(
      (s, o) => s + (Number(o.total) || 0),
      0
    );
    const totalSubsidy = completed.length * SUBSIDY_PER_ITEM;

    return {
      totalOrders: todayOrders.length,
      completedCount: completed.length,
      cancelledCount: cancelled.length,
      preparingCount: preparingOrders.length,
      readyCount: readyOrders.length,
      pendingCount: pendingOrders.length,
      revenue: totalRevenue,
      subsidy: totalSubsidy,
    };
  }, [todayOrders, preparingOrders, readyOrders, pendingOrders]);

  // Thời gian phục vụ TB thật — tính từ các đơn completed hôm nay
  // (dùng updated_at - created_at nếu có, fallback bỏ qua)
  const avgPrepTime = useMemo(() => {
    const completed = todayOrders.filter(
      (o) => o.status === "Hoàn thành" && o.created_at && o.updated_at
    );
    if (completed.length === 0) return 0;
    const totalMs = completed.reduce((s, o) => {
      const start = new Date(o.created_at).getTime();
      const end = new Date(o.updated_at).getTime();
      if (isNaN(start) || isNaN(end)) return s;
      return s + Math.max(0, end - start);
    }, 0);
    const avgMs = totalMs / completed.length;
    return avgMs / 60000; // phút
  }, [todayOrders]);

  // Nhanh nhất — đơn completed có thời gian ngắn nhất
  const fastestOrder = useMemo(() => {
    const completed = todayOrders.filter(
      (o) => o.status === "Hoàn thành" && o.created_at && o.updated_at
    );
    if (completed.length === 0) return null;
    let best = null;
    let bestMs = Infinity;
    for (const o of completed) {
      const start = new Date(o.created_at).getTime();
      const end = new Date(o.updated_at).getTime();
      if (isNaN(start) || isNaN(end)) continue;
      const d = Math.max(0, end - start);
      if (d < bestMs) {
        bestMs = d;
        best = { order: o, ms: d };
      }
    }
    if (!best) return null;
    return {
      minutes: best.ms / 60000,
      station: best.order.station || "Quầy 01",
    };
  }, [todayOrders]);

  // ---- HERO DATA (tính thật) ----
  const shiftInfo = useMemo(() => getCurrentShiftInfo(now), [now]);

  // Tổ trưởng ca = user đang đăng nhập
  const shiftLeaderName = user?.name || "—";
  const shiftLeaderCode = user?.employeeCode || user?.code || "";

  // Kíp trực = số NV có ca approved hôm nay
  const crewSize = useMemo(() => {
    const uniqueNames = new Set();
    approvedShifts.forEach((s) => {
      const n = s.name || s.staff_name || s.employee_name;
      if (n) uniqueNames.add(n);
    });
    return uniqueNames.size || approvedShifts.length || 1;
  }, [approvedShifts]);

  // Quầy đang trực (lấy từ shift đầu tiên hoặc fallback)
  const stationName = useMemo(() => {
    const s = approvedShifts[0];
    return (
      s?.station ||
      s?.counter_name ||
      "Quầy Chế Biến Tổng Hợp"
    );
  }, [approvedShifts]);

  // Thời gian ca = now - checkIn (từ attendance.today)
  const elapsedShiftMs = useMemo(() => {
    const checkIn = todayAttendance?.checkIn;
    if (!checkIn) return 0;
    const start = new Date(checkIn).getTime();
    if (isNaN(start)) return 0;
    return Math.max(0, now.getTime() - start);
  }, [todayAttendance, now]);

  // ---- Inventory 86 ----
  const lowStockItems = useMemo(() => {
    return menuItems.filter(
      (m) => typeof m.stock === "number" && m.stock < 30
    );
  }, [menuItems]);

  // ---- ACTIONS ----
  const handleMarkReady = useCallback(
    async (order) => {
      const id = order._id || order.id;
      if (processingId) return;
      setProcessingId(id);
      try {
        await api.orders.setStatus(id, "Sẵn sàng nhận");
        toast(`${order.code} — ${t("Đã báo xong món!")}`, "success", {
          variant: "card",
          title: t("Đã báo xong món!"),
          description: `${order.code} — ${t("Khách có thể đến nhận.")}`,
        });
        await load(true);
      } catch (e) {
        toast(e.message || t("Không chuyển được trạng thái"), "error");
      } finally {
        setProcessingId(null);
      }
    },
    [processingId, load, t]
  );

  const handleSendToKitchen = useCallback(
    async (order) => {
      const id = order._id || order.id;
      if (processingId) return;
      setProcessingId(id);
      try {
        await api.orders.setStatus(id, "Đang chuẩn bị");
        toast(`${order.code} — ${t("Đã đẩy vào bếp!")}`, "success", {
          variant: "card",
          title: t("Đã đẩy vào bếp!"),
          description: `${order.code} — ${t("Bếp sẽ xử lý ngay.")}`,
        });
        await load(true);
      } catch (e) {
        toast(e.message || t("Không chuyển được trạng thái"), "error");
      } finally {
        setProcessingId(null);
      }
    },
    [processingId, load, t]
  );

  const handleHandover = useCallback(
    async (order) => {
      const id = order._id || order.id;
      if (processingId) return;
      setProcessingId(id);
      try {
        await api.orders.setStatus(id, "Hoàn thành");
        toast(`${order.code} — ${t("Đã trao khay!")}`, "success", {
          variant: "card",
          title: t("Đã trao khay!"),
          description: `${order.code} — ${t("Giao dịch hoàn tất.")}`,
        });
        await load(true);
      } catch (e) {
        toast(e.message || t("Không chuyển được trạng thái"), "error");
      } finally {
        setProcessingId(null);
      }
    },
    [processingId, load, t]
  );

  const handleRecall = useCallback(
    (pickupNumber) => {
      toast(
        `${t("Đang phát loa:")} ${t("Mời số")} #${pickupNumber} ${t("đến nhận món tại Quầy 01")}`,
        "info"
      );
    },
    [t]
  );

  const handleToggle86 = useCallback(
    async (item) => {
      const id = item._id || item.id;
      const isOff = item.stock === 0;
      const newStock = isOff ? 20 : 0;

      try {
        await api.menu.update(id, { stock: newStock });
        toast(
          isOff
            ? `${t("Đã MỞ LẠI món:")} ${item.name}`
            : `${t("Đã BÁO HẾT (86):")} ${item.name}`,
          isOff ? "success" : "warning"
        );
        await load(true);
      } catch (e) {
        toast(e.message || t("Không cập nhật được"), "error");
      }
    },
    [load, t]
  );

  const handleAddTo86 = useCallback(() => {
    toast(t("Chọn món để báo hết từ menu"), "info");
    navigate("/employee/menu");
  }, [navigate, t]);

  // ---- Hero actions ----
  const handleSoundToggle = () =>
    toast(t("Đã đổi trạng thái loa báo"), "info");
  const handlePrintHandover = () =>
    toast(t("Đang in phiếu giao ca..."), "success");
  const handle86Alert = () => {
    const el = document.getElementById("inventory-section");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ---- RENDER ----
  return (
    <div>
      {error && (
        <div
          style={{
            background: "var(--st-danger-bg)",
            border: "1px solid var(--st-danger-border)",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 16,
            color: "var(--st-danger)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* ============ HERO (gộp StaffHero) ============ */}
      <div className="staff-hero">
        <div className="staff-hero__row">
          <div className="staff-hero__left">
            <div className="staff-hero__chips">
              <span className="staff-hero__chip staff-hero__chip--success">
                <span className="staff-hero__chip-dot" />
                {t("Đang mở cửa đón khách")}
              </span>
              <span className="staff-hero__chip-sep">•</span>
              <span className="staff-hero__chip staff-hero__chip--neutral">
                {stationName}
              </span>
            </div>

            <h1 className="staff-hero__title">
              {t(shiftInfo.title)} ({shiftInfo.time})
              <span> — {stationName}</span>
            </h1>

            <div className="staff-hero__meta">
              <div className="staff-hero__meta-item">
                <BadgeCheck
                  size={16}
                  style={{ color: "var(--st-primary-container)" }}
                />
                <span>
                  {t("Tổ trưởng ca:")} <b>{shiftLeaderName}</b>
                  {shiftLeaderCode && ` (${shiftLeaderCode})`}
                </span>
              </div>
              <span className="staff-hero__meta-sep" />
              <div className="staff-hero__meta-item">
                <Users size={16} />
                <span>
                  {t("Kíp trực:")}{" "}
                  <b>
                    {crewSize} {t("nhân viên")}
                  </b>
                </span>
              </div>
              <span className="staff-hero__meta-sep" />
              <div
                className="staff-hero__meta-item"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                <Timer size={16} style={{ color: "var(--st-info)" }} />
                <span>
                  {t("Thời gian ca:")}{" "}
                  <b>
                    {elapsedShiftMs > 0
                      ? fmtDuration(elapsedShiftMs)
                      : t("Chưa chấm công")}
                  </b>
                </span>
              </div>
            </div>
          </div>

          <div className="staff-hero__actions">
            <button
              type="button"
              className="staff-hero__action"
              onClick={handleSoundToggle}
              title={t("Bật/Tắt chuông báo")}
            >
              <Bell
                size={18}
                style={{ color: "var(--st-primary-container)" }}
              />
              <span>{t("Loa Báo Đơn")}</span>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--st-success)",
                  flexShrink: 0,
                }}
              />
            </button>

            <button
              type="button"
              className="staff-hero__action"
              onClick={handlePrintHandover}
            >
              <Printer size={18} />
              <span>{t("In Phiếu Giao Ca")}</span>
            </button>

            <button
              type="button"
              className="staff-hero__action staff-hero__action--danger"
              onClick={handle86Alert}
            >
              <AlertTriangle size={18} />
              <span>{t("Báo Hết Món (86)")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI GRID */}
      <div className="staff-kpi-grid">
        {/* KPI 1 — Tổng đơn trong ca */}
        <StaffKPICard
          icon={<ShoppingBag size={22} />}
          label={t("Tổng đơn trong ca")}
          value={kpi.totalOrders}
          unit={t("suất")}
          delta={{ pct: 15, isUp: true }}
          progressSegments={[
            {
              pct: kpi.totalOrders
                ? (kpi.completedCount / kpi.totalOrders) * 100
                : 0,
              variant: "success",
              title: `${t("Đã xong")}: ${kpi.completedCount}`,
            },
            {
              pct: kpi.totalOrders
                ? (kpi.preparingCount / kpi.totalOrders) * 100
                : 0,
              variant: "warning",
            },
            {
              pct: kpi.totalOrders
                ? ((kpi.readyCount + kpi.pendingCount) / kpi.totalOrders) * 100
                : 0,
              variant: "primary",
            },
          ]}
          legendRows={[
            { label: `${t("Chế biến:")}`, value: kpi.preparingCount },
            {
              label: `${t("Chờ nhận:")}`,
              value: kpi.readyCount + kpi.pendingCount,
            },
          ]}
        />

        {/* KPI 2 — Thời gian phục vụ TB */}
        <StaffKPICard
          icon={<Timer size={22} />}
          label={t("Thời gian phục vụ TB")}
          value={avgPrepTime > 0 ? avgPrepTime.toFixed(1) : "—"}
          unit={avgPrepTime > 0 ? t("phút/món") : ""}
          colorVariant="success"
          badge={
            avgPrepTime > 0 && avgPrepTime <= 10
              ? {
                  icon: <span style={{ fontSize: 12 }}>⚡</span>,
                  text: t("Đạt Chuẩn Tốc Độ"),
                  variant: "success",
                }
              : null
          }
          progressSegments={
            avgPrepTime > 0
              ? [
                  {
                    pct: Math.min(100, (10 / Math.max(avgPrepTime, 1)) * 100),
                    variant: "success",
                  },
                ]
              : []
          }
          hint={
            fastestOrder ? (
              <>
                {t("Nhanh nhất:")}{" "}
                <b>{fastestOrder.minutes.toFixed(1)}m</b> (
                {fastestOrder.station})
              </>
            ) : (
              t("Chưa có dữ liệu")
            )
          }
        />

        {/* KPI 3 — Doanh thu ca hiện tại */}
        <StaffKPICard
          icon={<HandCoins size={22} />}
          label={t("Doanh thu ca hiện tại")}
          value={kpi.revenue.toLocaleString("vi-VN")}
          unit="đ"
          colorVariant="primary"
          progressSegments={[
            { pct: 78, variant: "primary" },
            { pct: 22, variant: "info" },
          ]}
          legendRows={[
            {
              label: t("VWA Pay / Thẻ SV (78%)"),
              value: `${(kpi.revenue * 0.78).toLocaleString("vi-VN")} đ`,
            },
          ]}
          hint={
            <>
              {t("Tiền mặt / VietQR:")}{" "}
              <b>{(kpi.revenue * 0.22).toLocaleString("vi-VN")} đ</b>
            </>
          }
        />

        {/* KPI 4 — Trợ giá sinh viên */}
        <StaffKPICard
          icon={<School size={22} />}
          label={t("Trợ giá sinh viên")}
          value={kpi.subsidy.toLocaleString("vi-VN")}
          unit="đ"
          colorVariant="tertiary"
          progressSegments={[{ pct: 85, variant: "info" }]}
          legendRows={[
            {
              label: t("Lượt hưởng trợ giá"),
              value: `${kpi.completedCount} ${t("suất")} (-10k/suất)`,
            },
          ]}
          hint={
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span
                style={{
                  color: "var(--st-primary-container)",
                  fontSize: 14,
                }}
              >
                ✓
              </span>
              {t("Chính sách hỗ trợ Học Viện Phụ Nữ VN")}
            </span>
          }
        />
      </div>

      {/* WORKSPACE: KDS + SIDE */}
      <div className="staff-workspace">
        <div className="staff-workspace__kds">
          <div className="kds-header">
            <div className="kds-header__left">
              <Package
                size={22}
                style={{ color: "var(--st-primary-container)" }}
              />
              <span className="kds-header__title">
                {t("Bảng Điều Phối Bếp & Nhận Món Realtime")}
              </span>
              <span className="kds-header__count">
                {preparingOrders.length +
                  readyOrders.length +
                  pendingOrders.length}{" "}
                {t("ĐƠN HOẠT ĐỘNG")}
              </span>
            </div>
            <div className="kds-header__live">
              <span className="kds-header__live-dot" />
              {t("Live 2s")}
            </div>
          </div>

          <div className="kds-grid">
            {/* Column A: Đang Chế Biến */}
            <div className="kds-column">
              <div className="kds-column__head">
                <div className="kds-column__title">
                  <span className="kds-column__dot kds-column__dot--preparing" />
                  <span>{t("Đang Chế Biến")}</span>
                </div>
                <span className="kds-column__count kds-column__count--preparing">
                  {preparingOrders.length} {t("đơn")}
                </span>
              </div>
              <div className="kds-column__body">
                {preparingOrders.length === 0 ? (
                  <div className="kds-column__empty">
                    {t("Không có đơn đang chế biến")}
                  </div>
                ) : (
                  preparingOrders.slice(0, 6).map((o) => (
                    <KDSTicket
                      key={o._id || o.id}
                      variant="preparing"
                      order={o}
                      elapsed={calcElapsedSeconds(o)}
                      loading={processingId === (o._id || o.id)}
                      onAction={handleMarkReady}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Column B: Sẵn Sàng Nhận */}
            <div className="kds-column">
              <div className="kds-column__head">
                <div className="kds-column__title">
                  <span className="kds-column__dot kds-column__dot--ready" />
                  <span>{t("Sẵn Sàng Nhận Món")}</span>
                </div>
                <span className="kds-column__count kds-column__count--ready">
                  {readyOrders.length} {t("đơn")}
                </span>
              </div>
              <div className="kds-column__body">
                {readyOrders.length === 0 ? (
                  <div className="kds-column__empty">
                    {t("Chưa có đơn sẵn sàng")}
                  </div>
                ) : (
                  readyOrders.slice(0, 6).map((o) => (
                    <KDSTicket
                      key={o._id || o.id}
                      variant="pickup"
                      order={o}
                      pickupNumber={genPickupNumber(o._id || o.id)}
                      loading={processingId === (o._id || o.id)}
                      onAction={handleHandover}
                      onRecall={() =>
                        handleRecall(genPickupNumber(o._id || o.id))
                      }
                    />
                  ))
                )}
              </div>
            </div>

            {/* Column C: Mới Nhận / Chờ Bếp */}
            <div className="kds-column">
              <div className="kds-column__head">
                <div className="kds-column__title">
                  <span className="kds-column__dot kds-column__dot--pending" />
                  <span>{t("Mới Nhận / Chờ Bếp")}</span>
                </div>
                <span className="kds-column__count kds-column__count--pending">
                  {pendingOrders.length} {t("đơn")}
                </span>
              </div>
              <div className="kds-column__body">
                {pendingOrders.length === 0 ? (
                  <div className="kds-column__empty">
                    {t("Chưa có đơn mới")}
                  </div>
                ) : (
                  pendingOrders.slice(0, 6).map((o) => (
                    <KDSTicket
                      key={o._id || o.id}
                      variant="pending"
                      order={o}
                      elapsed={calcElapsedSeconds(o)}
                      loading={processingId === (o._id || o.id)}
                      onAction={handleSendToKitchen}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Ticker */}
          <div className="kds-ticker">
            <div className="kds-ticker__left">
              <span className="kds-ticker__label">{t("Tin nhanh bếp")}</span>
              <span className="kds-ticker__text">
                {t(
                  "Nồi cơm thơm dẻo số 2 vừa chín tới. Quầy tráng miệng chuẩn bị 50 ly chè khúc bạch cho ca 12:00."
                )}
              </span>
            </div>
            <span className="kds-ticker__time">
              {new Date().toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>
        </div>

        {/* RIGHT: 86 List + VSATTP */}
        <div className="staff-workspace__side" id="inventory-section">
          <Inventory86List
            items={lowStockItems}
            onToggle86={handleToggle86}
            onAddTo86={handleAddTo86}
            limit={6}
          />

          <ShiftChecklist
            tasks={DEFAULT_VSATTP_TASKS}
            supervisorNote={t(
              "Hôm nay có 2 lớp học quân sự ăn trưa dồn lúc 11:45, ưu tiên chia sẵn 40 khay cơm sườn."
            )}
          />
        </div>
      </div>

      {/* TELEMETRY DOCK */}
      <TelemetryDock />
    </div>
  );
}
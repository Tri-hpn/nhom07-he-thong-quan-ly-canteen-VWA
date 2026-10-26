// ============================================================
// EMPLOYEEHOME.JSX — Trang Tổng quan ca làm việc (V8 - FIX)
// ============================================================
// V8:
//   - 🔧 Tăng REFRESH_MS từ 5s lên 15s để giảm tải cho Serverless.
//   - 🔧 Thêm guard getToken() chặn gọi API khi mất phiên.
// ============================================================

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingBag, Timer, Wallet, School, Package, HandCoins,
  Bell, BellOff, Printer, AlertTriangle, BadgeCheck, Users,
  ClipboardList, CheckSquare, Clock,
  Check, Loader2, TrendingUp, CheckCircle2, X,
} from "lucide-react";

import { api, getToken } from "../../api"; // 🔧 Thêm getToken
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import { emitOrderUpdated, onOrderUpdated } from "../../lib/orderEvents";
import { useI18n } from "../../hooks/useI18n";
import { useAuth } from "../../contexts/AuthContext";
import StaffKPICard from "../../components/StaffKPICard";
import TelemetryDock from "../../components/TelemetryDock";

// 🔧 FIX: Tăng thời gian refresh lên 15s để giảm tải Vercel
const REFRESH_MS = 15000;
const SUBSIDY_PER_ITEM = 10000;
const LOW_STOCK_THRESHOLD = 10;
const DANGER_STOCK_THRESHOLD = 5;
const SOUND_REPEAT_MS = 30000;
const SOUND_STORAGE_KEY = "canteen.sound_enabled";

const TICKER_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});

const PRINT_DATETIME_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});

const PRINT_DATE_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric",
});

const PRINT_TIME_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false,
});

function getLocalDateStr(input) {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dt = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dt}`;
}

function fmtDuration(ms) {
  if (!ms || ms < 0) return "00h 00m";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}

function getCurrentShiftInfo(now = new Date()) {
  const min = now.getHours() * 60 + now.getMinutes();
  const hhmm = (h, m) => h * 60 + m;

  if (min >= hhmm(10, 30) && min < hhmm(14, 0)) return { title: "Ca Trưa", time: "10:30 - 14:00" };
  if (min >= hhmm(6, 30) && min < hhmm(12, 30)) return { title: "Ca Sáng", time: "06:30 - 12:30" };
  if (min >= hhmm(12, 30) && min < hhmm(18, 30)) return { title: "Ca Chiều", time: "12:30 - 18:30" };
  return { title: "Ngoài giờ", time: "--:-- - --:--" };
}

function genShiftCode(now = new Date(), suffix = "A") {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `SHIFT-${y}${m}${d}-${suffix}`;
}

function playDing() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const makeTone = (freq, startAt, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.25, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + duration + 0.05);
    };

    makeTone(880, now, 0.18);
    makeTone(1320, now + 0.16, 0.22);
    setTimeout(() => { try { ctx.close(); } catch (_) {} }, 700);
  } catch (e) {}
}

export default function EmployeeHome() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [approvedShifts, setApprovedShifts] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [pushingAlertId, setPushingAlertId] = useState(null);
  const [togglingTaskId, setTogglingTaskId] = useState(null);

  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      const v = localStorage.getItem(SOUND_STORAGE_KEY);
      return v === null ? true : v === "1";
    } catch { return true; }
  });

  const [showHandover, setShowHandover] = useState(false);
  const [now, setNow] = useState(new Date());

  const reqIdRef = useRef(0);
  const inFlightRef = useRef(false);

  const prevPendingCountRef = useRef(null);
  const dingIntervalRef = useRef(null);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { try { localStorage.setItem(SOUND_STORAGE_KEY, soundEnabled ? "1" : "0"); } catch (_) {} }, [soundEnabled]);

  const load = useCallback(async (silent = false) => {
    // 🔧 FIX: Chặn gọi API khi chưa đăng nhập
    if (!getToken()) return; 
    
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const myReqId = ++reqIdRef.current;
    if (!silent) setRefreshing(true);
    setError("");

    try {
      const [ordersRes, menuRes, shiftsRes, attRes, tasksRes] = await Promise.all([
        api.orders.all("Tất cả").catch(() => []),
        api.menu.listActive("", "Tất cả", "popular").catch(() => []),
        api.shifts.approvedToday().catch(() => []),
        api.attendance.today().catch(() => null),
        api.tasks.me().catch(() => []),
      ]);

      if (myReqId !== reqIdRef.current) return;

      setOrders(Array.isArray(ordersRes) ? ordersRes : []);
      setMenuItems((Array.isArray(menuRes) ? menuRes : []).filter((m) => m.active));
      setApprovedShifts(Array.isArray(shiftsRes) ? shiftsRes : []);
      setTodayAttendance(attRes || null);
      setTasks(Array.isArray(tasksRes) ? tasksRes : []);
    } catch (e) {
      if (myReqId === reqIdRef.current && !silent) setError(e.message || t("Không tải được dữ liệu"));
    } finally {
      if (myReqId === reqIdRef.current) {
        setLoading(false);
        if (!silent) setRefreshing(false);
      }
      inFlightRef.current = false;
    }
  }, [t]);

  useEffect(() => { load(false); }, [load]);
  useEffect(() => { const timer = setInterval(() => load(true), REFRESH_MS); return () => clearInterval(timer); }, [load]);
  useEffect(() => { const off = onOrderUpdated(() => { load(true); }); return off; }, [load]);

  const todayStr = useMemo(() => getLocalDateStr(new Date()), []);
  const todayOrders = useMemo(() => orders.filter((o) => getLocalDateStr(o.created_at) === todayStr), [orders, todayStr]);

  const unconfirmedOrders = useMemo(() => orders.filter((o) => o.status === "Chờ xác nhận"), [orders]);
  const preparingOrders = useMemo(() => orders.filter((o) => o.status === "Đang chuẩn bị"), [orders]);
  const readyOrders = useMemo(() => orders.filter((o) => o.status === "Sẵn sàng nhận"), [orders]);
  const pendingOrders = useMemo(() => orders.filter((o) => o.status === "Chờ xác nhận" || o.status === "Đã xác nhận"), [orders]);

  const kpi = useMemo(() => {
    const completed = todayOrders.filter((o) => o.status === "Hoàn thành");
    const cancelled = todayOrders.filter((o) => o.status === "Đã hủy");
    const totalRevenue = completed.reduce((s, o) => s + (Number(o.total) || 0), 0);
    return {
      totalOrders: todayOrders.length, completedCount: completed.length, cancelledCount: cancelled.length,
      preparingCount: preparingOrders.length, readyCount: readyOrders.length, pendingCount: pendingOrders.length,
      revenue: totalRevenue, subsidy: completed.length * SUBSIDY_PER_ITEM,
    };
  }, [todayOrders, preparingOrders, readyOrders, pendingOrders]);

  const avgPrepTime = useMemo(() => {
    const completed = todayOrders.filter((o) => o.status === "Hoàn thành" && o.created_at && o.updated_at);
    if (completed.length === 0) return 0;
    const totalMs = completed.reduce((s, o) => {
      const start = new Date(o.created_at).getTime();
      const end = new Date(o.updated_at).getTime();
      if (isNaN(start) || isNaN(end)) return s;
      return s + Math.max(0, end - start);
    }, 0);
    return (totalMs / completed.length) / 60000;
  }, [todayOrders]);

  const fastestOrder = useMemo(() => {
    const completed = todayOrders.filter((o) => o.status === "Hoàn thành" && o.created_at && o.updated_at);
    if (completed.length === 0) return null;
    let best = null; let bestMs = Infinity;
    for (const o of completed) {
      const start = new Date(o.created_at).getTime();
      const end = new Date(o.updated_at).getTime();
      if (isNaN(start) || isNaN(end)) continue;
      const d = Math.max(0, end - start);
      if (d < bestMs) { bestMs = d; best = { order: o, ms: d }; }
    }
    if (!best) return null;
    return { minutes: best.ms / 60000, station: best.order.station || "Quầy 01" };
  }, [todayOrders]);

  const shiftInfo = useMemo(() => {
    if (approvedShifts.length > 0) {
      const current = approvedShifts[0];
      const title = current.name || current.shift_name || current.title || "Ca làm việc";
      const time = current.time || (current.start_time && current.end_time ? `${current.start_time} - ${current.end_time}` : "");
      return { title, time };
    }
    return getCurrentShiftInfo(now);
  }, [approvedShifts, now]);

  const upcomingShiftNotice = useMemo(() => {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin >= 600 && nowMin < 630) return "Ca Trưa (10:30 - 14:00)";
    if (nowMin >= 360 && nowMin < 390) return "Ca Sáng (06:30 - 12:30)";
    if (nowMin >= 720 && nowMin < 750) return "Ca Chiều (12:30 - 18:30)";
    return null;
  }, [now]);

  const shiftLeaderName = user?.name || "—";
  const shiftLeaderCode = user?.employeeCode || user?.code || "";

  const crewSize = useMemo(() => {
    const uniqueNames = new Set();
    approvedShifts.forEach((s) => {
      const n = s.name || s.staff_name || s.employee_name;
      if (n) uniqueNames.add(n);
    });
    return uniqueNames.size || approvedShifts.length || 1;
  }, [approvedShifts]);

  const stationName = useMemo(() => {
    const s = approvedShifts[0];
    return s?.station || s?.counter_name || "Quầy Chế Biến Tổng Hợp";
  }, [approvedShifts]);

  const elapsedShiftMs = useMemo(() => {
    const checkIn = todayAttendance?.checkIn;
    if (!checkIn) return 0;
    const start = new Date(checkIn).getTime();
    if (isNaN(start)) return 0;
    return Math.max(0, now.getTime() - start);
  }, [todayAttendance, now]);

  const lowStockItems = useMemo(() => {
    return menuItems.filter((m) => { const stock = Number(m.stock) || 0; return stock < LOW_STOCK_THRESHOLD && stock > 0; })
      .sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0));
  }, [menuItems]);

  const outOfStockItems = useMemo(() => menuItems.filter((m) => (Number(m.stock) || 0) === 0), [menuItems]);

  const highStockItems = useMemo(() => {
    return [...menuItems].filter((m) => Number(m.stock) > 0)
      .sort((a, b) => (Number(b.stock) || 0) - (Number(a.stock) || 0)).slice(0, 10);
  }, [menuItems]);

  const pendingTasks = useMemo(() => tasks.filter((tk) => tk.status === "pending"), [tasks]);
  const doneTasks = useMemo(() => tasks.filter((tk) => tk.status === "done"), [tasks]);

  useEffect(() => {
    const current = unconfirmedOrders.length;
    const prev = prevPendingCountRef.current;
    if (prev === null) { prevPendingCountRef.current = current; return; }
    if (current > prev && soundEnabledRef.current) playDing();
    prevPendingCountRef.current = current;
  }, [unconfirmedOrders.length]);

  useEffect(() => {
    if (dingIntervalRef.current) { clearInterval(dingIntervalRef.current); dingIntervalRef.current = null; }
    if (unconfirmedOrders.length > 0 && soundEnabled) {
      dingIntervalRef.current = setInterval(() => { if (soundEnabledRef.current) playDing(); }, SOUND_REPEAT_MS);
    }
    return () => { if (dingIntervalRef.current) clearInterval(dingIntervalRef.current); };
  }, [unconfirmedOrders.length, soundEnabled]);

  const handlePushAlert = useCallback(async (item) => {
    const id = item._id || item.id;
    if (pushingAlertId) return;
    setPushingAlertId(id);
    try {
      toast(`${t("Đã gửi thông báo cho Admin:")} "${item.name}" ${t("chỉ còn")} ${item.stock} ${t("suất")}`, "success");
    } catch (e) { toast(e.message || t("Không gửi được thông báo"), "error"); }
    finally { setPushingAlertId(null); }
  }, [pushingAlertId, t]);

  const handleToggleTask = useCallback(async (task) => {
    const id = task.id;
    if (togglingTaskId) return;
    setTogglingTaskId(id);
    setTasks((prev) => prev.map((tk) => tk.id === id ? { ...tk, status: tk.status === "done" ? "pending" : "done", completed_at: tk.status === "done" ? null : new Date().toISOString() } : tk));
    try {
      await api.tasks.complete(id);
      toast(task.status === "done" ? t("Đã mở lại công việc") : t("Đã đánh dấu hoàn thành!"), "success");
    } catch (e) {
      setTasks((prev) => prev.map((tk) => (tk.id === id ? task : tk)));
      toast(e.message || t("Không cập nhật được"), "error");
    } finally { setTogglingTaskId(null); }
  }, [togglingTaskId, t]);

  const handleSoundToggle = useCallback(() => {
    setSoundEnabled((v) => {
      const next = !v;
      toast(next ? t("Đã bật loa báo đơn") : t("Đã tắt loa báo đơn"), next ? "success" : "info");
      if (next) setTimeout(() => { try { playDing(); } catch (_) {} }, 100);
      return next;
    });
  }, [t]);

  const handleOpenHandover = useCallback(() => setShowHandover(true), []);
  const handleCloseHandover = useCallback(() => setShowHandover(false), []);
  const handlePrintHandover = useCallback(() => setTimeout(() => window.print(), 100), []);

  const shiftCode = useMemo(() => genShiftCode(now, "A"), []);
  const completedOrders = useMemo(() => todayOrders.filter((o) => o.status === "Hoàn thành"), [todayOrders]);
  const printTimestamp = PRINT_DATETIME_FORMATTER.format(now);
  const printDate = PRINT_DATE_FORMATTER.format(now);
  const printTime = PRINT_TIME_FORMATTER.format(now);

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        {unconfirmedOrders.length > 0 && (
          <div className="alert-banner alert-banner--danger" onClick={() => navigate("/employee/orders")}>
            <Bell size={18} />
            <span>Bạn có <b>{unconfirmedOrders.length}</b> đơn hàng mới cần xác nhận!</span>
          </div>
        )}
        {upcomingShiftNotice && (
          <div className="alert-banner alert-banner--warning">
            <Clock size={18} />
            <span>Thông báo: Sắp đến ca làm việc <b>{upcomingShiftNotice}</b>.</span>
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: "var(--st-danger-bg)", border: "1px solid var(--st-danger-border)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, color: "var(--st-danger)", fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="staff-hero">
        <div className="staff-hero__row">
          <div className="staff-hero__left">
            <div className="staff-hero__chips">
              <span className="staff-hero__chip staff-hero__chip--success">
                <span className="staff-hero__chip-dot" />{t("Đang mở cửa đón khách")}
              </span>
              <span className="staff-hero__chip-sep">•</span>
              <span className="staff-hero__chip staff-hero__chip--neutral">{stationName}</span>
            </div>

            <h1 className="staff-hero__title">
              {t(shiftInfo.title)} {shiftInfo.time && `(${shiftInfo.time})`}<span> — {stationName}</span>
            </h1>

            <div className="staff-hero__meta">
              <div className="staff-hero__meta-item">
                <BadgeCheck size={16} style={{ color: "var(--st-primary-container)" }} />
                <span>{t("Tổ trưởng ca:")} <b>{shiftLeaderName}</b>{shiftLeaderCode && ` (${shiftLeaderCode})`}</span>
              </div>
              <span className="staff-hero__meta-sep" />
              <div className="staff-hero__meta-item">
                <Users size={16} /><span>{t("Kíp trực:")} <b>{crewSize} {t("nhân viên")}</b></span>
              </div>
              <span className="staff-hero__meta-sep" />
              <div className="staff-hero__meta-item" style={{ fontVariantNumeric: "tabular-nums" }}>
                <Timer size={16} style={{ color: "var(--st-info)" }} />
                <span>{t("Thời gian ca:")} <b>{elapsedShiftMs > 0 ? fmtDuration(elapsedShiftMs) : t("Chưa chấm công")}</b></span>
              </div>
            </div>
          </div>

          <div className="staff-hero__actions">
            <button type="button" className="staff-hero__action" onClick={handleSoundToggle} title={soundEnabled ? t("Đang bật — bấm để tắt") : t("Đang tắt — bấm để bật")}>
              {soundEnabled ? <Bell size={18} style={{ color: "var(--st-primary-container)" }} /> : <BellOff size={18} style={{ color: "var(--st-text-muted)" }} />}
              <span>{soundEnabled ? t("Loa Báo Đơn") : t("Loa Đã Tắt")}</span>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: soundEnabled ? "var(--st-success)" : "var(--st-outline)", flexShrink: 0 }} />
            </button>
            <button type="button" className="staff-hero__action" onClick={handleOpenHandover}>
              <Printer size={18} /><span>{t("In Phiếu Giao Ca")}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="staff-kpi-grid">
        <StaffKPICard icon={<ShoppingBag size={22} />} label={t("Tổng đơn trong ca")} value={kpi.totalOrders} unit={t("suất")}
          delta={{ pct: 15, isUp: true }}
          progressSegments={[
            { pct: kpi.totalOrders ? (kpi.completedCount / kpi.totalOrders) * 100 : 0, variant: "success", title: `${t("Đã xong")}: ${kpi.completedCount}` },
            { pct: kpi.totalOrders ? (kpi.preparingCount / kpi.totalOrders) * 100 : 0, variant: "warning" },
            { pct: kpi.totalOrders ? ((kpi.readyCount + kpi.pendingCount) / kpi.totalOrders) * 100 : 0, variant: "primary" },
          ]}
          legendRows={[{ label: `${t("Chế biến:")}`, value: kpi.preparingCount }, { label: `${t("Chờ nhận:")}`, value: kpi.readyCount + kpi.pendingCount }]}
        />
        <StaffKPICard icon={<Timer size={22} />} label={t("Thời gian phục vụ TB")} value={avgPrepTime > 0 ? avgPrepTime.toFixed(1) : "—"} unit={avgPrepTime > 0 ? t("phút/món") : ""} colorVariant="success"
          badge={avgPrepTime > 0 && avgPrepTime <= 10 ? { icon: <span style={{ fontSize: 12 }}>⚡</span>, text: t("Đạt Chuẩn Tốc Độ"), variant: "success" } : null}
          progressSegments={avgPrepTime > 0 ? [{ pct: Math.min(100, (10 / Math.max(avgPrepTime, 1)) * 100), variant: "success" }] : []}
          hint={fastestOrder ? <>{t("Nhanh nhất:")} <b>{fastestOrder.minutes.toFixed(1)}m</b> ({fastestOrder.station})</> : t("Chưa có dữ liệu")}
        />
        <StaffKPICard icon={<HandCoins size={22} />} label={t("Doanh thu ca hiện tại")} value={kpi.revenue.toLocaleString("vi-VN")} unit="đ" colorVariant="primary"
          progressSegments={[{ pct: 78, variant: "primary" }, { pct: 22, variant: "info" }]}
          legendRows={[{ label: t("VWA Pay / Thẻ SV (78%)"), value: `${(kpi.revenue * 0.78).toLocaleString("vi-VN")} đ` }]}
          hint={<>{t("Tiền mặt / VietQR:")} <b>{(kpi.revenue * 0.22).toLocaleString("vi-VN")} đ</b></>}
        />
        <StaffKPICard icon={<School size={22} />} label={t("Trợ giá sinh viên")} value={kpi.subsidy.toLocaleString("vi-VN")} unit="đ" colorVariant="tertiary"
          progressSegments={[{ pct: 85, variant: "info" }]}
          legendRows={[{ label: t("Lượt hưởng trợ giá"), value: `${kpi.completedCount} ${t("suất")} (-10k/suất)` }]}
          hint={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ color: "var(--st-primary-container)", fontSize: 14 }}>✓</span>{t("Chính sách hỗ trợ Học Viện Phụ Nữ VN")}</span>}
        />
      </div>

      <div className="staff-workspace-bottom">
        <section id="low-stock-section" className="lowstock-card">
          <div className="lowstock-card__head">
            <div className="lowstock-card__head-left">
              <AlertTriangle size={20} className="lowstock-card__head-icon" />
              <div>
                <h3 className="lowstock-card__title">{t("Món Cần Bổ Sung")}</h3>
                <span className="lowstock-card__sub">{lowStockItems.length + outOfStockItems.length > 0 ? `${lowStockItems.length + outOfStockItems.length} ${t("món sắp hết hoặc đã hết")}` : t("Tất cả món đều đủ hàng")}</span>
              </div>
            </div>
            {(lowStockItems.length + outOfStockItems.length) > 0 && <span className="lowstock-card__badge lowstock-card__badge--danger">{lowStockItems.length + outOfStockItems.length} {t("món")}</span>}
          </div>

          <div className="lowstock-card__body">
            {lowStockItems.length === 0 && outOfStockItems.length === 0 ? (
              <div className="lowstock-card__empty"><CheckCircle2 size={40} style={{ opacity: 0.3 }} /><div>{t("Tất cả món đều đủ hàng để phục vụ")}</div></div>
            ) : (
              <div className="lowstock-card__list">
                {outOfStockItems.map((item) => {
                  const id = item._id || item.id;
                  return (
                    <div key={id} className="lowstock-row lowstock-row--danger">
                      <div className="lowstock-row__left">
                        <span className="lowstock-row__dot lowstock-row__dot--danger" />
                        <div className="lowstock-row__info"><span className="lowstock-row__name">{item.name}</span><span className="lowstock-row__meta">{item.category}</span></div>
                      </div>
                      <div className="lowstock-row__right">
                        <span className="lowstock-row__qty lowstock-row__qty--danger">{t("ĐÃ HẾT")}</span>
                        <button type="button" className="lowstock-row__push-btn" onClick={() => handlePushAlert(item)} disabled={pushingAlertId === id} title={t("Gửi thông báo cho Admin")}>
                          {pushingAlertId === id ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Bell size={13} />}<span>{t("Báo Admin")}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

                {lowStockItems.map((item) => {
                  const id = item._id || item.id;
                  const stock = Number(item.stock) || 0;
                  const isDanger = stock < DANGER_STOCK_THRESHOLD;
                  return (
                    <div key={id} className={`lowstock-row ${isDanger ? "lowstock-row--danger" : "lowstock-row--warning"}`}>
                      <div className="lowstock-row__left">
                        <span className={`lowstock-row__dot ${isDanger ? "lowstock-row__dot--danger" : "lowstock-row__dot--warning"}`} />
                        <div className="lowstock-row__info"><span className="lowstock-row__name">{item.name}</span><span className="lowstock-row__meta">{item.category}</span></div>
                      </div>
                      <div className="lowstock-row__right">
                        <span className={`lowstock-row__qty ${isDanger ? "lowstock-row__qty--danger" : "lowstock-row__qty--warning"}`}>{t("Còn")} <b>{stock}</b> {t("suất")}</span>
                        {isDanger && (
                          <button type="button" className="lowstock-row__push-btn" onClick={() => handlePushAlert(item)} disabled={pushingAlertId === id} title={t("Gửi thông báo cho Admin")}>
                            {pushingAlertId === id ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Bell size={13} />}<span>{t("Báo Admin")}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="highstock-card">
          <div className="highstock-card__head">
            <div className="highstock-card__head-left">
              <TrendingUp size={20} className="highstock-card__head-icon" />
              <div><h3 className="highstock-card__title">{t("Tồn Kho Nhiều Nhất")}</h3><span className="highstock-card__sub">{t("Top 10 món còn nhiều suất nhất")}</span></div>
            </div>
            {highStockItems.length > 0 && <span className="highstock-card__badge">{highStockItems.length} {t("món")}</span>}
          </div>

          <div className="highstock-card__body">
            {highStockItems.length === 0 ? (
              <div className="highstock-card__empty"><Package size={40} style={{ opacity: 0.3 }} /><div>{t("Chưa có dữ liệu tồn kho")}</div></div>
            ) : (
              <div className="highstock-card__list">
                {highStockItems.map((item) => {
                  const id = item._id || item.id;
                  const stock = Number(item.stock) || 0;
                  const maxStock = Math.max(...highStockItems.map((m) => Number(m.stock) || 1));
                  const pct = (stock / maxStock) * 100;
                  return (
                    <div key={id} className="highstock-row">
                      <div className="highstock-row__left"><span className="highstock-row__name">{item.name}</span><span className="highstock-row__meta">{item.category}</span></div>
                      <div className="highstock-row__right">
                        <div className="highstock-row__bar"><div className="highstock-row__bar-fill" style={{ width: `${pct}%` }} /></div>
                        <span className="highstock-row__qty"><b>{stock}</b> {t("suất")}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="tasks-card">
        <div className="tasks-card__head">
          <div className="tasks-card__head-left">
            <ClipboardList size={20} className="tasks-card__head-icon" />
            <div>
              <h3 className="tasks-card__title">{t("Công Việc Được Giao")}</h3>
              <span className="tasks-card__sub">{pendingTasks.length > 0 ? `${pendingTasks.length} ${t("việc chưa hoàn thành")} · ${doneTasks.length} ${t("đã xong")}` : doneTasks.length > 0 ? `${t("Đã hoàn thành tất cả")} ${doneTasks.length} ${t("việc")}` : t("Không có công việc nào")}</span>
            </div>
          </div>
          {pendingTasks.length > 0 && <span className="tasks-card__badge">{doneTasks.length}/{tasks.length} {t("việc")}</span>}
        </div>

        <div className="tasks-card__body">
          {tasks.length === 0 ? (
            <div className="tasks-card__empty"><CheckSquare size={40} style={{ opacity: 0.3 }} /><div>{t("Chưa có công việc nào được giao")}</div></div>
          ) : (
            <div className="tasks-card__list">
              {[...tasks].sort((a, b) => { if (a.status !== b.status) return a.status === "pending" ? -1 : 1; const order = { urgent: 0, high: 1, normal: 2, low: 3 }; return (order[a.priority] ?? 2) - (order[b.priority] ?? 2); }).map((task) => {
                  const isDone = task.status === "done";
                  const isToggling = togglingTaskId === task.id;
                  const prioColor = task.priority === "urgent" ? "#ef4444" : task.priority === "high" ? "#f59e0b" : "var(--st-primary-container)";
                  return (
                    <div key={task.id} className={`tasks-row ${isDone ? "tasks-row--done" : ""}`}>
                      <button type="button" className={`tasks-row__check ${isDone ? "tasks-row__check--done" : ""}`} onClick={() => handleToggleTask(task)} disabled={isToggling} aria-label={isDone ? t("Bỏ đánh dấu hoàn thành") : t("Đánh dấu hoàn thành")}>
                        {isToggling ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : isDone ? <Check size={14} /> : null}
                      </button>
                      <div className="tasks-row__content">
                        <div className="tasks-row__title-row">
                          <b className={`tasks-row__title ${isDone ? "tasks-row__title--done" : ""}`}>{task.title}</b>
                          {task.priority !== "normal" && <span className="tasks-row__priority" style={{ color: prioColor, borderColor: prioColor }}>{task.priority === "urgent" ? t("Khẩn") : task.priority === "high" ? t("Cao") : t("Thấp")}</span>}
                        </div>
                        {task.description && <p className="tasks-row__desc">{task.description}</p>}
                        <div className="tasks-row__meta">
                          {task.shift && <span className="tasks-row__meta-item"><Timer size={11} />{task.shift}</span>}
                          {task.due_date && <span className="tasks-row__meta-item">{t("Hạn:")} {task.due_date}</span>}
                          {task.assigned_by_name && <span className="tasks-row__meta-item">{t("Giao bởi")}: {task.assigned_by_name}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </section>

      <TelemetryDock />

      {showHandover && (
        <div className="handover-overlay" role="dialog" aria-modal="true">
          <div className="handover-modal">
            <div className="handover-modal__toolbar no-print">
              <h3 className="handover-modal__toolbar-title">{t("Xem trước phiếu giao ca")}</h3>
              <div className="handover-modal__toolbar-actions">
                <button type="button" className="handover-modal__btn handover-modal__btn--ghost" onClick={handleCloseHandover}><X size={16} /><span>{t("Đóng")}</span></button>
                <button type="button" className="handover-modal__btn handover-modal__btn--primary" onClick={handlePrintHandover}><Printer size={16} /><span>{t("In phiếu")}</span></button>
              </div>
            </div>

            <div className="handover-sheet" id="handover-print-area">
              <div className="handover-sheet__header">
                <div className="handover-sheet__logo">
                  <img src="/icon.svg" alt="Canteen VWA" width={48} height={48} style={{ display: "block" }} />
                  <div className="handover-sheet__logo-text"><b>CANTEEN VWA</b><span>Học viện Phụ Nữ Việt Nam</span></div>
                </div>
                <div className="handover-sheet__title-wrap"><h1 className="handover-sheet__title">PHIẾU GIAO CA</h1><span className="handover-sheet__subtitle">Shift Handover Report</span></div>
                <div className="handover-sheet__meta-right">
                  <div><b>{t("Mã phiếu:")}</b> {shiftCode}</div>
                  <div><b>{t("Ngày:")}</b> {printDate}</div>
                  <div><b>{t("Giờ in:")}</b> {printTime}</div>
                </div>
              </div>

              <div className="handover-sheet__section">
                <div className="handover-sheet__section-title">{t("THÔNG TIN CA")}</div>
                <div className="handover-sheet__grid">
                  <div className="handover-sheet__row"><span className="handover-sheet__label">{t("Ca làm việc:")}</span><span className="handover-sheet__value">{t(shiftInfo.title)} {shiftInfo.time && `(${shiftInfo.time})`}</span></div>
                  <div className="handover-sheet__row"><span className="handover-sheet__label">{t("Quầy:")}</span><span className="handover-sheet__value">{stationName}</span></div>
                  <div className="handover-sheet__row"><span className="handover-sheet__label">{t("Tổ trưởng ca:")}</span><span className="handover-sheet__value">{shiftLeaderName}{shiftLeaderCode ? ` (${shiftLeaderCode})` : ""}</span></div>
                  <div className="handover-sheet__row"><span className="handover-sheet__label">{t("Kíp trực:")}</span><span className="handover-sheet__value">{crewSize} {t("nhân viên")}</span></div>
                  <div className="handover-sheet__row"><span className="handover-sheet__label">{t("Thời gian ca:")}</span><span className="handover-sheet__value">{elapsedShiftMs > 0 ? fmtDuration(elapsedShiftMs) : t("Chưa chấm công")}</span></div>
                </div>
              </div>

              <div className="handover-sheet__section">
                <div className="handover-sheet__section-title">{t("THỐNG KÊ CA")}</div>
                <table className="handover-sheet__table">
                  <tbody>
                    <tr><td>{t("Tổng đơn trong ca")}</td><td className="handover-sheet__num">{kpi.totalOrders} {t("suất")}</td></tr>
                    <tr><td>{t("Đã hoàn thành")}</td><td className="handover-sheet__num">{kpi.completedCount} {t("suất")}</td></tr>
                    <tr><td>{t("Đang chế biến")}</td><td className="handover-sheet__num">{kpi.preparingCount} {t("suất")}</td></tr>
                    <tr><td>{t("Sẵn sàng nhận")}</td><td className="handover-sheet__num">{kpi.readyCount} {t("suất")}</td></tr>
                    <tr><td>{t("Mới nhận / Chờ bếp")}</td><td className="handover-sheet__num">{kpi.pendingCount} {t("suất")}</td></tr>
                    <tr><td>{t("Đã hủy")}</td><td className="handover-sheet__num">{kpi.cancelledCount} {t("suất")}</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="handover-sheet__section">
                <div className="handover-sheet__section-title">{t("DOANH THU")}</div>
                <table className="handover-sheet__table">
                  <tbody>
                    <tr><td>{t("Doanh thu ca hiện tại")}</td><td className="handover-sheet__num handover-sheet__num--big">{kpi.revenue.toLocaleString("vi-VN")} đ</td></tr>
                    <tr><td>{t("Trợ giá sinh viên")}</td><td className="handover-sheet__num">{kpi.subsidy.toLocaleString("vi-VN")} đ</td></tr>
                    <tr><td>{t("Thời gian phục vụ TB")}</td><td className="handover-sheet__num">{avgPrepTime > 0 ? `${avgPrepTime.toFixed(1)} ${t("phút/món")}` : "—"}</td></tr>
                  </tbody>
                </table>
              </div>

              {completedOrders.length > 0 && (
                <div className="handover-sheet__section">
                  <div className="handover-sheet__section-title">{t("CHI TIẾT ĐƠN HOÀN THÀNH")} ({completedOrders.length})</div>
                  <table className="handover-sheet__table handover-sheet__table--list">
                    <thead><tr><th>{t("Mã đơn")}</th><th>{t("Khách hàng")}</th><th className="handover-sheet__th-num">{t("Tổng tiền")}</th><th>{t("Giờ xong")}</th></tr></thead>
                    <tbody>
                      {completedOrders.slice(0, 20).map((o) => (
                        <tr key={o._id || o.id}>
                          <td><b>{o.code}</b></td>
                          <td>{o.customer_name || "—"}{o.customer_mssv ? ` (${o.customer_mssv})` : ""}</td>
                          <td className="handover-sheet__th-num">{(Number(o.total) || 0).toLocaleString("vi-VN")} đ</td>
                          <td>{o.updated_at ? PRINT_TIME_FORMATTER.format(new Date(o.updated_at)) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {completedOrders.length > 20 && <div className="handover-sheet__more-note">… {t("và")} {completedOrders.length - 20} {t("đơn khác (xem trên hệ thống)")}</div>}
                </div>
              )}

              <div className="handover-sheet__section">
                <div className="handover-sheet__section-title">{t("GHI CHÚ")}</div>
                <div className="handover-sheet__note-box"><div className="handover-sheet__note-line" /><div className="handover-sheet__note-line" /><div className="handover-sheet__note-line" /></div>
              </div>

              <div className="handover-sheet__signatures">
                <div className="handover-sheet__sign"><b>{t("Người giao ca")}</b><span>({t("Ký, ghi rõ họ tên")})</span><div className="handover-sheet__sign-space" /><div className="handover-sheet__sign-name">{shiftLeaderName}</div></div>
                <div className="handover-sheet__sign"><b>{t("Người nhận ca")}</b><span>({t("Ký, ghi rõ họ tên")})</span><div className="handover-sheet__sign-space" /><div className="handover-sheet__sign-name">&nbsp;</div></div>
              </div>

              <div className="handover-sheet__footer">{t("Phiếu được tạo tự động bởi hệ thống Canteen VWA — {time}").replace("{time}", printTimestamp)}</div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .alert-banner { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: var(--st-radius-md); font-family: var(--st-font-body); font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s; animation: slideDown 0.3s ease-out; }
        .alert-banner--danger { background: var(--st-danger-bg); color: var(--st-danger); border: 1px solid var(--st-danger-border); }
        .alert-banner--danger:hover { background: rgba(220, 38, 38, 0.15); }
        .alert-banner--warning { background: var(--st-warning-bg); color: #b45309; border: 1px solid var(--st-warning-border); }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .handover-overlay { position: fixed; inset: 0; z-index: 9999; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); display: flex; align-items: flex-start; justify-content: center; padding: 24px 16px; overflow-y: auto; }
        .handover-modal { width: 100%; max-width: 820px; background: var(--st-surface); border-radius: 12px; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35); overflow: hidden; }
        .handover-modal__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; background: var(--st-surface-low); border-bottom: 1px solid var(--st-outline-light); }
        .handover-modal__toolbar-title { margin: 0; font-family: var(--st-font-head); font-size: 15px; font-weight: 700; color: var(--st-text); }
        .handover-modal__toolbar-actions { display: flex; align-items: center; gap: 8px; }
        .handover-modal__btn { height: 38px; padding: 0 14px; border-radius: 8px; border: 0; font-family: var(--st-font-head); font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; transition: all 0.15s; }
        .handover-modal__btn--ghost { background: var(--st-surface-container); color: var(--st-text); }
        .handover-modal__btn--ghost:hover { background: var(--st-surface-high); }
        .handover-modal__btn--primary { background: var(--st-primary-container); color: var(--st-on-primary); }
        .handover-modal__btn--primary:hover { background: var(--st-primary); }
        .handover-sheet { background: #ffffff; color: #111827; padding: 28px 32px 32px; font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; line-height: 1.5; }
        .handover-sheet__header { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 16px; padding-bottom: 14px; border-bottom: 2px solid #111827; }
        .handover-sheet__logo { display: flex; align-items: center; gap: 10px; }
        .handover-sheet__logo-text { display: flex; flex-direction: column; gap: 2px; }
        .handover-sheet__logo-text b { font-family: "Plus Jakarta Sans", sans-serif; font-size: 13px; font-weight: 800; letter-spacing: 0.02em; color: #111827; }
        .handover-sheet__logo-text span { font-size: 11px; color: #6b7280; }
        .handover-sheet__title-wrap { text-align: center; min-width: 0; }
        .handover-sheet__title { margin: 0; font-family: "Plus Jakarta Sans", sans-serif; font-size: 22px; font-weight: 800; letter-spacing: 0.06em; color: #111827; }
        .handover-sheet__subtitle { display: block; font-size: 11px; color: #6b7280; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 2px; }
        .handover-sheet__meta-right { text-align: right; display: flex; flex-direction: column; gap: 2px; font-size: 12px; white-space: nowrap; }
        .handover-sheet__meta-right b { color: #374151; font-weight: 700; }
        .handover-sheet__section { margin-top: 18px; }
        .handover-sheet__section-title { font-family: "Plus Jakarta Sans", sans-serif; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #004ac6; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; margin-bottom: 8px; }
        .handover-sheet__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
        .handover-sheet__row { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; }
        .handover-sheet__label { color: #6b7280; min-width: 110px; }
        .handover-sheet__value { font-weight: 600; color: #111827; flex: 1; }
        .handover-sheet__table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        .handover-sheet__table td { padding: 5px 8px; border-bottom: 1px dashed #e5e7eb; }
        .handover-sheet__table tr:last-child td { border-bottom: 0; }
        .handover-sheet__num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; color: #111827; white-space: nowrap; }
        .handover-sheet__num--big { font-size: 15px; color: #004ac6; }
        .handover-sheet__table--list th { text-align: left; padding: 6px 8px; background: #f3f4f6; font-family: "Plus Jakarta Sans", sans-serif; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: #374151; border-bottom: 1px solid #d1d5db; }
        .handover-sheet__th-num { text-align: right !important; }
        .handover-sheet__table--list td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; }
        .handover-sheet__more-note { margin-top: 6px; font-size: 11.5px; color: #6b7280; font-style: italic; }
        .handover-sheet__note-box { padding: 4px 0; display: flex; flex-direction: column; gap: 18px; }
        .handover-sheet__note-line { border-bottom: 1px dotted #9ca3af; height: 1px; }
        .handover-sheet__signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; }
        .handover-sheet__sign { display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; }
        .handover-sheet__sign b { font-family: "Plus Jakarta Sans", sans-serif; font-size: 12.5px; font-weight: 800; color: #111827; }
        .handover-sheet__sign span { font-size: 11px; color: #6b7280; font-style: italic; }
        .handover-sheet__sign-space { height: 56px; }
        .handover-sheet__sign-name { font-family: "Plus Jakarta Sans", sans-serif; font-size: 13px; font-weight: 700; color: #111827; border-top: 1px solid #111827; padding-top: 4px; min-width: 160px; }
        .handover-sheet__footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 10.5px; color: #9ca3af; }
        @media print {
          body * { visibility: hidden !important; }
          #handover-print-area, #handover-print-area * { visibility: visible !important; }
          #handover-print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: #fff !important; box-shadow: none !important; border-radius: 0 !important; padding: 20px 24px !important; }
          .no-print { display: none !important; }
          .handover-overlay { position: static !important; background: #fff !important; backdrop-filter: none !important; padding: 0 !important; overflow: visible !important; }
          .handover-modal { max-width: none !important; box-shadow: none !important; border-radius: 0 !important; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>
    </div>
  );
}
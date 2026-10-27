// ============================================================
// EMPLOYEEORDERS.JSX — KDS Kanban (V20 - STRICTLY POLLING)
// ============================================================
// V20:
//   - 🔥 XÓA HOÀN TOÀN SSE. Chỉ dùng Polling (10s) để tránh
//     mọi lỗi 501 trên Vercel Serverless.
// ============================================================

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Search, AlertCircle, RefreshCw, Check, XCircle, ChefHat,
  CheckCircle2, Wallet, Timer, TrendingUp, User, Lock,
  ChevronDown, PackageCheck, Volume2, VolumeX, Store,
  UtensilsCrossed, ListFilter, Inbox, Play, Soup, ArrowRight,
  Clock, Flame, ChevronLeft, Wifi
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api, getToken } from "../../api";
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import ConfirmDialog from "../../components/ConfirmDialog";
import KDSTicket from "../../components/KDSTicket";
import { useI18n } from "../../hooks/useI18n";
import { useAuth } from "../../contexts/AuthContext";
import { emitOrderUpdated, onOrderUpdated } from "../../lib/orderEvents";
import {
  fmtTime, fmtTimeWithLabel, getDateLabelVariant, getCurrentShiftLabel,
} from "../../lib/datetime";

const COMPLETED_LIMIT = 8;
const ROW_LIMIT = 10;
const SOUND_REPEAT_MS = 4000;
const SOUND_STORAGE_KEY = "canteen.kds_sound_enabled";
const POLL_MS = 10000; // 🔧 Polling 10s

const NEXT_STATUS = {
  "Chờ xác nhận": "Đã xác nhận",
  "Đã xác nhận": "Đang chuẩn bị",
  "Đang chuẩn bị": "Sẵn sàng nhận",
  "Sẵn sàng nhận": "Hoàn thành",
};

const STATION_TABS = [
  { id: "all",      label: "Tất cả trạm",        icon: ListFilter },
  { id: "pending",  label: "Chờ xử lý",           icon: Inbox },
  { id: "kitchen",  label: "Bếp Nấu (Kitchen)",  icon: ChefHat },
  { id: "dispatch", label: "Quầy Trả Món",        icon: Store },
];

const STATION_IDS = STATION_TABS.map((s) => s.id);
function normalizeStation(value) { return STATION_IDS.includes(value) ? value : "all"; }

const CATEGORY_TO_STATION = {
  "Cơm": "kitchen", "Bún - Phở - Cháo": "kitchen", "Món mặn": "kitchen",
  "Món chay": "kitchen", "Đồ chay": "kitchen", "Bánh mì - Xôi": "kitchen",
  "Ăn vặt": "kitchen", "Đồ ăn nhanh": "kitchen", "Đồ uống": "kitchen",
  "Coffee & Tea": "kitchen", "Nước ép - Sinh tố": "kitchen",
  "Tráng miệng": "kitchen", "Combo 1 người": "kitchen", "Combo siêu hời": "kitchen",
};

function getOrderStation(order) {
  if (order?.station && STATION_IDS.includes(order.station)) return order.station;
  const items = order?.items || [];
  for (const it of items) {
    const cat = it.category || it.menu_category || "";
    const st = CATEGORY_TO_STATION[cat];
    if (st) return st;
  }
  return "all";
}

const PAYMENT_ALIASES = { 
  "Tiền mặt": "cash", cash: "cash", CASH: "cash", 
  QR: "qr", VietQR: "qr", 
  "Ví Canteen": "wallet", WALLET: "wallet", 
  "Thẻ": "card", "Thẻ SV": "card" 
};
function normalizePayment(p) { return PAYMENT_ALIASES[p] || "cash"; }

const TIMEFRAMES = { 
  all: null, 
  "1130": [11 * 60 + 30, 12 * 60], 
  "1200": [12 * 60, 12 * 60 + 30], 
  "1230": [12 * 60 + 30, 13 * 60] 
};

function getLocalDateStr(d = new Date()) {
  const y = d.getFullYear(); 
  const m = String(d.getMonth() + 1).padStart(2, "0"); 
  const dt = String(d.getDate()).padStart(2, "0"); 
  return `${y}-${m}-${dt}`;
}

function calcElapsedSec(iso) {
  if (!iso) return 0;
  const created = new Date(iso).getTime();
  if (isNaN(created)) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / 1000));
}

function getOrderPickupMinutes(order) {
  const src = `${order?.pickupTime || order?.pickup || ""} ${order?.note || ""}`;
  const m = src.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10); 
  const mi = parseInt(m[2], 10);
  if (isNaN(h) || isNaN(mi)) return null;
  return h * 60 + mi;
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

export default function EmployeeOrders({ isAdmin = false }) {
  const { t } = useI18n();
  const { user } = useAuth();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [approvedShifts, setApprovedShifts] = useState([]);

  const [searchParams, setSearchParams] = useSearchParams();
  const stationParam = searchParams.get("station");

  const [search, setSearch] = useState("");
  const [stationFilter, setStationFilter] = useState(() => normalizeStation(stationParam));
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [timeframeFilter, setTimeframeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [advancingId, setAdvancingId] = useState(null);
  const [greenBusyId, setGreenBusyId] = useState(null);
  const [confirmReject, setConfirmReject] = useState(null);
  const [showStationMenu, setShowStationMenu] = useState(false);

  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { const v = localStorage.getItem(SOUND_STORAGE_KEY); return v === null ? false : v === "1"; } catch { return false; }
  });

  const [expandedRows, setExpandedRows] = useState({ pending: false, confirmed: false, prep: false, ready: false });

  const reqIdRef = useRef(0);
  const inFlightRef = useRef(0);
  const prevPendingCountRef = useRef(null);
  const dingIntervalRef = useRef(null);
  const soundEnabledRef = useRef(soundEnabled);
  const stationMenuRef = useRef(null);

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { try { localStorage.setItem(SOUND_STORAGE_KEY, soundEnabled ? "1" : "0"); } catch (_) {} }, [soundEnabled]);

  useEffect(() => {
    const unlockAudio = () => {
      try { const AudioCtx = window.AudioContext || window.webkitAudioContext; if (AudioCtx) { const ctx = new AudioCtx(); if (ctx.state === "suspended") ctx.resume(); } } catch (e) {}
      document.removeEventListener("click", unlockAudio);
    };
    document.addEventListener("click", unlockAudio);
    return () => document.removeEventListener("click", unlockAudio);
  }, []);

  useEffect(() => {
    if (!showStationMenu) return;
    const handler = (e) => { if (stationMenuRef.current && !stationMenuRef.current.contains(e.target)) setShowStationMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showStationMenu]);

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    api.shifts.approvedToday().then((list) => { if (!cancelled) setApprovedShifts(Array.isArray(list) ? list : []); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const next = normalizeStation(stationParam);
    setStationFilter((cur) => (cur === next ? cur : next));
  }, [stationParam]);

  const changeStation = useCallback((id) => {
    setStationFilter(id);
    setShowStationMenu(false);
    const next = new URLSearchParams(searchParams);
    if (id === "all") next.delete("station"); else next.set("station", id);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const load = useCallback(async (silent = false) => {
    if (!getToken()) return;
    if (inFlightRef.current) return;
    inFlightRef.current = 1;

    const myReqId = ++reqIdRef.current;
    if (!silent) setRefreshing(true);
    setError("");

    try {
      const data = await api.orders.all("Tất cả");
      if (myReqId !== reqIdRef.current) return;
      const list = Array.isArray(data) ? data : [];
      const sorted = [...list].sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
      setOrders(sorted);
    } catch (e) {
      if (myReqId === reqIdRef.current && !silent) setError(e.message || t("Không tải được đơn hàng"));
    } finally {
      if (myReqId === reqIdRef.current) { setLoading(false); if (!silent) setRefreshing(false); }
      inFlightRef.current = 0;
    }
  }, [t]);

  // 🔧 CHỈ DÙNG POLLING, KHÔNG DÙNG SSE
  useEffect(() => {
    load(false); // Load lần đầu
    
    // Tự động load lại mỗi 10s
    const timer = setInterval(() => {
      load(true); 
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => { const off = onOrderUpdated(() => { load(true); }); return off; }, [load]);

  const rows = useMemo(() => {
    const byStatus = { pending: [], confirmed: [], prep: [], ready: [], completed: [] };
    for (const o of orders) {
      if (o.status === "Chờ xác nhận") byStatus.pending.push(o);
      else if (o.status === "Đã xác nhận") byStatus.confirmed.push(o);
      else if (o.status === "Đang chuẩn bị") byStatus.prep.push(o);
      else if (o.status === "Sẵn sàng nhận") byStatus.ready.push(o);
      else if (o.status === "Hoàn thành") byStatus.completed.push(o);
    }

    const sortOldestFirst = (arr) => arr.sort((a, b) => new Date(a.created_at || a.updated_at || 0).getTime() - new Date(b.created_at || b.updated_at || 0).getTime());
    sortOldestFirst(byStatus.pending); sortOldestFirst(byStatus.confirmed); sortOldestFirst(byStatus.prep); sortOldestFirst(byStatus.ready);

    byStatus.completed.sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
    const completedTotal = byStatus.completed.length;
    byStatus.completed = byStatus.completed.slice(0, COMPLETED_LIMIT);

    return { ...byStatus, completedTotal };
  }, [orders]);

  const applyFilter = useCallback((list) => {
    let result = list;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((o) => {
        const code = (o.code || "").toLowerCase(); const name = (o.customer_name || "").toLowerCase();
        const mssv = (o.customer_mssv || "").toLowerCase(); const email = (o.customer_email || "").toLowerCase();
        return code.includes(q) || name.includes(q) || mssv.includes(q) || email.includes(q);
      });
    }
    if (paymentFilter !== "all") result = result.filter((o) => normalizePayment(o.payment) === paymentFilter);
    if (statusFilter !== "all") result = result.filter((o) => o.status === statusFilter);
    if (timeframeFilter !== "all") {
      const range = TIMEFRAMES[timeframeFilter];
      if (range) result = result.filter((o) => { const mins = getOrderPickupMinutes(o); if (mins === null) return true; return mins >= range[0] && mins < range[1]; });
    }
    return result;
  }, [search, paymentFilter, statusFilter, timeframeFilter]);

  const filteredRows = useMemo(() => ({
    pending: applyFilter(rows.pending), confirmed: applyFilter(rows.confirmed), prep: applyFilter(rows.prep), ready: applyFilter(rows.ready), completed: applyFilter(rows.completed), completedTotal: rows.completedTotal,
  }), [rows, applyFilter]);

  const kpi = useMemo(() => {
    const today = getLocalDateStr(new Date());
    const todayOrders = orders.filter((o) => getLocalDateStr(new Date(o.created_at || 0)) === today);
    const completedToday = orders.filter((o) => { if (o.status !== "Hoàn thành") return false; const refDate = o.updated_at || o.received_at || o.created_at; return getLocalDateStr(new Date(refDate || 0)) === today; });
    const revenue = completedToday.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const onTimePct = todayOrders.length > 0 ? ((completedToday.length / todayOrders.length) * 100).toFixed(1) : "0";
    return { pending: rows.pending.length, prep: rows.prep.length, ready: rows.ready.length, completedToday: completedToday.length, revenue, onTimePct };
  }, [orders, rows]);

  useEffect(() => {
    const current = rows.pending.length;
    const prev = prevPendingCountRef.current;
    if (prev === null) { prevPendingCountRef.current = current; return; }
    if (current > prev && soundEnabledRef.current) playDing();
    prevPendingCountRef.current = current;
  }, [rows.pending.length]);

  useEffect(() => {
    if (dingIntervalRef.current) { clearInterval(dingIntervalRef.current); dingIntervalRef.current = null; }
    if (rows.pending.length > 0 && soundEnabled) { dingIntervalRef.current = setInterval(() => { if (soundEnabledRef.current) playDing(); }, SOUND_REPEAT_MS); }
    return () => { if (dingIntervalRef.current) { clearInterval(dingIntervalRef.current); dingIntervalRef.current = null; } };
  }, [rows.pending.length, soundEnabled]);

  const toggleSound = useCallback(() => { setSoundEnabled((v) => { const next = !v; toast(next ? t("Đã bật âm báo đơn") : t("Đã tắt âm báo đơn"), next ? "success" : "info"); if (next) setTimeout(() => playDing(), 100); return next; }); }, [t]);
  const toggleExpand = useCallback((key) => { setExpandedRows((s) => ({ ...s, [key]: !s[key] })); }, []);

  const takeVisible = useCallback((list, key) => {
    if (expandedRows[key]) return { visible: list, hiddenCount: 0, isExpanded: true };
    return { visible: list.slice(0, ROW_LIMIT), hiddenCount: Math.max(0, list.length - ROW_LIMIT), isExpanded: false };
  }, [expandedRows]);

  const shiftLabel = useMemo(() => getCurrentShiftLabel(new Date()), []);
  const staffName = user?.name || t("Nhân viên");
  const staffCode = user?.employeeCode || user?.code || "";

  const approveGreen = useCallback(async (order) => {
    const id = order._id || order.id;
    if (greenBusyId !== null) return;
    setGreenBusyId(id);
    try { const res = await api.orders.approveGreen(id); toast(`${t("Đã duyệt Sống Xanh")} + ${res.bonus} ${t("Xu")}`, "success"); emitOrderUpdated(); await load(true); }
    catch (e) { toast(e.message || t("Không duyệt được"), "error"); }
    finally { setGreenBusyId(null); }
  }, [load, t, greenBusyId]);

  const rejectGreen = useCallback(async (order) => {
    const id = order._id || order.id;
    if (greenBusyId !== null) return;
    setGreenBusyId(id);
    try { await api.orders.rejectGreen(id); toast(t("Đã từ chối Sống Xanh"), "warning"); emitOrderUpdated(); await load(true); }
    catch (e) { toast(e.message || t("Không từ chối được"), "error"); }
    finally { setGreenBusyId(null); }
  }, [load, t, greenBusyId]);

  const advance = useCallback(async (order) => {
    const id = order._id || order.id;
    if (advancingId !== null) return;
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    setAdvancingId(id);
    try { await api.orders.setStatus(id, next); toast(`"${order.code}" → "${next}"`, "success"); await load(true); emitOrderUpdated({ ...order, status: next }); }
    catch (e) { toast(e.message || t("Không chuyển được trạng thái"), "error"); }
    finally { setAdvancingId(null); }
  }, [advancingId, load, t]);

  const rejectOrder = useCallback((order) => { if (advancingId !== null) return; setConfirmReject(order); }, [advancingId]);

  const executeReject = useCallback(async () => {
    if (!confirmReject) return;
    const order = confirmReject; const id = order._id || order.id;
    setAdvancingId(id);
    try { await api.orders.setStatus(id, "Đã hủy"); toast(`${t("Đã hủy")} ${order.code} ${t("và hoàn tiền khách")}`, "warning"); setConfirmReject(null); emitOrderUpdated({ ...order, status: "Đã hủy" }); await load(true); }
    catch (e) { toast(e.message || t("Không hủy được"), "error"); }
    finally { setAdvancingId(null); }
  }, [confirmReject, load, t]);

  const showRow1 = stationFilter === "all" || stationFilter === "pending";
  const showRow2 = stationFilter === "all" || stationFilter === "pending";
  const showRow3 = stationFilter === "all" || stationFilter === "kitchen";
  const showRow4 = stationFilter === "all" || stationFilter === "dispatch";
  const showRow5 = stationFilter === "all" || stationFilter === "dispatch";
  const currentStationObj = STATION_TABS.find((s) => s.id === stationFilter) || STATION_TABS[0];

  return (
    <>
      <div className="kds-workbench">
        {error && <div className="kds-error"><AlertCircle size={18} /><span style={{ flex: 1 }}>{error}</span><button type="button" onClick={() => load(false)}>{t("Thử lại")}</button></div>}

        <div className="kds-console">
          <div className="kds-console__left">
            <div className="kds-console__card">
              <span className="kds-console__card-dot" style={{ background: "#10b981" }} />
              <div className="kds-console__card-info"><span className="kds-console__card-label">{t("Kết nối")}</span><span className="kds-console__card-value" style={{ fontSize: 13 }}>{t("LIVE (Polling)")}</span></div>
            </div>
            <div className="kds-console__card"><User size={22} className="kds-console__card-icon" /><div className="kds-console__card-info"><span className="kds-console__card-label">{t("Nhân sự trực")}</span><span className="kds-console__card-value">{staffName}{staffCode && <span className="kds-console__card-sub"> (ID: {staffCode})</span>}</span></div></div>
            <button type="button" className="kds-console__sound-btn" onClick={toggleSound} aria-pressed={soundEnabled}>
              {soundEnabled ? <Volume2 size={22} style={{ color: "var(--st-success)" }} /> : <VolumeX size={22} style={{ color: "var(--st-text-muted)" }} />}
              <div className="kds-console__sound-text"><span className="kds-console__sound-label">{t("Âm báo đơn")}</span><span className="kds-console__sound-status" style={{ color: soundEnabled ? "var(--st-success)" : "var(--st-text-muted)" }}>{soundEnabled ? (kpi.pending > 0 ? `${t("Đang báo")} (${kpi.pending})` : t("Đang bật")) : t("Đã tắt")}</span></div>
              <span className="kds-console__sound-dot" style={{ background: soundEnabled ? "var(--st-success)" : "var(--st-outline)", boxShadow: soundEnabled ? "0 0 0 3px rgba(24, 169, 103, 0.2)" : "none" }} />
            </button>
          </div>

          <div ref={stationMenuRef} className="kds-station-menu-wrap">
            <button type="button" className="kds-station-btn" onClick={() => setShowStationMenu((s) => !s)}><currentStationObj.icon size={16} /><span>{stationFilter === "all" ? t("Tải ca trạm") : t(currentStationObj.label)}</span><ChevronDown size={14} /></button>
            {showStationMenu && (
              <div className="kds-station-menu" role="menu">
                {STATION_TABS.map((s) => { const Icon = s.icon; const active = stationFilter === s.id; return (<button key={s.id} type="button" className={`kds-station-menu__item ${active ? "active" : ""}`} onClick={() => changeStation(s.id)}><Icon size={16} /><span>{t(s.label)}</span>{active && <Check size={14} />}</button>); })}
              </div>
            )}
          </div>

          <div className="kds-station-tabs">{STATION_TABS.map((s) => (<button key={s.id} type="button" className={`kds-station-tab ${stationFilter === s.id ? "active" : ""}`} onClick={() => changeStation(s.id)}>{t(s.label)}</button>))}</div>
        </div>

        <div className="kds-kpi-grid">
          <div className="kds-kpi kds-kpi--danger"><div className="kds-kpi__head"><span className="kds-kpi__label">{t("Đơn Mới Cần Duyệt")}</span>{kpi.pending > 0 && <span className="kds-kpi__pulse" />}</div><div className="kds-kpi__value-row"><span className="kds-kpi__value">{String(kpi.pending).padStart(2, "0")}</span>{kpi.pending > 0 && <span className="kds-kpi__badge">{t("GẤP")}</span>}</div><div className="kds-kpi__bar"><div className="kds-kpi__bar-fill kds-kpi__bar-fill--danger" style={{ width: `${Math.min(100, kpi.pending * 20)}%` }} /></div></div>
          <div className="kds-kpi"><div className="kds-kpi__head"><span className="kds-kpi__label">{t("Đang Chuẩn Bị (Prep)")}</span><ChefHat size={20} style={{ color: "var(--st-secondary)" }} /></div><div className="kds-kpi__value-row"><span className="kds-kpi__value">{String(kpi.prep).padStart(2, "0")}</span><span className="kds-kpi__unit">{t("Bếp đang xào")}</span></div><div className="kds-kpi__bar"><div className="kds-kpi__bar-fill kds-kpi__bar-fill--primary" style={{ width: `${Math.min(100, kpi.prep * 20)}%` }} /></div></div>
          <div className="kds-kpi"><div className="kds-kpi__head"><span className="kds-kpi__label">{t("Chờ Khách Lấy (Ready)")}</span><PackageCheck size={20} style={{ color: "var(--st-primary)" }} /></div><div className="kds-kpi__value-row"><span className="kds-kpi__value">{String(kpi.ready).padStart(2, "0")}</span><span className="kds-kpi__unit">{t("Tủ giữ nóng OK")}</span></div><div className="kds-kpi__bar"><div className="kds-kpi__bar-fill kds-kpi__bar-fill--tertiary" style={{ width: `${Math.min(100, kpi.ready * 20)}%` }} /></div></div>
          <div className="kds-kpi"><div className="kds-kpi__head"><span className="kds-kpi__label">{t("Hoàn Thành Trong Ca")}</span><CheckCircle2 size={20} style={{ color: "var(--st-text-muted)" }} /></div><div className="kds-kpi__value-row"><span className="kds-kpi__value">{kpi.completedToday}</span><span className="kds-kpi__unit">{kpi.onTimePct}% {t("đúng giờ")}</span></div><div className="kds-kpi__bar"><div className="kds-kpi__bar-fill kds-kpi__bar-fill--success" style={{ width: `${Math.min(100, kpi.onTimePct)}%` }} /></div></div>
          <div className="kds-kpi kds-kpi--primary"><div className="kds-kpi__head"><span className="kds-kpi__label">{t("Doanh Thu Tạm Tính")}</span><Wallet size={20} style={{ color: "var(--st-primary)" }} /></div><div className="kds-kpi__value-row"><span className="kds-kpi__value" style={{ fontSize: 22 }}>{money(kpi.revenue).replace("đ", "")}đ</span></div><div className="kds-kpi__note"><TrendingUp size={14} /><span>+14.2% {t("so với hôm qua")}</span></div></div>
        </div>

        <div className="kds-filter">
          <div className="kds-filter__left">
            <div className="kds-filter__search"><Search size={18} className="kds-filter__search-icon" /><input type="text" className="kds-filter__search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Tìm theo Mã Đơn (#ORD-), Tên SV hoặc MSSV...")} /></div>
            <div className="kds-filter__select-wrap"><select className="kds-filter__select" value={timeframeFilter} onChange={(e) => setTimeframeFilter(e.target.value)}><option value="all">{t("Mọi khung giờ nhận")}</option><option value="1130">{t("11:30 - 12:00 (Cao điểm)")}</option><option value="1200">{t("12:00 - 12:30")}</option><option value="1230">{t("12:30 - 13:00")}</option></select><ChevronDown size={16} /></div>
            <div className="kds-filter__select-wrap"><select className="kds-filter__select" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}><option value="all">{t("Mọi thanh toán")}</option><option value="qr">{t("VietQR (Đã TT)")}</option><option value="wallet">{t("Ví Nội Bộ VWA")}</option><option value="cash">{t("Tiền mặt tại quầy")}</option><option value="card">{t("Thẻ SV")}</option></select><ChevronDown size={16} /></div>
            <div className="kds-filter__select-wrap"><select className="kds-filter__select kds-filter__select--status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">{t("Trạng thái đơn hàng")}</option><option value="Chờ xác nhận">{t("Đơn mới")}</option><option value="Đã xác nhận">{t("Đã xác nhận")}</option><option value="Đang chuẩn bị">{t("Đang nấu")}</option><option value="Sẵn sàng nhận">{t("Sẵn sàng nhận")}</option><option value="Hoàn thành">{t("Gần nhất")}</option><option value="Đã hủy">{t("Đã hủy")}</option></select><ChevronDown size={16} /></div>
          </div>
          <div className="kds-filter__right"><button type="button" className="kds-filter__btn" onClick={() => load(false)} disabled={refreshing}><RefreshCw size={16} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} /><span>{t("Đồng bộ KDS")}</span></button></div>
        </div>

        <div className="kds-board kds-board--rows">
          {showRow1 && (() => {
            const { visible, hiddenCount, isExpanded } = takeVisible(filteredRows.pending, "pending");
            return (
              <KDSRow title={t("Đơn Mới")} subtitle={t("Chờ xác nhận")} variant="pending" empty={t("Không có đơn mới")} moreCount={hiddenCount} isExpanded={isExpanded} onMore={() => toggleExpand("pending")} t={t}>
                {visible.map((o, idx) => (<KDSTicket key={o._id || o.id} order={o} variant="pending" layout="tall" isPriority={idx === 0 && !isExpanded} isProcessing={advancingId === (o._id || o.id)} elapsed={calcElapsedSec(o.created_at)} onAdvance={() => advance(o)} onReject={() => rejectOrder(o)} onApproveGreen={approveGreen} onRejectGreen={rejectGreen} greenBusy={greenBusyId === (o._id || o.id)} t={t} />))}
              </KDSRow>
            );
          })()}
          {showRow2 && (() => {
            const { visible, hiddenCount, isExpanded } = takeVisible(filteredRows.confirmed, "confirmed");
            return (
              <KDSRow title={t("Đã Xác Nhận")} subtitle={t("Chờ Bếp")} variant="confirmed" empty={t("Không có đơn đã xác nhận")} moreCount={hiddenCount} isExpanded={isExpanded} onMore={() => toggleExpand("confirmed")} t={t}>
                {visible.map((o, idx) => (<KDSTicket key={o._id || o.id} order={o} variant="confirmed" layout="tall" isPriority={idx === 0 && !isExpanded} isProcessing={advancingId === (o._id || o.id)} elapsed={calcElapsedSec(o.created_at)} onAdvance={() => advance(o)} onApproveGreen={approveGreen} onRejectGreen={rejectGreen} greenBusy={greenBusyId === (o._id || o.id)} t={t} />))}
              </KDSRow>
            );
          })()}
          {showRow3 && (() => {
            const { visible, hiddenCount, isExpanded } = takeVisible(filteredRows.prep, "prep");
            return (
              <KDSRow title={t("Đang Nấu")} subtitle={t("Đang chế biến")} variant="prep" empty={t("Không có đơn đang nấu")} moreCount={hiddenCount} isExpanded={isExpanded} onMore={() => toggleExpand("prep")} t={t}>
                {visible.map((o, idx) => (<KDSTicket key={o._id || o.id} order={o} variant="prep" layout="tall" isPriority={idx === 0 && !isExpanded} isProcessing={advancingId === (o._id || o.id)} elapsed={calcElapsedSec(o.created_at)} onAdvance={() => advance(o)} onApproveGreen={approveGreen} onRejectGreen={rejectGreen} greenBusy={greenBusyId === (o._id || o.id)} t={t} />))}
              </KDSRow>
            );
          })()}
          {showRow4 && (() => {
            const { visible, hiddenCount, isExpanded } = takeVisible(filteredRows.ready, "ready");
            return (
              <KDSRow title={t("Sẵn Sàng Nhận")} subtitle={t("Tủ giữ nóng")} variant="ready" empty={t("Không có đơn sẵn sàng")} moreCount={hiddenCount} isExpanded={isExpanded} onMore={() => toggleExpand("ready")} t={t}>
                {visible.map((o, idx) => (<KDSTicket key={o._id || o.id} order={o} variant="ready" layout="tall" isPriority={idx === 0 && !isExpanded} isProcessing={advancingId === (o._id || o.id)} onAdvance={() => advance(o)} onApproveGreen={approveGreen} onRejectGreen={rejectGreen} greenBusy={greenBusyId === (o._id || o.id)} t={t} />))}
              </KDSRow>
            );
          })()}
          {showRow5 && (
            <KDSRow title={t("Gần Nhất")} subtitle={t("Hoàn thành")} variant="completed" empty={t("Chưa có đơn hoàn thành")} isStrip t={t}>
              {filteredRows.completed.map((o) => (<CompletedStripItem key={o._id || o.id} order={o} t={t} />))}
              {filteredRows.completedTotal > COMPLETED_LIMIT && <button type="button" className="kds-completed__more">{t("Xem tất cả")} {filteredRows.completedTotal} {t("đơn →")}</button>}
            </KDSRow>
          )}
        </div>
      </div>

      <ConfirmDialog open={!!confirmReject} title={confirmReject ? `${t("Từ chối đơn")} ${confirmReject.code}?` : ""} message={confirmReject ? `${t("Hệ thống sẽ hủy đơn và hoàn tiền cho khách. Lý do có thể là hết nguyên liệu hoặc quá tải.")}` : ""} confirmText={t("Từ chối & Hoàn tiền")} cancelText={t("Giữ đơn")} danger loading={!!advancingId} onConfirm={executeReject} onClose={() => !advancingId && setConfirmReject(null)} />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes kdsPulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        .kds-workbench { padding: 24px; background: var(--st-surface-lowest, #f8fafc); min-height: calc(100vh - 64px); display: flex; flex-direction: column; gap: 16px; }
        .kds-error { background: #fee2e2; color: #b91c1c; padding: 12px 16px; border-radius: 8px; display: flex; align-items: center; gap: 12px; font-size: 14px; font-weight: 600; border: 1px solid #fecaca; }
        .kds-error button { background: #b91c1c; color: #fff; border: 0; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; }
        .kds-console { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; background: var(--st-surface, #fff); padding: 12px 16px; border-radius: 12px; border: 1px solid var(--st-outline-light, #e2e8f0); }
        .kds-console__left { display: flex; align-items: center; gap: 12px; }
        .kds-console__card { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--st-surface-low, #f1f5f9); border-radius: 8px; border: 1px solid var(--st-outline-light, #e2e8f0); }
        .kds-console__card-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
        .kds-console__card-info { display: flex; flex-direction: column; gap: 2px; }
        .kds-console__card-label { font-size: 11px; color: var(--st-text-muted, #64748b); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; }
        .kds-console__card-value { font-size: 14px; font-weight: 700; color: var(--st-text, #0f172a); }
        .kds-console__card-icon { color: var(--st-primary, #2563eb); }
        .kds-console__sound-btn { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--st-surface-low, #f1f5f9); border-radius: 8px; border: 1px solid var(--st-outline-light, #e2e8f0); cursor: pointer; transition: 0.2s; }
        .kds-console__sound-btn:hover { background: var(--st-surface-high, #e2e8f0); }
        .kds-console__sound-text { display: flex; flex-direction: column; align-items: flex-start; }
        .kds-console__sound-label { font-size: 11px; color: var(--st-text-muted, #64748b); font-weight: 700; text-transform: uppercase; }
        .kds-console__sound-status { font-size: 13px; font-weight: 700; }
        .kds-console__sound-dot { width: 8px; height: 8px; border-radius: 50%; margin-left: 4px; }
        .kds-station-menu-wrap { position: relative; display: none; }
        .kds-station-btn { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid var(--st-outline, #cbd5e1); padding: 8px 12px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .kds-station-menu { position: absolute; top: calc(100% + 8px); right: 0; background: #fff; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; z-index: 100; min-width: 200px; display: flex; flex-direction: column; padding: 6px; }
        .kds-station-menu__item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 6px; border: 0; background: transparent; font-size: 14px; font-weight: 600; text-align: left; cursor: pointer; color: #334155; }
        .kds-station-menu__item:hover { background: #f1f5f9; }
        .kds-station-menu__item.active { background: #eff6ff; color: #2563eb; }
        .kds-station-tabs { display: flex; align-items: center; gap: 4px; background: var(--st-surface-low, #f1f5f9); padding: 4px; border-radius: 8px; }
        .kds-station-tab { padding: 6px 16px; border: 0; background: transparent; border-radius: 6px; font-size: 13px; font-weight: 600; color: var(--st-text-muted, #64748b); cursor: pointer; transition: 0.15s; }
        .kds-station-tab:hover { color: var(--st-text, #0f172a); }
        .kds-station-tab.active { background: #fff; color: var(--st-primary, #2563eb); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .kds-kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
        .kds-kpi { background: #fff; padding: 16px; border-radius: 12px; border: 1px solid var(--st-outline-light, #e2e8f0); display: flex; flex-direction: column; gap: 8px; }
        .kds-kpi--danger { border-color: #fecaca; background: #fef2f2; }
        .kds-kpi--primary { background: #eff6ff; border-color: #bfdbfe; }
        .kds-kpi__head { display: flex; align-items: center; justify-content: space-between; }
        .kds-kpi__label { font-size: 12px; font-weight: 700; color: var(--st-text-muted, #64748b); text-transform: uppercase; letter-spacing: 0.5px; }
        .kds-kpi__pulse { width: 8px; height: 8px; border-radius: 50%; background: #ef4444; animation: kdsPulse 1.5s infinite; }
        .kds-kpi__value-row { display: flex; align-items: baseline; gap: 8px; }
        .kds-kpi__value { font-size: 32px; font-weight: 800; color: var(--st-text, #0f172a); line-height: 1; }
        .kds-kpi--danger .kds-kpi__value { color: #dc2626; }
        .kds-kpi--primary .kds-kpi__value { color: #2563eb; }
        .kds-kpi__badge { background: #dc2626; color: #fff; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; }
        .kds-kpi__unit { font-size: 13px; font-weight: 600; color: var(--st-text-muted, #64748b); }
        .kds-kpi__bar { height: 4px; background: #e2e8f0; border-radius: 2px; overflow: hidden; margin-top: 4px; }
        .kds-kpi__bar-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
        .kds-kpi__bar-fill--danger { background: #dc2626; }
        .kds-kpi__bar-fill--primary { background: #2563eb; }
        .kds-kpi__bar-fill--tertiary { background: #8b5cf6; }
        .kds-kpi__bar-fill--success { background: #10b981; }
        .kds-kpi__note { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #10b981; font-weight: 600; }
        .kds-filter { display: flex; align-items: center; justify-content: space-between; background: #fff; padding: 12px 16px; border-radius: 12px; border: 1px solid var(--st-outline-light, #e2e8f0); gap: 16px; flex-wrap: wrap; }
        .kds-filter__left { display: flex; align-items: center; gap: 12px; flex: 1; flex-wrap: wrap; }
        .kds-filter__search { position: relative; flex: 1; min-width: 200px; max-width: 350px; }
        .kds-filter__search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; }
        .kds-filter__search-input { width: 100%; padding: 10px 12px 10px 38px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; }
        .kds-filter__search-input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .kds-filter__select-wrap { position: relative; display: flex; align-items: center; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
        .kds-filter__select { appearance: none; padding: 10px 32px 10px 12px; border: 0; background: transparent; font-size: 14px; font-weight: 500; color: #334155; outline: none; cursor: pointer; }
        .kds-filter__select-wrap svg { position: absolute; right: 10px; pointer-events: none; color: #64748b; }
        .kds-filter__select--status { font-weight: 700; color: #2563eb; }
        .kds-filter__btn { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; font-weight: 600; cursor: pointer; color: #334155; transition: 0.15s; }
        .kds-filter__btn:hover { background: #f8fafc; border-color: #94a3b8; }
        .kds-filter__btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .kds-board { display: flex; flex-direction: column; gap: 16px; }
        .kds-row { background: #fff; border-radius: 12px; border: 1px solid var(--st-outline-light, #e2e8f0); overflow: hidden; }
        .kds-row__head { padding: 12px 16px; border-bottom: 1px solid var(--st-outline-light, #e2e8f0); display: flex; align-items: center; justify-content: space-between; }
        .kds-row__title-wrap { display: flex; align-items: center; gap: 8px; }
        .kds-row__dot { width: 10px; height: 10px; border-radius: 50%; }
        .kds-row__dot--pending { background: #f59e0b; }
        .kds-row__dot--confirmed { background: #2563eb; }
        .kds-row__dot--prep { background: #8b5cf6; }
        .kds-row__dot--ready { background: #10b981; }
        .kds-row__dot--completed { background: #94a3b8; }
        .kds-row__title { font-size: 15px; font-weight: 800; color: #0f172a; text-transform: uppercase; }
        .kds-row__subtitle { font-size: 13px; color: #64748b; font-weight: 500; }
        .kds-row__body { padding: 16px; display: flex; gap: 16px; overflow-x: auto; align-items: flex-start; min-height: 120px; }
        .kds-row__body--strip { flex-direction: column; gap: 0; padding: 8px 0; }
        .kds-row__empty { width: 100%; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 14px; font-style: italic; min-height: 80px; }
        .kds-row__more { flex-shrink: 0; width: 120px; height: 160px; border: 2px dashed #cbd5e1; border-radius: 12px; background: #f8fafc; color: #64748b; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; font-weight: 600; font-size: 13px; transition: 0.15s; }
        .kds-row__more:hover { background: #f1f5f9; border-color: #94a3b8; color: #334155; }
        .kds-completed-strip-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid #f1f5f9; }
        .kds-completed-strip-item:last-child { border-bottom: 0; }
        .kds-completed-strip-item__left { display: flex; align-items: center; gap: 12px; }
        .kds-completed-strip-item__icon { color: #10b981; }
        .kds-completed-strip-item__code { font-weight: 700; font-size: 14px; color: #0f172a; }
        .kds-completed-strip-item__customer { font-size: 13px; color: #64748b; }
        .kds-completed-strip-item__right { display: flex; align-items: center; gap: 16px; }
        .kds-completed-strip-item__time { font-size: 13px; color: #94a3b8; }
        .kds-completed-strip-item__total { font-weight: 700; color: #10b981; }
        .kds-completed__more { width: 100%; padding: 10px; text-align: center; background: #f8fafc; border: 0; border-top: 1px solid #f1f5f9; font-size: 13px; font-weight: 600; color: #2563eb; cursor: pointer; }
        .kds-completed__more:hover { background: #eff6ff; }
        @media (max-width: 1200px) { .kds-kpi-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 768px) {
          .kds-kpi-grid { grid-template-columns: repeat(2, 1fr); }
          .kds-console { flex-direction: column; align-items: flex-start; }
          .kds-station-tabs { display: none; }
          .kds-station-menu-wrap { display: block; width: 100%; }
          .kds-station-btn { width: 100%; justify-content: space-between; }
          .kds-filter__left { flex-direction: column; width: 100%; }
          .kds-filter__search { max-width: none; width: 100%; }
          .kds-filter__select-wrap { width: 100%; }
          .kds-filter__select { width: 100%; }
        }
      `}</style>
    </>
  );
}

function KDSRow({ title, subtitle, variant, empty, moreCount = 0, onMore, isExpanded = false, isStrip = false, children, t }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <section className={`kds-row kds-row--${variant}`}>
      <div className="kds-row__head"><div className="kds-row__title-wrap"><span className={`kds-row__dot kds-row__dot--${variant}`} /><span className="kds-row__title">{title}</span>{subtitle && <span className="kds-row__subtitle">{subtitle}</span>}</div></div>
      <div className={`kds-row__body ${isStrip ? "kds-row__body--strip" : ""}`}>
        {hasChildren ? (
          <>
            {children}
            {isExpanded ? (<button type="button" className="kds-row__more" onClick={onMore} style={{ borderStyle: "solid", background: "var(--st-surface-container)" }}><ChevronLeft size={18} style={{ marginBottom: 4 }} /><span>{t("Ẩn bớt")}</span></button>)
             : moreCount > 0 ? (<button type="button" className="kds-row__more" onClick={onMore}><span>{t("Xem thêm")}</span><span style={{ fontSize: 11, color: "var(--st-text-muted)", marginTop: 4 }}>+{moreCount} {t("đơn")}</span><ArrowRight size={16} style={{ marginTop: 4 }} /></button>) : null}
          </>
        ) : (<div className="kds-row__empty">{empty}</div>)}
      </div>
    </section>
  );
}

function CompletedStripItem({ order, t }) {
  return (
    <div className="kds-completed-strip-item">
      <div className="kds-completed-strip-item__left"><div className="kds-completed-strip-item__icon"><CheckCircle2 size={16} /></div><span className="kds-completed-strip-item__code">{order.code}</span><span className="kds-completed-strip-item__customer">{order.customer_name || t("Khách")}</span></div>
      <div className="kds-completed-strip-item__right"><span className="kds-completed-strip-item__time">{fmtTimeWithLabel(order.updated_at || order.created_at)}</span><span className="kds-completed-strip-item__total">{money(Number(order.total) || 0)}</span></div>
    </div>
  );
}
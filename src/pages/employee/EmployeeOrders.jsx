// ============================================================
// EMPLOYEEORDERS.JSX — KDS Kanban (V17 - REAL-TIME SSE)
// ============================================================
// V17 (2026-10):
//   - ⚡ Tích hợp Server-Sent Events (SSE) thay thế Polling 5s.
//   - 🔄 Auto fallback về Polling nếu SSE đứt kết nối.
//   - 🟢 Hiển thị trạng thái kết nối (LIVE / POLLING).
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

// ============================================================
// CONSTANTS
// ============================================================
const COMPLETED_LIMIT = 8;
const ROW_LIMIT = 10;
const SOUND_REPEAT_MS = 4000;
const SOUND_STORAGE_KEY = "canteen.kds_sound_enabled";

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
function normalizeStation(value) {
  return STATION_IDS.includes(value) ? value : "all";
}

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
  "Thẻ": "card", "Thẻ SV": "card",
};

function normalizePayment(p) { return PAYMENT_ALIASES[p] || "cash"; }

const TIMEFRAMES = {
  all: null,
  "1130": [11 * 60 + 30, 12 * 60],
  "1200": [12 * 60, 12 * 60 + 30],
  "1230": [12 * 60 + 30, 13 * 60],
};

// ============================================================
// HELPERS
// ============================================================
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

// ============================================================
// WEB AUDIO
// ============================================================
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

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function EmployeeOrders({ isAdmin = false }) {
  const { t } = useI18n();
  const { user } = useAuth();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [sseConnected, setSseConnected] = useState(false); // Trạng thái SSE

  const [approvedShifts, setApprovedShifts] = useState([]);

  const [searchParams, setSearchParams] = useSearchParams();
  const stationParam = searchParams.get("station");

  const [search, setSearch] = useState("");
  const [stationFilter, setStationFilter] = useState(() => normalizeStation(stationParam));
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [timeframeFilter, setTimeframeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [advancingId, setAdvancingId] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const [greenBusyId, setGreenBusyId] = useState(null);
  const [confirmReject, setConfirmReject] = useState(null);
  const [showStationMenu, setShowStationMenu] = useState(false);

  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      const v = localStorage.getItem(SOUND_STORAGE_KEY);
      return v === null ? false : v === "1";
    } catch { return false; }
  });

  const [expandedRows, setExpandedRows] = useState({
    pending: false, confirmed: false, prep: false, ready: false,
  });

  const reqIdRef = useRef(0);
  const inFlightRef = useRef(0);
  const prevPendingCountRef = useRef(null);
  const dingIntervalRef = useRef(null);
  const soundEnabledRef = useRef(soundEnabled);
  const stationMenuRef = useRef(null);
  
  // Refs cho SSE
  const esRef = useRef(null);
  const pollTimerRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => {
    try { localStorage.setItem(SOUND_STORAGE_KEY, soundEnabled ? "1" : "0"); } catch (_) {}
  }, [soundEnabled]);

  useEffect(() => {
    const unlockAudio = () => {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) { const ctx = new AudioCtx(); if (ctx.state === "suspended") ctx.resume(); }
      } catch (e) {}
      document.removeEventListener("click", unlockAudio);
    };
    document.addEventListener("click", unlockAudio);
    return () => document.removeEventListener("click", unlockAudio);
  }, []);

  useEffect(() => {
    if (!showStationMenu) return;
    const handler = (e) => {
      if (stationMenuRef.current && !stationMenuRef.current.contains(e.target)) setShowStationMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showStationMenu]);

  useEffect(() => {
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
    if (id === "all") next.delete("station");
    else next.set("station", id);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const load = useCallback(async (silent = false) => {
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
      if (myReqId === reqIdRef.current) {
        setLoading(false);
        if (!silent) setRefreshing(false);
      }
      inFlightRef.current = 0;
    }
  }, [t]);

  // ============================================================
  // SSE & POLLING FALLBACK LOGIC
  // ============================================================
  useEffect(() => {
    let isSubscribed = true;

    const startPolling = () => {
      if (pollTimerRef.current) return;
      pollTimerRef.current = setInterval(async () => {
        try {
          await load(true); // Silent reload
        } catch {}
      }, 15000); // Polling 15s fallback
    };

    const stopPolling = () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    const connectSSE = () => {
      if (!isSubscribed) return;
      stopPolling();

      const token = getToken();
      const url = `/api/kds/stream${token ? `?token=${token}` : ""}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        if (!isSubscribed) return;
        setSseConnected(true);
        load(true); // Đồng bộ ngay khi kết nối
      };

      // Lắng nghe sự kiện có đơn mới hoặc đổi trạng thái
      es.addEventListener("order.new", () => { if (isSubscribed) load(true); });
      es.addEventListener("order.updated", () => { if (isSubscribed) load(true); });

      es.onerror = () => {
        if (!isSubscribed) return;
        setSseConnected(false);
        es.close();
        esRef.current = null;
        startPolling();
        reconnectTimerRef.current = setTimeout(connectSSE, 5000); // Thử lại sau 5s
      };
    };

    connectSSE();

    return () => {
      isSubscribed = false;
      if (esRef.current) esRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      stopPolling();
    };
  }, [load]);

  // Các event từ tab khác (local storage)
  useEffect(() => {
    const off = onOrderUpdated(() => { load(true); });
    return off;
  }, [load]);

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
    sortOldestFirst(byStatus.pending);
    sortOldestFirst(byStatus.confirmed);
    sortOldestFirst(byStatus.prep);
    sortOldestFirst(byStatus.ready);

    byStatus.completed.sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
    const completedTotal = byStatus.completed.length;// [FIX v13] Đã bỏ slice ở data gốc — slice được xử lý trong filteredRows.completed
    return { ...byStatus, completedTotal };
  }, [orders]);

  const applyFilter = useCallback((list) => {
    let result = list;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((o) => {
        const code = (o.code || "").toLowerCase();
        const name = (o.customer_name || "").toLowerCase();
        const mssv = (o.customer_mssv || "").toLowerCase();
        const email = (o.customer_email || "").toLowerCase();
        return code.includes(q) || name.includes(q) || mssv.includes(q) || email.includes(q);
      });
    }
    if (paymentFilter !== "all") result = result.filter((o) => normalizePayment(o.payment) === paymentFilter);
    if (statusFilter !== "all") result = result.filter((o) => o.status === statusFilter);
    if (timeframeFilter !== "all") {
      const range = TIMEFRAMES[timeframeFilter];
      if (range) {
        result = result.filter((o) => {
          const mins = getOrderPickupMinutes(o);
          if (mins === null) return true;
          return mins >= range[0] && mins < range[1];
        });
      }
    }
    return result;
  }, [search, paymentFilter, statusFilter, timeframeFilter]);

  const filteredRows = useMemo(() => ({
    pending: applyFilter(rows.pending),
    confirmed: applyFilter(rows.confirmed),
    prep: applyFilter(rows.prep),
    ready: applyFilter(rows.ready),
    completed: showAllCompleted ? applyFilter(rows.completed) : applyFilter(rows.completed).slice(0, COMPLETED_LIMIT),
    completedTotal: rows.completedTotal,
  }), [rows, applyFilter, showAllCompleted]);

  const kpi = useMemo(() => {
    const today = getLocalDateStr(new Date());
    const todayOrders = orders.filter((o) => getLocalDateStr(new Date(o.created_at || 0)) === today);
    const completedToday = orders.filter((o) => {
      if (o.status !== "Hoàn thành") return false;
      const refDate = o.updated_at || o.received_at || o.created_at;
      return getLocalDateStr(new Date(refDate || 0)) === today;
    });
    const revenue = completedToday.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const onTimePct = todayOrders.length > 0 ? ((completedToday.length / todayOrders.length) * 100).toFixed(1) : "0";
    return {
      pending: rows.pending.length,
      prep: rows.prep.length,
      ready: rows.ready.length,
      completedToday: completedToday.length,
      revenue,
      onTimePct,
    };
  }, [orders, rows]);

  // Âm báo
  useEffect(() => {
    const current = rows.pending.length;
    const prev = prevPendingCountRef.current;
    if (prev === null) { prevPendingCountRef.current = current; return; }
    if (current > prev && soundEnabledRef.current) playDing();
    prevPendingCountRef.current = current;
  }, [rows.pending.length]);

  useEffect(() => {
    if (dingIntervalRef.current) { clearInterval(dingIntervalRef.current); dingIntervalRef.current = null; }
    if (rows.pending.length > 0 && soundEnabled) {
      dingIntervalRef.current = setInterval(() => { if (soundEnabledRef.current) playDing(); }, SOUND_REPEAT_MS);
    }
    return () => { if (dingIntervalRef.current) { clearInterval(dingIntervalRef.current); dingIntervalRef.current = null; } };
  }, [rows.pending.length, soundEnabled]);

  const toggleSound = useCallback(() => {
    setSoundEnabled((v) => {
      const next = !v;
      toast(next ? t("Đã bật âm báo đơn") : t("Đã tắt âm báo đơn"), next ? "success" : "info");
      if (next) setTimeout(() => playDing(), 100);
      return next;
    });
  }, [t]);

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
    try {
      const res = await api.orders.approveGreen(id);
      toast(`${t("Đã duyệt Sống Xanh")} + ${res.bonus} ${t("Xu")}`, "success");
      emitOrderUpdated(); await load(true);
    } catch (e) { toast(e.message || t("Không duyệt được"), "error"); }
    finally { setGreenBusyId(null); }
  }, [load, t, greenBusyId]);

  const rejectGreen = useCallback(async (order) => {
    const id = order._id || order.id;
    if (greenBusyId !== null) return;
    setGreenBusyId(id);
    try {
      await api.orders.rejectGreen(id);
      toast(t("Đã từ chối Sống Xanh"), "warning");
      emitOrderUpdated(); await load(true);
    } catch (e) { toast(e.message || t("Không từ chối được"), "error"); }
    finally { setGreenBusyId(null); }
  }, [load, t, greenBusyId]);

  const advance = useCallback(async (order) => {
    const id = order._id || order.id;
    if (advancingId !== null) return;
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    setAdvancingId(id);
    try {
      await api.orders.setStatus(id, next);
      toast(`"${order.code}" → "${next}"`, "success");
      await load(true);
      emitOrderUpdated({ ...order, status: next });
    } catch (e) { toast(e.message || t("Không chuyển được trạng thái"), "error"); }
    finally { setAdvancingId(null); }
  }, [advancingId, load, t]);

  const rejectOrder = useCallback((order) => {
    if (advancingId !== null) return;
    setConfirmReject(order);
  }, [advancingId]);

  const executeReject = useCallback(async () => {
    if (!confirmReject) return;
    const order = confirmReject;
    const id = order._id || order.id;
    setAdvancingId(id);
    try {
      await api.orders.setStatus(id, "Đã hủy");
      toast(`${t("Đã hủy")} ${order.code} ${t("và hoàn tiền khách")}`, "warning");
      setConfirmReject(null);
      emitOrderUpdated({ ...order, status: "Đã hủy" });
      await load(true);
    } catch (e) { toast(e.message || t("Không hủy được"), "error"); }
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
        {error && (
          <div className="kds-error">
            <AlertCircle size={18} />
            <span style={{ flex: 1 }}>{error}</span>
            <button type="button" onClick={() => load(false)}>{t("Thử lại")}</button>
          </div>
        )}

        {/* ============ TOP CONSOLE ============ */}
        <div className="kds-console">
          <div className="kds-console__left">
            <div className="kds-console__card">
              <span className="kds-console__card-dot" style={{ background: sseConnected ? "#10b981" : "#f59e0b" }} />
              <div className="kds-console__card-info">
                <span className="kds-console__card-label">{t("Kết nối")}</span>
                <span className="kds-console__card-value" style={{ fontSize: 13 }}>
                  {sseConnected ? t("LIVE (SSE)") : t("Fallback Polling")}
                </span>
              </div>
            </div>

            <div className="kds-console__card">
              <User size={22} className="kds-console__card-icon" />
              <div className="kds-console__card-info">
                <span className="kds-console__card-label">{t("Nhân sự trực")}</span>
                <span className="kds-console__card-value">
                  {staffName}
                  {staffCode && <span className="kds-console__card-sub"> (ID: {staffCode})</span>}
                </span>
              </div>
            </div>

            <button type="button" className="kds-console__sound-btn" onClick={toggleSound} aria-pressed={soundEnabled}>
              {soundEnabled ? <Volume2 size={22} style={{ color: "var(--st-success)" }} /> : <VolumeX size={22} style={{ color: "var(--st-text-muted)" }} />}
              <div className="kds-console__sound-text">
                <span className="kds-console__sound-label">{t("Âm báo đơn")}</span>
                <span className="kds-console__sound-status" style={{ color: soundEnabled ? "var(--st-success)" : "var(--st-text-muted)" }}>
                  {soundEnabled ? (kpi.pending > 0 ? `${t("Đang báo")} (${kpi.pending})` : t("Đang bật")) : t("Đã tắt")}
                </span>
              </div>
              <span className="kds-console__sound-dot" style={{ background: soundEnabled ? "var(--st-success)" : "var(--st-outline)", boxShadow: soundEnabled ? "0 0 0 3px rgba(24, 169, 103, 0.2)" : "none" }} />
            </button>
          </div>

          <div ref={stationMenuRef} className="kds-station-menu-wrap">
            <button type="button" className="kds-station-btn" onClick={() => setShowStationMenu((s) => !s)}>
              <currentStationObj.icon size={16} />
              <span>{stationFilter === "all" ? t("Tải ca trạm") : t(currentStationObj.label)}</span>
              <ChevronDown size={14} />
            </button>
            {showStationMenu && (
              <div className="kds-station-menu" role="menu">
                {STATION_TABS.map((s) => {
                  const Icon = s.icon;
                  const active = stationFilter === s.id;
                  return (
                    <button key={s.id} type="button" className={`kds-station-menu__item ${active ? "active" : ""}`} onClick={() => changeStation(s.id)}>
                      <Icon size={16} /><span>{t(s.label)}</span>{active && <Check size={14} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="kds-station-tabs">
            {STATION_TABS.map((s) => (
              <button key={s.id} type="button" className={`kds-station-tab ${stationFilter === s.id ? "active" : ""}`} onClick={() => changeStation(s.id)}>{t(s.label)}</button>
            ))}
          </div>
        </div>

        {/* ============ KPI ROW ============ */}
        <div className="kds-kpi-grid">
          <div className="kds-kpi kds-kpi--danger">
            <div className="kds-kpi__head">
              <span className="kds-kpi__label">{t("Đơn Mới Cần Duyệt")}</span>
              {kpi.pending > 0 && <span className="kds-kpi__pulse" />}
            </div>
            <div className="kds-kpi__value-row">
              <span className="kds-kpi__value">{String(kpi.pending).padStart(2, "0")}</span>
              {kpi.pending > 0 && <span className="kds-kpi__badge">{t("GẤP")}</span>}
            </div>
            <div className="kds-kpi__bar">
              <div className="kds-kpi__bar-fill kds-kpi__bar-fill--danger" style={{ width: `${Math.min(100, kpi.pending * 20)}%` }} />
            </div>
          </div>
          <div className="kds-kpi">
            <div className="kds-kpi__head">
              <span className="kds-kpi__label">{t("Đang Chuẩn Bị (Prep)")}</span>
              <ChefHat size={20} style={{ color: "var(--st-secondary)" }} />
            </div>
            <div className="kds-kpi__value-row">
              <span className="kds-kpi__value">{String(kpi.prep).padStart(2, "0")}</span>
              <span className="kds-kpi__unit">{t("Bếp đang xào")}</span>
            </div>
            <div className="kds-kpi__bar">
              <div className="kds-kpi__bar-fill kds-kpi__bar-fill--primary" style={{ width: `${Math.min(100, kpi.prep * 20)}%` }} />
            </div>
          </div>
          <div className="kds-kpi">
            <div className="kds-kpi__head">
              <span className="kds-kpi__label">{t("Chờ Khách Lấy (Ready)")}</span>
              <PackageCheck size={20} style={{ color: "var(--st-primary)" }} />
            </div>
            <div className="kds-kpi__value-row">
              <span className="kds-kpi__value">{String(kpi.ready).padStart(2, "0")}</span>
              <span className="kds-kpi__unit">{t("Tủ giữ nóng OK")}</span>
            </div>
            <div className="kds-kpi__bar">
              <div className="kds-kpi__bar-fill kds-kpi__bar-fill--tertiary" style={{ width: `${Math.min(100, kpi.ready * 20)}%` }} />
            </div>
          </div>
          <div className="kds-kpi">
            <div className="kds-kpi__head">
              <span className="kds-kpi__label">{t("Hoàn Thành Trong Ca")}</span>
              <CheckCircle2 size={20} style={{ color: "var(--st-text-muted)" }} />
            </div>
            <div className="kds-kpi__value-row">
              <span className="kds-kpi__value">{kpi.completedToday}</span>
              <span className="kds-kpi__unit">{kpi.onTimePct}% {t("đúng giờ")}</span>
            </div>
            <div className="kds-kpi__bar">
              <div className="kds-kpi__bar-fill kds-kpi__bar-fill--success" style={{ width: `${Math.min(100, kpi.onTimePct)}%` }} />
            </div>
          </div>
          <div className="kds-kpi kds-kpi--primary">
            <div className="kds-kpi__head">
              <span className="kds-kpi__label">{t("Doanh Thu Tạm Tính")}</span>
              <Wallet size={20} style={{ color: "var(--st-primary)" }} />
            </div>
            <div className="kds-kpi__value-row">
              <span className="kds-kpi__value" style={{ fontSize: 22 }}>{money(kpi.revenue).replace("đ", "")}đ</span>
            </div>
            <div className="kds-kpi__note">
              <TrendingUp size={14} /><span>+14.2% {t("so với hôm qua")}</span>
            </div>
          </div>
        </div>

        {/* ============ FILTER BAR ============ */}
        <div className="kds-filter">
          <div className="kds-filter__left">
            <div className="kds-filter__search">
              <Search size={18} className="kds-filter__search-icon" />
              <input type="text" className="kds-filter__search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Tìm theo Mã Đơn (#ORD-), Tên SV hoặc MSSV...")} />
            </div>
            <div className="kds-filter__select-wrap">
              <select className="kds-filter__select" value={timeframeFilter} onChange={(e) => setTimeframeFilter(e.target.value)}>
                <option value="all">{t("Mọi khung giờ nhận")}</option>
                <option value="1130">{t("11:30 - 12:00 (Cao điểm)")}</option>
                <option value="1200">{t("12:00 - 12:30")}</option>
                <option value="1230">{t("12:30 - 13:00")}</option>
              </select>
              <ChevronDown size={16} />
            </div>
            <div className="kds-filter__select-wrap">
              <select className="kds-filter__select" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
                <option value="all">{t("Mọi thanh toán")}</option>
                <option value="qr">{t("VietQR (Đã TT)")}</option>
                <option value="wallet">{t("Ví Nội Bộ VWA")}</option>
                <option value="cash">{t("Tiền mặt tại quầy")}</option>
                <option value="card">{t("Thẻ SV")}</option>
              </select>
              <ChevronDown size={16} />
            </div>
            <div className="kds-filter__select-wrap">
              <select className="kds-filter__select kds-filter__select--status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">{t("Trạng thái đơn hàng")}</option>
                <option value="Chờ xác nhận">{t("Đơn mới")}</option>
                <option value="Đã xác nhận">{t("Đã xác nhận")}</option>
                <option value="Đang chuẩn bị">{t("Đang nấu")}</option>
                <option value="Sẵn sàng nhận">{t("Sẵn sàng nhận")}</option>
                <option value="Hoàn thành">{t("Gần nhất")}</option>
                <option value="Đã hủy">{t("Đã hủy")}</option>
              </select>
              <ChevronDown size={16} />
            </div>
          </div>
          <div className="kds-filter__right">
            <button type="button" className="kds-filter__btn" onClick={() => load(false)} disabled={refreshing}>
              <RefreshCw size={16} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
              <span>{t("Đồng bộ KDS")}</span>
            </button>
          </div>
        </div>

        {/* ============ KDS BOARD ============ */}
        <div className="kds-board kds-board--rows">
          {showRow1 && (() => {
            const { visible, hiddenCount, isExpanded } = takeVisible(filteredRows.pending, "pending");
            return (
              <KDSRow title={t("Đơn Mới")} subtitle={t("Chờ xác nhận")} variant="pending" empty={t("Không có đơn mới")} moreCount={hiddenCount} isExpanded={isExpanded} onMore={() => toggleExpand("pending")} t={t}>
                {visible.map((o, idx) => (
                  <KDSTicket key={o._id || o.id} order={o} variant="pending" layout="tall" isPriority={idx === 0 && !isExpanded} isProcessing={advancingId === (o._id || o.id)} elapsed={calcElapsedSec(o.created_at)} onAdvance={() => advance(o)} onReject={() => rejectOrder(o)} onApproveGreen={approveGreen} onRejectGreen={rejectGreen} greenBusy={greenBusyId === (o._id || o.id)} t={t} />
                ))}
              </KDSRow>
            );
          })()}
          {showRow2 && (() => {
            const { visible, hiddenCount, isExpanded } = takeVisible(filteredRows.confirmed, "confirmed");
            return (
              <KDSRow title={t("Đã Xác Nhận")} subtitle={t("Chờ Bếp")} variant="confirmed" empty={t("Không có đơn đã xác nhận")} moreCount={hiddenCount} isExpanded={isExpanded} onMore={() => toggleExpand("confirmed")} t={t}>
                {visible.map((o, idx) => (
                  <KDSTicket key={o._id || o.id} order={o} variant="confirmed" layout="tall" isPriority={idx === 0 && !isExpanded} isProcessing={advancingId === (o._id || o.id)} elapsed={calcElapsedSec(o.created_at)} onAdvance={() => advance(o)} onApproveGreen={approveGreen} onRejectGreen={rejectGreen} greenBusy={greenBusyId === (o._id || o.id)} t={t} />
                ))}
              </KDSRow>
            );
          })()}
          {showRow3 && (() => {
            const { visible, hiddenCount, isExpanded } = takeVisible(filteredRows.prep, "prep");
            return (
              <KDSRow title={t("Đang Nấu")} subtitle={t("Đang chế biến")} variant="prep" empty={t("Không có đơn đang nấu")} moreCount={hiddenCount} isExpanded={isExpanded} onMore={() => toggleExpand("prep")} t={t}>
                {visible.map((o, idx) => (
                  <KDSTicket key={o._id || o.id} order={o} variant="prep" layout="tall" isPriority={idx === 0 && !isExpanded} isProcessing={advancingId === (o._id || o.id)} elapsed={calcElapsedSec(o.created_at)} onAdvance={() => advance(o)} onApproveGreen={approveGreen} onRejectGreen={rejectGreen} greenBusy={greenBusyId === (o._id || o.id)} t={t} />
                ))}
              </KDSRow>
            );
          })()}
          {showRow4 && (() => {
            const { visible, hiddenCount, isExpanded } = takeVisible(filteredRows.ready, "ready");
            return (
              <KDSRow title={t("Sẵn Sàng Nhận")} subtitle={t("Tủ giữ nóng")} variant="ready" empty={t("Không có đơn sẵn sàng")} moreCount={hiddenCount} isExpanded={isExpanded} onMore={() => toggleExpand("ready")} t={t}>
                {visible.map((o, idx) => (
                  <KDSTicket key={o._id || o.id} order={o} variant="ready" layout="tall" isPriority={idx === 0 && !isExpanded} isProcessing={advancingId === (o._id || o.id)} onAdvance={() => advance(o)} onApproveGreen={approveGreen} onRejectGreen={rejectGreen} greenBusy={greenBusyId === (o._id || o.id)} t={t} />
                ))}
              </KDSRow>
            );
          })()}
          {showRow5 && (
          <div className="kds-row kds-row--completed" style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: 16 }}>
            {/* Header */}
            <div className="kds-row__head" style={{ padding: "12px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 10 }}>
              <div className="kds-row__title-wrap" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 0 3px #d1fae5" }} />
                <span style={{ fontWeight: 700, fontSize: 14, color: "#172033" }}>{t("Gần Nhất")}</span>
                <span style={{ fontSize: 12, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: 10 }}>{t("Hoàn thành")}</span>
              </div>
            </div>

            {/* Danh sách đơn hàng */}
            <div className="kds-row__body kds-row__body--strip" style={{ maxHeight: showAllCompleted ? "none" : 400, overflowY: "auto", padding: "0" }}>
              {filteredRows.completed.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "#64748b", fontSize: 13 }}>{t("Chưa có đơn hoàn thành")}</div>
              ) : (
                filteredRows.completed.map((o) => {
                  const d = new Date(o.created_at || Date.now());
                  const timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                  const dateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
                  const itemsStr = o.items?.map(i => `${i.qty}x ${i.name} (${i.size?.name || 'L'})`).join(", ") || "Không có món";
                  
                  return (
                    <div key={o._id || o.id} onClick={() => setSelectedOrder(o)} style={{ display: "flex", alignItems: "center", padding: "16px", background: "#fff", borderBottom: "1px solid #e2e8f0", gap: "12px", width: "100%", boxSizing: "border-box", cursor: "pointer", transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}>
                      
                      {/* 1. Mã đơn hàng */}
                      <div style={{ flex: "0 0 160px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#eff6ff", color: "#3b82f6", display: "grid", placeItems: "center", flexShrink: 0 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Mã đơn hàng</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#2634d5", marginBottom: 4 }}>{o.code}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            {timeStr} • {dateStr}
                          </div>
                        </div>
                      </div>

                      {/* 2. Khách hàng */}
                      <div style={{ flex: "1", display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#f8fafc", color: "#64748b", display: "grid", placeItems: "center", flexShrink: 0 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Khách hàng</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#172033", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.customer_name}</div>
                        </div>
                      </div>

                      {/* 3. Món ăn */}
                      <div style={{ flex: "2", display: "flex", alignItems: "flex-start", gap: "10px", minWidth: 0 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#f8fafc", color: "#64748b", display: "grid", placeItems: "center", flexShrink: 0 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path></svg>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Món ăn</div>
                          <div style={{ fontSize: 12, color: "#172033", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.items?.length || 0} món: {itemsStr}</div>
                        </div>
                      </div>

                      {/* 4. Thanh toán */}
                      <div style={{ flex: "1", display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#f8fafc", color: "#64748b", display: "grid", placeItems: "center", flexShrink: 0 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Phương thức thanh toán</div>
                          <div style={{ display: "inline-block", background: "#f0fdf4", color: "#10b981", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{o.payment}</div>
                        </div>
                      </div>

                      {/* 5. Điểm thưởng */}
                      <div style={{ flex: "1", display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#f8fafc", color: "#64748b", display: "grid", placeItems: "center", flexShrink: 0 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Điểm thưởng</div>
                          <div style={{ display: "inline-block", background: "#f0fdf4", color: "#10b981", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                            +{o.green_points > 0 ? 300 : 100} Xu
                          </div>
                        </div>
                      </div>

                      {/* 6. Tổng tiền & Trạng thái */}
                      <div style={{ flex: "1.2", display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#eff6ff", color: "#3b82f6", display: "grid", placeItems: "center", flexShrink: 0 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>Tổng tiền</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: "#10b981", marginBottom: 4 }}>{Number(o.total).toLocaleString("vi-VN")}đ</div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#f0fdf4", color: "#10b981", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg> Hoàn thành
                          </div>
                        </div>
                      </div>

                      {/* 7. Mũi tên xem chi tiết */}
                      <div style={{ flex: "0 0 auto", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                      </div>

                    </div>
                  );
                })
              )}
            </div>

            {/* Footer: Nút Xem tất cả / Thu gọn */}
            <div style={{ padding: "12px", textAlign: "center", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
              <button 
                type="button" 
                onClick={() => setShowAllCompleted(!showAllCompleted)} 
                style={{ width: "100%", padding: "10px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontWeight: 700, color: "#2634d5", cursor: "pointer", transition: "all 0.2s" }} 
                onMouseEnter={(e) => e.currentTarget.style.background = "#f1f5f9"} 
                onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}
              >
                {showAllCompleted ? "Thu gọn" : `Xem tất cả ${filteredRows.completedTotal ?? filteredRows.completed.length} đơn →`}
              </button>
            </div>
          </div>
        )}
        </div>
      </div>

      
      {/* POPUP CHI TIẾT ĐƠN HÀNG */}
      {selectedOrder && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#172033" }}>Chi tiết đơn hàng</div>
              <button onClick={() => setSelectedOrder(null)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#64748b" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Mã đơn hàng</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#2634d5" }}>{selectedOrder.code}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Thời gian</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#172033" }}>
                    {new Date(selectedOrder.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} • {new Date(selectedOrder.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </div>
                </div>
              </div>
              <div style={{ height: 1, background: "#e2e8f0" }}></div>
              <div>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Khách hàng</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#172033" }}>{selectedOrder.customer_name}</div>
              </div>
              <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8, fontWeight: 700 }}>Danh sách món ({selectedOrder.items?.length || 0})</div>
                {selectedOrder.items?.map((item, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13, color: "#172033" }}>
                    <span><b>{item.qty}x</b> {item.name} {item.size?.name ? `(${item.size.name})` : ''}</span>
                    <span style={{ fontWeight: 600 }}>{Number(item.price * item.qty).toLocaleString("vi-VN")}đ</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b" }}>
                  <span>Phương thức thanh toán</span>
                  <span style={{ fontWeight: 700, color: "#172033" }}>{selectedOrder.payment}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b" }}>
                  <span>Điểm thưởng</span>
                  <span style={{ fontWeight: 700, color: "#10b981" }}>+{selectedOrder.points_earned || 0} Xu</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#172033" }}>Tổng tiền</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: "#10b981" }}>{Number(selectedOrder.total).toLocaleString("vi-VN")}đ</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!confirmReject} title={confirmReject ? `${t("Từ chối đơn")} ${confirmReject.code}?` : ""} message={confirmReject ? `${t("Hệ thống sẽ hủy đơn và hoàn tiền cho khách. Lý do có thể là hết nguyên liệu hoặc quá tải.")}` : ""} confirmText={t("Từ chối & Hoàn tiền")} cancelText={t("Giữ đơn")} danger loading={!!advancingId} onConfirm={executeReject} onClose={() => !advancingId && setConfirmReject(null)} />
    </>
  );
}

// ============================================================
// SUB: KDSRow
// ============================================================
function KDSRow({ title, subtitle, variant, empty, moreCount = 0, onMore, isExpanded = false, isStrip = false, children, t }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <section className={`kds-row kds-row--${variant}`}>
      <div className="kds-row__head">
        <div className="kds-row__title-wrap">
          <span className={`kds-row__dot kds-row__dot--${variant}`} />
          <span className="kds-row__title">{title}</span>
          {subtitle && <span className="kds-row__subtitle">{subtitle}</span>}
        </div>
      </div>
      <div className={`kds-row__body ${isStrip ? "kds-row__body--strip" : ""}`}>
        {hasChildren ? (
          <>
            {children}
            {isExpanded ? (
              <button type="button" className="kds-row__more" onClick={onMore} style={{ borderStyle: "solid", background: "var(--st-surface-container)" }}>
                <ChevronLeft size={18} style={{ marginBottom: 4 }} /><span>{t("Ẩn bớt")}</span>
              </button>
            ) : moreCount > 0 ? (
              <button type="button" className="kds-row__more" onClick={onMore}>
                <span>{t("Xem thêm")}</span>
                <span style={{ fontSize: 11, color: "var(--st-text-muted)", marginTop: 4 }}>+{moreCount} {t("đơn")}</span>
                <ArrowRight size={16} style={{ marginTop: 4 }} />
              </button>
            ) : null}
          </>
        ) : (
          <div className="kds-row__empty">{empty}</div>
        )}
      </div>
    </section>
  );
}

// ============================================================
// SUB: CompletedStripItem
// ============================================================
function CompletedStripItem({ order, t }) {
  return (
    <div className="kds-completed-strip-item">
      <div className="kds-completed-strip-item__left">
        <div className="kds-completed-strip-item__icon"><CheckCircle2 size={16} /></div>
        <span className="kds-completed-strip-item__code">{order.code}</span>
        <span className="kds-completed-strip-item__customer">{order.customer_name || t("Khách")}</span>
      </div>
      <div className="kds-completed-strip-item__right">
        <span className="kds-completed-strip-item__time">{fmtTimeWithLabel(order.updated_at || order.created_at)}</span>
        <span className="kds-completed-strip-item__total">{money(Number(order.total) || 0)}</span>
      </div>
    </div>
  );
}
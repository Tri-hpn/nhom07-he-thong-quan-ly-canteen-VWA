// ============================================================
// EMPLOYEEORDERS.JSX — KDS Kanban + Station Filter (V11 - FINAL)
// ============================================================
// V11 (2026-10):
//   - ✅ BỎ PrepBlock — mọi tab đều dùng KDSRow (giống tab "Tất cả")
//   - ✅ Tab "Chờ xử lý" → 2 row riêng: "1. Đơn Mới" + "2. Đã Xác Nhận"
//   - ✅ Tab "Bếp Nấu"   → 1 row: "3. Đang Nấu"
//   - ✅ Tab "Quầy Trả Món" → 2 row: "4. Sẵn Sàng Nhận" + "5. Gần Nhất"
//   - ✅ Tab "Tất cả"    → đủ 5 row
//   - ✅ Xoá tab "Nước & Bánh"
//   - ✅ Âm báo đơn: ding lặp mỗi 4s khi còn pending, dừng khi hết
// ============================================================

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Search, Loader2, AlertCircle, RefreshCw, Check, XCircle, ChefHat,
  CheckCircle2, Wallet, Timer, TrendingUp, User, Lock,
  ChevronDown, PackageCheck, Volume2, VolumeX, Store,
  UtensilsCrossed, ListFilter, Inbox, Play, Soup, ArrowRight,
  Clock, Flame,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api";
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

const POLL_MS = 5000;
const COMPLETED_LIMIT = 8;
const ROW_LIMIT = 6;
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
  if (order?.station && STATION_IDS.includes(order.station)) {
    return order.station;
  }
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

function normalizePayment(p) {
  return PAYMENT_ALIASES[p] || "cash";
}

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
  // Parse từ note "Nhận hàng: 13:00 - 13:30" hoặc pickupTime
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

    setTimeout(() => {
      try { ctx.close(); } catch (_) {}
    }, 700);
  } catch (e) {}
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function EmployeeOrders() {
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
  const [stationFilter, setStationFilter] = useState(() =>
    normalizeStation(stationParam)
  );
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [timeframeFilter, setTimeframeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [advancingId, setAdvancingId] = useState(null);
  const [greenBusyId, setGreenBusyId] = useState(null);
  const [confirmReject, setConfirmReject] = useState(null);
  const [showStationMenu, setShowStationMenu] = useState(false);

  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      const v = localStorage.getItem(SOUND_STORAGE_KEY);
      return v === null ? false : v === "1";
    } catch {
      return false;
    }
  });

  const [expandedRows, setExpandedRows] = useState({
    pending: false,
    confirmed: false,
    prep: false,
    ready: false,
  });

  const reqIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const prevPendingCountRef = useRef(null);
  const dingIntervalRef = useRef(null);
  const soundEnabledRef = useRef(soundEnabled);
  const stationMenuRef = useRef(null);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, soundEnabled ? "1" : "0");
    } catch (_) {}
  }, [soundEnabled]);

  useEffect(() => {
    if (!showStationMenu) return;
    const handler = (e) => {
      if (stationMenuRef.current && !stationMenuRef.current.contains(e.target)) {
        setShowStationMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showStationMenu]);

  useEffect(() => {
    let cancelled = false;
    api.shifts
      .approvedToday()
      .then((list) => {
        if (!cancelled) setApprovedShifts(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setApprovedShifts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const next = normalizeStation(stationParam);
    setStationFilter((cur) => (cur === next ? cur : next));
  }, [stationParam]);

  const changeStation = useCallback(
    (id) => {
      setStationFilter(id);
      setShowStationMenu(false);
      const next = new URLSearchParams(searchParams);
      if (id === "all") next.delete("station");
      else next.set("station", id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const load = useCallback(
    async (silent = false) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      const myReqId = ++reqIdRef.current;
      if (!silent) setRefreshing(true);
      setError("");

      try {
        const data = await api.orders.all("Tất cả");
        if (myReqId !== reqIdRef.current) return;

        const list = Array.isArray(data) ? data : [];
        const sorted = [...list].sort((a, b) => {
          const ta = new Date(a.created_at || 0).getTime();
          const tb = new Date(b.created_at || 0).getTime();
          return ta - tb;
        });
        setOrders(sorted);
      } catch (e) {
        if (myReqId === reqIdRef.current && !silent) {
          setError(e.message || t("Không tải được đơn hàng"));
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
    const off = onOrderUpdated(() => {
      load(true);
    });
    return off;
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const rows = useMemo(() => {
    const byStatus = {
      pending: [],
      confirmed: [],
      prep: [],
      ready: [],
      completed: [],
    };

    for (const o of orders) {
      if (o.status === "Chờ xác nhận") byStatus.pending.push(o);
      else if (o.status === "Đã xác nhận") byStatus.confirmed.push(o);
      else if (o.status === "Đang chuẩn bị") byStatus.prep.push(o);
      else if (o.status === "Sẵn sàng nhận") byStatus.ready.push(o);
      else if (o.status === "Hoàn thành") byStatus.completed.push(o);
    }

    const sortOldestFirst = (arr) =>
      arr.sort((a, b) => {
        const ta = new Date(a.created_at || a.updated_at || 0).getTime();
        const tb = new Date(b.created_at || b.updated_at || 0).getTime();
        return ta - tb;
      });

    sortOldestFirst(byStatus.pending);
    sortOldestFirst(byStatus.confirmed);
    sortOldestFirst(byStatus.prep);
    sortOldestFirst(byStatus.ready);

    byStatus.completed.sort((a, b) => {
      const ta = new Date(a.updated_at || a.created_at || 0).getTime();
      const tb = new Date(b.updated_at || b.created_at || 0).getTime();
      return tb - ta;
    });
    const completedTotal = byStatus.completed.length;
    byStatus.completed = byStatus.completed.slice(0, COMPLETED_LIMIT);

    return { ...byStatus, completedTotal };
  }, [orders]);

  const applyFilter = useCallback(
    (list) => {
      let result = list;

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        result = result.filter((o) => {
          const code = (o.code || "").toLowerCase();
          const name = (o.customer_name || "").toLowerCase();
          const mssv = (o.customer_mssv || "").toLowerCase();
          const email = (o.customer_email || "").toLowerCase();
          return (
            code.includes(q) ||
            name.includes(q) ||
            mssv.includes(q) ||
            email.includes(q)
          );
        });
      }

      if (paymentFilter !== "all") {
        result = result.filter(
          (o) => normalizePayment(o.payment) === paymentFilter
        );
      }

      if (statusFilter !== "all") {
        result = result.filter((o) => o.status === statusFilter);
      }

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
    },
    [search, paymentFilter, statusFilter, timeframeFilter]
  );

  const filteredRows = useMemo(
    () => ({
      pending: applyFilter(rows.pending),
      confirmed: applyFilter(rows.confirmed),
      prep: applyFilter(rows.prep),
      ready: applyFilter(rows.ready),
      completed: applyFilter(rows.completed),
      completedTotal: rows.completedTotal,
    }),
    [rows, applyFilter]
  );

  const kpi = useMemo(() => {
    const today = getLocalDateStr(new Date());

    const todayOrders = orders.filter((o) => {
      const d = getLocalDateStr(new Date(o.created_at || 0));
      return d === today;
    });

    const completedToday = orders.filter((o) => {
      if (o.status !== "Hoàn thành") return false;
      const refDate = o.updated_at || o.received_at || o.created_at;
      const d = getLocalDateStr(new Date(refDate || 0));
      return d === today;
    });

    const revenue = completedToday.reduce(
      (s, o) => s + (Number(o.total) || 0),
      0
    );

    const onTimePct =
      todayOrders.length > 0
        ? ((completedToday.length / todayOrders.length) * 100).toFixed(1)
        : "0";

    return {
      pending: rows.pending.length,
      prep: rows.prep.length,
      ready: rows.ready.length,
      completedToday: completedToday.length,
      revenue,
      onTimePct,
    };
  }, [orders, rows]);

  // Âm báo đơn — ding lặp mỗi 4s cho đến khi hết pending
  useEffect(() => {
    const current = rows.pending.length;
    const prev = prevPendingCountRef.current;

    if (prev === null) {
      prevPendingCountRef.current = current;
      return;
    }

    if (current > prev && soundEnabledRef.current) {
      playDing();
    }

    prevPendingCountRef.current = current;
  }, [rows.pending.length]);

  useEffect(() => {
    if (dingIntervalRef.current) {
      clearInterval(dingIntervalRef.current);
      dingIntervalRef.current = null;
    }

    if (rows.pending.length > 0 && soundEnabled) {
      dingIntervalRef.current = setInterval(() => {
        if (soundEnabledRef.current) playDing();
      }, SOUND_REPEAT_MS);
    }

    return () => {
      if (dingIntervalRef.current) {
        clearInterval(dingIntervalRef.current);
        dingIntervalRef.current = null;
      }
    };
  }, [rows.pending.length, soundEnabled]);

  const toggleSound = useCallback(() => {
    setSoundEnabled((v) => {
      const next = !v;
      toast(
        next ? t("Đã bật âm báo đơn") : t("Đã tắt âm báo đơn"),
        next ? "success" : "info"
      );
      if (next) setTimeout(() => playDing(), 100);
      return next;
    });
  }, [t]);

  const toggleExpand = useCallback((key) => {
    setExpandedRows((s) => ({ ...s, [key]: !s[key] }));
  }, []);

  const takeVisible = useCallback(
    (list, key) => {
      if (expandedRows[key]) return { visible: list, hiddenCount: 0 };
      return {
        visible: list.slice(0, ROW_LIMIT),
        hiddenCount: Math.max(0, list.length - ROW_LIMIT),
      };
    },
    [expandedRows]
  );

  const shiftLabel = useMemo(() => getCurrentShiftLabel(new Date()), []);
  const staffName = user?.name || t("Nhân viên");
  const staffCode = user?.employeeCode || user?.code || "";

  const approveGreen = useCallback(
    async (order) => {
      const id = order._id || order.id;
      if (greenBusyId !== null) return;
      setGreenBusyId(id);
      try {
        const res = await api.orders.approveGreen(id);
        toast(`${t("Đã duyệt Sống Xanh")} + ${res.bonus} ${t("điểm")}`, "success");
        emitOrderUpdated();
        await load(true);
      } catch (e) {
        toast(e.message || t("Không duyệt được"), "error");
      } finally {
        setGreenBusyId(null);
      }
    },
    [load, t, greenBusyId]
  );

  const rejectGreen = useCallback(
    async (order) => {
      const id = order._id || order.id;
      if (greenBusyId !== null) return;
      setGreenBusyId(id);
      try {
        await api.orders.rejectGreen(id);
        toast(t("Đã từ chối Sống Xanh"), "warning");
        emitOrderUpdated();
        await load(true);
      } catch (e) {
        toast(e.message || t("Không từ chối được"), "error");
      } finally {
        setGreenBusyId(null);
      }
    },
    [load, t, greenBusyId]
  );

  const advance = useCallback(
    async (order) => {
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
      } catch (e) {
        toast(e.message || t("Không chuyển được trạng thái"), "error");
      } finally {
        setAdvancingId(null);
      }
    },
    [advancingId, load, t]
  );

  const rejectOrder = useCallback(
    (order) => {
      if (advancingId !== null) return;
      setConfirmReject(order);
    },
    [advancingId]
  );

  const executeReject = useCallback(async () => {
    if (!confirmReject) return;
    const order = confirmReject;
    const id = order._id || order.id;

    setAdvancingId(id);
    try {
      await api.orders.setStatus(id, "Đã hủy");
      toast(
        `${t("Đã hủy")} ${order.code} ${t("và hoàn tiền khách")}`,
        "warning"
      );
      setConfirmReject(null);
      emitOrderUpdated({ ...order, status: "Đã hủy" });
      await load(true);
    } catch (e) {
      toast(e.message || t("Không hủy được"), "error");
    } finally {
      setAdvancingId(null);
    }
  }, [confirmReject, load, t]);

  // ============================================================
  // ✅ V11: Xác định row nào hiển thị theo tab — TẤT CẢ DÙNG KDSRow
  // ============================================================
  const showRow1 = stationFilter === "all" || stationFilter === "pending";
  const showRow2 = stationFilter === "all" || stationFilter === "pending";
  const showRow3 = stationFilter === "all" || stationFilter === "kitchen";
  const showRow4 = stationFilter === "all" || stationFilter === "dispatch";
  const showRow5 = stationFilter === "all" || stationFilter === "dispatch";

  const currentStationObj =
    STATION_TABS.find((s) => s.id === stationFilter) || STATION_TABS[0];

  return (
    <>
      <div className="kds-workbench">
        {/* ERROR */}
        {error && (
          <div className="kds-error">
            <AlertCircle size={18} />
            <span style={{ flex: 1 }}>{error}</span>
            <button type="button" onClick={() => load(false)}>
              {t("Thử lại")}
            </button>
          </div>
        )}

        {/* ============ TOP CONSOLE ============ */}
        <div className="kds-console">
          <div className="kds-console__left">
            <div className="kds-console__card">
              <span className="kds-console__card-dot" />
              <div className="kds-console__card-info">
                <span className="kds-console__card-label">
                  {t("Ca Vận Hành")}
                </span>
                <span className="kds-console__card-value">
                  {shiftLabel}
                </span>
              </div>
            </div>

            <div className="kds-console__card">
              <User size={22} className="kds-console__card-icon" />
              <div className="kds-console__card-info">
                <span className="kds-console__card-label">
                  {t("Nhân sự trực")}
                </span>
                <span className="kds-console__card-value">
                  {staffName}
                  {staffCode && (
                    <span className="kds-console__card-sub">
                      {" "}(ID: {staffCode})
                    </span>
                  )}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="kds-console__sound-btn"
              onClick={toggleSound}
              aria-pressed={soundEnabled}
              title={
                soundEnabled
                  ? t("Đang bật — bấm để tắt")
                  : t("Đang tắt — bấm để bật")
              }
            >
              {soundEnabled ? (
                <Volume2 size={22} style={{ color: "var(--st-success)" }} />
              ) : (
                <VolumeX
                  size={22}
                  style={{ color: "var(--st-text-muted)" }}
                />
              )}
              <div className="kds-console__sound-text">
                <span className="kds-console__sound-label">
                  {t("Âm báo đơn")}
                </span>
                <span
                  className="kds-console__sound-status"
                  style={{
                    color: soundEnabled
                      ? "var(--st-success)"
                      : "var(--st-text-muted)",
                  }}
                >
                  {soundEnabled
                    ? kpi.pending > 0
                      ? `${t("Đang báo")} (${kpi.pending})`
                      : t("Đang bật")
                    : t("Đã tắt")}
                </span>
              </div>
              <span
                className="kds-console__sound-dot"
                style={{
                  background: soundEnabled
                    ? "var(--st-success)"
                    : "var(--st-outline)",
                  boxShadow: soundEnabled
                    ? "0 0 0 3px rgba(24, 169, 103, 0.2)"
                    : "none",
                }}
              />
            </button>
          </div>

          {/* ============ STATION TABS + DROPDOWN ============ */}
          <div ref={stationMenuRef} className="kds-station-menu-wrap">
            <button
              type="button"
              className="kds-station-btn"
              onClick={() => setShowStationMenu((s) => !s)}
              aria-expanded={showStationMenu}
              aria-haspopup="menu"
            >
              <currentStationObj.icon size={16} />
              <span>
                {stationFilter === "all"
                  ? t("Tải ca trạm")
                  : t(currentStationObj.label)}
              </span>
              <ChevronDown size={14} />
            </button>

            {showStationMenu && (
              <div className="kds-station-menu" role="menu">
                {STATION_TABS.map((s) => {
                  const Icon = s.icon;
                  const active = stationFilter === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="menuitem"
                      className={`kds-station-menu__item ${
                        active ? "active" : ""
                      }`}
                      onClick={() => changeStation(s.id)}
                    >
                      <Icon size={16} />
                      <span>{t(s.label)}</span>
                      {active && <Check size={14} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="kds-station-tabs">
            {STATION_TABS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`kds-station-tab ${
                  stationFilter === s.id ? "active" : ""
                }`}
                onClick={() => changeStation(s.id)}
              >
                {t(s.label)}
              </button>
            ))}
          </div>
        </div>

        {/* ============ KPI ROW ============ */}
        <div className="kds-kpi-grid">
          <div className="kds-kpi kds-kpi--danger">
            <div className="kds-kpi__head">
              <span className="kds-kpi__label">
                {t("Đơn Mới Cần Duyệt")}
              </span>
              {kpi.pending > 0 && <span className="kds-kpi__pulse" />}
            </div>
            <div className="kds-kpi__value-row">
              <span className="kds-kpi__value">
                {String(kpi.pending).padStart(2, "0")}
              </span>
              {kpi.pending > 0 && (
                <span className="kds-kpi__badge">{t("GẤP")}</span>
              )}
            </div>
            <div className="kds-kpi__bar">
              <div
                className="kds-kpi__bar-fill kds-kpi__bar-fill--danger"
                style={{ width: `${Math.min(100, kpi.pending * 20)}%` }}
              />
            </div>
          </div>

          <div className="kds-kpi">
            <div className="kds-kpi__head">
              <span className="kds-kpi__label">
                {t("Đang Chuẩn Bị (Prep)")}
              </span>
              <ChefHat size={20} style={{ color: "var(--st-secondary)" }} />
            </div>
            <div className="kds-kpi__value-row">
              <span className="kds-kpi__value">
                {String(kpi.prep).padStart(2, "0")}
              </span>
              <span className="kds-kpi__unit">{t("Bếp đang xào")}</span>
            </div>
            <div className="kds-kpi__bar">
              <div
                className="kds-kpi__bar-fill kds-kpi__bar-fill--primary"
                style={{ width: `${Math.min(100, kpi.prep * 20)}%` }}
              />
            </div>
          </div>

          <div className="kds-kpi">
            <div className="kds-kpi__head">
              <span className="kds-kpi__label">
                {t("Chờ Khách Lấy (Ready)")}
              </span>
              <PackageCheck size={20} style={{ color: "var(--st-primary)" }} />
            </div>
            <div className="kds-kpi__value-row">
              <span className="kds-kpi__value">
                {String(kpi.ready).padStart(2, "0")}
              </span>
              <span className="kds-kpi__unit">{t("Tủ giữ nóng OK")}</span>
            </div>
            <div className="kds-kpi__bar">
              <div
                className="kds-kpi__bar-fill kds-kpi__bar-fill--tertiary"
                style={{ width: `${Math.min(100, kpi.ready * 20)}%` }}
              />
            </div>
          </div>

          <div className="kds-kpi">
            <div className="kds-kpi__head">
              <span className="kds-kpi__label">
                {t("Hoàn Thành Trong Ca")}
              </span>
              <CheckCircle2
                size={20}
                style={{ color: "var(--st-text-muted)" }}
              />
            </div>
            <div className="kds-kpi__value-row">
              <span className="kds-kpi__value">{kpi.completedToday}</span>
              <span className="kds-kpi__unit">
                {kpi.onTimePct}% {t("đúng giờ")}
              </span>
            </div>
            <div className="kds-kpi__bar">
              <div
                className="kds-kpi__bar-fill kds-kpi__bar-fill--success"
                style={{ width: `${Math.min(100, kpi.onTimePct)}%` }}
              />
            </div>
          </div>

          <div className="kds-kpi kds-kpi--primary">
            <div className="kds-kpi__head">
              <span className="kds-kpi__label">
                {t("Doanh Thu Tạm Tính")}
              </span>
              <Wallet size={20} style={{ color: "var(--st-primary)" }} />
            </div>
            <div className="kds-kpi__value-row">
              <span className="kds-kpi__value" style={{ fontSize: 22 }}>
                {money(kpi.revenue).replace("đ", "")}đ
              </span>
            </div>
            <div className="kds-kpi__note">
              <TrendingUp size={14} />
              <span>+14.2% {t("so với hôm qua")}</span>
            </div>
          </div>
        </div>

        {/* ============ FILTER BAR ============ */}
        <div className="kds-filter">
          <div className="kds-filter__left">
            <div className="kds-filter__search">
              <Search size={18} className="kds-filter__search-icon" />
              <input
                type="text"
                className="kds-filter__search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t(
                  "Tìm theo Mã Đơn (#ORD-), Tên SV hoặc MSSV..."
                )}
              />
            </div>

            <div className="kds-filter__select-wrap">
              <select
                className="kds-filter__select"
                value={timeframeFilter}
                onChange={(e) => setTimeframeFilter(e.target.value)}
              >
                <option value="all">{t("Mọi khung giờ nhận")}</option>
                <option value="1130">
                  {t("11:30 - 12:00 (Cao điểm)")}
                </option>
                <option value="1200">{t("12:00 - 12:30")}</option>
                <option value="1230">{t("12:30 - 13:00")}</option>
              </select>
              <ChevronDown size={16} />
            </div>

            <div className="kds-filter__select-wrap">
              <select
                className="kds-filter__select"
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
              >
                <option value="all">{t("Mọi thanh toán")}</option>
                <option value="qr">{t("VietQR (Đã TT)")}</option>
                <option value="wallet">{t("Ví Nội Bộ VWA")}</option>
                <option value="cash">{t("Tiền mặt tại quầy")}</option>
                <option value="card">{t("Thẻ SV")}</option>
              </select>
              <ChevronDown size={16} />
            </div>

            <div className="kds-filter__select-wrap">
              <select
                className="kds-filter__select kds-filter__select--status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label={t("Lọc theo trạng thái đơn hàng")}
              >
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
            <button
              type="button"
              className="kds-filter__btn"
              onClick={() => load(false)}
              disabled={refreshing}
            >
              <RefreshCw
                size={16}
                style={{
                  animation: refreshing ? "spin 1s linear infinite" : "none",
                }}
              />
              <span>{t("Đồng bộ KDS")}</span>
            </button>
          </div>
        </div>

        {/* ============ KDS BOARD ============ */}
        <div className="kds-board kds-board--rows">
          {/* ROW 1: PENDING — hiện khi tab all hoặc pending */}
          {showRow1 &&
            (() => {
              const { visible, hiddenCount } = takeVisible(
                filteredRows.pending,
                "pending"
              );
              return (
                <KDSRow
                  title={t("1. Đơn Mới")}
                  subtitle={t("Chờ xác nhận")}
                  variant="pending"
                  count={filteredRows.pending.length}
                  countLabel={t("Đơn")}
                  empty={t("Không có đơn mới")}
                  moreCount={hiddenCount}
                  onMore={() => toggleExpand("pending")}
                >
                  {visible.map((o, idx) => (
                    <KDSTicket
                      key={o._id || o.id}
                      order={o}
                      variant="pending"
                      layout="tall"
                      isPriority={idx === 0 && !expandedRows.pending}
                      isProcessing={advancingId === (o._id || o.id)}
                      elapsed={calcElapsedSec(o.created_at)}
                      onAdvance={() => advance(o)}
                      onReject={() => rejectOrder(o)}
                      onApproveGreen={approveGreen}
                      onRejectGreen={rejectGreen}
                      greenBusy={greenBusyId === (o._id || o.id)}
                      t={t}
                    />
                  ))}
                </KDSRow>
              );
            })()}

          {/* ROW 2: CONFIRMED */}
          {showRow2 &&
            (() => {
              const { visible, hiddenCount } = takeVisible(
                filteredRows.confirmed,
                "confirmed"
              );
              return (
                <KDSRow
                  title={t("2. Đã Xác Nhận")}
                  subtitle={t("Chờ Bếp")}
                  variant="confirmed"
                  count={filteredRows.confirmed.length}
                  countLabel={t("Đơn")}
                  empty={t("Không có đơn đã xác nhận")}
                  moreCount={hiddenCount}
                  onMore={() => toggleExpand("confirmed")}
                >
                  {visible.map((o, idx) => (
                    <KDSTicket
                      key={o._id || o.id}
                      order={o}
                      variant="confirmed"
                      layout="tall"
                      isPriority={idx === 0 && !expandedRows.confirmed}
                      isProcessing={advancingId === (o._id || o.id)}
                      elapsed={calcElapsedSec(o.created_at)}
                      onAdvance={() => advance(o)}
                      onApproveGreen={approveGreen}
                      onRejectGreen={rejectGreen}
                      greenBusy={greenBusyId === (o._id || o.id)}
                                            t={t}
                    />
                  ))}
                </KDSRow>
              );
            })()}

          {/* ROW 3: PREP */}
          {showRow3 &&
            (() => {
              const { visible, hiddenCount } = takeVisible(
                filteredRows.prep,
                "prep"
              );
              return (
                <KDSRow
                  title={t("3. Đang Nấu")}
                  subtitle={t("Đang chế biến")}
                  variant="prep"
                  count={filteredRows.prep.length}
                  countLabel={t("Đơn")}
                  empty={t("Không có đơn đang nấu")}
                  moreCount={hiddenCount}
                  onMore={() => toggleExpand("prep")}
                >
                  {visible.map((o, idx) => (
                    <KDSTicket
                      key={o._id || o.id}
                      order={o}
                      variant="prep"
                      layout="tall"
                      isPriority={idx === 0 && !expandedRows.prep}
                      isProcessing={advancingId === (o._id || o.id)}
                      elapsed={calcElapsedSec(o.created_at)}
                      onAdvance={() => advance(o)}
                      onApproveGreen={approveGreen}
                      onRejectGreen={rejectGreen}
                      greenBusy={greenBusyId === (o._id || o.id)}
                      t={t}
                    />
                  ))}
                </KDSRow>
              );
            })()}

          {/* ROW 4: READY */}
          {showRow4 &&
            (() => {
              const { visible, hiddenCount } = takeVisible(
                filteredRows.ready,
                "ready"
              );
              return (
                <KDSRow
                  title={t("4. Sẵn Sàng Nhận")}
                  subtitle={t("Tủ giữ nóng")}
                  variant="ready"
                  count={filteredRows.ready.length}
                  countLabel={t("Đơn")}
                  empty={t("Không có đơn sẵn sàng")}
                  moreCount={hiddenCount}
                  onMore={() => toggleExpand("ready")}
                >
                  {visible.map((o, idx) => (
                    <KDSTicket
                      key={o._id || o.id}
                      order={o}
                      variant="ready"
                      layout="tall"
                      isPriority={idx === 0 && !expandedRows.ready}
                      isProcessing={advancingId === (o._id || o.id)}
                      onAdvance={() => advance(o)}
                      onApproveGreen={approveGreen}
                      onRejectGreen={rejectGreen}
                      greenBusy={greenBusyId === (o._id || o.id)}
                      t={t}
                    />
                  ))}
                </KDSRow>
              );
            })()}

          {/* ROW 5: COMPLETED */}
          {showRow5 && (
            <KDSRow
              title={t("5. Gần Nhất")}
              subtitle={t("Hoàn thành")}
              variant="completed"
              count={filteredRows.completedTotal}
              countLabel={t("Hoàn thành")}
              empty={t("Chưa có đơn hoàn thành")}
              isStrip
            >
              {filteredRows.completed.map((o) => (
                <CompletedStripItem key={o._id || o.id} order={o} t={t} />
              ))}

              {filteredRows.completedTotal > COMPLETED_LIMIT && (
                <button type="button" className="kds-completed__more">
                  {t("Xem tất cả")} {filteredRows.completedTotal}{" "}
                  {t("đơn →")}
                </button>
              )}
            </KDSRow>
          )}
        </div>
      </div>

      {/* CONFIRM REJECT */}
      <ConfirmDialog
        open={!!confirmReject}
        title={
          confirmReject
            ? `${t("Từ chối đơn")} ${confirmReject.code}?`
            : ""
        }
        message={
          confirmReject
            ? `${t("Hệ thống sẽ hủy đơn và hoàn tiền cho khách. Lý do có thể là hết nguyên liệu hoặc quá tải.")}`
            : ""
        }
        confirmText={t("Từ chối & Hoàn tiền")}
        cancelText={t("Giữ đơn")}
        danger
        loading={!!advancingId}
        onConfirm={executeReject}
        onClose={() => !advancingId && setConfirmReject(null)}
      />

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
// SUB: KDSRow
// ============================================================

function KDSRow({
  title,
  subtitle,
  variant,
  count,
  countLabel,
  empty,
  moreCount = 0,
  onMore,
  isStrip = false,
  children,
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : !!children;

  return (
    <section className={`kds-row kds-row--${variant}`}>
      <div className="kds-row__head">
        <div className="kds-row__title-wrap">
          <span className={`kds-row__dot kds-row__dot--${variant}`} />
          <span className="kds-row__title">{title}</span>
          {subtitle && (
            <span className="kds-row__subtitle">{subtitle}</span>
          )}
        </div>
        <span className={`kds-row__count kds-row__count--${variant}`}>
          {count} {countLabel}
        </span>
      </div>

      <div
        className={`kds-row__body ${
          isStrip ? "kds-row__body--strip" : ""
        }`}
      >
        {hasChildren ? (
          <>
            {children}
            {moreCount > 0 && (
              <button
                type="button"
                className="kds-row__more"
                onClick={onMore}
              >
                +{moreCount} đơn nữa — Xem thêm
              </button>
            )}
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
        <div className="kds-completed-strip-item__icon">
          <CheckCircle2 size={16} />
        </div>
        <span className="kds-completed-strip-item__code">
          {order.code}
        </span>
        <span className="kds-completed-strip-item__customer">
          {order.customer_name || t("Khách")}
        </span>
      </div>
      <div className="kds-completed-strip-item__right">
        <span className="kds-completed-strip-item__time">
          {fmtTimeWithLabel(order.updated_at || order.created_at)}
        </span>
        <span className="kds-completed-strip-item__total">
          {money(Number(order.total) || 0)}
        </span>
      </div>
    </div>
  );
}
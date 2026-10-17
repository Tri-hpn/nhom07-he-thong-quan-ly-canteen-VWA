// ============================================================
// CUSTOMERORDERS.JSX â€” ÄÆ¡n hÃ ng cá»§a tÃ´i (V6 - FINAL + i18n)
// ============================================================
// V5 (2026-10):
//   - ðŸ”§ FIX #30: getRelativeDateLabel dÃ¹ng source-text i18n
// V6 (2026-10):
//   - ðŸ”§ FIX: Customer tháº¥y status má»›i ngay khi tab quay láº¡i
//             (visibilitychange â†’ fetch ngay, khÃ´ng chá» 15s)
//   - Poll 15s khi tab visible
// ============================================================

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import {
  RefreshCw, Package, Clock, CheckCircle2, XCircle, ShoppingBag,
  ChevronLeft, ChevronRight, Loader2, AlertCircle, ChefHat, Bell,
  Receipt, Headset, Soup, Utensils, Store, X, Sparkles,
  Wallet, Leaf, Flame,
} from "lucide-react";
import { api } from "../../api";
import { money } from "../../components/UI";
import { useI18n } from "../../hooks/useI18n";
import CustomerOrderDetail from "../../components/CustomerOrderDetail";

// ============================================================
// CONSTANTS
// ============================================================

const POLL_MS = 15000;
const PAGE_SIZE = 6;

const FALLBACK_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
      <rect fill='#f5f7fb' width='100' height='100'/>
      <text x='50' y='58' font-size='40' text-anchor='middle'>ðŸ½ï¸</text>
    </svg>`
  );

const ACTIVE_STATUSES = [
  "Chá» xÃ¡c nháº­n",
  "ÄÃ£ xÃ¡c nháº­n",
  "Äang chuáº©n bá»‹",
  "Sáºµn sÃ ng nháº­n",
];

const TAB_MAP = {
  all:       () => true,
  preparing: (s) =>
    s === "Äang chuáº©n bá»‹" || s === "ÄÃ£ xÃ¡c nháº­n" || s === "Chá» xÃ¡c nháº­n",
  ready:     (s) => s === "Sáºµn sÃ ng nháº­n",
  completed: (s) => s === "HoÃ n thÃ nh",
  cancelled: (s) => s === "ÄÃ£ há»§y",
};

const STEPPER_STEPS = [
  { key: "placed",    label: "ÄÃ£ xÃ¡c nháº­n & Tráº£ tiá»n", subKey: "time" },
  { key: "preparing", label: "Äang cháº¿ biáº¿n",           subKey: "status" },
  { key: "ready",     label: "Sáºµn sÃ ng nháº­n",           subKey: "note" },
  { key: "done",      label: "HoÃ n táº¥t",                subKey: "note" },
];

const STATUS_STEP_INDEX = {
  "Chá» xÃ¡c nháº­n":  1,
  "ÄÃ£ xÃ¡c nháº­n":   1,
  "Äang chuáº©n bá»‹": 2,
  "Sáºµn sÃ ng nháº­n": 3,
  "HoÃ n thÃ nh":    4,
  "ÄÃ£ há»§y":        0,
};

const TIME_RANGE_OPTIONS = [
  { id: "today",  label: "HÃ´m nay" },
  { id: "7days",  label: "7 ngÃ y qua" },
  { id: "30days", label: "30 ngÃ y qua" },
  { id: "month",  label: "ThÃ¡ng nÃ y" },
  { id: "all",    label: "Táº¥t cáº£ thá»i gian" },
];

const COUNTER_OPTIONS = [
  { id: "all",  label: "Má»i Quáº§y" },
  { id: "com",  label: "Quáº§y CÆ¡m Suáº¥t",   match: ["CÆ¡m"] },
  { id: "bun",  label: "Quáº§y BÃºn / Phá»Ÿ",  match: ["BÃºn", "Phá»Ÿ", "MÃ³n máº·n"] },
  { id: "nuoc", label: "Quáº§y TrÃ  & Cafe", match: ["Äá»“ uá»‘ng", "Coffee & Tea", "NÆ°á»›c Ã©p - Sinh tá»‘"] },
];

// ============================================================
// HELPERS
// ============================================================

function fmtDateTime(iso) {
  if (!iso) return "â€”";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "â€”";
    const dd = d.getDate().toString().padStart(2, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = d.getHours().toString().padStart(2, "0");
    const mi = d.getMinutes().toString().padStart(2, "0");
    return `${dd}/${mm}/${yyyy} â€¢ ${hh}:${mi}`;
  } catch {
    return "â€”";
  }
}

function fmtTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return `${d.getHours().toString().padStart(2, "0")}:${d
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function getRelativeDateLabel(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today - target) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "HÃ´m nay";
    if (diffDays === 1) return "HÃ´m qua";
    if (diffDays < 7) return `${diffDays} ngÃ y trÆ°á»›c`;
    return "";
  } catch {
    return "";
  }
}

function getOrderId(order) {
  return order?._id || order?.id || null;
}

function getPickupPin(order) {
  if (!order) return "â€”";
  if (order.pickup_pin) return order.pickup_pin;
  const code = order.code || "";
  return code.slice(-2).toUpperCase() || "â€”";
}

function getItemsSummary(order) {
  const items = order?.items || [];
  if (items.length === 0) return "";
  if (items.length === 1) return items[0].name || "";
  return `${items[0].name} + ${items.length - 1} mÃ³n khÃ¡c`;
}

function getTotalQty(order) {
  return (order?.items || []).reduce(
    (s, it) => s + (Number(it.qty) || 0),
    0
  );
}

function isOrderInTimeRange(order, timeRange) {
  if (timeRange === "all") return true;
  if (!order?.created_at) return false;

  const orderTime = new Date(order.created_at).getTime();
  if (isNaN(orderTime)) return false;

  const now = new Date();
  const nowTime = now.getTime();

  if (timeRange === "today") {
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    return orderTime >= startOfDay;
  }

  if (timeRange === "7days") {
    return orderTime >= nowTime - 7 * 24 * 60 * 60 * 1000;
  }

  if (timeRange === "30days") {
    return orderTime >= nowTime - 30 * 24 * 60 * 60 * 1000;
  }

  if (timeRange === "month") {
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).getTime();
    return orderTime >= startOfMonth;
  }

  return true;
}

function isOrderInCounter(order, counterFilter) {
  if (counterFilter === "all") return true;

  const opt = COUNTER_OPTIONS.find((c) => c.id === counterFilter);
  if (!opt || !opt.match) return true;

  if (order.counter_name) {
    const counterName = String(order.counter_name).toLowerCase();
    const matchAny = opt.match.some((m) =>
      counterName.includes(String(m).toLowerCase())
    );
    if (matchAny) return true;
  }

  const items = order.items || [];
  return items.some((it) => {
    const cat = String(it.category || "").toLowerCase();
    return opt.match.some((m) => cat.includes(String(m).toLowerCase()));
  });
}

function getPaginationItems(currentPage, totalPages) {
  const items = [];
  const DELTA = 1;

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) items.push(i);
    return items;
  }

  items.push(1);

  const left = Math.max(2, currentPage - DELTA);
  const right = Math.min(totalPages - 1, currentPage + DELTA);

  if (left > 2) items.push("...");

  for (let i = left; i <= right; i++) items.push(i);

  if (right < totalPages - 1) items.push("...");

  items.push(totalPages);

  return items;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function CustomerOrders({ user, onOpenSupport }) {
  const navigate = useNavigate();
  const handleReorderOrder = useCallback((order) => {
    const oldItems = Array.isArray(order?.items) ? order.items : [];
    const buyNowItems = oldItems.map((item) => {
      const itemId = item.menu_item_id ?? item.menuItemId ?? item.product_id ?? item.id ?? item._id;
      return {
        ...item,
        id: itemId,
        menu_item_id: item.menu_item_id ?? itemId,
        name: item.name || item.food_name || item.item_name || "MÃ³n Äƒn",
        price: Number(item.price ?? item.unit_price ?? 0) || 0,
        qty: Number(item.qty ?? item.quantity ?? 1) || 1
      };
    });

    navigate("/customer/checkout", {
      state: { buyNowItems, fromReorder: true }
    });
  }, [navigate]);
  const { t } = useI18n();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [timeRange, setTimeRange] = useState("all");
  const [counterFilter, setCounterFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState(null);
  const [showCounterMap, setShowCounterMap] = useState(false);
  const reminderStorageKey = `canteen_order_reminders_v1_${user?.id || user?._id || "customer"}`;
  const [remindedOrderIds, setRemindedOrderIds] = useState(() => {
    try {
      const saved = localStorage.getItem(reminderStorageKey);
      const parsed = saved ? JSON.parse(saved) : {};
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  });
  const remindedOrderIdsRef = useRef(remindedOrderIds);

  const showOrderReadyNotice = useCallback((order) => {
    window.dispatchEvent(
      new CustomEvent("canteen-notifications-refresh", {
        detail: {
          orderId: getOrderId(order),
          orderCode: order?.code || ""
        }
      })
    );
  }, []);

  const handleRemindOrder = useCallback(async (order) => {
    const key = String(getOrderId(order) || order?.code || "");
    const orderId = getOrderId(order) || order?.code;
    if (!key || !orderId) return;
    const current = { ...(remindedOrderIdsRef.current || {}) };
    const enabled = !current[key];

    try {
      const result = await api.orders.remind(orderId, { enabled });
      if (!result?.ok) throw new Error("KhÃ´ng thá»ƒ cáº­p nháº­t nháº¯c háº¹n.");

      const next = { ...current };
      if (enabled && result.active !== false) {
        next[key] = { code: order?.code || key, createdAt: Date.now() };
      } else {
        delete next[key];
      }
      remindedOrderIdsRef.current = next;
      setRemindedOrderIds(next);
      try { localStorage.setItem(reminderStorageKey, JSON.stringify(next)); } catch {}
      window.dispatchEvent(new CustomEvent("canteen-notifications-refresh"));
    } catch (e) {
      console.error("KhÃ´ng thá»ƒ Ä‘áº·t nháº¯c Ä‘Æ¡n hÃ ng:", e);
      window.alert(e?.message || "KhÃ´ng thá»ƒ Ä‘áº·t nháº¯c háº¹n. Vui lÃ²ng thá»­ láº¡i.");
    }
  }, [reminderStorageKey]);

  const reqIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  // ðŸ”§ FIX: theo dÃµi tab visible Ä‘á»ƒ pause poll khi áº©n
  const [tabVisible, setTabVisible] = useState(
    typeof document === "undefined" || !document.hidden
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (silent = false) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      const myReqId = ++reqIdRef.current;
      if (!silent) setRefreshing(true);
      setError("");

      try {
        const data = await api.orders.myOrders();
        if (myReqId !== reqIdRef.current) return;
        if (!mountedRef.current) return;

        const sorted = [...(data || [])].sort((a, b) => {
          const ta = new Date(a.created_at || 0).getTime();
          const tb = new Date(b.created_at || 0).getTime();
          return tb - ta;
        });
        const pendingReminders = { ...(remindedOrderIdsRef.current || {}) };
        let remindersChanged = false;

        for (const readyOrder of sorted) {
          const reminderId = String(getOrderId(readyOrder) || readyOrder?.code || "");
          if (
            reminderId &&
            pendingReminders[reminderId] &&
            readyOrder.status === "Sáºµn sÃ ng nháº­n"
          ) {
            showOrderReadyNotice(readyOrder);
            delete pendingReminders[reminderId];
            remindersChanged = true;
          }
        }

        if (remindersChanged) {
          remindedOrderIdsRef.current = pendingReminders;
          setRemindedOrderIds(pendingReminders);
          try {
            localStorage.setItem(reminderStorageKey, JSON.stringify(pendingReminders));
          } catch {}
        }

        setOrders(sorted);
      } catch (e) {
        if (myReqId === reqIdRef.current && mountedRef.current) {
          setError(e.message || t("KhÃ´ng táº£i Ä‘Æ°á»£c Ä‘Æ¡n hÃ ng"));
        }
      } finally {
        if (myReqId === reqIdRef.current && mountedRef.current) {
          setLoading(false);
          if (!silent) setRefreshing(false);
        }
        inFlightRef.current = false;
      }
    },
    [t, reminderStorageKey, showOrderReadyNotice]
  );

  // ============================================================
  // Polling â€” táº£i láº¡i danh sÃ¡ch Ä‘Æ¡n hÃ ng Ä‘á»‹nh ká»³
  // ðŸ”§ FIX: pause khi tab áº©n (trÃ¡nh spam request khi user á»Ÿ tab khÃ¡c)
  // ============================================================
  useEffect(() => {
    load(false);

    if (!tabVisible) return;

    const interval = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(interval);
  }, [load, tabVisible]);

  // ============================================================
  // ðŸ”§ FIX: láº¯ng nghe visibilitychange
  //   - Khi tab customer bá»‹ áº©n â†’ pause poll
  //   - Khi tab quay láº¡i visible â†’ fetch NGAY láº­p tá»©c (khÃ´ng chá» 15s)
  //   ÄÃ¢y lÃ  cÆ¡ cháº¿ chÃ­nh giÃºp customer tháº¥y status má»›i
  //   sau khi employee Ä‘á»•i status á»Ÿ tab khÃ¡c.
  // ============================================================
  useEffect(() => {
    const handler = () => {
      const visible = !document.hidden;
      setTabVisible(visible);
      if (visible) {
        // Fetch ngay khi tab quay láº¡i
        load(true);
      }
    };

    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [load]);

  useEffect(() => {
    try {
      localStorage.setItem("orders_last_seen", Date.now().toString());
      window.dispatchEvent(new CustomEvent("orders-seen"));
    } catch {}
  }, []);

  const stats = useMemo(() => {
    let active = 0;
    let completed = 0;
    let totalSpent = 0;
    let subsidy = 0;

    for (const o of orders) {
      if (ACTIVE_STATUSES.includes(o.status)) active++;
      if (o.status === "HoÃ n thÃ nh") {
        completed++;
        totalSpent += Number(o.total) || 0;
        subsidy += Number(o.discount) || 0;
      }
    }

    return { total: orders.length, active, completed, totalSpent, subsidy };
  }, [orders]);

  const liveOrder = useMemo(() => {
    return orders.find((o) => ACTIVE_STATUSES.includes(o.status)) || null;
  }, [orders]);
const activeCounterId = (() => {
    const counter = String(liveOrder?.counter_name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    if (/\bq1\b|quay\s*0?1|com tru(a)?|com\s*&\s*healthy/.test(counter)) return "Q1";
    if (/\bq2\b|quay\s*0?2|bun|mi|banh mi/.test(counter)) return "Q2";
    if (/\bq3\b|quay\s*0?3|barista|trang mieng|do uong/.test(counter)) return "Q3";
    return "";
  })();

  const completed7dAgo = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return orders.filter(
      (o) =>
        o.status === "HoÃ n thÃ nh" &&
        new Date(o.created_at || 0).getTime() >= weekAgo
    ).length;
  }, [orders]);

  const counts = useMemo(() => {
    const map = { all: orders.length };
    for (const o of orders) {
      const s = o.status;
      if (s === "Äang chuáº©n bá»‹" || s === "ÄÃ£ xÃ¡c nháº­n" || s === "Chá» xÃ¡c nháº­n") {
        map.preparing = (map.preparing || 0) + 1;
      } else if (s === "Sáºµn sÃ ng nháº­n") {
        map.ready = (map.ready || 0) + 1;
      } else if (s === "HoÃ n thÃ nh") {
        map.completed = (map.completed || 0) + 1;
      } else if (s === "ÄÃ£ há»§y") {
        map.cancelled = (map.cancelled || 0) + 1;
      }
    }
    return map;
  }, [orders]);

  const filtered = useMemo(() => {
    let list = orders.filter((o) => TAB_MAP[activeTab](o.status));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((o) => {
        const code = (o.code || "").toLowerCase();
        const items = (o.items || [])
          .map((it) => (it.name || "").toLowerCase())
          .join(" ");
        return code.includes(q) || items.includes(q);
      });
    }

    list = list.filter((o) => isOrderInTimeRange(o, timeRange));
    list = list.filter((o) => isOrderInCounter(o, counterFilter));

    return list;
  }, [orders, activeTab, searchQuery, timeRange, counterFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const paginationItems = useMemo(
    () => getPaginationItems(page, totalPages),
    [page, totalPages]
  );

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchQuery, timeRange, counterFilter]);

  const goToOrderDetail = (order) => {
    setSelected(order);
  };

  return (
    <div className="customer-orders-v2">
      {error && (
        <div className="orders-error">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button type="button" onClick={() => load(false)}>
            <RefreshCw size={12} /> {t("Thá»­ láº¡i")}
          </button>
        </div>
      )}

      <section className="orders-header">
        <div className="orders-header__row">
          <div className="orders-header__left">

          </div>

          <div className="orders-header__right">
            <div className="orders-sync-badge">
              <span className="orders-sync-dot" />
              <span>{t("Äá»“ng bá»™: Vá»«a xong")}</span>
            </div>
            <button
              type="button"
              className="orders-refresh-btn"
              onClick={() => load(false)}
              disabled={refreshing}
              title={t("LÃ m má»›i")}
            >
              <RefreshCw
                size={18}
                className={refreshing ? "orders-spin" : ""}
              />
            </button>
          </div>
        </div>
      </section>

      <section className="orders-kpi-grid">
        <div className="orders-kpi-card">
          <div className="orders-kpi-icon orders-kpi-icon--blue">
            <Utensils size={24} />
          </div>
          <div className="orders-kpi-body">
            <span className="orders-kpi-label">{t("ÄANG PHá»¤C Vá»¤")}</span>
            <div className="orders-kpi-value-row">
              <span className="orders-kpi-value">
                {stats.active.toString().padStart(2, "0")}
              </span>
              <span className="orders-kpi-unit">{t("Ä‘Æ¡n")}</span>
            </div>
            <span className="orders-kpi-sub">
              {liveOrder?.counter_name || t("ChÆ°a cÃ³ Ä‘Æ¡n nÃ o")}
            </span>
          </div>
        </div>

        <div className="orders-kpi-card">
          <div className="orders-kpi-icon orders-kpi-icon--green">
            <CheckCircle2 size={24} />
          </div>
          <div className="orders-kpi-body">
            <span className="orders-kpi-label">
              {t("HOÃ€N THÃ€NH THÃNG NÃ€Y")}
            </span>
            <div className="orders-kpi-value-row">
              <span className="orders-kpi-value">{stats.completed}</span>
              <span className="orders-kpi-unit">{t("suáº¥t Äƒn")}</span>
            </div>
            <span className="orders-kpi-sub orders-kpi-sub--green">
              {completed7dAgo > 0
                ? `+${completed7dAgo} ${t("Ä‘Æ¡n trong 7 ngÃ y qua")}`
                : t("ChÆ°a cÃ³ Ä‘Æ¡n trong tuáº§n nÃ y")}
            </span>
          </div>
        </div>

        <div className="orders-kpi-card">
          <div className="orders-kpi-icon orders-kpi-icon--sky">
            <Wallet size={24} />
          </div>
          <div className="orders-kpi-body">
            <span className="orders-kpi-label">
              {t("TRá»¢ GIÃ SV TÃCH LÅ¨Y")}
            </span>
            <div className="orders-kpi-value-row">
              <span className="orders-kpi-value">
                {stats.subsidy.toLocaleString("vi-VN")}
              </span>
              <span className="orders-kpi-unit">Ä‘</span>
            </div>
            <span className="orders-kpi-sub">
              {t("Há»— trá»£ 10k/bá»¯a trÆ°a")}
            </span>
          </div>
        </div>

        <div className="orders-kpi-card">
          <div className="orders-kpi-icon orders-kpi-icon--amber">
            <Leaf size={24} />
          </div>
          <div className="orders-kpi-body">
            <span className="orders-kpi-label">{t("ÄIá»‚M VWA GREEN")}</span>
            <div className="orders-kpi-value-row">
              <span className="orders-kpi-value orders-kpi-value--amber">
                350
              </span>
              <span className="orders-kpi-unit orders-kpi-unit--amber">
                pts
              </span>
            </div>
            <span className="orders-kpi-sub">
              {t("Äá»•i 01 nÆ°á»›c ngá»t miá»…n phÃ­")}
            </span>
          </div>
        </div>
      </section>

      {liveOrder && (
        <section className="orders-live-section">
          <div className="orders-live-head">
            <div className="orders-live-head-left">
              <span className="orders-live-pulse" />
              <h2 className="orders-live-title">
                {t("ÄÆ¡n hÃ ng trá»±c tiáº¿p Ä‘ang cháº¿ biáº¿n")}
              </h2>
            </div>
            <span className="orders-live-badge">
              <Flame size={14} />
              {t("Live KDS Canteen")}
            </span>
          </div>

          <LiveOrderCard
            order={liveOrder}
            onView={() => goToOrderDetail(liveOrder)}
            onOpenSupport={onOpenSupport}
            onRemindOrder={handleRemindOrder}
            isReminderSet={Boolean(remindedOrderIds[String(getOrderId(liveOrder) || liveOrder?.code || "")])}
            t={t}
          />
        </section>
      )}

      <section className="orders-filter-section">
  <div className="orders-filter-bar orders-filter-bar--ordered">
    <div className="orders-filter-controls orders-filter-controls--ordered">
      <select
        value={timeRange}
        onChange={(e) => setTimeRange(e.target.value)}
        className="orders-select"
        aria-label={t("Lá»c theo thá»i gian")}
      >
        {TIME_RANGE_OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {t(opt.label)}
          </option>
        ))}
      </select>

      <select
        value={counterFilter}
        onChange={(e) => setCounterFilter(e.target.value)}
        className="orders-select"
        aria-label={t("Lá»c theo quáº§y")}
      >
        {COUNTER_OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {t(opt.label)}
          </option>
        ))}
      </select>

      <div className="orders-search">
        <Clock size={14} className="orders-search__icon" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("TÃ¬m theo mÃ£ Ä‘Æ¡n hoáº·c mÃ³n...")}
          className="orders-search__input"
        />
      </div>

      <select
        value={activeTab}
        onChange={(e) => setActiveTab(e.target.value)}
        className="orders-select orders-status-select"
        aria-label={t("Lá»c theo tráº¡ng thÃ¡i Ä‘Æ¡n hÃ ng")}
      >
        <option value="all">{t("Táº¥t cáº£ Ä‘Æ¡n")}</option>
        <option value="preparing">{t("Äang chuáº©n bá»‹")}</option>
        <option value="ready">{t("Chá» nháº­n mÃ³n")}</option>
        <option value="completed">{t("ÄÃ£ hoÃ n thÃ nh")}</option>
        <option value="cancelled">{t("ÄÃ£ há»§y")}</option>
      </select>
    </div>
  </div>
</section>

      {loading && !orders.length && (
        <div className="orders-skeleton-list">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="orders-skeleton-card">
              <div className="orders-skeleton-row">
                <SkeletonBox w="140px" h="18px" />
                <SkeletonBox w="100px" h="18px" />
              </div>
              <div className="orders-skeleton-row">
                <SkeletonBox w="80px" h="80px" radius="12px" />
                <div style={{ flex: 1 }}>
                  <SkeletonBox w="60%" h="16px" />
                  <SkeletonBox w="40%" h="12px" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="orders-empty">
          <Package size={56} className="orders-empty__icon" />
          <h3 className="orders-empty__title">
            {activeTab === "all" &&
            timeRange === "all" &&
            counterFilter === "all" &&
            !searchQuery
              ? t("Báº¡n chÆ°a cÃ³ Ä‘Æ¡n hÃ ng nÃ o")
              : t("KhÃ´ng cÃ³ Ä‘Æ¡n hÃ ng phÃ¹ há»£p vá»›i bá»™ lá»c")}
          </h3>
          <p className="orders-empty__desc">
            {activeTab === "all" &&
            timeRange === "all" &&
            counterFilter === "all" &&
            !searchQuery
              ? t("HÃ£y Ä‘áº·t mÃ³n Ä‘á»ƒ báº¯t Ä‘áº§u tráº£i nghiá»‡m")
              : t("Thá»­ Ä‘á»•i bá»™ lá»c hoáº·c xem táº¥t cáº£ Ä‘Æ¡n hÃ ng.")}
          </p>
          {activeTab === "all" &&
          timeRange === "all" &&
          counterFilter === "all" &&
          !searchQuery ? (
            <Link to="/customer/menu" className="orders-empty__btn">
              <ShoppingBag size={15} /> {t("Äáº·t mÃ³n ngay")}
            </Link>
          ) : (
            <button
              type="button"
              className="orders-empty__btn"
              onClick={() => {
                setActiveTab("all");
                setTimeRange("all");
                setCounterFilter("all");
                setSearchQuery("");
              }}
            >
              {t("XÃ³a táº¥t cáº£ bá»™ lá»c")}
            </button>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <section className="orders-list-section">
          <div className="orders-list">
            {paginatedOrders.map((order) => (
              <OrderHistoryCard
                key={getOrderId(order)}
                order={order}
                onView={() => goToOrderDetail(order)}
                onReorder={handleReorderOrder}
                t={t}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && filtered.length > 0 && (
        <section className="orders-footer-section">
          {totalPages > 1 && (
            <div className="orders-pagination">
              <p className="orders-pagination__info">
                {t("Hiá»ƒn thá»‹")}{" "}
                <b>
                  {(page - 1) * PAGE_SIZE + 1} -{" "}
                  {Math.min(page * PAGE_SIZE, filtered.length)}
                </b>{" "}
                {t("trong tá»•ng sá»‘")} <b>{filtered.length}</b>{" "}
                {t("Ä‘Æ¡n hÃ ng Ä‘Ã£ Ä‘áº·t")}
              </p>

              <div className="orders-pagination__controls">
                <button
                  type="button"
                  className="orders-page-btn"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  title={t("Trang trÆ°á»›c")}
                >
                  <ChevronLeft size={16} />
                </button>

                {paginationItems.map((item, idx) => {
                  if (item === "...") {
                    return (
                      <span
                        key={`ellipsis-${idx}`}
                        className="orders-page-btn orders-page-btn--ellipsis"
                        aria-hidden="true"
                        style={{
                          cursor: "default",
                          background: "transparent",
                          color: "var(--text-light, #94a3b8)",
                        }}
                      >
                        â€¦
                      </span>
                    );
                  }
                  return (
                    <button
                      key={item}
                      type="button"
                      className={`orders-page-btn ${
                        item === page ? "active" : ""
                      }`}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </button>
                  );
                })}

                <button
                  type="button"
                  className="orders-page-btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  title={t("Trang tiáº¿p")}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          <div className="orders-banner">
            <div className="orders-banner__left">
              <div className="orders-banner__icon">
                <Bell size={26} />
              </div>
              <div>
                <h4 className="orders-banner__title">
                  {t("VÄƒn hÃ³a láº¥y mÃ³n vÄƒn minh táº¡i Canteen VWA")}
                </h4>
                <p className="orders-banner__desc">
                  {t("Khi há»‡ thá»‘ng bÃ¡o")}{" "}
                  <b>"{t("Sáºµn sÃ ng nháº­n mÃ³n")}"</b>,{" "}
                  {t("báº¡n hÃ£y di chuyá»ƒn Ä‘áº¿n mÃ n hÃ¬nh KDS táº¡i quáº§y tÆ°Æ¡ng á»©ng, xuáº¥t trÃ¬nh mÃ£ PIN sá»‘")}{" "}
                  <b>#{getPickupPin(liveOrder)}</b>{" "}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="orders-banner__btn"
              onClick={() => setShowCounterMap(true)}
              style={{ border: 0, cursor: "pointer" }}
            >
              <Store size={16} />
              {t("SÆ¡ Ä‘á»“ quáº§y Äƒn")}
            </button>
          </div>
        </section>
      )}

      {showCounterMap && (
        <div
          role="presentation"
          onClick={() => setShowCounterMap(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10040,
            background: "rgba(15,23,42,.68)",
            display: "grid",
            placeItems: "center",
            padding: 12
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={t("SÆ¡ Ä‘á»“ quáº§y Äƒn")}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(100%, 980px)",
              maxHeight: "94vh",
              overflowY: "auto",
              background: "#f8fafc",
              color: "#172b4d",
              borderRadius: 22,
              padding: 20,
              boxShadow: "0 28px 80px rgba(0,0,0,.28)",
              boxSizing: "border-box",
              border: "1px solid #dbe4ef"
            }}
          >
            <header style={{
  position: "relative",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: 44,
  marginBottom: 18
}}>
  <h3 style={{
    margin: 0,
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: "-.5px",
    color: "#192D5B",
    textAlign: "center"
  }}>
    {t("SÆ¡ Ä‘á»“ quáº§y Äƒn")}
  </h3>
  <button
    type="button"
    onClick={() => setShowCounterMap(false)}
    aria-label={t("ÄÃ³ng")}
    style={{
      position: "absolute",
      right: 0,
      top: 0,
      width: 40,
      height: 40,
      border: "1px solid #dbe4ef",
      borderRadius: 13,
      background: "#fff",
      color: "#334155",
      cursor: "pointer",
      fontSize: 24,
      lineHeight: 1
    }}
  >Ã—</button>
</header>

            <div style={{
              border: "1px solid #d9e3ec",
              borderRadius: 18,
              overflow: "hidden",
              background: "#fdfefe",
              boxShadow: "0 5px 18px rgba(25,55,85,.05)"
            }}>
              <svg
  viewBox="0 0 1200 760"
  role="img"
  aria-label={t("SÆ¡ Ä‘á»“ máº·t báº±ng nhÃ  hÃ ng Canteen VWA")}
  style={{ display: "block", width: "100%", height: "auto", minWidth: 620 }}
>
  <defs>
    <pattern id="vwa-restaurant-floor" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0H0V32" fill="none" stroke="#EAF0FF" strokeWidth="1" />
    </pattern>
    <linearGradient id="vwa-restaurant-kitchen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor="#E7EDFF" />
      <stop offset="100%" stopColor="#D8E3FF" />
    </linearGradient>
    <linearGradient id="vwa-restaurant-counter" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#ffffff" />
      <stop offset="100%" stopColor="#f4f7fa" />
    </linearGradient>
    <marker id="vwa-restaurant-arrow" viewBox="0 0 10 10" refX="8" refY="5"
      markerWidth="7" markerHeight="7" orient="auto">
      <path d="M0 0L10 5L0 10Z" fill="#2878d0" />
    </marker>
  </defs>

  {/* FLOOR */}
  <rect width="1200" height="760" rx="20" fill="#F7F9FF" />
  <rect width="1200" height="760" rx="20" fill="url(#vwa-restaurant-floor)" />
  <rect x="20" y="20" width="1160" height="720" rx="19"
    fill="none" stroke="#C9D6F2" strokeWidth="2" />

  {/* KITCHEN */}
  <rect x="370" y="38" width="460" height="88" rx="13"
    fill="url(#vwa-restaurant-kitchen)" stroke="#A8B9E8" strokeWidth="1.5" />
  <rect x="390" y="58" width="42" height="42" rx="9"
    fill="#fff" stroke="#D7E0F4" />
  <path d="M401 69V89M411 69V89M421 69V89M401 79H421"
    fill="none" stroke="#2634D5" strokeWidth="2" strokeLinecap="round" />
  <text x="610" y="70" textAnchor="middle" fontSize="20" fontWeight="800" fill="#192D5B">
    KHU Báº¾P
  </text>
  <text x="610" y="94" textAnchor="middle" fontSize="12" letterSpacing="1" fill="#657AA0">
    CHáº¾ BIáº¾N Â· CHUáº¨N Bá»Š MÃ“N
  </text>
  <path d="M610 127V143" stroke="#a8b8c9" strokeWidth="2" strokeDasharray="4 4" />

  {/* SERVICE COUNTER WALL */}
  <rect x="43" y="145" width="1114" height="177" rx="17"
    fill="#E3E9FF" stroke="#C8D7F4" strokeWidth="1.5" />
  <rect x="56" y="156" width="1088" height="13" rx="6"
    fill="#CCD9F5" />

  {/* Q2 COUNTER */}
  <g>
    <rect x="59" y="174" width="344" height="135" rx="10"
      fill={activeCounterId === "Q2" ? "#E8EDFF" : "url(#vwa-restaurant-counter)"}
      stroke={activeCounterId === "Q2" ? "#2634D5" : "#D6E0F8"}
      strokeWidth={activeCounterId === "Q2" ? 3.5 : 1.3} />
    <rect x="59" y="174" width="344" height="7" rx="3.5" fill="#2634D5" />
    <text x="80" y="201" fontSize="11" fontWeight="800" letterSpacing="1" fill="#3F5CA9">Q2 Â· QUáº¦Y 02</text>
    <text x="231" y="232" textAnchor="middle" fontSize="20" fontWeight="800" fill="#182D5A">BÃºn, MÃ¬ &amp; BÃ¡nh mÃ¬</text>
    <g transform="translate(231 263)">
      <ellipse cx="0" cy="5" rx="27" ry="7" fill="#dbe5ee" />
      <path d="M-22 -2Q0 7 22 -2L16 13Q0 23 -16 13Z"
        fill="#2634D5" stroke="#2563eb" strokeWidth="1.5" />
      <path d="M-22 -2Q0 4 22 -2" fill="none" stroke="#2563eb" strokeWidth="2" />
      <path d="M-11 -18L-1 -3M-3 -20L7 -4M5 -18L14 -3"
        fill="none" stroke="#a27b4f" strokeWidth="2.2" strokeLinecap="round" />
    </g>
    <text x="231" y="298" textAnchor="middle" fontSize="11" fill="#72879d">MÃ“N NÆ¯á»šC Â· Äá»’ Ä‚N NHANH</text>
    {activeCounterId === "Q2" && (
      <g>
        <rect x="278" y="187" width="109" height="20" rx="10" fill="#2634D5" />
        <text x="332.5" y="201" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">ÄÆ N Cá»¦A Báº N</text>
      </g>
    )}
  </g>

  {/* Q1 COUNTER */}
  <g>
    <rect x="428" y="174" width="344" height="135" rx="10"
      fill={activeCounterId === "Q1" ? "#E8EDFF" : "url(#vwa-restaurant-counter)"}
      stroke={activeCounterId === "Q1" ? "#2634D5" : "#D6E0F8"}
      strokeWidth={activeCounterId === "Q1" ? 3.5 : 1.3} />
    <rect x="428" y="174" width="344" height="7" rx="3.5" fill="#34d399" />
    <text x="449" y="201" fontSize="11" fontWeight="800" letterSpacing="1" fill="#21835c">Q1 Â· QUáº¦Y 01</text>
    <text x="600" y="232" textAnchor="middle" fontSize="20" fontWeight="800" fill="#182D5A">CÆ¡m &amp; Healthy</text>
    <g transform="translate(600 263)">
      <ellipse cx="0" cy="7" rx="31" ry="14" fill="#e6eee9" stroke="#9cb5a5" strokeWidth="1.5" />
      <ellipse cx="0" cy="4" rx="25" ry="10" fill="#fff" stroke="#bdcfc4" strokeWidth="1.3" />
      <ellipse cx="-7" cy="2" rx="11" ry="6" fill="#fff" stroke="#c6d5cb" strokeWidth="1" />
      <path d="M5 -2L18 -7L25 0L17 7L6 6Z" fill="#22c55e" />
      <circle cx="-16" cy="7" r="3.5" fill="#f59e0b" />
      <circle cx="5" cy="3" r="3" fill="#fb7185" />
    </g>
    <text x="600" y="298" textAnchor="middle" fontSize="11" fill="#72879d">CÆ M PHáº¦N Â· MÃ“N HEALTHY</text>
    {activeCounterId === "Q1" && (
      <g>
        <rect x="647" y="187" width="109" height="20" rx="10" fill="#2634D5" />
        <text x="701.5" y="201" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">ÄÆ N Cá»¦A Báº N</text>
      </g>
    )}
  </g>

  {/* Q3 COUNTER */}
  <g>
    <rect x="797" y="174" width="344" height="135" rx="10"
      fill={activeCounterId === "Q3" ? "#E8EDFF" : "url(#vwa-restaurant-counter)"}
      stroke={activeCounterId === "Q3" ? "#2634D5" : "#D6E0F8"}
      strokeWidth={activeCounterId === "Q3" ? 3.5 : 1.3} />
    <rect x="797" y="174" width="344" height="7" rx="3.5" fill="#fb923c" />
    <text x="818" y="201" fontSize="11" fontWeight="800" letterSpacing="1" fill="#b76524">Q3 Â· QUáº¦Y 03</text>
    <text x="969" y="232" textAnchor="middle" fontSize="19" fontWeight="800" fill="#182D5A">Barista &amp; TrÃ¡ng miá»‡ng</text>
    <g transform="translate(969 263)">
      <path d="M-17 -13H12V12Q12 17 7 17H-12Q-17 17 -17 12Z"
        fill="#DCE5FF" stroke="#6D8BFF" strokeWidth="1.5" />
      <path d="M12 -8H18Q28 -8 24 3Q22 8 12 8"
        fill="none" stroke="#6D8BFF" strokeWidth="2.2" />
      <path d="M-12 -13Q-8 -19 -12 -24M-3 -13Q1 -19 -3 -24"
        fill="none" stroke="#a6b3cd" strokeWidth="1.7" strokeLinecap="round" />
    </g>
    <text x="969" y="298" textAnchor="middle" fontSize="11" fill="#72879d">Äá»’ Uá»NG Â· BÃNH NGá»ŒT</text>
    {activeCounterId === "Q3" && (
      <g>
        <rect x="1016" y="187" width="109" height="20" rx="10" fill="#2634D5" />
        <text x="1070.5" y="201" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">ÄÆ N Cá»¦A Báº N</text>
      </g>
    )}
  </g>

  {/* ORDERING / PICKUP LINE */}
  <text x="65" y="344" fontSize="11" fontWeight="800" letterSpacing="1" fill="#687d94">
    HÃ€NG CHá»œ PHá»¤C Vá»¤
  </text>
  <path d="M65 365H1134" stroke="#E2E9FF" strokeWidth="12" strokeLinecap="round" />
  <path d="M65 365H1134" stroke="#2878d0" strokeWidth="2.6"
    strokeDasharray="9 8" markerEnd="url(#vwa-restaurant-arrow)" />
  <rect x="428" y="349" width="344" height="32" rx="10" fill="#fff" stroke="#d7e2ed" />
  <text x="600" y="370" textAnchor="middle" fontSize="13" fontWeight="800" fill="#395776">
    Gá»ŒI MÃ“N Â· NHáº¬N MÃ“N
  </text>

  {/* DINING ROOM */}
  <rect x="43" y="405" width="1114" height="262" rx="16"
    fill="#fff5e7" stroke="#edd5b7" strokeWidth="1.5" />
  <text x="66" y="433" fontSize="13" fontWeight="800" letterSpacing="1" fill="#8b6235">
    KHU Vá»°C NGá»’I Ä‚N
  </text>
  <text x="1134" y="433" textAnchor="end" fontSize="11" letterSpacing=".8" fill="#9a8a76">
    DINING AREA
  </text>

  {/* TABLE 1 */}
  <g>
    <rect x="121" y="456" width="150" height="47" rx="8" fill="#DFE7FF" />
    <rect x="126" y="450" width="140" height="47" rx="7" fill="#ffffff" stroke="#BAC9F0" strokeWidth="1.5" />
    <rect x="137" y="461" width="118" height="25" rx="4" fill="#FFFFFF" />
    <circle cx="144" cy="442" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="204" cy="442" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="250" cy="442" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="144" cy="506" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="204" cy="506" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="250" cy="506" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
  </g>

  {/* TABLE 2 */}
  <g>
    <rect x="380" y="456" width="150" height="47" rx="8" fill="#DFE7FF" />
    <rect x="385" y="450" width="140" height="47" rx="7" fill="#ffffff" stroke="#BAC9F0" strokeWidth="1.5" />
    <rect x="396" y="461" width="118" height="25" rx="4" fill="#FFFFFF" />
    <circle cx="403" cy="442" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="463" cy="442" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="509" cy="442" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="403" cy="506" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="463" cy="506" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="509" cy="506" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
  </g>

  {/* TABLE 3 */}
  <g>
    <rect x="639" y="456" width="150" height="47" rx="8" fill="#DFE7FF" />
    <rect x="644" y="450" width="140" height="47" rx="7" fill="#ffffff" stroke="#BAC9F0" strokeWidth="1.5" />
    <rect x="655" y="461" width="118" height="25" rx="4" fill="#FFFFFF" />
    <circle cx="662" cy="442" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="722" cy="442" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="768" cy="442" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="662" cy="506" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="722" cy="506" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="768" cy="506" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
  </g>

  {/* TABLE 4 */}
  <g>
    <rect x="898" y="456" width="150" height="47" rx="8" fill="#DFE7FF" />
    <rect x="903" y="450" width="140" height="47" rx="7" fill="#ffffff" stroke="#BAC9F0" strokeWidth="1.5" />
    <rect x="914" y="461" width="118" height="25" rx="4" fill="#FFFFFF" />
    <circle cx="921" cy="442" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="981" cy="442" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="1027" cy="442" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="921" cy="506" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="981" cy="506" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="1027" cy="506" r="9" fill="#E3E9FF" stroke="#A6B8E8" />
  </g>

  {/* CENTRAL AISLE */}
  <path d="M72 548H1127" stroke="#ffe9c8" strokeWidth="11" strokeLinecap="round" />
  <path d="M72 548H1127" stroke="#2634D5" strokeWidth="1.7"
    strokeDasharray="7 8" markerEnd="url(#vwa-restaurant-arrow)" />
  <rect x="438" y="535" width="324" height="26" rx="9" fill="#F7F9FF" stroke="#e0e8f0" />
  <text x="600" y="552" textAnchor="middle" fontSize="11" fontWeight="800" fill="#637d9a">
    Lá»I ÄI CHÃNH
  </text>

  {/* Additional tables */}
  <g>
    <rect x="205" y="579" width="125" height="36" rx="7" fill="#fff" stroke="#BAC9F0" strokeWidth="1.5" />
    <rect x="221" y="589" width="93" height="16" rx="4" fill="#FFFFFF" />
    <circle cx="220" cy="572" r="7" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="280" cy="572" r="7" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="220" cy="622" r="7" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="280" cy="622" r="7" fill="#E3E9FF" stroke="#A6B8E8" />
  </g>
  <g>
    <rect x="536" y="579" width="125" height="36" rx="7" fill="#fff" stroke="#BAC9F0" strokeWidth="1.5" />
    <rect x="552" y="589" width="93" height="16" rx="4" fill="#FFFFFF" />
    <circle cx="551" cy="572" r="7" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="611" cy="572" r="7" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="551" cy="622" r="7" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="611" cy="622" r="7" fill="#E3E9FF" stroke="#A6B8E8" />
  </g>
  <g>
    <rect x="867" y="579" width="125" height="36" rx="7" fill="#fff" stroke="#BAC9F0" strokeWidth="1.5" />
    <rect x="883" y="589" width="93" height="16" rx="4" fill="#FFFFFF" />
    <circle cx="882" cy="572" r="7" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="942" cy="572" r="7" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="882" cy="622" r="7" fill="#E3E9FF" stroke="#A6B8E8" />
    <circle cx="942" cy="622" r="7" fill="#E3E9FF" stroke="#A6B8E8" />
  </g>

  {/* ENTRY / EXIT */}
  <path d="M79 713V666" stroke="#2878d0" strokeWidth="3.5" markerEnd="url(#vwa-restaurant-arrow)" />
  <rect x="47" y="700" width="166" height="34" rx="10" fill="#E8EDFF" stroke="#cadcf5" />
  <text x="130" y="721" textAnchor="middle" fontSize="12" fontWeight="800" fill="#2634D5">Lá»I VÃ€O Â· ENTRY</text>

  <path d="M1120 666V713" stroke="#71869c" strokeWidth="3.5" />
  <path d="M1113 704L1120 713L1127 704" fill="none" stroke="#71869c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  <rect x="987" y="700" width="166" height="34" rx="10" fill="#FFFFFF" stroke="#d6e0e8" />
  <text x="1070" y="721" textAnchor="middle" fontSize="12" fontWeight="800" fill="#556b81">Lá»I RA Â· EXIT</text>
</svg>
            </div>

            <footer style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 9,
              marginTop: 14,
              color: "#64748b",
              fontSize: 12,
              lineHeight: 1.6
            }}>
              <Store size={17} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                {t("SÆ¡ Ä‘á»“ minh há»a dá»±a trÃªn ba quáº§y hiá»‡n cÃ³ trong há»‡ thá»‘ng. Vá»‹ trÃ­ máº·t báº±ng vÃ  lá»‘i Ä‘i cáº§n Ä‘Æ°á»£c Ä‘á»‘i chiáº¿u vá»›i bá»‘ trÃ­ thá»±c táº¿ táº¡i canteen.")}
              </span>
            </footer>

            <button
              type="button"
              onClick={() => setShowCounterMap(false)}
              style={{
                width: "100%",
                marginTop: 16,
                padding: 13,
                border: 0,
                borderRadius: 13,
                color: "#fff",
                background: "#263f8f",
                fontWeight: 800,
                cursor: "pointer",
                fontSize: 14,
                boxShadow: "0 5px 13px rgba(38,63,143,.2)"
              }}
            >
              {t("ÄÃ³ng sÆ¡ Ä‘á»“")}
            </button>
          </section>
        </div>
      )}
      {selected && (
        <CustomerOrderDetail
          order={selected}
          onClose={() => setSelected(null)}
          onUpdate={load}
        />
      )}

      <style>{`
        @keyframes ordersSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .orders-spin { animation: ordersSpin 1s linear infinite; }
        @keyframes ordersSkeleton {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .orders-page-btn--ellipsis {
          font-size: 16px;
          font-weight: 700;
          min-width: 24px;
        }
      `}</style>
    </div>
  );
}

// ============================================================
// SUB: SkeletonBox
// ============================================================

function SkeletonBox({ w, h, radius = 6 }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, #eef2f7 25%, #e5e9ef 50%, #eef2f7 75%)",
        backgroundSize: "200% 100%",
        animation: "ordersSkeleton 1.5s infinite",
      }}
    />
  );
}

// ============================================================
// SUB: LiveOrderCard
// ============================================================

function LiveOrderCard({ order, onView, onOpenSupport, onRemindOrder, isReminderSet, t }) {
  if (!order) return null;

  const stepIndex = STATUS_STEP_INDEX[order.status] || 1;
  const items = order.items || [];
  const total = Number(order.total) || 0;
  const discount = Number(order.discount) || 0;
  const originalTotal = total + discount;
  const pin = getPickupPin(order);
  const relativeLabel = getRelativeDateLabel(order.created_at);

  return (
    <div className="orders-live-card">
      <div className="orders-live-card__top">
        <div className="orders-live-card__code-group">
          <span className="orders-live-card__code">#{order.code}</span>
          {order.counter_name && (
            <span className="orders-live-card__counter">
              <Soup size={14} />
              {order.counter_name}
            </span>
          )}
          <span className="orders-live-card__time">
            <Clock size={14} />
            {t("Äáº·t lÃºc:")} {fmtDateTime(order.created_at)}
            {relativeLabel && (
              <span className="orders-live-card__time-label">
                Â· {t(relativeLabel)}
              </span>
            )}
          </span>
          {order.pickup_time && (
            <span className="orders-live-card__time orders-live-card__time--pickup">
              <Clock size={14} />
              {t("Nháº­n:")} {order.pickup_time}
            </span>
          )}
        </div>

        <div className="orders-live-card__pin-group">
          <div className="orders-live-card__pin-info">
            <span className="orders-live-card__pin-label">
              {t("MÃ£ nháº­n táº¡i quáº§y")}
            </span>
            <span className="orders-live-card__pin-value">#{pin}</span>
          </div>
        </div>
      </div>

      <div className="orders-stepper">
        <div className="orders-stepper__head">
          <span className="orders-stepper__status">
            <span className="orders-stepper__status-dot" />
            {order.status === "Äang chuáº©n bá»‹"
              ? t("Äáº§u báº¿p Ä‘ang thá»±c hiá»‡n â€¢ Dá»± kiáº¿n ra mÃ³n trong 3 phÃºt")
              : `${t("Tráº¡ng thÃ¡i:")} ${t(order.status)}`}
          </span>
          <span className="orders-stepper__step-count">
            {t("BÆ°á»›c")} {stepIndex} / 4
          </span>
        </div>

        <div className="orders-stepper__track">
          {STEPPER_STEPS.map((step, i) => {
            const idx = i + 1;
            const isDone = idx < stepIndex;
            const isActive = idx === stepIndex;
            return (
              <div key={step.key} className="orders-stepper__item">
                <div
                  className={`orders-stepper__bar ${
                    isDone ? "done" : isActive ? "active" : ""
                  }`}
                />
                <div className="orders-stepper__label-group">
                  <span
                    className={`orders-stepper__label ${
                      isDone ? "done" : isActive ? "active" : ""
                    }`}
                  >
                    {t(step.label)}
                  </span>
                  {step.subKey === "time" && (
                    <span className="orders-stepper__sub">
                      {fmtTime(order.created_at)}
                    </span>
                  )}
                  {step.subKey === "status" && isActive && (
                    <span className="orders-stepper__sub">
                      {t("Äang chuáº©n bá»‹")}
                    </span>
                  )}
                  {step.subKey === "note" && !isActive && !isDone && (
                    <span className="orders-stepper__sub">
                      {step.key === "ready"
                        ? t("Chá» gá»i loa/mÃ n hÃ¬nh")
                        : t("ÄÃ£ láº¥y khay")}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="orders-live-card__body">
        <div className="orders-live-card__items">
          <h3 className="orders-live-card__items-title">
            {t("Danh sÃ¡ch mÃ³n Ä‘Ã£ gá»i")} (
            {items.length.toString().padStart(2, "0")} {t("mÃ³n")})
          </h3>

          {items.length === 0 ? (
            <p
              style={{
                fontSize: 12,
                color: "var(--text-light, #94a3b8)",
                margin: 0,
              }}
            >
              {t("ÄÆ¡n hÃ ng chÆ°a cÃ³ mÃ³n nÃ o")}
            </p>
          ) : (
            items.map((it, i) => (
              <div key={i} className="orders-live-item">
                <div className="orders-live-item__img">
                  <img
                    src={it.image || FALLBACK_IMG}
                    alt={it.name}
                    loading="lazy"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = FALLBACK_IMG;
                    }}
                  />
                </div>
                <div className="orders-live-item__info">
                  <div className="orders-live-item__row">
                    <h4 className="orders-live-item__name">{it.name}</h4>
                    <span className="orders-live-item__price">
                      {money((it.price || 0) * (it.qty || 1))}
                    </span>
                  </div>
                  <div className="orders-live-item__meta">
                    <span className="orders-live-item__qty">
                      SL: {it.qty}
                    </span>
                    {it.note && (
                      <span className="orders-live-item__note">
                        {t("Ghi chÃº:")} {it.note}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="orders-live-card__summary">
          <div className="orders-summary-row">
            <span className="orders-summary-label">{t("Tá»•ng giÃ¡ gá»‘c")}</span>
            <span className="orders-summary-value">
              {money(originalTotal)}
            </span>
          </div>

          {discount > 0 && (
            <div className="orders-summary-row orders-summary-row--discount">
              <span className="orders-summary-label">
                <Sparkles size={14} />
                {t("Trá»£ giÃ¡ SV")}
              </span>
              <span className="orders-summary-value">
                -{money(discount)}
              </span>
            </div>
          )}

          <div className="orders-summary-final">
            <div>
              <span className="orders-summary-final-label">
                {t("Thá»±c thanh toÃ¡n")}
              </span>
              <span className="orders-summary-final-sub">
                <CheckCircle2 size={13} /> {t("ÄÃ£ trá»« qua Tháº» SV (SSO)")}
              </span>
            </div>
            <span className="orders-summary-final-value">{money(total)}</span>
          </div>

          <div className="orders-live-card__actions">
            <button
              type="button"
              className="orders-action-btn"
              onClick={onView}
            >
              <Receipt size={15} />
              {t("HÃ³a Ä‘Æ¡n")}
            </button>
            <button
  type="button"
  className="orders-action-btn"
  onClick={() => {
    const orderItems = Array.isArray(order?.items) ? order.items : [];
    const itemSummary = orderItems.slice(0, 5).map((item) => {
      const name = item.name || item.food_name || item.item_name || "MÃ³n Äƒn";
      const quantity = Number(item.qty ?? item.quantity ?? 1) || 1;
      return `${name} x${quantity}`;
    }).join(", ");

    const message = [
      `Xin chÃ o nhÃ  hÃ ng, mÃ¬nh cáº§n há»— trá»£ sá»›m vá» Ä‘Æ¡n #${order?.code || order?.id || "Ä‘ang hiá»ƒn thá»‹"}.`,
      `Tráº¡ng thÃ¡i: ${order?.status || "Ä‘ang xá»­ lÃ½"}.`,
      `MÃ³n: ${itemSummary || "Vui lÃ²ng xem chi tiáº¿t Ä‘Æ¡n hÃ ng trÃªn há»‡ thá»‘ng"}.`,
      `Tá»•ng thanh toÃ¡n: ${money(total)}.`,
      "Nhá» nhÃ  hÃ ng kiá»ƒm tra Ä‘Æ¡n nÃ y vÃ  pháº£n há»“i giÃºp mÃ¬nh sá»›m nhÃ©."
    ].join(" ");

    const supportDetail = {
      requestId: `${order?.id || order?.code || "order"}-${Date.now()}`,
      message
    };
    if (typeof onOpenSupport === "function") {
      onOpenSupport(supportDetail);
    } else {
      window.dispatchEvent(new CustomEvent("canteen-open-chatbot", {
        detail: supportDetail
      }));
    }
  }}
>
  <Headset size={15} />
  {t("Há»— trá»£")}
</button>
            <button
              type="button"
              className="orders-action-btn orders-action-btn--primary"
              aria-pressed={isReminderSet}
              onClick={() => onRemindOrder?.(order)}
            >
              <Bell size={15} />
              {isReminderSet ? t("Há»§y bÃ¡o") : t("BÃ¡o tÃ´i")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SUB: OrderHistoryCard
// ============================================================

function OrderHistoryCard({ order, onView, onReorder, t }) {
  const items = order.items || [];
  const firstItem = items[0];
  const totalQty = getTotalQty(order);
  const total = Number(order.total) || 0;
  const discount = Number(order.discount) || 0;
  const originalTotal = total + discount;
  const isCancelled = order.status === "ÄÃ£ há»§y";
  const isCompleted = order.status === "HoÃ n thÃ nh";
  const relativeLabel = getRelativeDateLabel(order.created_at);

  return (
    <div className={`order-history-card ${isCancelled ? "cancelled" : ""}`}>
      <div className="order-history-card__top">
        <div className="order-history-card__top-left">
          <span className="order-history-card__code">#{order.code}</span>
          <StatusPill status={order.status} t={t} />
          <span className="order-history-card__date">
            {fmtDateTime(order.created_at)}
            {relativeLabel && (
              <span className="order-history-card__date-label">
                {t(relativeLabel)}
              </span>
            )}
          </span>
        </div>
        <span className="order-history-card__counter">
          {order.counter_name || t("Quáº§y 01 (CÆ¡m trÆ°a)")}
        </span>
      </div>

      <div className="order-history-card__body">
        <div className="order-history-card__left">
          <div className="order-history-card__img">
            <img
              src={firstItem?.image || FALLBACK_IMG}
              alt={firstItem?.name || "Order"}
              loading="lazy"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = FALLBACK_IMG;
              }}
            />
          </div>
          <div className="order-history-card__info">
            <h4
              className={`order-history-card__name ${
                isCancelled ? "strikethrough" : ""
              }`}
            >
              {getItemsSummary(order) || t("ÄÆ¡n hÃ ng trá»‘ng")}
              {items.length > 1 && (
                <span className="order-history-card__extra">
                  {" "}
                  (+{items.length - 1})
                </span>
              )}
            </h4>
            <p className="order-history-card__desc">
              {totalQty}x {t("Suáº¥t Äƒn")} â€¢{" "}
              {firstItem?.category || t("CÆ¡m")}
            </p>

            {isCompleted && order.rating && (
              <div className="order-history-card__rating">
                <Sparkles size={12} color="#f59e0b" />
                <b>{order.rating}</b>
                <span>"{order.review || t("MÃ³n ngon, giao nhanh!")}"</span>
              </div>
            )}

            {isCancelled && (
              <div className="order-history-card__refund">
                <CheckCircle2 size={13} />
                {t("ÄÃ£ hoÃ n 100% tiá»n vÃ o VÃ­ VWA Pay")}
              </div>
            )}
          </div>
        </div>

        <div className="order-history-card__right">
          <div className="order-history-card__price-group">
            {discount > 0 && (
              <span className="order-history-card__price-old">
                {money(originalTotal)}
              </span>
            )}
            <div className="order-history-card__price-row">
              <span className="order-history-card__price-now">
                {money(total)}
              </span>
              {discount > 0 && (
                <span className="order-history-card__discount">
                  -{money(discount)} {t("Trá»£ giÃ¡")}
                </span>
              )}
            </div>
            {isCancelled && (
              <span className="order-history-card__refund-note">
                {t("ÄÃ£ hoÃ n táº¥t thá»§ tá»¥c hoÃ n tiá»n")}
              </span>
            )}
          </div>

          <div className="order-history-card__actions">
            <button
              type="button"
              className="order-card-action"
              onClick={onView}
            >
              {isCancelled ? t("Lá»‹ch sá»­ hoÃ n tiá»n") : t("Xem chi tiáº¿t")}
            </button>
            {!isCancelled && (
              <button
                type="button"
                className="order-card-action order-card-action--primary"
                onClick={() => onReorder?.(order)}
              >
                <RefreshCw size={13} />
                {t("Äáº·t láº¡i mÃ³n nÃ y")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SUB: StatusPill
// ============================================================

function StatusPill({ status, t }) {
  const configs = {
    "Chá» xÃ¡c nháº­n":  { color: "#f59e0b", bg: "#fef3c7", Icon: Clock },
    "ÄÃ£ xÃ¡c nháº­n":   { color: "#2634d5", bg: "#dbeafe", Icon: CheckCircle2 },
    "Äang chuáº©n bá»‹": { color: "#8b5cf6", bg: "#ede9fe", Icon: ChefHat },
    "Sáºµn sÃ ng nháº­n": { color: "#18a967", bg: "#d1fae5", Icon: ShoppingBag },
    "HoÃ n thÃ nh":    { color: "#18a967", bg: "#d1fae5", Icon: CheckCircle2 },
    "ÄÃ£ há»§y":        { color: "#ef4444", bg: "#fee2e2", Icon: XCircle },
  };
  const cfg = configs[status] || configs["Chá» xÃ¡c nháº­n"];
  const Icon = cfg.Icon;

  return (
    <span
      className="order-history-card__status"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <Icon size={12} />
      {t(status)}
    </span>
  );
}

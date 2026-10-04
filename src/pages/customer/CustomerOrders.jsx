// ============================================================
// CUSTOMERORDERS.JSX — Đơn hàng của tôi (V2)
// ============================================================
// ✅ SOURCE-TEXT I18N
// ✅ Đủ ngày + giờ + nhãn tương đối (Hôm nay / Hôm qua / X ngày trước)
// ============================================================

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  RefreshCw, Package, Clock, CheckCircle2, XCircle, ShoppingBag,
  ChevronLeft, ChevronRight, Loader2, AlertCircle, ChefHat, Bell,
  QrCode, Receipt, Headset, Soup, Utensils, Store, X, Sparkles,
  Wallet, Leaf, Flame,
} from "lucide-react";
import { api } from "../../api";
import { money } from "../../components/UI";
import { useI18n } from "../../hooks/useI18n";
import CustomerOrderDetail from "../../components/CustomerOrderDetail";

const POLL_MS = 15000;
const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&q=70";

const ACTIVE_STATUSES = [
  "Chờ xác nhận",
  "Đã xác nhận",
  "Đang chuẩn bị",
  "Sẵn sàng nhận",
];

const TAB_MAP = {
  all: () => true,
  preparing: (s) =>
    s === "Đang chuẩn bị" || s === "Đã xác nhận" || s === "Chờ xác nhận",
  ready: (s) => s === "Sẵn sàng nhận",
  completed: (s) => s === "Hoàn thành",
  cancelled: (s) => s === "Đã hủy",
};

const STEPPER_STEPS = [
  { key: "placed", label: "Đã xác nhận & Trả tiền", subKey: "time" },
  { key: "preparing", label: "Đang chế biến", subKey: "status" },
  { key: "ready", label: "Sẵn sàng nhận", subKey: "note" },
  { key: "done", label: "Hoàn tất", subKey: "note" },
];

const STATUS_STEP_INDEX = {
  "Chờ xác nhận": 1,
  "Đã xác nhận": 1,
  "Đang chuẩn bị": 2,
  "Sẵn sàng nhận": 3,
  "Hoàn thành": 4,
  "Đã hủy": 0,
};

// ============================================================
// HELPERS — Thời gian đầy đủ ngày + giờ + nhãn tương đối
// ============================================================

function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const dd = d.getDate().toString().padStart(2, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = d.getHours().toString().padStart(2, "0");
    const mi = d.getMinutes().toString().padStart(2, "0");
    return `${dd}/${mm}/${yyyy} • ${hh}:${mi}`;
  } catch {
    return "—";
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
    if (diffDays === 0) return "Hôm nay";
    if (diffDays === 1) return "Hôm qua";
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return "";
  } catch {
    return "";
  }
}

function getOrderId(order) {
  return order?._id || order?.id || null;
}

function getPickupPin(order) {
  if (order.pickup_pin) return order.pickup_pin;
  const code = order.code || "";
  return code.slice(-2).toUpperCase() || "—";
}

function getItemsSummary(order) {
  const items = order.items || [];
  if (items.length === 0) return "";
  if (items.length === 1) return items[0].name || "";
  return `${items[0].name} + ${items.length - 1} món khác`;
}

function getTotalQty(order) {
  return (order.items || []).reduce(
    (s, it) => s + (Number(it.qty) || 0),
    0
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function CustomerOrders() {
  const { t } = useI18n();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [timeRange, setTimeRange] = useState("7days");
  const [counterFilter, setCounterFilter] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 4;

  const [selected, setSelected] = useState(null);

  const reqIdRef = useRef(0);
  const inFlightRef = useRef(false);

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

        const sorted = [...(data || [])].sort((a, b) => {
          const ta = new Date(a.created_at || 0).getTime();
          const tb = new Date(b.created_at || 0).getTime();
          return tb - ta;
        });
        setOrders(sorted);
      } catch (e) {
        if (myReqId === reqIdRef.current) {
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
    const interval = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(interval);
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
      if (o.status === "Hoàn thành") {
        completed++;
        totalSpent += Number(o.total) || 0;
        subsidy += Number(o.discount) || 0;
      }
    }

    return {
      total: orders.length,
      active,
      completed,
      totalSpent,
      subsidy,
    };
  }, [orders]);

  const liveOrder = useMemo(() => {
    return orders.find((o) => ACTIVE_STATUSES.includes(o.status)) || null;
  }, [orders]);

  const counts = useMemo(() => {
    const map = { all: orders.length };
    for (const o of orders) {
      const s = o.status;
      if (s === "Đang chuẩn bị" || s === "Đã xác nhận" || s === "Chờ xác nhận") {
        map.preparing = (map.preparing || 0) + 1;
      } else if (s === "Sẵn sàng nhận") {
        map.ready = (map.ready || 0) + 1;
      } else if (s === "Hoàn thành") {
        map.completed = (map.completed || 0) + 1;
      } else if (s === "Đã hủy") {
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

    return list;
  }, [orders, activeTab, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

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
          <button onClick={() => load(false)}>
            <RefreshCw size={12} /> {t("Thử lại")}
          </button>
        </div>
      )}

      <section className="orders-header">
        <div className="orders-header__row">
          <div className="orders-header__left">
            <h1 className="orders-title">{t("Đơn hàng của tôi")}</h1>
            <p className="orders-subtitle">
              {t("Theo dõi tiến độ chế biến thời gian thực, mã nhận món tại quầy và lịch sử đặt cơm tại hệ thống Canteen VWA.")}
            </p>
          </div>

          <div className="orders-header__right">
            <div className="orders-sync-badge">
              <span className="orders-sync-dot" />
              <span>{t("Đồng bộ: Vừa xong")}</span>
            </div>
            <button
              className="orders-refresh-btn"
              onClick={() => load(false)}
              disabled={refreshing}
              title={t("Làm mới")}
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
            <span className="orders-kpi-label">{t("ĐANG PHỤC VỤ")}</span>
            <div className="orders-kpi-value-row">
              <span className="orders-kpi-value">
                {stats.active.toString().padStart(2, "0")}
              </span>
              <span className="orders-kpi-unit">{t("đơn")}</span>
            </div>
            <span className="orders-kpi-sub">
              {liveOrder?.counter_name || t("Chưa có đơn nào")}
            </span>
          </div>
        </div>

        <div className="orders-kpi-card">
          <div className="orders-kpi-icon orders-kpi-icon--green">
            <CheckCircle2 size={24} />
          </div>
          <div className="orders-kpi-body">
            <span className="orders-kpi-label">
              {t("HOÀN THÀNH THÁNG NÀY")}
            </span>
            <div className="orders-kpi-value-row">
              <span className="orders-kpi-value">{stats.completed}</span>
              <span className="orders-kpi-unit">{t("suất ăn")}</span>
            </div>
            <span className="orders-kpi-sub orders-kpi-sub--green">
              +{Math.max(0, stats.completed - 4)} {t("đơn so với tuần trước")}
            </span>
          </div>
        </div>

        <div className="orders-kpi-card">
          <div className="orders-kpi-icon orders-kpi-icon--sky">
            <Wallet size={24} />
          </div>
          <div className="orders-kpi-body">
            <span className="orders-kpi-label">
              {t("TRỢ GIÁ SV TÍCH LŨY")}
            </span>
            <div className="orders-kpi-value-row">
              <span className="orders-kpi-value">
                {stats.subsidy.toLocaleString("vi-VN")}
              </span>
              <span className="orders-kpi-unit">đ</span>
            </div>
            <span className="orders-kpi-sub">
              {t("Hỗ trợ 10k/bữa trưa")}
            </span>
          </div>
        </div>

        <div className="orders-kpi-card">
          <div className="orders-kpi-icon orders-kpi-icon--amber">
            <Leaf size={24} />
          </div>
          <div className="orders-kpi-body">
            <span className="orders-kpi-label">{t("ĐIỂM VWA GREEN")}</span>
            <div className="orders-kpi-value-row">
              <span className="orders-kpi-value orders-kpi-value--amber">
                350
              </span>
              <span className="orders-kpi-unit orders-kpi-unit--amber">
                pts
              </span>
            </div>
            <span className="orders-kpi-sub">
              {t("Đổi 01 nước ngọt miễn phí")}
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
                {t("Đơn hàng trực tiếp đang chế biến")}
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
            t={t}
          />
        </section>
      )}

      <section className="orders-filter-section">
        <div className="orders-filter-bar">
          <div className="orders-tabs">
            {[
              { id: "all", label: t("Tất cả đơn"), count: counts.all },
              {
                id: "preparing",
                label: t("Đang chuẩn bị"),
                count: counts.preparing || 0,
              },
              {
                id: "ready",
                label: t("Chờ nhận món"),
                count: counts.ready || 0,
              },
              {
                id: "completed",
                label: t("Đã hoàn thành"),
                count: counts.completed || 0,
              },
              {
                id: "cancelled",
                label: t("Đã hủy"),
                count: counts.cancelled || 0,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                className={`orders-tab ${
                  activeTab === tab.id ? "active" : ""
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          <div className="orders-filter-controls">
            <div className="orders-search">
              <Clock size={14} className="orders-search__icon" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("Tìm theo mã đơn hoặc món...")}
                className="orders-search__input"
              />
            </div>

            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="orders-select"
            >
              <option value="today">{t("Hôm nay")}</option>
              <option value="7days">{t("7 ngày qua")}</option>
              <option value="month">{t("Tháng 02/2025")}</option>
              <option value="all">{t("Tất cả thời gian")}</option>
            </select>

            <select
              value={counterFilter}
              onChange={(e) => setCounterFilter(e.target.value)}
              className="orders-select"
            >
              <option value="all">{t("Mọi Quầy")}</option>
              <option value="com">{t("Quầy Cơm Suất")}</option>
              <option value="bun">{t("Quầy Bún / Phở")}</option>
              <option value="nuoc">{t("Quầy Trà & Cafe")}</option>
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
            {activeTab === "all"
              ? t("Bạn chưa có đơn hàng nào")
              : t("Không có đơn hàng trong mục này")}
          </h3>
          <p className="orders-empty__desc">
            {activeTab === "all"
              ? t("Hãy đặt món để bắt đầu trải nghiệm")
              : t("Thử chọn trạng thái khác hoặc xem tất cả đơn hàng.")}
          </p>
          {activeTab === "all" && (
            <Link to="/customer/menu" className="orders-empty__btn">
              <ShoppingBag size={15} /> {t("Đặt món ngay")}
            </Link>
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
                {t("Hiển thị")}{" "}
                <b>
                  {(page - 1) * PAGE_SIZE + 1} -{" "}
                  {Math.min(page * PAGE_SIZE, filtered.length)}
                </b>{" "}
                {t("trong tổng số")} <b>{filtered.length}</b>{" "}
                {t("đơn hàng đã đặt")}
              </p>

              <div className="orders-pagination__controls">
                <button
                  className="orders-page-btn"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  title={t("Trang trước")}
                >
                  <ChevronLeft size={16} />
                </button>

                {Array.from({ length: Math.min(4, totalPages) }).map((_, i) => {
                  const p = i + 1;
                  return (
                    <button
                      key={p}
                      className={`orders-page-btn ${
                        p === page ? "active" : ""
                      }`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  );
                })}

                <button
                  className="orders-page-btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  title={t("Trang tiếp")}
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
                  {t("Văn hóa lấy món văn minh tại Canteen VWA")}
                </h4>
                <p className="orders-banner__desc">
                  {t("Khi hệ thống báo")}{" "}
                  <b>"{t("Sẵn sàng nhận món")}"</b>,{" "}
                  {t("bạn hãy di chuyển đến màn hình KDS tại quầy tương ứng, xuất trình mã PIN số")}{" "}
                  <b>#{getPickupPin(liveOrder || {})}</b>{" "}
                  {t("hoặc quét mã QR để nhận khay cơm nhanh chóng, không cần chen hàng.")}
                </p>
              </div>
            </div>
            <Link to="/customer/menu" className="orders-banner__btn">
              <Receipt size={16} />
              {t("Sơ đồ quầy ăn")}
            </Link>
          </div>
        </section>
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
      `}</style>
    </div>
  );
}

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
// LiveOrderCard
// ============================================================

function LiveOrderCard({ order, onView, t }) {
  const stepIndex = STATUS_STEP_INDEX[order.status] || 1;
  const items = order.items || [];
  const total = Number(order.total) || 0;
  const discount = Number(order.discount) || 0;
  const originalTotal = total + discount;
  const pin = getPickupPin(order);

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
            {t("Đặt lúc:")} {fmtDateTime(order.created_at)}
            {getRelativeDateLabel(order.created_at) && (
              <span className="orders-live-card__time-label">
                · {getRelativeDateLabel(order.created_at)}
              </span>
            )}
          </span>
          {order.pickup_time && (
            <span className="orders-live-card__time orders-live-card__time--pickup">
              <Clock size={14} />
              {t("Nhận:")} {order.pickup_time}
            </span>
          )}
        </div>

        <div className="orders-live-card__pin-group">
          <div className="orders-live-card__pin-info">
            <span className="orders-live-card__pin-label">
              {t("Mã nhận tại quầy")}
            </span>
            <span className="orders-live-card__pin-value">#{pin}</span>
          </div>
          <button
            className="orders-live-card__qr-btn"
            onClick={onView}
            title={t("Bấm xem mã QR quầy POS")}
          >
            <QrCode size={22} />
            <span>{t("Chạm quét")}</span>
          </button>
        </div>
      </div>

      <div className="orders-stepper">
        <div className="orders-stepper__head">
          <span className="orders-stepper__status">
            <span className="orders-stepper__status-dot" />
            {order.status === "Đang chuẩn bị"
              ? t("Đầu bếp đang thực hiện • Dự kiến ra món trong 3 phút")
              : `${t("Trạng thái:")} ${order.status}`}
          </span>
          <span className="orders-stepper__step-count">
            {t("Bước")} {stepIndex} / 4
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
                    {step.label}
                  </span>
                  {step.subKey === "time" && (
                    <span className="orders-stepper__sub">
                      {fmtTime(order.created_at)}
                    </span>
                  )}
                  {step.subKey === "status" && isActive && (
                    <span className="orders-stepper__sub">
                      {t("Đang chuẩn bị")}
                    </span>
                  )}
                  {step.subKey === "note" && !isActive && !isDone && (
                    <span className="orders-stepper__sub">
                      {step.key === "ready"
                        ? t("Chờ gọi loa/màn hình")
                        : t("Đã lấy khay")}
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
            {t("Danh sách món đã gọi")} (
            {items.length.toString().padStart(2, "0")} {t("món")})
          </h3>

          {items.map((it, i) => (
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
                  <span className="orders-live-item__qty">SL: {it.qty}</span>
                  {it.note && (
                    <span className="orders-live-item__note">
                      {t("Ghi chú:")} {it.note}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="orders-live-card__summary">
          <div className="orders-summary-row">
            <span className="orders-summary-label">{t("Tổng giá gốc")}</span>
            <span className="orders-summary-value">
              {money(originalTotal)}
            </span>
          </div>

          {discount > 0 && (
            <div className="orders-summary-row orders-summary-row--discount">
              <span className="orders-summary-label">
                <Sparkles size={14} />
                {t("Trợ giá SV")}
              </span>
              <span className="orders-summary-value">-{money(discount)}</span>
            </div>
          )}

          <div className="orders-summary-final">
            <div>
              <span className="orders-summary-final-label">
                {t("Thực thanh toán")}
              </span>
              <span className="orders-summary-final-sub">
                <CheckCircle2 size={13} /> {t("Đã trừ qua Thẻ SV (SSO)")}
              </span>
            </div>
            <span className="orders-summary-final-value">{money(total)}</span>
          </div>

          <div className="orders-live-card__actions">
            <button className="orders-action-btn" onClick={onView}>
              <Receipt size={15} />
              {t("Hóa đơn")}
            </button>
            <button className="orders-action-btn">
              <Headset size={15} />
              {t("Hỗ trợ")}
            </button>
            <button className="orders-action-btn orders-action-btn--primary">
              <Bell size={15} />
              {t("Báo tôi")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// OrderHistoryCard
// ============================================================

function OrderHistoryCard({ order, onView, t }) {
  const items = order.items || [];
  const firstItem = items[0];
  const totalQty = getTotalQty(order);
  const total = Number(order.total) || 0;
  const discount = Number(order.discount) || 0;
  const originalTotal = total + discount;
  const isCancelled = order.status === "Đã hủy";
  const isCompleted = order.status === "Hoàn thành";

  return (
    <div className={`order-history-card ${isCancelled ? "cancelled" : ""}`}>
      <div className="order-history-card__top">
        <div className="order-history-card__top-left">
          <span className="order-history-card__code">#{order.code}</span>
          <StatusPill status={order.status} />
          <span className="order-history-card__date">
            {fmtDateTime(order.created_at)}
            {getRelativeDateLabel(order.created_at) && (
              <span className="order-history-card__date-label">
                {getRelativeDateLabel(order.created_at)}
              </span>
            )}
          </span>
        </div>
        <span className="order-history-card__counter">
          {order.counter_name || t("Quầy 01 (Cơm trưa)")}
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
              {getItemsSummary(order)}
              {items.length > 1 && (
                <span className="order-history-card__extra">
                  {" "}
                  (+{items.length - 1})
                </span>
              )}
            </h4>
            <p className="order-history-card__desc">
              {totalQty}x {t("Suất ăn")} • {firstItem?.category || t("Cơm")}
            </p>

            {isCompleted && order.rating && (
              <div className="order-history-card__rating">
                <Sparkles size={12} color="#f59e0b" />
                <b>{order.rating}</b>
                <span>"{order.review || t("Món ngon, giao nhanh!")}"</span>
              </div>
            )}

            {isCancelled && (
              <div className="order-history-card__refund">
                <CheckCircle2 size={13} />
                {t("Đã hoàn 100% tiền vào Ví VWA Pay")}
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
                  -{money(discount)} {t("Trợ giá")}
                </span>
              )}
            </div>
            {isCancelled && (
              <span className="order-history-card__refund-note">
                {t("Đã hoàn tất thủ tục hoàn tiền")}
              </span>
            )}
          </div>

          <div className="order-history-card__actions">
            <button className="order-card-action" onClick={onView}>
              {isCancelled ? t("Lịch sử hoàn tiền") : t("Xem chi tiết")}
            </button>
            {!isCancelled && (
              <button className="order-card-action order-card-action--primary">
                <RefreshCw size={13} />
                {t("Đặt lại món này")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const configs = {
    "Chờ xác nhận": { color: "#f59e0b", bg: "#fef3c7", Icon: Clock },
    "Đã xác nhận": { color: "#2634d5", bg: "#dbeafe", Icon: CheckCircle2 },
    "Đang chuẩn bị": { color: "#8b5cf6", bg: "#ede9fe", Icon: ChefHat },
    "Sẵn sàng nhận": { color: "#18a967", bg: "#d1fae5", Icon: ShoppingBag },
    "Hoàn thành": { color: "#18a967", bg: "#d1fae5", Icon: CheckCircle2 },
    "Đã hủy": { color: "#ef4444", bg: "#fee2e2", Icon: XCircle },
  };
  const cfg = configs[status] || configs["Chờ xác nhận"];
  const Icon = cfg.Icon;

  return (
    <span
      className="order-history-card__status"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <Icon size={12} />
      {status}
    </span>
  );
}
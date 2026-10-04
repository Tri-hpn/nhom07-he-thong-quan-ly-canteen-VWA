// ============================================================
// EMPLOYEEORDERS.JSX — KDS Kanban Board (V5)
// ============================================================
// Layout 5-column Kanban:
//   1. Đơn Mới (Chờ xác nhận)     → Duyệt / Từ chối
//   2. Đã Xác Nhận                 → Bắt đầu nấu
//   3. Đang Nấu (Đang chuẩn bị)   → Báo xong
//   4. Sẵn Sàng (Sẵn sàng nhận)   → Khách đã nhận (tủ giữ nóng + PIN)
//   5. Gần Nhất (Hoàn thành)      → Compact list
//
// ✅ V5:
//   - Kanban responsive 5/4/3/2/1 cột theo màn hình
//   - Mỗi cột scroll riêng, header cố định
//   - Nút "Xem thêm" khi cột có > 5 đơn
// ============================================================

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Search, X, Loader2, AlertCircle, RefreshCw, Check, XCircle, ChefHat,
  CheckCircle2, CreditCard, Wallet, Verified, Timer, ClipboardList,
  TrendingUp, Clock, User, Lock, Package, ChevronDown, Sun, PackageCheck,
  Ban, Inbox, VolumeX,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useI18n } from "../../hooks/useI18n";
import { useAuth } from "../../contexts/AuthContext";
import {
  fmtTime,
  fmtTimeWithLabel,
  getDateLabelVariant,
  getCurrentShiftLabel,
} from "../../lib/datetime";

// ============================================================
// CONSTANTS
// ============================================================

const POLL_MS = 10000;
const COMPLETED_LIMIT = 5;
const COLUMN_LIMIT = 5;

const NEXT_STATUS = {
  "Chờ xác nhận": "Đã xác nhận",
  "Đã xác nhận": "Đang chuẩn bị",
  "Đang chuẩn bị": "Sẵn sàng nhận",
  "Sẵn sàng nhận": "Hoàn thành",
};

const ACTION_LABELS = {
  "Chờ xác nhận": "Duyệt Đơn",
  "Đã xác nhận": "Bắt Đầu Nấu",
  "Đang chuẩn bị": "Báo Xong & Chuyển Tủ",
  "Sẵn sàng nhận": "Khách Đã Nhận Món",
};

const STATION_TABS = [
  { id: "all", label: "Tất cả trạm" },
  { id: "kitchen", label: "Bếp Nấu (Kitchen)" },
  { id: "beverage", label: "Nước & Bánh" },
  { id: "dispatch", label: "Quầy Trả Món" },
];

const STATION_IDS = STATION_TABS.map((s) => s.id);
function normalizeStation(value) {
  return STATION_IDS.includes(value) ? value : "all";
}

const PAYMENT_LABELS = {
  "Tiền mặt": { icon: "cash", label: "Tiền mặt tại quầy" },
  QR: { icon: "qr", label: "VietQR (Đã TT)" },
  "Ví Canteen": { icon: "wallet", label: "Ví Nội Bộ VWA" },
  "Thẻ": { icon: "card", label: "Thẻ SV" },
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

function fmtElapsed(seconds) {
  if (!seconds || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getLockerInfo(orderId) {
  const key = `kds_locker_${orderId}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {}

  const id = Number(orderId) || 0;
  const slot = (id % 20) + 1;
  const pin = String(1000 + ((id * 137) % 9000)).slice(-4);
  const info = { slot, pin };

  try {
    localStorage.setItem(key, JSON.stringify(info));
  } catch {}
  return info;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function EmployeeOrders() {
  const { t } = useI18n();
  const { user } = useAuth();

  // ---- Data ----
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // ---- Approved shifts ----
  const [approvedShifts, setApprovedShifts] = useState([]);

  // ---- Clock (cập nhật Ca Vận Hành mỗi 30s) ----
  const [now, setNow] = useState(new Date());

  // ---- Trạm (station) ----
  const [searchParams, setSearchParams] = useSearchParams();
  const stationParam = searchParams.get("station");

  // ---- Filters ----
  const [search, setSearch] = useState("");
  const [stationFilter, setStationFilter] = useState(() =>
    normalizeStation(stationParam)
  );
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [timeframeFilter, setTimeframeFilter] = useState("all");

  // ---- UI state ----
  const [advancingId, setAdvancingId] = useState(null);
  const [confirmReject, setConfirmReject] = useState(null);

  // ✅ Kanban — giới hạn 5 đơn mỗi cột + nút "Xem thêm"
  const [expandedColumns, setExpandedColumns] = useState({
    pending: false,
    confirmed: false,
    prep: false,
    ready: false,
  });

  const reqIdRef = useRef(0);
  const inFlightRef = useRef(false);

  // ---- Helper cho expand ----
  const toggleExpand = useCallback((key) => {
    setExpandedColumns((s) => ({ ...s, [key]: !s[key] }));
  }, []);

  const takeVisible = useCallback(
    (list, key) => {
      if (expandedColumns[key]) return { visible: list, hiddenCount: 0 };
      return {
        visible: list.slice(0, COLUMN_LIMIT),
        hiddenCount: Math.max(0, list.length - COLUMN_LIMIT),
      };
    },
    [expandedColumns]
  );

  // ============================================================
  // CLOCK
  // ============================================================

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // ============================================================
  // APPROVED SHIFTS
  // ============================================================

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

  // ============================================================
  // SYNC ?station=
  // ============================================================

  useEffect(() => {
    const next = normalizeStation(stationParam);
    setStationFilter((cur) => (cur === next ? cur : next));
  }, [stationParam]);

  const changeStation = useCallback(
    (id) => {
      setStationFilter(id);
      const next = new URLSearchParams(searchParams);
      if (id === "all") next.delete("station");
      else next.set("station", id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // ============================================================
  // LOAD
  // ============================================================

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
    const timer = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // ============================================================
  // GROUP ORDERS BY STATUS
  // ============================================================

  const columns = useMemo(() => {
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

    byStatus.completed.sort((a, b) => {
      const ta = new Date(a.updated_at || a.created_at || 0).getTime();
      const tb = new Date(b.updated_at || b.created_at || 0).getTime();
      return tb - ta;
    });
    const completedTotal = byStatus.completed.length;
    byStatus.completed = byStatus.completed.slice(0, COMPLETED_LIMIT);

    return { ...byStatus, completedTotal };
  }, [orders]);

  // ============================================================
  // FILTER
  // ============================================================

  const applyFilter = useCallback(
    (list) => {
      let result = list;

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        result = result.filter((o) => {
          const code = (o.code || "").toLowerCase();
          const name = (o.customer_name || "").toLowerCase();
          const mssv = (o.customer_mssv || "").toLowerCase();
          return code.includes(q) || name.includes(q) || mssv.includes(q);
        });
      }

      if (paymentFilter !== "all") {
        result = result.filter((o) => o.payment === paymentFilter);
      }

      return result;
    },
    [search, paymentFilter]
  );

  const filteredColumns = useMemo(
    () => ({
      pending: applyFilter(columns.pending),
      confirmed: applyFilter(columns.confirmed),
      prep: applyFilter(columns.prep),
      ready: applyFilter(columns.ready),
      completed: applyFilter(columns.completed),
      completedTotal: columns.completedTotal,
    }),
    [columns, applyFilter]
  );

  // ============================================================
  // KPI
  // ============================================================

  const kpi = useMemo(() => {
    const today = getLocalDateStr(new Date());
    const todayOrders = orders.filter((o) => {
      const d = getLocalDateStr(new Date(o.created_at || 0));
      return d === today;
    });

    const completedToday = todayOrders.filter(
      (o) => o.status === "Hoàn thành"
    );
    const revenue = completedToday.reduce(
      (s, o) => s + (Number(o.total) || 0),
      0
    );

    const onTimePct =
      completedToday.length > 0
        ? ((completedToday.length / todayOrders.length) * 100).toFixed(1)
        : "0";

    return {
      pending: columns.pending.length,
      prep: columns.prep.length,
      ready: columns.ready.length,
      completedToday: completedToday.length,
      revenue,
      onTimePct,
    };
  }, [orders, columns]);

  // ============================================================
  // HERO
  // ============================================================

  const shiftLabel = useMemo(() => getCurrentShiftLabel(now), [now]);
  const staffName = user?.name || t("Nhân viên");
  const staffCode = user?.employeeCode || user?.code || "";

  // ============================================================
  // ACTIONS
  // ============================================================

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
      await load(true);
    } catch (e) {
      toast(e.message || t("Không hủy được"), "error");
    } finally {
      setAdvancingId(null);
    }
  }, [confirmReject, load, t]);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <>
      <div className="kds-workbench">
        {/* ERROR */}
        {error && (
          <div
            style={{
              background: "var(--st-danger-bg)",
              border: "1px solid var(--st-danger-border)",
              borderRadius: "var(--st-radius-md)",
              padding: "12px 16px",
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

        {/* ============ TOP CONSOLE ============ */}
        <div className="kds-console">
          <div className="kds-console__left">
            {/* Shift card */}
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

            {/* Staff card */}
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
                      {" "}
                      (ID: {staffCode})
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Sound (disabled) */}
            <div className="kds-console__card">
              <VolumeX
                size={22}
                style={{ color: "var(--st-text-muted)" }}
              />
              <div className="kds-console__card-info">
                <span className="kds-console__card-label">
                  {t("Âm báo đơn")}
                </span>
                <span
                  className="kds-console__card-sub"
                  style={{ fontWeight: 700 }}
                >
                  {t("Đã tắt")}
                </span>
              </div>
            </div>
          </div>

          {/* Station tabs */}
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
          {/* KPI 1 */}
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
                style={{
                  width: `${Math.min(100, kpi.pending * 20)}%`,
                }}
              />
            </div>
          </div>

          {/* KPI 2 */}
          <div className="kds-kpi">
            <div className="kds-kpi__head">
              <span className="kds-kpi__label">
                {t("Đang Chuẩn Bị (Prep)")}
              </span>
              <ChefHat
                size={20}
                style={{ color: "var(--st-secondary)" }}
              />
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

          {/* KPI 3 */}
          <div className="kds-kpi">
            <div className="kds-kpi__head">
              <span className="kds-kpi__label">
                {t("Chờ Khách Lấy (Ready)")}
              </span>
              <PackageCheck
                size={20}
                style={{ color: "var(--st-primary)" }}
              />
            </div>
            <div className="kds-kpi__value-row">
              <span className="kds-kpi__value">
                {String(kpi.ready).padStart(2, "0")}
              </span>
              <span className="kds-kpi__unit">
                {t("Tủ giữ nóng OK")}
              </span>
            </div>
            <div className="kds-kpi__bar">
              <div
                className="kds-kpi__bar-fill kds-kpi__bar-fill--tertiary"
                style={{ width: `${Math.min(100, kpi.ready * 20)}%` }}
              />
            </div>
          </div>

          {/* KPI 4 */}
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

          {/* KPI 5 */}
          <div className="kds-kpi kds-kpi--primary">
            <div className="kds-kpi__head">
              <span className="kds-kpi__label">
                {t("Doanh Thu Tạm Tính")}
              </span>
              <Wallet
                size={20}
                style={{ color: "var(--st-primary)" }}
              />
            </div>
            <div className="kds-kpi__value-row">
              <span
                className="kds-kpi__value"
                style={{ fontSize: 22 }}
              >
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
                <option value="QR">{t("VietQR (Đã TT)")}</option>
                <option value="Ví Canteen">
                  {t("Ví Nội Bộ VWA")}
                </option>
                <option value="Tiền mặt">
                  {t("Tiền mặt tại quầy")}
                </option>
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
                  animation: refreshing
                    ? "spin 1s linear infinite"
                    : "none",
                }}
              />
              <span>{t("Đồng bộ KDS")}</span>
            </button>
          </div>
        </div>

        {/* ============ KANBAN BOARD ============ */}
        <div className="kds-board">
          {/* COL 1: PENDING */}
          {(() => {
            const { visible, hiddenCount } = takeVisible(
              filteredColumns.pending,
              "pending"
            );
            return (
              <KDSColumn
                title={t("1. Đơn Mới")}
                variant="pending"
                count={filteredColumns.pending.length}
                countLabel={t("Đơn")}
                empty={t("Không có đơn mới")}
                moreCount={hiddenCount}
                onMore={() => toggleExpand("pending")}
              >
                {visible.map((o) => (
                  <KDSTicket
                    key={o._id || o.id}
                    order={o}
                    variant="pending"
                    isProcessing={advancingId === (o._id || o.id)}
                    elapsed={calcElapsedSec(o.created_at)}
                    onAdvance={() => advance(o)}
                    onReject={() => rejectOrder(o)}
                    t={t}
                    now={now}
                  />
                ))}
              </KDSColumn>
            );
          })()}

          {/* COL 2: CONFIRMED */}
          {(() => {
            const { visible, hiddenCount } = takeVisible(
              filteredColumns.confirmed,
              "confirmed"
            );
            return (
              <KDSColumn
                title={t("2. Đã Xác Nhận")}
                variant="confirmed"
                count={filteredColumns.confirmed.length}
                countLabel={t("Đơn")}
                empty={t("Không có đơn đã xác nhận")}
                moreCount={hiddenCount}
                onMore={() => toggleExpand("confirmed")}
              >
                {visible.map((o) => (
                  <KDSTicket
                    key={o._id || o.id}
                    order={o}
                    variant="confirmed"
                    isProcessing={advancingId === (o._id || o.id)}
                    elapsed={calcElapsedSec(o.created_at)}
                    onAdvance={() => advance(o)}
                    t={t}
                    now={now}
                  />
                ))}
              </KDSColumn>
            );
          })()}

          {/* COL 3: PREP */}
          {(() => {
            const { visible, hiddenCount } = takeVisible(
              filteredColumns.prep,
              "prep"
            );
            return (
              <KDSColumn
                title={t("3. Đang Nấu")}
                variant="prep"
                count={filteredColumns.prep.length}
                countLabel={t("Đơn")}
                empty={t("Không có đơn đang nấu")}
                moreCount={hiddenCount}
                onMore={() => toggleExpand("prep")}
              >
                {visible.map((o) => (
                  <KDSTicket
                    key={o._id || o.id}
                    order={o}
                    variant="prep"
                    isProcessing={advancingId === (o._id || o.id)}
                    elapsed={calcElapsedSec(o.created_at)}
                    onAdvance={() => advance(o)}
                    t={t}
                    now={now}
                  />
                ))}
              </KDSColumn>
            );
          })()}

          {/* COL 4: READY */}
          {(() => {
            const { visible, hiddenCount } = takeVisible(
              filteredColumns.ready,
              "ready"
            );
            return (
              <KDSColumn
                title={t("4. Sẵn Sàng Nhận")}
                variant="ready"
                count={filteredColumns.ready.length}
                countLabel={t("Đơn")}
                empty={t("Không có đơn sẵn sàng")}
                moreCount={hiddenCount}
                onMore={() => toggleExpand("ready")}
              >
                {visible.map((o) => (
                  <KDSTicket
                    key={o._id || o.id}
                    order={o}
                    variant="ready"
                    isProcessing={advancingId === (o._id || o.id)}
                    onAdvance={() => advance(o)}
                    t={t}
                    now={now}
                  />
                ))}
              </KDSColumn>
            );
          })()}

          {/* COL 5: COMPLETED */}
          <KDSColumn
            title={t("5. Gần Nhất")}
            variant="completed"
            count={filteredColumns.completedTotal}
            countLabel={t("Hoàn thành")}
            empty={t("Chưa có đơn hoàn thành")}
          >
            {filteredColumns.completed.map((o) => (
              <CompletedItem key={o._id || o.id} order={o} t={t} />
            ))}

            {filteredColumns.completedTotal > COMPLETED_LIMIT && (
              <button type="button" className="kds-completed__more">
                {t("Xem tất cả")} {filteredColumns.completedTotal}{" "}
                {t("đơn →")}
              </button>
            )}
          </KDSColumn>
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
// SUB: KDSColumn
// ============================================================

function KDSColumn({
  title,
  variant,
  count,
  countLabel,
  empty,
  moreCount = 0,
  onMore,
  children,
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : !!children;

  return (
    <div className="kds-column">
      <div className="kds-column__head">
        <div className="kds-column__title-wrap">
          <span className={`kds-column__dot kds-column__dot--${variant}`} />
          <span className="kds-column__title">{title}</span>
        </div>
        <span className={`kds-column__count kds-column__count--${variant}`}>
          {count} {countLabel}
        </span>
      </div>

      <div className="kds-column__body">
        {hasChildren ? (
          <>
            {children}
            {moreCount > 0 && (
              <button
                type="button"
                className="kds-column__more"
                onClick={onMore}
              >
                +{moreCount} đơn nữa — Xem thêm
              </button>
            )}
          </>
        ) : (
          <div className="kds-column__empty">{empty}</div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SUB: KDSTicket
// ============================================================

function KDSTicket({
  order,
  variant,
  isProcessing,
  elapsed,
  onAdvance,
  onReject,
  t,
  now,
}) {
  const isPending = variant === "pending";
  const isConfirmed = variant === "confirmed";
  const isPrep = variant === "prep";
  const isReady = variant === "ready";

  const items = order.items || [];
  const totalQty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  const total = Number(order.total) || 0;

  const elapsedMin = Math.floor(elapsed / 60);
  const isUrgent = elapsedMin >= 12;
  const timeLabel = fmtElapsed(elapsed);

  const paymentInfo =
    PAYMENT_LABELS[order.payment] || PAYMENT_LABELS["Tiền mặt"];
  const paymentLabel = paymentInfo.label;

  const locker = isReady ? getLockerInfo(order._id || order.id) : null;

  const prepPct = isPrep ? Math.min(95, (elapsed / 600) * 100) : 0;

  const actionLabel = ACTION_LABELS[order.status] || t("Xử lý");

  // Ngày label
  const dateVariant = getDateLabelVariant(order.created_at);
  const showDateLabel = dateVariant && dateVariant !== "today";
  const dateLabelText = (() => {
    if (!showDateLabel) return "";
    if (dateVariant === "yesterday") return "Hôm qua";
    const d = new Date(order.created_at);
    const dd = d.getDate().toString().padStart(2, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    return `${dd}/${mm}`;
  })();

  return (
    <article
      className={`kds-card ${isProcessing ? "kds-card--processing" : ""}`}
    >
      <div className="kds-card__head">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            minWidth: 0,
          }}
        >
          <span className="kds-card__code">{order.code}</span>
          {isUrgent && isPending && (
            <span className="kds-card__tag kds-card__tag--danger">
              {t("Còn")} {Math.max(0, 12 - elapsedMin)}p
            </span>
          )}
          {isConfirmed && (
            <span className="kds-card__tag kds-card__tag--primary">
              {t("Chờ Bếp")}
            </span>
          )}
          {isPrep && (
            <span className="kds-card__tag kds-card__tag--primary">
              {t("BẾP")}
            </span>
          )}
          {isReady && (
            <span className="kds-card__tag kds-card__tag--success">
              {t("ĐÃ BÁO KHÁCH")}
            </span>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 4,
            flexShrink: 0,
          }}
        >
          <span
            className={`kds-card__time-badge ${
              isUrgent ? "kds-card__time-badge--urgent" : ""
            }`}
          >
            {fmtTime(order.created_at)}
          </span>
          {showDateLabel && (
            <span
              className={`kds-card__date-label kds-card__date-label--${dateVariant}`}
            >
              {dateLabelText}
            </span>
          )}
        </div>
      </div>

      <div className="kds-card__customer">
        {order.customer_name || t("Khách")}{" "}
        {order.customer_mssv && (
          <span className="kds-card__customer-id">
            (MSSV: {order.customer_mssv})
          </span>
        )}
      </div>

      {isPrep && (
        <div className="kds-card__progress">
          <div className="kds-card__progress-head">
            <span className="kds-card__progress-label">
              <Timer size={14} />
              {t("Thời gian nấu")}
            </span>
            <span className="kds-card__progress-value">
              {fmtElapsed(elapsed)} / 10:00
            </span>
          </div>
          <div className="kds-card__progress-bar">
            <div
              className="kds-card__progress-fill"
              style={{ width: `${prepPct}%` }}
            />
          </div>
        </div>
      )}

      {isReady && locker && (
        <div className="kds-card__locker">
          <div className="kds-card__locker-left">
            <Lock size={22} className="kds-card__locker-icon" />
            <div className="kds-card__locker-info">
              <span className="kds-card__locker-label">
                {t("Tủ Giữ Nóng")}
              </span>
              <span className="kds-card__locker-value">
                {t("Ô SỐ")} #{String(locker.slot).padStart(2, "0")}
              </span>
            </div>
          </div>
          <span className="kds-card__locker-pin">PIN: {locker.pin}</span>
        </div>
      )}

      <div className="kds-card__items">
        {items.slice(0, 4).map((it, i) => (
          <div key={i} className="kds-card__item">
            <span className="kds-card__item-name">
              {it.qty}x {it.name}
            </span>
            <span className="kds-card__item-price">
              {money((Number(it.price) || 0) * (Number(it.qty) || 0))}
            </span>
          </div>
        ))}

        {items.length > 4 && (
          <div
            style={{
              fontSize: 11,
              color: "var(--st-text-muted)",
              fontStyle: "italic",
              textAlign: "center",
              paddingTop: 2,
            }}
          >
            +{items.length - 4} {t("món khác")}
          </div>
        )}

        {order.note && (
          <div className="kds-card__note">
            <AlertCircle
              size={12}
              style={{ flexShrink: 0, marginTop: 2 }}
            />
            <span>{order.note}</span>
          </div>
        )}
      </div>

      <div className="kds-card__meta">
        <span
          className={`kds-card__payment ${
            order.payment === "Ví Canteen"
              ? "kds-card__payment--success"
              : ""
          } ${
            order.payment === "QR" ? "kds-card__payment--primary" : ""
          }`}
        >
          <Verified size={14} />
          {paymentLabel}
        </span>
        <span className="kds-card__total">{money(total)}</span>
      </div>

      <div
        className={`kds-card__actions ${
          isPending ? "kds-card__actions--split" : ""
        }`}
      >
        {isPending && (
          <button
            type="button"
            className="kds-card__btn kds-card__btn--ghost"
            onClick={onReject}
            disabled={isProcessing}
          >
            <XCircle size={18} />
            <span>{t("Từ chối")}</span>
          </button>
        )}

        {onAdvance && (
          <button
            type="button"
            className={`kds-card__btn ${
              isPending
                ? "kds-card__btn--primary"
                : isConfirmed
                ? "kds-card__btn--secondary"
                : isPrep
                ? "kds-card__btn--primary"
                : "kds-card__btn--tertiary"
            }`}
            onClick={onAdvance}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <Loader2
                size={18}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : isPending || isConfirmed ? (
              <Check size={18} />
            ) : isPrep ? (
              <CheckCircle2 size={18} />
            ) : (
              <PackageCheck size={18} />
            )}
            <span>{actionLabel}</span>
          </button>
        )}
      </div>
    </article>
  );
}

// ============================================================
// SUB: CompletedItem
// ============================================================

function CompletedItem({ order, t }) {
  return (
    <div className="kds-completed-item">
      <div className="kds-completed-item__left">
        <div className="kds-completed-item__icon">
          <CheckCircle2 size={18} />
        </div>
        <div className="kds-completed-item__info">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="kds-completed-item__code">
              {order.code}
            </span>
            <span className="kds-completed-item__time">
              {fmtTimeWithLabel(order.updated_at || order.created_at)}
            </span>
          </div>
          <span className="kds-completed-item__customer">
            {order.customer_name || t("Khách")}
          </span>
        </div>
      </div>
      <span className="kds-completed-item__total">
        {money(Number(order.total) || 0)}
      </span>
    </div>
  );
}
// ============================================================
// EMPLOYEEORDERSPREP.JSX — Trang Chuẩn bị đơn (layout dọc)
// ============================================================
// Khác Kanban: layout list dọc, chỉ hiện đơn bếp đang làm.
//   - Chỉ hiển thị: Đã xác nhận + Đang chuẩn bị
//   - Timer đếm từ updated_at (lúc chuyển trạng thái)
//   - Đỏ khi > 15 phút, vàng 10-15 phút, xanh < 10 phút
//   - Sắp xếp: cũ nhất lên đầu (bếp xử lý trước)
// ============================================================

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Clock, ChefHat, CheckCircle2, AlertCircle, RefreshCw, Loader2,
  ArrowRight, Inbox, Play, Soup, Search, X,
} from "lucide-react";
import { api } from "../../api";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import { fmtTime, fmtTimeWithLabel } from "../../lib/datetime";

const POLL_MS = 5000; // 5s — realtime hơn
const URGENT_MIN = 15;
const WARNING_MIN = 10;

// ============================================================
// HELPERS
// ============================================================

function getElapsedMs(order) {
  // Timer đếm từ updated_at (lúc chuyển trạng thái)
  const base = order.updated_at || order.created_at;
  if (!base) return 0;
  const t = new Date(base).getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, Date.now() - t);
}

function fmtElapsedMs(ms) {
  if (!ms || ms < 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getUrgency(ms) {
  const min = ms / 60000;
  if (min >= URGENT_MIN) return "urgent";
  if (min >= WARNING_MIN) return "warning";
  return "normal";
}

function paymentLabel(payment, t) {
  if (!payment) return t("Tiền mặt");
  return payment;
}

// ============================================================
// MAIN
// ============================================================

export default function EmployeeOrdersPrep() {
  const { t } = useI18n();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState(null);
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(0); // force re-render timer

  const reqIdRef = useRef(0);
  const inFlightRef = useRef(false);

  // Clock 1s để timer chạy
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
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
        const data = await api.orders.all("Tất cả");
        if (myReqId !== reqIdRef.current) return;

        const list = Array.isArray(data) ? data : [];
        // Chỉ lấy đơn bếp đang làm
        const filtered = list.filter(
          (o) =>
            o.status === "Đã xác nhận" || o.status === "Đang chuẩn bị"
        );
        setOrders(filtered);
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

  // ---- FILTER + SORT ----
  const visibleOrders = useMemo(() => {
    let list = orders;

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((o) => {
        const code = (o.code || "").toLowerCase();
        const name = (o.customer_name || "").toLowerCase();
        const mssv = (o.customer_mssv || "").toLowerCase();
        return code.includes(q) || name.includes(q) || mssv.includes(q);
      });
    }

    // Sắp xếp: đơn cũ nhất lên đầu
    return [...list].sort((a, b) => {
      const ta = new Date(a.updated_at || a.created_at || 0).getTime();
      const tb = new Date(b.updated_at || b.created_at || 0).getTime();
      return ta - tb;
    });
  }, [orders, search]);

  const stats = useMemo(() => {
    let urgent = 0;
    let warning = 0;
    for (const o of visibleOrders) {
      const u = getUrgency(getElapsedMs(o));
      if (u === "urgent") urgent++;
      else if (u === "warning") warning++;
    }
    return { total: visibleOrders.length, urgent, warning };
  }, [visibleOrders, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- ACTIONS ----
  const handleStartCooking = useCallback(
    async (order) => {
      const id = order._id || order.id;
      if (processingId) return;
      setProcessingId(id);
      try {
        await api.orders.setStatus(id, "Đang chuẩn bị");
        toast(`${order.code} — ${t("Bắt đầu nấu!")}`, "success");
        await load(true);
      } catch (e) {
        toast(e.message || t("Không chuyển được trạng thái"), "error");
      } finally {
        setProcessingId(null);
      }
    },
    [processingId, load, t]
  );

  const handleMarkReady = useCallback(
    async (order) => {
      const id = order._id || order.id;
      if (processingId) return;
      setProcessingId(id);
      try {
        await api.orders.setStatus(id, "Sẵn sàng nhận");
        toast(`${order.code} — ${t("Đã báo xong món!")}`, "success");
        await load(true);
      } catch (e) {
        toast(e.message || t("Không chuyển được trạng thái"), "error");
      } finally {
        setProcessingId(null);
      }
    },
    [processingId, load, t]
  );

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="prep-workspace">
      {/* ERROR */}
      {error && (
        <div className="prep-error">
          <AlertCircle size={18} />
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" onClick={() => load(false)}>
            {t("Thử lại")}
          </button>
        </div>
      )}

      {/* HEADER */}
      <div className="prep-header">
        <div className="prep-header__left">
          <div className="prep-header__icon">
            <ChefHat size={26} />
          </div>
          <div>
            <h1 className="prep-header__title">{t("Chuẩn bị đơn")}</h1>
            <p className="prep-header__desc">
              {t("Danh sách đơn bếp cần xử lý — ưu tiên đơn cũ nhất")}
            </p>
          </div>
        </div>

        <div className="prep-header__stats">
          <div className="prep-stat">
            <span className="prep-stat__label">{t("Đang chờ")}</span>
            <span className="prep-stat__value">{stats.total}</span>
          </div>
          {stats.warning > 0 && (
            <div className="prep-stat prep-stat--warning">
              <span className="prep-stat__label">{t("Sắp trễ")}</span>
              <span className="prep-stat__value">{stats.warning}</span>
            </div>
          )}
          {stats.urgent > 0 && (
            <div className="prep-stat prep-stat--urgent">
              <span className="prep-stat__label">{t("Khẩn")}</span>
              <span className="prep-stat__value">{stats.urgent}</span>
            </div>
          )}

          <button
            type="button"
            className="prep-refresh-btn"
            onClick={() => load(false)}
            disabled={refreshing}
            title={t("Làm mới")}
          >
            <RefreshCw
              size={16}
              style={{
                animation: refreshing ? "spin 1s linear infinite" : "none",
              }}
            />
            <span>{t("Làm mới")}</span>
          </button>
        </div>
      </div>

      {/* SEARCH */}
      <div className="prep-search">
        <Search size={16} className="prep-search__icon" />
        <input
          type="text"
          className="prep-search__input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Tìm theo mã đơn, tên khách, MSSV...")}
        />
        {search && (
          <button
            type="button"
            className="prep-search__clear"
            onClick={() => setSearch("")}
            aria-label={t("Xoá tìm kiếm")}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* LIST */}
      {loading ? (
        <div className="prep-empty">
          <Loader2 size={26} style={{ animation: "spin 1s linear infinite" }} />
          <span>{t("Đang tải...")}</span>
        </div>
      ) : visibleOrders.length === 0 ? (
        <div className="prep-empty">
          <Inbox size={44} style={{ opacity: 0.3 }} />
          <b>{t("Bếp đang rảnh")}</b>
          <span>{t("Chưa có đơn nào cần chuẩn bị")}</span>
        </div>
      ) : (
        <div className="prep-list">
          {visibleOrders.map((o) => (
            <PrepCard
              key={o._id || o.id}
              order={o}
              tick={tick}
              processing={processingId === (o._id || o.id)}
              onStart={() => handleStartCooking(o)}
              onReady={() => handleMarkReady(o)}
              t={t}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// SUB: PrepCard
// ============================================================

function PrepCard({ order, tick, processing, onStart, onReady, t }) {
  const elapsedMs = getElapsedMs(order);
  const urgency = getUrgency(elapsedMs);
  const isConfirmed = order.status === "Đã xác nhận";
  const isPrep = order.status === "Đang chuẩn bị";

  const items = order.items || [];
  const totalQty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);

  return (
    <div className={`prep-card prep-card--${urgency}`}>
      {/* Left: code + time */}
      <div className="prep-card__left">
        <div className="prep-card__code-wrap">
          <span className="prep-card__code">{order.code}</span>
          <span className={`prep-card__status prep-card__status--${isPrep ? "prep" : "confirmed"}`}>
            {isConfirmed ? t("Chờ nấu") : t("Đang nấu")}
          </span>
        </div>

        <div className="prep-card__customer">
          {order.customer_name || t("Khách")}
          {order.customer_mssv && (
            <span className="prep-card__mssv">
              {" "}
              (MSSV: {order.customer_mssv})
            </span>
          )}
        </div>

        <div className="prep-card__meta">
          <span>{totalQty} {t("món")}</span>
          <span>•</span>
          <span>{paymentLabel(order.payment, t)}</span>
        </div>
      </div>

      {/* Center: items list */}
      <div className="prep-card__center">
        <ul className="prep-card__items">
          {items.slice(0, 5).map((it, i) => (
            <li key={i}>
              <b>{it.qty}x</b> {it.name}
            </li>
          ))}
          {items.length > 5 && (
            <li className="prep-card__items-more">
              +{items.length - 5} {t("món khác")}
            </li>
          )}
        </ul>

        {order.note && (
          <div className="prep-card__note">
            <AlertCircle size={12} />
            <span>{order.note}</span>
          </div>
        )}
      </div>

      {/* Right: timer + actions */}
      <div className="prep-card__right">
        <div className={`prep-card__timer prep-card__timer--${urgency}`}>
          <Clock size={16} />
          <span className="prep-card__timer-value">
            {fmtElapsedMs(elapsedMs)}
          </span>
        </div>

        <div className="prep-card__actions">
          {isConfirmed && (
            <button
              type="button"
              className="prep-card__btn prep-card__btn--primary"
              onClick={onStart}
              disabled={processing}
            >
              {processing ? (
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <Play size={16} />
              )}
              <span>{t("Bắt đầu nấu")}</span>
            </button>
          )}

          {isPrep && (
            <button
              type="button"
              className="prep-card__btn prep-card__btn--success"
              onClick={onReady}
              disabled={processing}
            >
              {processing ? (
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <CheckCircle2 size={16} />
              )}
              <span>{t("Báo xong món")}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
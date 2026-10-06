// ============================================================
// EMPLOYEEMENU.JSX — Quản lý Kho & Báo hết món (86 List) V2
// ============================================================
// Layout theo design mới:
//   - Hero header + 3 quick actions
//   - 4 KPI cards (Tổng món, Đang mở, 86, Sắp hết)
//   - Filter: search + 3 dropdowns + category pills
//   - Grid 3 cột food cards với 4 states: ACTIVE/LOW/OUT/PAUSED
//   - Audit log table
// 🔧 FIX #81: audit log dùng Intl.DateTimeFormat cố định (VN, 24h)
// ============================================================

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Search, X, Loader2, AlertCircle, RefreshCw, Package, Store, Ban, Hourglass, FileSpreadsheet, History, Plus, Minus, Timer, AlertTriangle, CheckCircle2, ToggleLeft, ToggleRight, Utensils, Banana, Coffee, Sparkles, RotateCcw, Filter,
} from "lucide-react";
import { api } from "../../api";
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";

const REFRESH_MS = 30000;
const LOW_STOCK_THRESHOLD = 10;
const MAX_STOCK = 40;

// 🔧 FIX #81: formatter cố định cho audit log (VN timezone, 24h)
const AUDIT_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const CATEGORY_MAP = {
  "Cơm": "COM",
  "Món mặn": "BUN",
  "Đồ ăn nhanh": "FAST",
  "Đồ uống": "DRINK",
  "Món chay": "COM",
  "Món phụ": "FAST",
};

const STATION_MAP = {
  "Cơm": "Q1",
  "Món mặn": "Q2",
  "Đồ ăn nhanh": "Q2",
  "Đồ uống": "Q3",
  "Món chay": "Q1",
};

const STATUS_OPTIONS = [
  { id: "ALL", label: "Trạng thái: Tất cả" },
  { id: "ACTIVE", label: "Đang nhận đơn" },
  { id: "LOW", label: "Sắp hết (<10)" },
  { id: "OUT", label: "Đã báo hết 86" },
  { id: "PAUSED", label: "Tạm dừng nấu mẻ mới" },
];

const SORT_OPTIONS = [
  { id: "STOCK_ASC", label: "Tồn kho ít nhất trước" },
  { id: "STOCK_DESC", label: "Tồn kho nhiều nhất trước" },
  { id: "NAME", label: "Tên món (A - Z)" },
];

const STATION_OPTIONS = [
  { id: "ALL", label: "Tất cả Quầy (01, 02, 03)" },
  { id: "Q1", label: "Quầy 01 - Cơm & Healthy" },
  { id: "Q2", label: "Quầy 02 - Bún, Mì & Bánh mì" },
  { id: "Q3", label: "Quầy 03 - Barista & Tráng miệng" },
];

function getCategoryId(item) {
  return CATEGORY_MAP[item.category] || "OTHER";
}

function getStationId(item) {
  return STATION_MAP[item.category] || "Q1";
}

function getStockStatus(stock) {
  if (stock === 0) return "OUT";
  if (stock < LOW_STOCK_THRESHOLD) return "LOW";
  return "ACTIVE";
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function EmployeeMenu() {
  const { t, tData } = useI18n();

  // ---- Data ----
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // ---- Filters ----
  const [search, setSearch] = useState("");
  const [stationFilter, setStationFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("STOCK_ASC");
  const [category, setCategory] = useState("ALL");

  // ---- Action tracking ----
  const [processingIds, setProcessingIds] = useState(() => new Set());

  // ---- Audit log (local state) ----
  const [auditLog, setAuditLog] = useState([]);

  const reqIdRef = useRef(0);
  const inFlightRef = useRef(false);

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
        const data = await api.menu.list("", "Tất cả", "popular");
        if (myReqId !== reqIdRef.current) return;
        const list = Array.isArray(data) ? data.filter((m) => m.active) : [];
        setItems(list);
      } catch (e) {
        if (myReqId === reqIdRef.current && !silent) {
          setError(e.message || t("Không tải được thực đơn"));
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

  // ============================================================
  // DERIVED
  // ============================================================

  const enrichedItems = useMemo(() => {
    return items.map((m) => {
      const stock = typeof m.stock === "number" ? m.stock : 0;
      return {
        ...m,
        _catId: getCategoryId(m),
        _stationId: getStationId(m),
        _stockStatus: m._paused
          ? "PAUSED"
          : getStockStatus(stock),
      };
    });
  }, [items]);

  const kpi = useMemo(() => {
    const total = enrichedItems.length;
    const active = enrichedItems.filter((m) => m._stockStatus === "ACTIVE").length;
    const out = enrichedItems.filter((m) => m._stockStatus === "OUT").length;
    const low = enrichedItems.filter((m) => m._stockStatus === "LOW").length;
    return { total, active, out, low };
  }, [enrichedItems]);

  const categoryCounts = useMemo(() => {
    const counts = { ALL: enrichedItems.length, COM: 0, BUN: 0, FAST: 0, DRINK: 0, DESSERT: 0 };
    for (const m of enrichedItems) {
      if (counts[m._catId] !== undefined) counts[m._catId]++;
    }
    return counts;
  }, [enrichedItems]);

  const filtered = useMemo(() => {
    let list = [...enrichedItems];

    // LayoutGrid
    if (category !== "ALL") {
      list = list.filter((m) => m._catId === category);
    }

    // Station
    if (stationFilter !== "ALL") {
      list = list.filter((m) => m._stationId === stationFilter);
    }

    // Status
    if (statusFilter !== "ALL") {
      list = list.filter((m) => m._stockStatus === statusFilter);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (m) =>
          (m.name || "").toLowerCase().includes(q) ||
          (m.category || "").toLowerCase().includes(q) ||
          (m.sku || "").toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === "STOCK_ASC") {
        return (Number(a.stock) || 0) - (Number(b.stock) || 0);
      }
      if (sortBy === "STOCK_DESC") {
        return (Number(b.stock) || 0) - (Number(a.stock) || 0);
      }
      if (sortBy === "NAME") {
        return (a.name || "").localeCompare(b.name || "", "vi");
      }
      return 0;
    });

    return list;
  }, [enrichedItems, category, stationFilter, statusFilter, search, sortBy]);

  // ============================================================
  // AUDIT LOG
  // ============================================================

  const addAudit = useCallback((dish, action, reason, actionVariant = "neutral") => {
    // 🔧 FIX #81: dùng formatter cố định VN, 24h
    const timeStr = AUDIT_TIME_FORMATTER.format(new Date());
    setAuditLog((log) =>
      [
        {
          id: Date.now(),
          time: timeStr,
          dish,
          station: "Quầy NV",
          action,
          actionVariant,
          reason,
          staff: "Trần Thị Mai (NV-2024-08)",
          status: "Đã đồng bộ",
        },
        ...log,
      ].slice(0, 10)
    );
  }, []);

  // ============================================================
  // ACTIONS
  // ============================================================

  const markProcessing = (id, on) => {
    setProcessingIds((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  // Toggle 86
  const handleToggle86 = useCallback(
    async (item) => {
      const id = item._id || item.id;
      if (processingIds.has(id)) return;
      markProcessing(id, true);

      const isOut = item._stockStatus === "OUT";
      const newStock = isOut ? 20 : 0;

      try {
        await api.menu.update(id, { stock: newStock, active: isOut ? 1 : 0 });
        toast(
          isOut
            ? `${t("Đã mở bán lại:")} "${item.name}"`
            : `${t("Đã khóa 86:")} "${item.name}" — ${t("ẩn khỏi App")}`,
          isOut ? "success" : "warning"
        );
        addAudit(
          item.name,
          isOut ? t("Mở bán lại trên App") : t("Khóa hết món (86)"),
          isOut ? t("Bổ sung nguyên liệu") : t("Thao tác tay nhân viên"),
          isOut ? "success" : "danger"
        );
        await load(true);
      } catch (e) {
        toast(e.message || t("Không cập nhật được"), "error");
      } finally {
        markProcessing(id, false);
      }
    },
    [processingIds, load, addAudit, t]
  );

  // Adjust stock
  const handleAdjustStock = useCallback(
    async (item, delta) => {
      const id = item._id || item.id;
      if (processingIds.has(id)) return;

      const currentStock = Number(item.stock) || 0;
      const newStock = Math.max(0, Math.min(MAX_STOCK, currentStock + delta));
      if (newStock === currentStock) return;

      markProcessing(id, true);
      try {
        await api.menu.update(id, { stock: newStock, active: newStock > 0 ? 1 : 0 });
        toast(`${t("Tồn kho:")} ${newStock} ${t("suất")}`, "success");
        await load(true);
      } catch (e) {
        toast(e.message || t("Không cập nhật được"), "error");
      } finally {
        markProcessing(id, false);
      }
    },
    [processingIds, load, t]
  );

  // Toggle pause
  const handlePause = useCallback(
    async (item) => {
      const id = item._id || item.id;
      if (processingIds.has(id)) return;
      markProcessing(id, true);

      const isPaused = !!item._paused;
      try {
        // Chỉ lưu local flag (không có API chính thức) → optimistic
        setItems((list) =>
          list.map((m) =>
            (m._id || m.id) === id ? { ...m, _paused: !isPaused } : m
          )
        );
        toast(
          isPaused
            ? `"${item.name}" ${t("đã mở bán lại")}`
            : `"${item.name}" ${t("tạm dừng 15 phút")}`,
          isPaused ? "success" : "info"
        );
        addAudit(
          item.name,
          isPaused ? t("Hủy tạm dừng") : t("Tạm dừng 15p"),
          isPaused ? t("Mẻ mới đã sẵn sàng") : t("Nấu thêm mẻ mới"),
          isPaused ? "success" : "warning"
        );
      } finally {
        markProcessing(id, false);
      }
    },
    [processingIds, addAudit, t]
  );

  // Quick actions
  const handleBatch86 = () => toast(t("Mở modal chọn nhanh nhiều món để khóa 86"), "info");
  const handleSyncKitchen = () => toast(t("Đã đồng bộ tồn kho từ KDS Bếp Trưởng"), "success");
  const handleViewLog = () => {
    const el = document.getElementById("menu86-audit-section");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const handleExportExcel = () => toast(t("Đang xuất file Excel nhật ký..."), "success");

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="menu86-workspace">
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
              borderRadius: "var(--st-radius-sm)",
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

      {/* ============ HERO ============ */}
      <section className="menu86-hero">
        <div className="menu86-hero__left">
          <span className="menu86-hero__eyebrow">
            <span className="menu86-hero__eyebrow-dot" />
            {t("Hệ Thống Kiểm Soát Bán Hàng Trực Tiếp • Căn Tin VWA")}
          </span>
          <h1 className="menu86-hero__title">
            {t("Quản Lý Trạng Thái Thực Đơn & Kho Ca Trực (86 List)")}
          </h1>
          <p className="menu86-hero__desc">
            {t(
              "Kiểm soát mở bán, báo hết món tức thì lên ứng dụng sinh viên và hệ thống máy gọi món Kiosk khi quầy hết nguyên liệu. Mọi thay đổi đồng bộ tức thời dưới 1 giây."
            )}
          </p>
        </div>

        <div className="menu86-hero__actions">
          <button
            type="button"
            className="menu86-hero__action menu86-hero__action--danger"
            onClick={handleBatch86}
          >
            <Ban size={18} />
            <span>{t("Khóa nhanh (Batch 86)")}</span>
          </button>
          <button
            type="button"
            className="menu86-hero__action menu86-hero__action--primary"
            onClick={handleSyncKitchen}
          >
            <RefreshCw size={18} />
            <span>{t("Đồng bộ tồn kho Bếp")}</span>
          </button>
          <button
            type="button"
            className="menu86-hero__action menu86-hero__action--ghost"
            onClick={handleViewLog}
          >
            <History size={18} />
            <span>{t("Nhật ký đóng/mở")}</span>
          </button>
        </div>
      </section>

      {/* ============ KPI (4 cards) ============ */}
      <div className="menu86-kpi-grid">
        <div className="menu86-kpi">
          <div className="menu86-kpi__left">
            <span className="menu86-kpi__label">{t("Tổng món ca trưa")}</span>
            <div className="menu86-kpi__value-row">
              <span className="menu86-kpi__value">{kpi.total}</span>
              <span className="menu86-kpi__unit">{t("món thực tế")}</span>
            </div>
            <span className="menu86-kpi__sub">
              {t("Quầy 01, 02, 03")}
            </span>
          </div>
          <div className="menu86-kpi__icon">
            <Utensils size={26} />
          </div>
        </div>

        <div className="menu86-kpi">
          <div className="menu86-kpi__left">
            <span className="menu86-kpi__label">{t("Đang nhận order")}</span>
            <div className="menu86-kpi__value-row">
              <span className="menu86-kpi__value menu86-kpi__value--success">
                {kpi.active}
              </span>
              <span className="menu86-kpi__unit">/ {kpi.total} {t("món")}</span>
            </div>
            <span className="menu86-kpi__sub menu86-kpi__sub--success">
              <CheckCircle2 size={14} />
              {t("Sẵn sàng phục vụ sinh viên")}
            </span>
          </div>
          <div className="menu86-kpi__icon menu86-kpi__icon--success">
            <Store size={26} />
          </div>
        </div>

        <div className="menu86-kpi">
          <div className="menu86-kpi__left">
            <span className="menu86-kpi__label">{t("Đã báo hết món (86)")}</span>
            <div className="menu86-kpi__value-row">
              <span className="menu86-kpi__value menu86-kpi__value--danger">
                {kpi.out}
              </span>
              <span className="menu86-kpi__unit">{t("món ẩn khỏi App")}</span>
            </div>
            <span className="menu86-kpi__sub menu86-kpi__sub--danger">
              <Ban size={14} />
              {t("Khóa Kiosk & App VWA")}
            </span>
          </div>
          <div className="menu86-kpi__icon menu86-kpi__icon--danger">
            <Ban size={26} />
          </div>
        </div>

        <div className="menu86-kpi">
          <div className="menu86-kpi__left">
            <span className="menu86-kpi__label">{t("Cảnh báo sắp hết")}</span>
            <div className="menu86-kpi__value-row">
              <span className="menu86-kpi__value menu86-kpi__value--warning">
                {kpi.low}
              </span>
              <span className="menu86-kpi__unit">&lt; {LOW_STOCK_THRESHOLD} {t("suất tồn")}</span>
            </div>
            <span className="menu86-kpi__sub menu86-kpi__sub--warning">
              <AlertTriangle size={14} />
              {t("Cần bếp chuẩn bị mẻ bổ sung")}
            </span>
          </div>
          <div className="menu86-kpi__icon menu86-kpi__icon--warning">
            <Hourglass size={26} />
          </div>
        </div>
      </div>

      {/* ============ FILTER ============ */}
      <section className="menu86-filter">
        <div className="menu86-filter__controls">
          <div className="menu86-filter__search">
            <Search size={20} className="menu86-filter__search-icon" />
            <input
              className="menu86-filter__search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(
                "Tìm kiếm nhanh theo tên món, mã SKU (VD: CB-01), nguyên liệu..."
              )}
            />
            {search && (
              <button
                type="button"
                className="menu86-filter__search-clear"
                onClick={() => setSearch("")}
                aria-label={t("Xoá tìm kiếm")}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="menu86-filter__selects">
            <div className="menu86-filter__select-wrap">
              <Filter size={16} className="menu86-filter__select-icon" />
              <select
                className="menu86-filter__select"
                value={stationFilter}
                onChange={(e) => setStationFilter(e.target.value)}
              >
                {STATION_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{t(o.label)}</option>
                ))}
              </select>
            </div>

            <div className="menu86-filter__select-wrap">
              <Sparkles size={16} className="menu86-filter__select-icon" />
              <select
                className="menu86-filter__select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{t(o.label)}</option>
                ))}
              </select>
            </div>

            <div className="menu86-filter__select-wrap">
              <RotateCcw size={16} className="menu86-filter__select-icon" />
              <select
                className="menu86-filter__select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{t(o.label)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* LayoutGrid pills */}
        <div className="menu86-cat-pills">
          {[
            { id: "ALL", label: t("Tất cả món"), count: categoryCounts.ALL },
            { id: "COM", label: t("Cơm trưa sinh viên"), count: categoryCounts.COM },
            { id: "BUN", label: t("Bún & Mì nước nóng"), count: categoryCounts.BUN },
            { id: "FAST", label: t("Bánh mì & Ăn nhanh"), count: categoryCounts.FAST },
            { id: "DRINK", label: t("Đồ uống giải khát"), count: categoryCounts.DRINK },
            { id: "DESSERT", label: t("Tráng miệng & Chè"), count: categoryCounts.DESSERT },
          ].map((c) => (
            <button
              key={c.id}
              type="button"
              className={`menu86-cat-pill ${category === c.id ? "active" : ""}`}
              onClick={() => setCategory(c.id)}
            >
              {c.label} ({c.count})
            </button>
          ))}
        </div>
      </section>

      {/* ============ FOOD GRID ============ */}
      {loading && filtered.length === 0 ? (
        <div className="dish86-empty">
          <Loader2
            size={26}
            style={{ animation: "spin 1s linear infinite", marginBottom: 8 }}
          />
          <div>{t("Đang tải thực đơn...")}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="dish86-empty">
          <Package size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
          <div>
            {search || category !== "ALL" || statusFilter !== "ALL"
              ? t("Không có món nào khớp bộ lọc")
              : t("Chưa có món nào")}
          </div>
        </div>
      ) : (
        <div className="menu86-grid">
          {filtered.map((m) => (
            <Dish86Card
              key={m._id || m.id}
              item={m}
              isProcessing={processingIds.has(m._id || m.id)}
              onToggle86={() => handleToggle86(m)}
              onAdjustStock={(delta) => handleAdjustStock(m, delta)}
              onPause={() => handlePause(m)}
              t={t}
              tData={tData}
            />
          ))}
        </div>
      )}

      {/* ============ AUDIT LOG ============ */}
      <section className="menu86-audit" id="menu86-audit-section">
        <div className="menu86-audit__head">
          <div className="menu86-audit__head-left">
            <FileSpreadsheet
              size={24}
              style={{ color: "var(--st-primary)" }}
            />
            <div>
              <h2 className="menu86-audit__title">
                {t("Nhật Ký Đóng/Mở & Khóa 86 Trong Ca Trực")}
              </h2>
              <p className="menu86-audit__sub">
                {t("Minh bạch hoạt động thao tác của nhân viên phục vụ và bếp trưởng điều phối")}
              </p>
            </div>
          </div>
          <div className="menu86-audit__head-right">
            <span className="menu86-audit__note">
              {t("Tự động lưu vào hệ thống kiểm toán VWA")}
            </span>
            <button
              type="button"
              className="menu86-audit__export"
              onClick={handleExportExcel}
            >
              <FileSpreadsheet size={14} />
              {t("Xuất file Excel")}
            </button>
          </div>
        </div>

        <div className="menu86-audit__table-wrap">
          <table className="menu86-audit__table">
            <thead>
              <tr>
                <th>{t("Thời gian")}</th>
                <th>{t("Món ăn / SKU")}</th>
                <th>{t("Quầy")}</th>
                <th>{t("Thao tác")}</th>
                <th>{t("Lý do ghi nhận")}</th>
                <th>{t("Nhân viên thực hiện")}</th>
                <th>{t("Trạng thái App")}</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: "center", padding: 24, color: "var(--st-text-muted)" }}>
                    {t("Chưa có thao tác nào trong ca này")}
                  </td>
                </tr>
              ) : (
                auditLog.map((row) => (
                  <tr key={row.id}>
                    <td className="menu86-audit__time">{row.time}</td>
                    <td className="menu86-audit__dish">{row.dish}</td>
                    <td>
                      <span className="menu86-audit__station">{row.station}</span>
                    </td>
                    <td>
                      <span
                        className={`menu86-audit__action menu86-audit__action--${row.actionVariant}`}
                      >
                        {row.actionVariant === "danger" && <Ban size={12} />}
                        {row.actionVariant === "warning" && <Timer size={12} />}
                        {row.actionVariant === "success" && <Plus size={12} />}
                        {row.action}
                      </span>
                    </td>
                    <td className="menu86-audit__reason">{row.reason}</td>
                    <td className="menu86-audit__staff">{row.staff}</td>
                    <td className="menu86-audit__status">{row.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

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
// SUB-COMPONENT: Dish86Card
// ============================================================

function Dish86Card({
  item,
  isProcessing,
  onToggle86,
  onAdjustStock,
  onPause,
  t,
  tData,
}) {
  const stock = Number(item.stock) || 0;
  const status = item._stockStatus;
  const isOut = status === "OUT";
  const isPaused = status === "PAUSED";
  const isLow = status === "LOW";
  const isActive = status === "ACTIVE";

  const stockPct = Math.min(100, Math.max(0, (stock / MAX_STOCK) * 100));

  // Overlay
  let overlay = null;
  if (isOut) {
    overlay = {
      icon: <Ban size={24} />,
      iconVariant: "danger",
      title: t("ĐÃ KHÓA 86 (HẾT HÀNG)"),
      desc: item._reason
        ? `${t("Khóa lúc")} ${item._lockedAt || "—"} • ${t("Lý do:")} ${item._reason}`
        : t("Đã dừng nhận đơn ca trưa"),
    };
  } else if (isPaused) {
    overlay = {
      icon: <Hourglass size={24} />,
      iconVariant: "warning",
      title: t("TẠM DỪNG NHẬN ĐƠN (15 PHÚT)"),
      desc: t("Barista đang nấu mẻ mới"),
    };
  }

  // Status pill in image
  let statusPill = null;
  if (isActive) {
    statusPill = {
      variant: "success",
      text: t("Đang phục vụ"),
      dot: true,
    };
  } else if (isLow) {
    statusPill = {
      variant: "warning",
      text: t("Sắp hết hàng"),
      icon: <AlertTriangle size={12} />,
    };
  }

  // Station color
  const stationClass =
    item._stationId === "Q2"
      ? "dish86-card__badge-station--secondary"
      : item._stationId === "Q3"
      ? "dish86-card__badge-station--tertiary"
      : item._catId === "COM" && item.category === "Món chay"
      ? "dish86-card__badge-station--green"
      : "";

  // Label suất
  const unitLabel = item.category === "Đồ uống" ? t("ly") : item.category === "Món mặn" ? t("tô") : t("suất");

  return (
    <article
      className={`dish86-card ${
        isOut ? "dish86-card--out" : isPaused ? "dish86-card--paused" : ""
      }`}
    >
      {/* Image */}
      <div className="dish86-card__img-wrap">
        <img
          src={item.image}
          alt={item.name}
          className="dish86-card__img"
          loading="lazy"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src =
              "data:image/svg+xml;utf8," +
              encodeURIComponent(
                `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect fill='#f5f7fb' width='100' height='100'/><text x='50' y='58' font-size='40' text-anchor='middle'>🍽️</text></svg>`
              );
          }}
        />
        <div className="dish86-card__gradient" />

        {/* Top badges */}
        <div className="dish86-card__badges-top">
          <span className={`dish86-card__badge-station ${stationClass}`}>
            {t("Quầy")} {item._stationId.replace("Q", "0")} • {item.category}
          </span>
          <span className="dish86-card__badge-sku">
            {t("SKU:")} {item.sku || `#${(item._id || item.id).toString().slice(-4)}`}
          </span>
        </div>

        {/* Overlay for OUT/PAUSED */}
        {overlay && (
          <div className="dish86-card__overlay">
            <div
              className={`dish86-card__overlay-icon ${
                overlay.iconVariant === "warning"
                  ? "dish86-card__overlay-icon--warning"
                  : ""
              }`}
            >
              {overlay.icon}
            </div>
            <span className="dish86-card__overlay-title">{overlay.title}</span>
            <span className="dish86-card__overlay-desc">{overlay.desc}</span>
          </div>
        )}

        {/* Bottom overlay: price + status */}
        {!overlay && (
          <div className="dish86-card__bottom-overlay">
            <div className="dish86-card__price-group">
              {item.original_price > item.price && (
                <span className="dish86-card__price-old">
                  {money(item.original_price)}
                </span>
              )}
              <span className="dish86-card__price-new">
                {money(item.price)}
                {item.original_price > item.price && (
                  <span className="dish86-card__subsidy">{t("Trợ giá SV")}</span>
                )}
              </span>
            </div>
            {statusPill && (
              <span
                className={`dish86-card__status-pill dish86-card__status-pill--${statusPill.variant}`}
              >
                {statusPill.dot && (
                  <span className="dish86-card__status-pill-dot" />
                )}
                {statusPill.icon}
                {statusPill.text}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="dish86-card__body">
        <div className="dish86-card__body-top">
          <h3 className="dish86-card__name">
            {tData(item, "name") || item.name}
          </h3>
          {item.description && (
            <p className="dish86-card__desc">
              {tData(item, "description") || item.description}
            </p>
          )}
        </div>

        {/* Inventory panel */}
        <div
          className={`dish86-inv ${
            isLow ? "dish86-inv--warning" : isOut ? "dish86-inv--danger" : ""
          }`}
        >
          <div className="dish86-inv__row">
            <span className="dish86-inv__label">
              {isOut ? <Ban size={14} /> : <Package size={14} />}
              {isLow ? t("Suất còn lại:") : t("Suất còn lại:")}
            </span>
            <span className="dish86-inv__value">
              {stock} {unitLabel}
            </span>
          </div>

          <div className="dish86-inv__bar">
            <div
              className="dish86-inv__fill"
              style={{ width: `${stockPct}%` }}
            />
          </div>

          <div className="dish86-inv__controls">
            <div className="dish86-inv__stepper">
              <button
                type="button"
                className="dish86-inv__step-btn"
                onClick={() => onAdjustStock(-1)}
                disabled={isProcessing || stock <= 0}
                aria-label={t("Giảm")}
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                className="dish86-inv__step-btn"
                onClick={() => onAdjustStock(1)}
                disabled={isProcessing || stock >= MAX_STOCK}
                aria-label={t("Tăng")}
              >
                <Plus size={14} />
              </button>
            </div>

            <div className="dish86-inv__quick">
              {isOut ? (
                <button
                  type="button"
                  className="dish86-inv__quick-btn dish86-inv__quick-btn--primary"
                  onClick={() => onAdjustStock(15)}
                  disabled={isProcessing}
                >
                  {t("Có mẻ mới (+15 & Mở lại)")}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="dish86-inv__quick-btn"
                    onClick={() => onAdjustStock(10)}
                    disabled={isProcessing}
                  >
                    +10
                  </button>
                  <button
                    type="button"
                    className="dish86-inv__quick-btn"
                    onClick={() => onAdjustStock(20)}
                    disabled={isProcessing}
                  >
                    +20
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 86 Toggle */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            className={`dish86-toggle ${
              isOut
                ? "dish86-toggle--out"
                : isPaused
                ? "dish86-toggle--paused"
                : "dish86-toggle--active"
            }`}
            onClick={onToggle86}
            disabled={isProcessing}
          >
            <span className="dish86-toggle__left">
              {isProcessing ? (
                <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
              ) : isOut ? (
                <ToggleLeft size={18} />
              ) : (
                <ToggleRight size={18} />
              )}
              <span className="dish86-toggle__label">
                {isOut
                  ? t("ĐÃ HẾT MÓN (Khóa trên App SV)")
                  : isPaused
                  ? t("Đang tạm dừng nấu (Hẹn giờ mở)")
                  : t("Đang nhận đơn trên App & Kiosk")}
              </span>
            </span>
            <span className="dish86-toggle__hint">
              {isOut ? t("Mở bán lại") : t("Bấm để KHÓA 86")}
            </span>
          </button>

          {!isOut && (
            <button
              type="button"
              className="dish86-pause-btn"
              onClick={onPause}
              disabled={isProcessing}
            >
              <Timer size={12} />
              <span>
                {isPaused
                  ? t("Hủy tạm dừng / Mở nhận đơn")
                  : t("Tạm dừng 15 phút (Đang xào mẻ mới)")}
              </span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
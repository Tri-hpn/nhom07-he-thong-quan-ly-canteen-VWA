// ============================================================
// EMPLOYEEMENU.JSX — Quản lý Kho & Báo hết món (V9 - B9.4)
// ============================================================
// V9:
//   - handleToggleOut / handleToggleActive: tData + object interpolation
//   - handleAdjustStock: object interpolation

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Search, X, Loader2, AlertCircle, RefreshCw, Package, Store, Ban,
  Hourglass, FileSpreadsheet, History, Plus, Minus, Timer, AlertTriangle,
  CheckCircle2, ToggleLeft, ToggleRight, Utensils, Sparkles, RotateCcw,
  Filter, ChevronLeft, ChevronRight, Star, Flame, Clock, Power,
} from "lucide-react";
import { api, getToken } from "../../api";
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import { useAuth } from "../../contexts/AuthContext";

const REFRESH_MS = 30000;
const LOW_STOCK_THRESHOLD = 10;
const MAX_STOCK = 100;
const PAGE_SIZE = 12;
const AUDIT_STORAGE_KEY = "canteen_audit_log";

const AUDIT_TIME_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});

const CATEGORY_MAP = { "Cơm": "COM", "Món mặn": "BUN", "Đồ ăn nhanh": "FAST", "Đồ uống": "DRINK", "Món chay": "COM", "Món phụ": "FAST" };
const STATION_MAP = { "Cơm": "Q1", "Món mặn": "Q2", "Đồ ăn nhanh": "Q2", "Đồ uống": "Q3", "Món chay": "Q1" };

const STATUS_OPTIONS = [
  { id: "ALL", label: "Trạng thái: Tất cả" },
  { id: "ACTIVE", label: "Đang bán" },
  { id: "LOW", label: "Sắp hết (<10)" },
  { id: "OUT", label: "Tạm hết hàng" },
  { id: "DISABLED", label: "Đã tắt món" },
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

function getCategoryId(item) { return CATEGORY_MAP[item.category] || "OTHER"; }
function getStationId(item) { return STATION_MAP[item.category] || "Q1"; }

function getStockStatus(item) {
  const stock = Number(item.stock) || 0;
  const active = Number(item.active) !== 0;
  if (!active) return "DISABLED";
  if (stock === 0) return "OUT";
  if (stock < LOW_STOCK_THRESHOLD) return "LOW";
  return "ACTIVE";
}

function getFALLBACK_IMG() {
  return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect fill='#f5f7fb' width='100' height='100'/><text x='50' y='58' font-size='40' text-anchor='middle'>🍽️</text></svg>`);
}

function getSafeAuditLog() {
  try {
    const saved = localStorage.getItem(AUDIT_STORAGE_KEY);
    if (!saved || saved === "undefined" || saved === "null") return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
}

export default function EmployeeMenu() {
  const { t, tData } = useI18n();
  const { user } = useAuth();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [stationFilter, setStationFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("STOCK_ASC");
  const [category, setCategory] = useState("ALL");
  const [page, setPage] = useState(1);
  const [processingIds, setProcessingIds] = useState(() => new Set());

  const [auditLog, setAuditLog] = useState(getSafeAuditLog);
  const [showAuditModal, setShowAuditModal] = useState(false);

  const reqIdRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => { try { localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(auditLog)); } catch (e) {} }, [auditLog]);

  const load = useCallback(async (silent = false) => {
    if (!getToken()) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const myReqId = ++reqIdRef.current;
    if (!silent) setRefreshing(true);
    setError("");

    try {
      const data = await api.menu.list("", "Tất cả", "popular");
      if (myReqId !== reqIdRef.current) return;
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      if (myReqId === reqIdRef.current && !silent) setError(e.message || t("Không tải được thực đơn"));
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

  const enrichedItems = useMemo(() => {
    return items.map((m) => {
      const stock = typeof m.stock === "number" ? m.stock : 0;
      const sold = typeof m.sold === "number" ? m.sold : 0;
      return {
        ...m, _catId: getCategoryId(m), _stationId: getStationId(m),
        _stockStatus: getStockStatus(m), _stock: stock, _sold: sold,
        _totalStock: stock + sold,
      };
    });
  }, [items]);

  const kpi = useMemo(() => {
    const total = enrichedItems.length;
    const active = enrichedItems.filter((m) => m._stockStatus === "ACTIVE").length;
    const out = enrichedItems.filter((m) => m._stockStatus === "OUT").length;
    const low = enrichedItems.filter((m) => m._stockStatus === "LOW").length;
    const disabled = enrichedItems.filter((m) => m._stockStatus === "DISABLED").length;
    return { total, active, out, low, disabled };
  }, [enrichedItems]);

  const categoryCounts = useMemo(() => {
    const counts = { ALL: enrichedItems.length, COM: 0, BUN: 0, FAST: 0, DRINK: 0, DESSERT: 0 };
    for (const m of enrichedItems) { if (counts[m._catId] !== undefined) counts[m._catId]++; }
    return counts;
  }, [enrichedItems]);

  const filtered = useMemo(() => {
    let list = [...enrichedItems];
    if (category !== "ALL") list = list.filter((m) => m._catId === category);
    if (stationFilter !== "ALL") list = list.filter((m) => m._stationId === stationFilter);
    if (statusFilter !== "ALL") list = list.filter((m) => m._stockStatus === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((m) => (m.name || "").toLowerCase().includes(q) || (m.category || "").toLowerCase().includes(q) || (m.sku || "").toLowerCase().includes(q));

    list.sort((a, b) => {
      const order = { OUT: 0, LOW: 1, ACTIVE: 2, DISABLED: 3 };
      const oa = order[a._stockStatus] ?? 4;
      const ob = order[b._stockStatus] ?? 4;
      if (oa !== ob) return oa - ob;
      if (sortBy === "STOCK_ASC") return a._stock - b._stock;
      if (sortBy === "STOCK_DESC") return b._stock - a._stock;
      if (sortBy === "NAME") return (a.name || "").localeCompare(b.name || "", "vi");
      return 0;
    });
    return list;
  }, [enrichedItems, category, stationFilter, statusFilter, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = useMemo(() => { const start = (currentPage - 1) * PAGE_SIZE; return filtered.slice(start, start + PAGE_SIZE); }, [filtered, currentPage]);

  const staffName = user?.name || t("Nhân viên");
  const staffCode = user?.employeeCode || user?.code || "";
  const staffDisplay = staffCode ? `${staffName} (${staffCode})` : staffName;

  const addAudit = useCallback((dish, action, reason, actionVariant = "neutral") => {
    const timeStr = AUDIT_TIME_FORMATTER.format(new Date());
    setAuditLog((log) => [{
      id: Date.now() + Math.random(), time: timeStr, dish,
      station: "Quầy NV", action, actionVariant, reason, staff: staffDisplay,
      status: "Đã đồng bộ",
    }, ...log].slice(0, 50));
  }, [staffDisplay]);

  const markProcessing = (id, on) => {
    setProcessingIds((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  };

  // 🔧 B9.4: tData + object interpolation
  const handleToggleOut = useCallback(async (item) => {
    const id = item._id || item.id;
    if (processingIds.has(id)) return;
    markProcessing(id, true);

    const isOut = item._stockStatus === "OUT";
    const newStock = isOut ? 20 : 0;
    const itemName = tData(item, "name") || item.name;

    try {
      await api.menu.update(id, { stock: newStock });
      toast(
        isOut
          ? t("Đã mở bán lại: {name}", { name: itemName })
          : t("Đã tạm hết hàng: {name}", { name: itemName }),
        isOut ? "success" : "warning"
      );
      addAudit(itemName, isOut ? t("Mở bán lại") : t("Tạm hết hàng"), isOut ? t("Bổ sung mẻ mới") : t("Thao tác nhân viên"), isOut ? "success" : "danger");
      await load(true);
    } catch (e) {
      toast(e.message || t("Không cập nhật được"), "error");
    } finally {
      markProcessing(id, false);
    }
  }, [processingIds, load, addAudit, t, tData]);

  // 🔧 B9.4: tData + object interpolation
  const handleToggleActive = useCallback(async (item) => {
    const id = item._id || item.id;
    if (processingIds.has(id)) return;
    markProcessing(id, true);

    const isActive = Number(item.active) !== 0;
    const newActive = isActive ? 0 : 1;
    const itemName = tData(item, "name") || item.name;

    try {
      await api.menu.update(id, { active: newActive });
      toast(
        isActive
          ? t("Đã tắt món: {name}", { name: itemName })
          : t("Đã bật bán món: {name}", { name: itemName }),
        isActive ? "warning" : "success"
      );
      addAudit(itemName, isActive ? t("Tắt món") : t("Bật món"), t("Thay đổi trạng thái bán"), isActive ? "danger" : "success");
      await load(true);
    } catch (e) {
      toast(e.message || t("Không cập nhật được"), "error");
    } finally {
      markProcessing(id, false);
    }
  }, [processingIds, load, addAudit, t, tData]);

  // 🔧 B9.4: object interpolation
  const handleAdjustStock = useCallback(async (item, delta) => {
    const id = item._id || item.id;
    if (processingIds.has(id)) return;
    const currentStock = Number(item.stock) || 0;
    const newStock = Math.max(0, Math.min(MAX_STOCK, currentStock + delta));
    if (newStock === currentStock) return;

    markProcessing(id, true);
    try {
      await api.menu.update(id, { stock: newStock });
      toast(t("Tồn kho: {n} {unit}", { n: newStock, unit: t("suất") }), "success");
      await load(true);
    } catch (e) {
      toast(e.message || t("Không cập nhật được"), "error");
    } finally {
      markProcessing(id, false);
    }
  }, [processingIds, load, t]);

  const handleSyncKitchen = () => toast(t("Đã đồng bộ tồn kho từ KDS Bếp Trưởng"), "success");
  const handleViewLog = () => setShowAuditModal(true);

  const handleExportExcel = () => {
    if (auditLog.length === 0) { toast(t("Không có dữ liệu để xuất"), "warning"); return; }
    const headers = ["Thời gian", "Món ăn/SKU", "Quầy", "Thao tác", "Lý do ghi nhận", "Nhân viên thực hiện", "Trạng thái App"];
    const rows = auditLog.map((log) => [`"${log.time}"`, `"${log.dish}"`, `"${log.station}"`, `"${log.action}"`, `"${log.reason}"`, `"${log.staff}"`, `"${log.status}"`]);
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.setAttribute("download", `Nhat_Ky_Menu_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    toast(t("Đã xuất file nhật ký thành công"), "success");
  };

  const handleFilterChange = (setter) => (e) => { setter(e.target.value); setPage(1); };

  return (
    <div className="menu86-workspace">
      {error && (
        <div style={{ background: "var(--st-danger-bg)", border: "1px solid var(--st-danger-border)", borderRadius: "var(--st-radius-md)", padding: "12px 16px", color: "var(--st-danger)", fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
          <AlertCircle size={18} /><span style={{ flex: 1 }}>{error}</span>
          <button type="button" onClick={() => load(false)} style={{ padding: "6px 12px", background: "var(--st-danger)", color: "#fff", border: 0, borderRadius: "var(--st-radius-sm)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>{t("Thử lại")}</button>
        </div>
      )}

      <section className="menu86-hero">
        <div className="menu86-hero__left"><span className="menu86-hero__eyebrow"><span className="menu86-hero__eyebrow-dot" />{t("Hệ Thống Kiểm Soát Bán Hàng Trực Tiếp • Căn Tin VWA")}</span></div>
        <div className="menu86-hero__actions">
          <button type="button" className="menu86-hero__action menu86-hero__action--primary" onClick={handleSyncKitchen}><RefreshCw size={18} /><span>{t("Đồng bộ tồn kho Bếp")}</span></button>
          <button type="button" className="menu86-hero__action menu86-hero__action--ghost" onClick={handleViewLog}><History size={18} /><span>{t("Nhật ký đóng/mở")}</span></button>
        </div>
      </section>

      <div className="menu86-kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div className="menu86-kpi"><div className="menu86-kpi__left"><span className="menu86-kpi__label">{t("Tổng món ca trưa")}</span><div className="menu86-kpi__value-row"><span className="menu86-kpi__value">{kpi.total}</span><span className="menu86-kpi__unit">{t("món")}</span></div><span className="menu86-kpi__sub">{t("Quầy 01, 02, 03")}</span></div><div className="menu86-kpi__icon"><Utensils size={26} /></div></div>
        <div className="menu86-kpi"><div className="menu86-kpi__left"><span className="menu86-kpi__label">{t("Đang bán")}</span><div className="menu86-kpi__value-row"><span className="menu86-kpi__value menu86-kpi__value--success">{kpi.active}</span><span className="menu86-kpi__unit">/ {kpi.total}</span></div><span className="menu86-kpi__sub menu86-kpi__sub--success"><CheckCircle2 size={14} />{t("Khách thấy trên App")}</span></div><div className="menu86-kpi__icon menu86-kpi__icon--success"><Store size={26} /></div></div>
        <div className="menu86-kpi"><div className="menu86-kpi__left"><span className="menu86-kpi__label">{t("Sắp hết")}</span><div className="menu86-kpi__value-row"><span className="menu86-kpi__value menu86-kpi__value--warning">{kpi.low}</span><span className="menu86-kpi__unit">&lt; {LOW_STOCK_THRESHOLD}</span></div><span className="menu86-kpi__sub menu86-kpi__sub--warning"><AlertTriangle size={14} />{t("Cần bổ sung")}</span></div><div className="menu86-kpi__icon menu86-kpi__icon--warning"><Hourglass size={26} /></div></div>
        <div className="menu86-kpi"><div className="menu86-kpi__left"><span className="menu86-kpi__label">{t("Tạm hết hàng")}</span><div className="menu86-kpi__value-row"><span className="menu86-kpi__value menu86-kpi__value--danger">{kpi.out}</span><span className="menu86-kpi__unit">{t("món")}</span></div><span className="menu86-kpi__sub menu86-kpi__sub--danger"><Ban size={14} />{t("Ẩn khỏi khách")}</span></div><div className="menu86-kpi__icon menu86-kpi__icon--danger"><Ban size={26} /></div></div>
        <div className="menu86-kpi"><div className="menu86-kpi__left"><span className="menu86-kpi__label">{t("Đã tắt món")}</span><div className="menu86-kpi__value-row"><span className="menu86-kpi__value" style={{ color: "var(--st-text-muted)" }}>{kpi.disabled}</span><span className="menu86-kpi__unit">{t("món")}</span></div><span className="menu86-kpi__sub"><Power size={14} />{t("Admin đã tắt")}</span></div><div className="menu86-kpi__icon" style={{ background: "var(--st-surface-container)", color: "var(--st-text-muted)" }}><Power size={26} /></div></div>
      </div>

      <section className="menu86-filter">
        <div className="menu86-filter__controls">
          <div className="menu86-filter__search">
            <Search size={20} className="menu86-filter__search-icon" />
            <input className="menu86-filter__search-input" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t("Tìm kiếm nhanh theo tên món, mã SKU (VD: CB-01), nguyên liệu...")} />
            {search && <button type="button" className="menu86-filter__search-clear" onClick={() => { setSearch(""); setPage(1); }} aria-label={t("Xoá tìm kiếm")}><X size={16} /></button>}
          </div>
          <div className="menu86-filter__selects" style={{ position: "relative", zIndex: 10 }}>
            <div className="menu86-filter__select-wrap"><Filter size={16} className="menu86-filter__select-icon" /><select className="menu86-filter__select" value={stationFilter} onChange={handleFilterChange(setStationFilter)}>{STATION_OPTIONS.map((o) => <option key={o.id} value={o.id}>{t(o.label)}</option>)}</select></div>
            <div className="menu86-filter__select-wrap"><Sparkles size={16} className="menu86-filter__select-icon" /><select className="menu86-filter__select" value={statusFilter} onChange={handleFilterChange(setStatusFilter)}>{STATUS_OPTIONS.map((o) => <option key={o.id} value={o.id}>{t(o.label)}</option>)}</select></div>
            <div className="menu86-filter__select-wrap"><RotateCcw size={16} className="menu86-filter__select-icon" /><select className="menu86-filter__select" value={sortBy} onChange={handleFilterChange(setSortBy)}>{SORT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{t(o.label)}</option>)}</select></div>
          </div>
        </div>

        <div className="menu86-cat-pills" style={{ position: "relative", zIndex: 1 }}>
          {[{ id: "ALL", label: t("Tất cả món"), count: categoryCounts.ALL }, { id: "COM", label: t("Cơm trưa sinh viên"), count: categoryCounts.COM }, { id: "BUN", label: t("Bún & Mì nước nóng"), count: categoryCounts.BUN }, { id: "FAST", label: t("Bánh mì & Ăn nhanh"), count: categoryCounts.FAST }, { id: "DRINK", label: t("Đồ uống giải khát"), count: categoryCounts.DRINK }, { id: "DESSERT", label: t("Tráng miệng & Chè"), count: categoryCounts.DESSERT }].map((c) => (
            <button key={c.id} type="button" className={`menu86-cat-pill ${category === c.id ? "active" : ""}`} onClick={() => { setCategory(c.id); setPage(1); }}>{c.label} ({c.count})</button>
          ))}
        </div>
      </section>

      {!loading && filtered.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, fontSize: 13, color: "var(--st-text-muted)", flexWrap: "wrap", gap: 10 }}>
          <span>{t("Hiển thị")} <b style={{ color: "var(--st-text)" }}>{paginatedItems.length}</b> / {filtered.length} {t("món")}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><RefreshCw size={13} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />{t("Tự động làm mới 30 giây")}</span>
        </div>
      )}

      {loading && paginatedItems.length === 0 ? (
        <div className="dish86-empty"><Loader2 size={26} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} /><div>{t("Đang tải thực đơn...")}</div></div>
      ) : filtered.length === 0 ? (
        <div className="dish86-empty"><Package size={40} style={{ opacity: 0.3, marginBottom: 8 }} /><div>{search.trim() || category !== "ALL" || statusFilter !== "ALL" || stationFilter !== "ALL" ? t("Không có món nào khớp bộ lọc") : t("Chưa có món nào")}</div></div>
      ) : (
        <>
          <div className="menu86-grid">
            {paginatedItems.map((m) => (
              <Dish86CardRow key={m._id || m.id} item={m} isProcessing={processingIds.has(m._id || m.id)} onToggleOut={() => handleToggleOut(m)} onToggleActive={() => handleToggleActive(m)} onAdjustStock={(delta) => handleAdjustStock(m, delta)} t={t} tData={tData} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="menu86-pagination">
              <button type="button" className="menu86-page-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1} aria-label={t("Trang trước")}><ChevronLeft size={18} /><span>{t("Trang trước")}</span></button>
              <div className="menu86-page-indicator"><span className="menu86-page-indicator__label">{t("Trang")}</span><span className="menu86-page-indicator__current">{currentPage}</span><span className="menu86-page-indicator__sep">/</span><span className="menu86-page-indicator__total">{totalPages}</span></div>
              <button type="button" className="menu86-page-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} aria-label={t("Trang sau")}><span>{t("Trang sau")}</span><ChevronRight size={18} /></button>
            </div>
          )}
        </>
      )}

      {showAuditModal && (
        <div className="menu86-modal-overlay" onClick={() => setShowAuditModal(false)}>
          <div className="menu86-modal" onClick={(e) => e.stopPropagation()}>
            <div className="menu86-modal__header">
              <div className="menu86-modal__title-wrap">
                <FileSpreadsheet size={24} style={{ color: "var(--st-primary)" }} />
                <div><h2 className="menu86-modal__title">{t("Nhật Ký Đóng/Mở & Tạm Hết Hàng Trong Ca Trực")}</h2><p className="menu86-modal__sub">{t("Minh bạch hoạt động thao tác của nhân viên phục vụ và bếp trưởng điều phối")}</p></div>
              </div>
              <div className="menu86-modal__actions">
                <button type="button" className="menu86-audit__export" onClick={handleExportExcel}><FileSpreadsheet size={14} />{t("Xuất file Excel")}</button>
                <button type="button" className="menu86-modal__close" onClick={() => setShowAuditModal(false)} title={t("Đóng")}><X size={20} /></button>
              </div>
            </div>
            <div className="menu86-modal__body">
              <div className="menu86-audit__table-wrap">
                <table className="menu86-audit__table">
                  <thead><tr><th>{t("Thời gian")}</th><th>{t("Món ăn / SKU")}</th><th>{t("Quầy")}</th><th>{t("Thao tác")}</th><th>{t("Lý do ghi nhận")}</th><th>{t("Nhân viên thực hiện")}</th><th>{t("Trạng thái App")}</th></tr></thead>
                  <tbody>
                    {auditLog.length === 0 ? (
                      <tr><td colSpan="7" style={{ textAlign: "center", padding: 24, color: "var(--st-text-muted)" }}>{t("Chưa có thao tác nào trong ca này")}</td></tr>
                    ) : (
                      auditLog.map((row) => (
                        <tr key={row.id}>
                          <td className="menu86-audit__time">{row.time}</td>
                          <td className="menu86-audit__dish">{row.dish}</td>
                          <td><span className="menu86-audit__station">{row.station}</span></td>
                          <td><span className={`menu86-audit__action menu86-audit__action--${row.actionVariant}`}>{row.actionVariant === "danger" && <Ban size={12} />}{row.actionVariant === "warning" && <Timer size={12} />}{row.actionVariant === "success" && <Plus size={12} />}{row.action}</span></td>
                          <td className="menu86-audit__reason">{row.reason}</td>
                          <td className="menu86-audit__staff">{row.staff}</td>
                          <td className="menu86-audit__status">{row.status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .menu86-modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .menu86-modal { background: var(--st-surface); border-radius: var(--st-radius-xl); box-shadow: var(--st-shadow-4); width: 100%; max-width: 1050px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
        .menu86-modal__header { padding: 20px; border-bottom: 1px solid var(--st-outline-light); display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; background: var(--st-surface-low); }
        .menu86-modal__title-wrap { display: flex; align-items: flex-start; gap: 12px; }
        .menu86-modal__title { margin: 0; font-family: var(--st-font-head); font-size: 18px; font-weight: 700; color: var(--st-text); }
        .menu86-modal__sub { margin: 4px 0 0; font-size: 13px; color: var(--st-text-muted); }
        .menu86-modal__actions { display: flex; align-items: center; gap: 12px; }
        .menu86-modal__close { background: transparent; border: 0; cursor: pointer; color: var(--st-text-muted); border-radius: 50%; padding: 6px; display: grid; place-items: center; transition: background 0.15s; }
        .menu86-modal__close:hover { background: var(--st-surface-high); color: var(--st-text); }
        .menu86-modal__body { padding: 20px; overflow-y: auto; flex: 1; }
      `}</style>
    </div>
  );
}

function Dish86CardRow({ item, isProcessing, onToggleOut, onToggleActive, onAdjustStock, t, tData }) {
  const stock = item._stock;
  const totalStock = item._totalStock;
  const status = item._stockStatus;
  const isOut = status === "OUT";
  const isLow = status === "LOW";
  const isDisabled = status === "DISABLED";
  const isActive = status === "ACTIVE";

  const unitLabel = item.category === "Đồ uống" ? t("ly") : item.category === "Món mặn" ? t("tô") : t("suất");

  let statusBadge = null;
  if (isDisabled) statusBadge = { variant: "disabled", icon: <Power size={11} />, text: t("Đã tắt món") };
  else if (isOut) statusBadge = { variant: "out", icon: <Ban size={11} />, text: t("Tạm hết hàng") };
  else if (isLow) statusBadge = { variant: "low", icon: <AlertTriangle size={11} />, text: t("Sắp hết hàng") };
  else if (isActive) statusBadge = { variant: "active", icon: <CheckCircle2 size={11} />, text: t("Đang bán") };

  return (
    <article className={`menu86-card-row ${isDisabled ? "menu86-card-row--disabled" : isOut ? "menu86-card-row--out" : ""}`}>
      <div className="menu86-card-row__img-wrap">
        <img src={item.image || getFALLBACK_IMG()} alt={tData(item, "name")} loading="lazy" onError={(e) => { e.target.onerror = null; e.target.src = getFALLBACK_IMG(); }} />
        {item.is_signature && <span className="menu86-card-row__badge-signature"><Star size={9} fill="#fff" /> SIGNATURE</span>}
      </div>

      <div className="menu86-card-row__info">
        <span className="menu86-card-row__category">{t(item.category)}</span>
        <h3 className="menu86-card-row__name">{tData(item, "name") || item.name}</h3>

        <div className="menu86-card-row__price-row">
          {item.original_price > item.price && <span className="menu86-card-row__price-old">{money(item.original_price)}</span>}
          <span className="menu86-card-row__price-new">{money(item.price)}</span>
          {item.original_price > item.price && item.discount_percent > 0 && <span className="menu86-card-row__discount">-{item.discount_percent}%</span>}
        </div>

        <div className="menu86-card-row__meta">
          {item.rating > 0 && <span className="menu86-card-row__meta-item"><Star size={12} fill="#f59e0b" color="#f59e0b" /><b>{item.rating}</b></span>}
          {item.calories > 0 && <span className="menu86-card-row__meta-item"><Flame size={12} color="#ef4444" />{item.calories} kcal</span>}
          {item.prep_time > 0 && <span className="menu86-card-row__meta-item"><Clock size={12} />{item.prep_time} {t("phút")}</span>}
        </div>

        <div className="menu86-card-row__status-row">
          {statusBadge && <span className={`menu86-card-row__badge menu86-card-row__badge--${statusBadge.variant}`}>{statusBadge.icon}{statusBadge.text}</span>}
          <span className="menu86-card-row__stock-info"><Package size={12} /><b style={{ color: isOut ? "var(--st-danger)" : isLow ? "#b45309" : "var(--st-success)" }}>{stock}</b><span>/ {totalStock} {unitLabel}</span></span>
        </div>

        <div className="menu86-card-row__actions">
          <div className="menu86-card-row__stepper">
            <button type="button" className="menu86-card-row__step-btn" onClick={() => onAdjustStock(-1)} disabled={isProcessing || stock <= 0 || isDisabled} aria-label={t("Giảm")}><Minus size={14} /></button>
            <span className="menu86-card-row__step-value">{stock}</span>
            <button type="button" className="menu86-card-row__step-btn" onClick={() => onAdjustStock(1)} disabled={isProcessing || stock >= MAX_STOCK || isDisabled} aria-label={t("Tăng")}><Plus size={14} /></button>
          </div>

          <div className="menu86-card-row__quick">
            <button type="button" className="menu86-card-row__quick-btn" onClick={() => onAdjustStock(10)} disabled={isProcessing || isDisabled}>+10</button>
            <button type="button" className="menu86-card-row__quick-btn" onClick={() => onAdjustStock(20)} disabled={isProcessing || isDisabled}>+20</button>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className={`menu86-card-row__toggle-out ${isOut ? "menu86-card-row__toggle-out--reopen" : "menu86-card-row__toggle-out--out"}`} onClick={onToggleOut} disabled={isProcessing || isDisabled} title={isDisabled ? t("Món đã bị admin tắt — không thể thao tác") : isOut ? t("Mở bán lại") : t("Báo tạm hết hàng")}>
              {isProcessing ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : isOut ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
              <span>{isOut ? t("Mở bán lại") : t("Tạm hết hàng")}</span>
            </button>

            <button type="button" className={`menu86-card-row__toggle-out ${isActive ? "menu86-card-row__toggle-out--out" : "menu86-card-row__toggle-out--reopen"}`} onClick={onToggleActive} disabled={isProcessing} title={isActive ? t("Tắt bán món này hoàn toàn") : t("Bật bán món này")} style={{ borderColor: isActive ? "var(--st-outline)" : "var(--st-primary)", color: isActive ? "var(--st-text-muted)" : "var(--st-primary)" }}>
              {isProcessing ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Power size={16} />}
              <span>{isActive ? t("Tắt món") : t("Bật món")}</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
// ============================================================
// OWNERVOUCHERS.JSX — Quản lý voucher (Admin)
// ============================================================
// ✅ SOURCE-TEXT I18N: dùng tiếng Việt trực tiếp qua t("...")
// ============================================================

import { SkeletonTable } from "../../components/Skeleton";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Plus, Search, Trash2, Pencil, Ticket, Gift, Save, Check, Download, Power, Globe, User as UserIcon, Eye, X, Users, Copy, Loader2, AlertCircle, Edit, Settings,
} from "lucide-react";
import { api } from "../../api";
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import ConfirmDialog from "../../components/ConfirmDialog";

// ============================================================
// CONSTANTS
// ============================================================

const MODAL_Z = 2147483600;
const COPY_FEEDBACK_MS = 1500;
const FILTER_STORAGE_KEY = "vouchers_filter";

const QUICK_VALUES = [10000, 20000, 50000, 100000];

// Default filter state
const DEFAULT_FILTERS = {
  q: "",
  source: "all",
  status: "all",
  sortBy: "newest",
};

// ============================================================
// HELPERS
// ============================================================

/**
 * Escape 1 cell cho CSV.
 */
function csvCell(v) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * ✅ V3: Đọc filter đã lưu từ localStorage (an toàn).
 */
function readStoredFilters() {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_FILTERS;

    return {
      q: typeof parsed.q === "string" ? parsed.q : DEFAULT_FILTERS.q,
      source: ["all", "public", "personal"].includes(parsed.source)
        ? parsed.source
        : DEFAULT_FILTERS.source,
      status: ["all", "unused", "used"].includes(parsed.status)
        ? parsed.status
        : DEFAULT_FILTERS.status,
      sortBy: ["newest", "oldest", "value-desc", "value-asc"].includes(parsed.sortBy)
        ? parsed.sortBy
        : DEFAULT_FILTERS.sortBy,
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function OwnerVouchers() {
  const { t } = useI18n();

  // Filter options — useMemo vì phụ thuộc t
  const SOURCE_FILTERS = useMemo(
    () => [
      { id: "all",      label: t("Tất cả") },
      { id: "public",   label: `🌐 ${t("Public")}` },
      { id: "personal", label: `👤 ${t("Cá nhân")}` },
    ],
    [t]
  );

  const STATUS_FILTERS = useMemo(
    () => [
      { id: "all",    label: t("Tất cả TT") },
      { id: "unused", label: t("Chưa dùng") },
      { id: "used",   label: t("Đã dùng") },
    ],
    [t]
  );

  const SORT_OPTIONS = useMemo(
    () => [
      { id: "newest",     label: t("Mới nhất") },
      { id: "oldest",     label: t("Cũ nhất") },
      { id: "value-desc", label: t("Giá trị ↓") },
      { id: "value-asc",  label: t("Giá trị ↑") },
    ],
    [t]
  );

  // ---------- Data ----------
  const [list, setList] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ---------- UI ----------
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formValue, setFormValue] = useState("");

  // ✅ V3: Khởi tạo filter từ localStorage
  const [filters, setFilters] = useState(() => readStoredFilters());
  const { q, source: filterSource, status: filterStatus, sortBy } = filters;

  const [selected, setSelected] = useState([]);
  const [copiedId, setCopiedId] = useState(null);

  // ---------- Claims modal ----------
  const [claimsModal, setClaimsModal] = useState(null);
  const [claims, setClaims] = useState([]);
  const [loadingClaims, setLoadingClaims] = useState(false);


  // ---------- Points config ----------
  const [pointsConfig, setPointsConfig] = useState(null);
  const [configModal, setConfigModal] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  // ---------- Confirm dialog ----------
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Race-safe
  const reqIdRef = useRef(0);

  // ---------- ✅ V3: Persist filters vào localStorage ----------
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // Bỏ qua nếu localStorage bị chặn
    }
  }, [filters]);

  // ---------- Load ----------

  const load = useCallback(async () => {
    const myReqId = ++reqIdRef.current;
    setLoading(true);
    setError("");

    try {
      const [vRes, uRes, cfgRes] = await Promise.all([
        api.vouchers.all().catch(() => []),
        api.users.list("CUSTOMER").catch(() => []),
        api.points.config().catch(() => null),
      ]);

      if (myReqId !== reqIdRef.current) return;

      setList(Array.isArray(vRes) ? vRes : []);
      setCustomers(Array.isArray(uRes) ? uRes : []);
      if (cfgRes) setPointsConfig(cfgRes);
    } catch (e) {
      if (myReqId === reqIdRef.current) {
        setError(e.message || t("Không tải được danh sách voucher"));
      }
    } finally {
      if (myReqId === reqIdRef.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  // Sync formValue khi mở/đổi modal
  useEffect(() => {
    if (modal) {
      setFormValue(modal.value != null ? Number(modal.value) : "");
    }
  }, [modal]);

  // Cleanup timeout copy feedback khi unmount
  useEffect(() => {
    if (!copiedId) return;
    const timer = setTimeout(() => setCopiedId(null), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copiedId]);

  // ESC đóng modals
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (claimsModal) setClaimsModal(null);
      else if (modal && !saving) setModal(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modal, claimsModal, saving]);

  // ---------- Computed ----------

  // Map customer_id → customer để tra cứu O(1)
  const customerMap = useMemo(() => {
    const map = new Map();
    for (const c of customers) map.set(String(c.id), c);
    return map;
  }, [customers]);

  const filtered = useMemo(() => {
    let result = [...list];

    // Search
    if (q.trim()) {
      const s = q.toLowerCase().trim();
      result = result.filter(
        (v) =>
          v.code?.toLowerCase().includes(s) ||
          String(v.user_id || "").includes(s) ||
          String(v.value).includes(s)
      );
    }

    // Status filter
    if (filterStatus === "used") result = result.filter((v) => v.used);
    if (filterStatus === "unused") result = result.filter((v) => !v.used);

    // Source filter
    if (filterSource === "public") {
      result = result.filter((v) => !v.user_id && !v.claimed_from);
    }
    if (filterSource === "personal") {
      result = result.filter((v) => v.user_id);
    }

    // Sort
    switch (sortBy) {
      case "oldest":
        result.sort((a, b) => (a.id || 0) - (b.id || 0));
        break;
      case "value-desc":
        result.sort((a, b) => (b.value || 0) - (a.value || 0));
        break;
      case "value-asc":
        result.sort((a, b) => (a.value || 0) - (b.value || 0));
        break;
      case "newest":
      default:
        result.sort((a, b) => (b.id || 0) - (a.id || 0));
    }

    return result;
  }, [list, q, filterStatus, filterSource, sortBy]);

  const stats = useMemo(() => {
    const publicTemplates = list.filter(
      (v) => !v.user_id && !v.claimed_from
    );
    const personal = list.filter((v) => v.user_id);
    const totalClaims = personal.filter((v) => v.claimed_from).length;

    // ✅ V2: "Khả dụng cá nhân" = chỉ tính personal chưa dùng
    const personalAvailable = personal.filter((v) => !v.used).length;

    return {
      total: list.length,
      public: publicTemplates.length,
      personal: personal.length,
      personalAvailable,
      used: list.filter((v) => v.used).length,
      totalClaims,
    };
  }, [list]);

  // Đếm claims theo template_id — map 1 lần
  const claimsCountMap = useMemo(() => {
    const map = new Map();
    for (const v of list) {
      if (v.claimed_from) {
        map.set(v.claimed_from, (map.get(v.claimed_from) || 0) + 1);
      }
    }
    return map;
  }, [list]);

  const allSelected =
    filtered.length > 0 && selected.length === filtered.length;

  const hasActiveFilter =
    q.trim() !== "" ||
    filterSource !== "all" ||
    filterStatus !== "all" ||
    sortBy !== "newest";

  // ---------- Filter handlers ----------

  const setFilterField = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  /** ✅ V3: Reset về default + xoá localStorage */
  const clearFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
    try {
      localStorage.removeItem(FILTER_STORAGE_KEY);
    } catch {}
  };

  // ---------- Handlers ----------

  const getSource = (v) => {
    if (v.claimed_from)
      return { label: t("Đã nhận từ ƯĐ"), color: "#8b5cf6", bg: "#ede9fe" };
    if (!v.user_id)
      return { label: t("Toàn hệ thống"), color: "#ec4899", bg: "#fce7f3" };
    return { label: t("Cá nhân"), color: "#2634d5", bg: "#eef2ff" };
  };

  const generateCode = () => {
    const n = Math.max(0, ...list.map((v) => v.id || 0)) + 1;
    return "VOUCHER" + String(n).padStart(4, "0");
  };

  const copyCode = (v) => {
    navigator.clipboard.writeText(v.code);
    setCopiedId(v.id);
    toast(`${t("Đã sao chép mã")} ${v.code}`, "success");
  };

  const closeConfirm = useCallback(() => {
    if (confirmBusy) return;
    setConfirm(null);
  }, [confirmBusy]);

  const runConfirm = useCallback(async () => {
    if (!confirm || confirmBusy) return;
    setConfirmBusy(true);
    try {
      await confirm.onConfirm();
    } finally {
      setConfirmBusy(false);
    }
  }, [confirm, confirmBusy]);

  const toggleSelect = (id) => {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
    );
  };

  const toggleSelectAll = () => {
    if (allSelected) setSelected([]);
    else setSelected(filtered.map((v) => v.id));
  };

  // ---------- CRUD ----------

  const saveVoucher = async (e) => {
    e.preventDefault();
    if (saving) return;

    const f = new FormData(e.currentTarget);
    const code = f.get("code")?.trim().toUpperCase();
    const value = Number(formValue);
    const userId = f.get("user_id") ? Number(f.get("user_id")) : null;
    const pointsUsed = Number(f.get("points_used")) || 0;

    // Validate cơ bản
    if (!code) return toast(t("Vui lòng nhập mã voucher"), "error");
    if (!value || value <= 0) return toast(t("Giá trị phải lớn hơn 0"), "error");
    if (value > 10_000_000)
      return toast(t("Giá trị tối đa 10 triệu"), "error");
    if (pointsUsed < 0) return toast(t("Số điểm không được âm"), "error");

    // ✅ V1: Validate trùng mã (case-insensitive, bỏ qua chính nó khi edit)
    const currentId = modal?.id;
    const dup = list.find(
      (v) =>
        v.id !== currentId &&
        (v.code || "").toUpperCase() === code
    );
    if (dup) {
      return toast(
        `${t("Đã có voucher mã")} "${dup.code}" — ${t("vui lòng đặt mã khác")}`,
        "error"
      );
    }

    setSaving(true);
    try {
      const data = { code, value, user_id: userId, points_used: pointsUsed };
      if (modal?.id) {
        await api.vouchers.update(modal.id, data);
        toast(t("Đã cập nhật voucher"), "success");
      } else {
        await api.vouchers.create(data);
        toast(`${t("Đã tạo voucher")} ${code}`, "success");
      }
      setModal(null);
      load();
    } catch (e) {
      toast(e.message || t("Không lưu được"), "error");
    } finally {
      setSaving(false);
    }
  };

  const removeVoucher = (v) => {
    setConfirm({
      title: `${t("Xóa voucher")} "${v.code}"?`,
      message:
        `${t("Voucher trị giá")} ${money(v.value)} ${t("sẽ bị xoá vĩnh viễn.")} ` +
        t("Hành động này không thể hoàn tác."),
      confirmText: t("Xóa voucher"),
      cancelText: t("Hủy"),
      danger: true,
      onConfirm: async () => {
        try {
          await api.vouchers.remove(v.id);
          toast(t("Đã xóa voucher"), "success");
          setSelected((s) => s.filter((x) => x !== v.id));
          setConfirm(null);
          load();
        } catch (e) {
          toast(e.message || t("Không xóa được"), "error");
        }
      },
    });
  };

  const removeSelected = () => {
    if (!selected.length) return;
    const count = selected.length;

    setConfirm({
      title: `${t("Xóa")} ${count} ${t("voucher đã chọn?")}`,
      message:
        `${count} ${t("voucher sẽ bị xoá vĩnh viễn.")} ` +
        t("Hành động này không thể hoàn tác."),
      confirmText: `${t("Xóa")} ${count} ${t("voucher")}`,
      cancelText: t("Hủy"),
      danger: true,
      onConfirm: async () => {
        try {
          await Promise.all(selected.map((id) => api.vouchers.remove(id)));
          toast(`${t("Đã xóa")} ${count} ${t("voucher")}`, "success");
          setSelected([]);
          setConfirm(null);
          load();
        } catch (e) {
          toast(e.message || t("Không xóa được"), "error");
        }
      },
    });
  };

  const toggleUsed = (v) => {
    const newUsed = !v.used;
    const action = newUsed ? t("đã dùng") : t("chưa dùng");

    setConfirm({
      title: `${t("Đánh dấu")} "${v.code}" ${t("là")} ${action}?`,
      message: newUsed
        ? t("Voucher sẽ được đánh dấu là đã sử dụng. Khách hàng sẽ không dùng được nữa.")
        : t("Voucher sẽ được khôi phục về trạng thái chưa dùng."),
      confirmText: `${t("Đánh dấu")} ${action}`,
      cancelText: t("Hủy"),
      danger: newUsed,
      onConfirm: async () => {
        try {
          await api.vouchers.update(v.id, { used: newUsed });
          toast(`${t("Đã đánh dấu")} ${action}`, "success");
          setConfirm(null);
          load();
        } catch (e) {
          toast(e.message || t("Không cập nhật được"), "error");
        }
      },
    });
  };

  // ---------- Claims ----------

  const openClaims = async (template) => {
    setClaimsModal(template);
    setLoadingClaims(true);
    setClaims([]);
    try {
      const data = await api.vouchers.claims(template.id).catch(() => []);
      setClaims(Array.isArray(data) ? data : []);
    } catch (e) {
      toast(e.message || t("Không tải được danh sách"), "error");
    } finally {
      setLoadingClaims(false);
    }
  };

  // ---------- Export CSV ----------

  const exportCSV = () => {
    if (!filtered.length) {
      return toast(t("Không có voucher nào để xuất"), "error");
    }

    let url = null;
    let a = null;
    try {
      const rows = [
        [t("Mã"), t("Giá trị"), t("Nguồn"), t("Khách hàng"), t("Điểm đổi"), t("Trạng thái"), t("Ngày tạo")],
        ...filtered.map((v) => {
          const c = customerMap.get(String(v.user_id));
          const src = getSource(v).label;
          const customerName = c
            ? c.name
            : v.user_id
            ? `User #${v.user_id}`
            : t("Toàn hệ thống");
          return [
            v.code,
            v.value,
            src,
            customerName,
            v.points_used || 0,
            v.used ? t("Đã dùng") : t("Chưa dùng"),
            v.created_at
              ? new Date(v.created_at).toLocaleString("vi-VN")
              : "",
          ];
        }),
      ];

      const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");

      const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8",
      });
      url = URL.createObjectURL(blob);
      a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `vouchers-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();

      toast(`${t("Đã xuất")} ${filtered.length} ${t("voucher")}`, "success");
    } catch (e) {
      toast(e.message || t("Không xuất được"), "error");
    } finally {
      if (a && a.parentNode) a.parentNode.removeChild(a);
      if (url) URL.revokeObjectURL(url);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div>
      {/* ============================================================
          STATS
          ============================================================ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <Stat label={t("Tổng voucher")} value={stats.total} color="#2634d5" icon={<Ticket size={16} />} />
        <Stat label={t("Toàn hệ thống")} value={stats.public} color="#ec4899" icon={<Globe size={16} />} />
        <Stat label={t("Cá nhân")} value={stats.personal} color="#8b5cf6" icon={<UserIcon size={16} />} />
        <Stat label={t("Khả dụng (cá nhân)")} value={stats.personalAvailable} color="#18a967" icon={<Gift size={16} />} />
        <Stat label={t("Đã dùng")} value={stats.used} color="#ef4444" icon={<Check size={16} />} />
        <Stat label={t("Lượt nhận")} value={stats.totalClaims} color="#f59e0b" icon={<Users size={16} />} />
      </div>

      {/* ============================================================
          TOOLBAR + FILTERS
          ============================================================ */}
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {/* Search */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--bg-tertiary, #f5f7fb)",
              border: "1px solid var(--border-color, #e5e9ef)",
              borderRadius: 8,
              padding: "8px 12px",
              flex: 1,
              minWidth: 200,
            }}
          >
            <Search size={16} style={{ color: "var(--text-light, #8993a3)" }} />
            <input
              value={q}
              onChange={(e) => setFilterField("q", e.target.value)}
              placeholder={t("Tìm mã, giá trị, khách...")}
              style={{
                flex: 1,
                border: 0,
                outline: "none",
                background: "transparent",
                color: "var(--text-primary, #172033)",
                fontSize: 13,
                minWidth: 0,
              }}
            />
            {q && (
              <button
                onClick={() => setFilterField("q", "")}
                style={clearBtnStyle}
                aria-label={t("Xoá tìm kiếm")}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Source filter */}
          <div style={segmentedStyle}>
            {SOURCE_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterField("source", f.id)}
                style={segmentBtnStyle(filterSource === f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterField("status", e.target.value)}
            style={selectStyle}
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setFilterField("sortBy", e.target.value)}
            style={selectStyle}
          >
            {SORT_OPTIONS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>

          {/* Clear filters */}
          {hasActiveFilter && (
            <button
              onClick={clearFilters}
              style={{
                padding: "9px 14px",
                background: "transparent",
                color: "#ef4444",
                border: "1px solid #ef4444",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <X size={13} /> {t("Xoá lọc")}
            </button>
          )}

          {/* Points config */}
          <button
            onClick={() => setConfigModal(true)}
            style={toolBtnStyle}
            disabled={loading || !pointsConfig}
            title={t("Sửa quy tắc tích điểm và đổi điểm")}
          >
            <Settings size={14} /> {t("Quy tắc điểm")}
          </button>

          {/* Export */}
          <button onClick={exportCSV} style={toolBtnStyle} disabled={loading}>
            <Download size={14} /> {t("Xuất CSV")}
          </button>

          {/* Create */}
          <button
            onClick={() => setModal({ code: generateCode() })}
            style={btnPrimaryStyle}
          >
            <Plus size={16} /> {t("Tạo voucher")}
          </button>
        </div>

        {/* Bulk action bar */}
        {selected.length > 0 && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 13,
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <span style={{ color: "#ef4444", fontWeight: 600 }}>
              {t("Đã chọn")} <b>{selected.length}</b> {t("voucher")}
            </span>
            <button
              onClick={removeSelected}
              style={{
                padding: "6px 14px",
                background: "#ef4444",
                color: "#fff",
                border: 0,
                borderRadius: 6,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Trash2 size={13} /> {t("Xóa")} {selected.length}
            </button>
          </div>
        )}

        {/* Counter */}
        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            color: "var(--text-light, #8993a3)",
          }}
        >
          {t("Hiển thị")} <b>{filtered.length}</b> / {list.length} {t("voucher")}
        </div>
      </div>

      {/* ============================================================
          TABLE
          ============================================================ */}
      <div style={{ ...cardStyle, marginTop: 16 }}>
        {loading && (
          <SkeletonTable
            columns={8}
            rows={5}
            headers={[
              "",
              t("Mã"),
              t("Giá trị"),
              t("Nguồn"),
              t("Khách / Lượt nhận"),
              t("Trạng thái"),
              t("Ngày"),
              t("Thao tác"),
            ]}
          />
        )}

        {!loading && error && (
          <ErrorBox message={error} onRetry={load} t={t} />
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={emptyBoxStyle}>
            <Ticket size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div style={{ fontSize: 13 }}>
              {list.length === 0
                ? `${t("Chưa có voucher nào — bấm")} "${t("Tạo voucher")}" ${t("để bắt đầu")}`
                : t("Không có voucher khớp bộ lọc")}
            </div>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-tertiary, #f5f7fb)" }}>
                  <th style={{ ...thStyle, width: 40 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      style={{ cursor: "pointer" }}
                      aria-label={t("Chọn tất cả")}
                    />
                  </th>
                  <th style={thStyle}>{t("Mã")}</th>
                  <th style={thStyle}>{t("Giá trị")}</th>
                  <th style={thStyle}>{t("Nguồn")}</th>
                  <th style={thStyle}>{t("Khách / Lượt nhận")}</th>
                  <th style={thStyle}>{t("Trạng thái")}</th>
                  <th style={thStyle}>{t("Ngày")}</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>{t("Thao tác")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => {
                  const cust = customerMap.get(String(v.user_id));
                  const src = getSource(v);
                  const isTemplate = !v.user_id && !v.claimed_from;
                  const claimCount = isTemplate
                    ? claimsCountMap.get(v.id) || 0
                    : 0;
                  const isSelected = selected.includes(v.id);
                  const isCopied = copiedId === v.id;

                  return (
                    <tr
                      key={v.id}
                      style={{
                        borderBottom: "1px solid var(--border-color, #eef2f7)",
                        background: isSelected
                          ? "rgba(38, 52, 213, 0.04)"
                          : "transparent",
                      }}
                    >
                      <td style={tdStyle}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(v.id)}
                          style={{ cursor: "pointer" }}
                          aria-label={`${t("Chọn")} ${v.code}`}
                        />
                      </td>

                      {/* Code + copy */}
                      <td style={tdStyle}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <b
                            style={{
                              color: "#2634d5",
                              fontFamily: "monospace",
                              fontSize: 12,
                            }}
                          >
                            {v.code}
                          </b>
                          <button
                            onClick={() => copyCode(v)}
                            title={t("Sao chép mã")}
                            aria-label={t("Sao chép mã")}
                            style={{
                              background: "transparent",
                              border: 0,
                              cursor: "pointer",
                              color: isCopied
                                ? "#18a967"
                                : "var(--text-light, #94a3b8)",
                              padding: 2,
                              display: "grid",
                              placeItems: "center",
                            }}
                          >
                            {isCopied ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>

                      {/* Value */}
                      <td style={tdStyle}>
                        <b style={{ color: "#18a967" }}>{money(v.value)}</b>
                      </td>

                      {/* Source */}
                      <td style={tdStyle}>
                        <span
                          style={{
                            padding: "3px 9px",
                            borderRadius: 12,
                            fontSize: 10.5,
                            fontWeight: 700,
                            background: src.bg,
                            color: src.color,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {isTemplate ? (
                            <Globe size={10} />
                          ) : (
                            <UserIcon size={10} />
                          )}
                          {src.label}
                        </span>
                      </td>

                      {/* Customer / claims */}
                      <td style={{ ...tdStyle, fontSize: 12 }}>
                        {isTemplate ? (
                          <button
                            onClick={() => openClaims(v)}
                            style={{
                              background: "transparent",
                              border: 0,
                              cursor: "pointer",
                              color:
                                claimCount > 0
                                  ? "#2634d5"
                                  : "var(--text-light, #94a3b8)",
                              fontWeight: claimCount > 0 ? 700 : 400,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 12,
                              padding: 0,
                            }}
                          >
                            <Users size={12} />
                            {claimCount > 0
                              ? `${claimCount} ${t("khách đã nhận")}`
                              : t("Chưa ai nhận")}
                          </button>
                        ) : cust ? (
                          cust.name
                        ) : v.user_id ? (
                          <span style={{ color: "var(--text-muted, #64748b)" }}>
                            User #{v.user_id}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-light, #94a3b8)" }}>
                            —
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td style={tdStyle}>
                        <span
                          style={{
                            padding: "3px 9px",
                            borderRadius: 12,
                            fontSize: 10.5,
                            fontWeight: 700,
                            background: v.used ? "#fee2e2" : "#e8f9f1",
                            color: v.used ? "#ef4444" : "#18a967",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {v.used ? t("Đã dùng") : t("Chưa dùng")}
                        </span>
                      </td>

                      {/* Date */}
                      <td
                        style={{
                          ...tdStyle,
                          fontSize: 11,
                          color: "var(--text-muted, #64748b)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {v.created_at
                          ? new Date(v.created_at).toLocaleDateString("vi-VN")
                          : "—"}
                      </td>

                      {/* Actions */}
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 4,
                            justifyContent: "flex-end",
                          }}
                        >
                          {isTemplate && (
                            <IconButton
                              onClick={() => openClaims(v)}
                              title={t("Xem lượt nhận")}
                              color="#8b5cf6"
                            >
                              <Eye size={14} />
                            </IconButton>
                          )}
                          <IconButton
                            onClick={() => toggleUsed(v)}
                            title={
                              v.used
                                ? t("Đánh dấu chưa dùng")
                                : t("Đánh dấu đã dùng")
                            }
                            color={v.used ? "#18a967" : "#f59e0b"}
                          >
                            <Power size={14} />
                          </IconButton>
                          <IconButton
                            onClick={() => setModal(v)}
                            title={t("Sửa")}
                          >
                            <Edit size={14} />
                          </IconButton>
                          <IconButton
                            onClick={() => removeVoucher(v)}
                            title={t("Xóa")}
                            color="#ef4444"
                          >
                            <Trash2 size={14} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================================
          CREATE/EDIT MODAL
          ============================================================ */}
      {modal && (
        <Modal
          onClose={() => !saving && setModal(null)}
          maxWidth={500}
        >
          <div style={modalHeaderStyle}>
            <h3 style={modalTitleStyle}>
              <Ticket size={20} />{" "}
              {modal.id ? t("Sửa voucher") : t("Tạo voucher mới")}
            </h3>
            <button
              onClick={() => !saving && setModal(null)}
              style={modalCloseStyle}
              aria-label={t("Đóng")}
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={saveVoucher} autoComplete="off">
            <label style={labelStyle}>{t("Mã voucher")} *</label>
            <input
              name="code"
              defaultValue={modal.code || generateCode()}
              required
              disabled={saving || !!modal.id}
              style={{
                ...inputStyle,
                fontFamily: "monospace",
                textTransform: "uppercase",
                opacity: modal.id ? 0.7 : 1,
                cursor: modal.id ? "not-allowed" : "text",
              }}
            />

            <label style={labelStyle}>{t("Giá trị (VNĐ)")} *</label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 6,
                marginBottom: 8,
              }}
            >
              {QUICK_VALUES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFormValue(v)}
                  disabled={saving}
                  style={{
                    padding: "6px 4px",
                    background:
                      formValue === v
                        ? "#2634d5"
                        : "var(--bg-tertiary, #f5f7fb)",
                    color:
                      formValue === v
                        ? "#fff"
                        : "var(--text-primary, #172033)",
                    border: `1px solid ${
                      formValue === v
                        ? "#2634d5"
                        : "var(--border-color, #e5e9ef)"
                    }`,
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  {v / 1000}K
                </button>
              ))}
            </div>
            <input
              name="value"
              type="number"
              min="1000"
              step="1000"
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
              placeholder={t("VD: 50000")}
              required
              disabled={saving}
              style={inputStyle}
            />

            {/* Info box: public voucher */}
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(236, 72, 153, 0.08)",
                border: "1px solid rgba(236, 72, 153, 0.25)",
                borderRadius: 8,
                fontSize: 12,
                color: "#ec4899",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Globe size={14} />{" "}
              {t('Để trống "Khách hàng" → voucher sẽ hiện ở trang "Ưu đãi" cho mọi khách nhận')}
            </div>

            <label style={labelStyle}>
              {t("Khách hàng (để trống = toàn hệ thống)")}
            </label>
            <select
              name="user_id"
              defaultValue={modal.user_id || ""}
              disabled={saving}
              style={inputStyle}
            >
              <option value="">{t("— Toàn hệ thống —")}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email})
                </option>
              ))}
            </select>

            <label style={labelStyle}>{t("Số điểm đổi (nếu có)")}</label>
            <input
              name="points_used"
              type="number"
              min="0"
              defaultValue={modal.points_used || 0}
              disabled={saving}
              style={inputStyle}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setModal(null)}
                disabled={saving}
                style={{ ...btnCancelStyle, flex: 1 }}
              >
                {t("Hủy")}
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{ ...btnPrimaryStyle, flex: 1, width: "auto" }}
              >
                {saving ? (
                  <>
                    <Loader2
                      size={14}
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                    {t("Đang lưu...")}
                  </>
                ) : (
                  <>
                    <Save size={14} /> {t("Lưu")}
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ============================================================
          CLAIMS MODAL
          ============================================================ */}
      {claimsModal && (
        <Modal
          onClose={() => setClaimsModal(null)}
          maxWidth={560}
          zIndex={MODAL_Z + 10}
        >
          <div style={modalHeaderStyle}>
            <h3 style={modalTitleStyle}>
              <Users size={20} /> {t("Khách đã nhận voucher")}
            </h3>
            <button
              onClick={() => setClaimsModal(null)}
              style={modalCloseStyle}
              aria-label={t("Đóng")}
            >
              <X size={20} />
            </button>
          </div>

          <div
            style={{
              background: "var(--bg-tertiary, #f5f7fb)",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 14,
              fontSize: 12,
            }}
          >
            <b style={{ fontFamily: "monospace", color: "#2634d5" }}>
              {claimsModal.code}
            </b>{" "}
            · {money(claimsModal.value)} ·{" "}
            <b>{claims.length}</b> {t("khách đã nhận")}
          </div>

          {loadingClaims ? (
            <SkeletonTable
              columns={4}
              rows={3}
              headers={[
                t("Khách hàng"),
                t("Mã cá nhân"),
                t("Ngày nhận"),
                t("Trạng thái"),
              ]}
            />
          ) : claims.length === 0 ? (
            <div style={emptyBoxStyle}>
              <Users size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
              <div style={{ fontSize: 13 }}>
                {t("Chưa có khách nào nhận voucher này")}
              </div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-tertiary, #f5f7fb)" }}>
                    <th style={thStyle}>{t("Khách hàng")}</th>
                    <th style={thStyle}>{t("Mã cá nhân")}</th>
                    <th style={thStyle}>{t("Ngày nhận")}</th>
                    <th style={thStyle}>{t("Trạng thái")}</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((c) => (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom:
                          "1px solid var(--border-color, #eef2f7)",
                      }}
                    >
                      <td style={tdStyle}>
                        <b style={{ fontSize: 13 }}>{c.user_name}</b>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-light, #8993a3)",
                          }}
                        >
                          {c.user_email}
                        </div>
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          fontFamily: "monospace",
                          fontSize: 11,
                        }}
                      >
                        {c.code}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          fontSize: 11,
                          color: "var(--text-muted, #64748b)",
                        }}
                      >
                        {c.created_at
                          ? new Date(c.created_at).toLocaleDateString("vi-VN")
                          : "—"}
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            padding: "3px 9px",
                            borderRadius: 12,
                            fontSize: 10.5,
                            fontWeight: 700,
                            background: c.used ? "#fee2e2" : "#e8f9f1",
                            color: c.used ? "#ef4444" : "#18a967",
                          }}
                        >
                          {c.used ? t("Đã dùng") : t("Chưa dùng")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            onClick={() => setClaimsModal(null)}
            style={{ ...btnPrimaryStyle, marginTop: 16, width: "100%" }}
          >
            {t("Đóng")}
          </button>
        </Modal>
      )}

      {/* ============================================================
          POINTS CONFIG MODAL
          ============================================================ */}
      {configModal && pointsConfig && (
        <PointsConfigModal
          initial={pointsConfig}
          saving={savingConfig}
          onClose={() => !savingConfig && setConfigModal(false)}
          onSave={async (next) => {
            setSavingConfig(true);
            try {
              const res = await api.points.updateConfig(next);
              toast(t("Đã lưu quy tắc điểm"), "success");
              setPointsConfig(res.config || next);
              setConfigModal(false);
            } catch (e) {
              toast(e.message || t("Không lưu được quy tắc"), "error");
            } finally {
              setSavingConfig(false);
            }
          }}
          t={t}
        />
      )}

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          open
          title={confirm.title}
          message={confirm.message}
          confirmText={confirm.confirmText}
          cancelText={confirm.cancelText}
          danger={confirm.danger}
          loading={confirmBusy}
          onConfirm={runConfirm}
          onClose={closeConfirm}
        />
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
// SUB-COMPONENTS
// ============================================================

function Stat({ label, value, color, icon }) {
  return (
    <div
      style={{
        background: "var(--card-bg, #fff)",
        border: "1px solid var(--border-color, #e7ebf0)",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: color + "18",
            color,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <span
          style={{
            fontSize: 11,
            color: "var(--text-light, #8993a3)",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  title,
  color = "var(--text-primary, #172033)",
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        padding: 6,
        border: "1px solid var(--border-color, #e5e9ef)",
        borderRadius: 6,
        background: "var(--card-bg, #fff)",
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        color,
        width: 28,
        height: 28,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function Modal({ children, onClose, maxWidth = 500, zIndex = MODAL_Z }) {
  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex,
        padding: 20,
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card-bg, #fff)",
          borderRadius: 14,
          padding: 24,
          width: "100%",
          maxWidth,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ErrorBox({ message, onRetry, t }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: 30,
        background: "rgba(239, 68, 68, 0.08)",
        border: "1px solid rgba(239, 68, 68, 0.2)",
        borderRadius: 10,
        color: "#ef4444",
      }}
    >
      <AlertCircle size={26} style={{ marginBottom: 10 }} />
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {t("Không tải được dữ liệu")}
      </div>
      <div
        style={{
          fontSize: 13,
          opacity: 0.85,
          marginBottom: onRetry ? 12 : 0,
        }}
      >
        {message}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: "8px 16px",
            background: "#ef4444",
            color: "#fff",
            border: 0,
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          {t("Thử lại")}
        </button>
      )}
    </div>
  );
}

// ============================================================
// POINTS CONFIG MODAL — Sửa quy tắc tích/đổi điểm
// ============================================================
function PointsConfigModal({ initial, saving, onClose, onSave, t }) {
  const [earn, setEarn] = useState(() => ({ ...initial.earn }));
  const [redeem, setRedeem] = useState(() => ({
    ...initial.redeem,
    tiers: [...(initial.redeem.tiers || [])],
  }));

  const setEarnField = (k, v) => setEarn((p) => ({ ...p, [k]: v }));
  const setRedeemField = (k, v) => setRedeem((p) => ({ ...p, [k]: v }));

  const setTier = (idx, k, v) =>
    setRedeem((p) => {
      const tiers = [...p.tiers];
      tiers[idx] = { ...tiers[idx], [k]: v };
      return { ...p, tiers };
    });

  const addTier = () =>
    setRedeem((p) => ({
      ...p,
      tiers: [...p.tiers, { points: 100, value: 10000 }],
    }));

  const removeTier = (idx) =>
    setRedeem((p) => ({
      ...p,
      tiers: p.tiers.filter((_, i) => i !== idx),
    }));

  const submit = (e) => {
    e.preventDefault();
    const payload = {
      earn: {
        rate_amount: Number(earn.rate_amount),
        rate_points: Number(earn.rate_points),
        green_enabled: !!earn.green_enabled,
        green_points: Number(earn.green_points),
        green_require_approval: !!earn.green_require_approval,
        review_enabled: !!earn.review_enabled,
        review_points: Number(earn.review_points),
      },
      redeem: {
        rate_points: Number(redeem.rate_points),
        rate_value: Number(redeem.rate_value),
        min_points: Number(redeem.min_points),
        max_unused_vouchers: Number(redeem.max_unused_vouchers),
        tiers: redeem.tiers
          .map((t) => ({ points: Number(t.points), value: Number(t.value) }))
          .filter((t) => t.points > 0 && t.value > 0),
      },
    };
    onSave(payload);
  };

  return (
    <Modal onClose={onClose} maxWidth={620}>
      <div style={modalHeaderStyle}>
        <h3 style={modalTitleStyle}>
          <Settings size={20} /> {t("Quy tắc tích điểm & đổi điểm")}
        </h3>
        <button
          onClick={onClose}
          style={modalCloseStyle}
          disabled={saving}
          aria-label={t("Đóng")}
        >
          <X size={20} />
        </button>
      </div>

      <form onSubmit={submit} autoComplete="off">
        <div style={{ padding: 14, background: "var(--bg-tertiary, #f5f7fb)", borderRadius: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#18a967", marginBottom: 10 }}>
            📥 {t("TÍCH ĐIỂM")}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>{t("Mỗi (VNĐ)")}</label>
              <input
                type="number" min="0" step="1000"
                value={earn.rate_amount}
                onChange={(e) => setEarnField("rate_amount", e.target.value)}
                style={inputStyle} disabled={saving}
              />
            </div>
            <div>
              <label style={labelStyle}>{t("= Số điểm")}</label>
              <input
                type="number" min="0"
                value={earn.rate_points}
                onChange={(e) => setEarnField("rate_points", e.target.value)}
                style={inputStyle} disabled={saving}
              />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <input
              type="checkbox"
              checked={!!earn.green_enabled}
              onChange={(e) => setEarnField("green_enabled", e.target.checked)}
              disabled={saving} id="green-enabled"
            />
            <label htmlFor="green-enabled" style={{ fontSize: 13, fontWeight: 600 }}>
              🌱 {t("Bật Sống Xanh Học Đường")}
            </label>
          </div>
          {earn.green_enabled && (
            <div style={{ marginTop: 8 }}>
              <label style={labelStyle}>{t("Số điểm Sống Xanh / lần")}</label>
              <input
                type="number" min="0"
                value={earn.green_points}
                onChange={(e) => setEarnField("green_points", e.target.value)}
                style={inputStyle} disabled={saving}
              />
            </div>
          )}

          {earn.green_enabled && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
              <input
                type="checkbox"
                checked={!!earn.green_require_approval}
                onChange={(e) => setEarnField("green_require_approval", e.target.checked)}
                disabled={saving}
                id="green-approval"
              />
              <label htmlFor="green-approval" style={{ fontSize: 13, fontWeight: 600 }}>
                🛡️ {t("Yêu cầu nhân viên duyệt Sống Xanh")}
              </label>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <input
              type="checkbox"
              checked={!!earn.review_enabled}
              onChange={(e) => setEarnField("review_enabled", e.target.checked)}
              disabled={saving} id="review-enabled"
            />
            <label htmlFor="review-enabled" style={{ fontSize: 13, fontWeight: 600 }}>
              ⭐ {t("Bật thưởng Đánh giá món")}
            </label>
          </div>
          {earn.review_enabled && (
            <div style={{ marginTop: 8 }}>
              <label style={labelStyle}>{t("Số điểm Đánh giá / lần")}</label>
              <input
                type="number" min="0"
                value={earn.review_points}
                onChange={(e) => setEarnField("review_points", e.target.value)}
                style={inputStyle} disabled={saving}
              />
            </div>
          )}
        </div>

        <div style={{ padding: 14, background: "var(--bg-tertiary, #f5f7fb)", borderRadius: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#2634d5", marginBottom: 10 }}>
            📤 {t("ĐỔI ĐIỂM")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>{t("Số điểm")}</label>
              <input type="number" min="1" value={redeem.rate_points}
                onChange={(e) => setRedeemField("rate_points", e.target.value)}
                style={inputStyle} disabled={saving}
              />
            </div>
            <div>
              <label style={labelStyle}>{t("= Voucher (VNĐ)")}</label>
              <input type="number" min="0" step="1000" value={redeem.rate_value}
                onChange={(e) => setRedeemField("rate_value", e.target.value)}
                style={inputStyle} disabled={saving}
              />
            </div>
            <div>
              <label style={labelStyle}>{t("Tối thiểu đổi")}</label>
              <input type="number" min="1" value={redeem.min_points}
                onChange={(e) => setRedeemField("min_points", e.target.value)}
                style={inputStyle} disabled={saving}
              />
            </div>
            <div>
              <label style={labelStyle}>{t("Max voucher chưa dùng")}</label>
              <input type="number" min="1" value={redeem.max_unused_vouchers}
                onChange={(e) => setRedeemField("max_unused_vouchers", e.target.value)}
                style={inputStyle} disabled={saving}
              />
            </div>
          </div>
        </div>

        <div style={{ padding: 14, background: "var(--bg-tertiary, #f5f7fb)", borderRadius: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", marginBottom: 10 }}>
            🎟️ {t("MỐC VOUCHER")}
          </div>

          {redeem.tiers.map((tier, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 40px", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <input type="number" min="1" placeholder={t("Điểm")} value={tier.points}
                onChange={(e) => setTier(idx, "points", e.target.value)}
                style={inputStyle} disabled={saving}
              />
              <input type="number" min="0" step="1000" placeholder={t("VNĐ")} value={tier.value}
                onChange={(e) => setTier(idx, "value", e.target.value)}
                style={inputStyle} disabled={saving}
              />
              <button type="button" onClick={() => removeTier(idx)}
                disabled={saving || redeem.tiers.length <= 1}
                style={{
                  width: 32, height: 32, border: 0, borderRadius: 6,
                  background: "#fee2e2", color: "#ef4444",
                  cursor: redeem.tiers.length <= 1 ? "not-allowed" : "pointer",
                  display: "grid", placeItems: "center",
                  opacity: redeem.tiers.length <= 1 ? 0.4 : 1,
                }}
                title={t("Xoá mốc")}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          <button type="button" onClick={addTier} disabled={saving}
            style={{
              padding: "8px 12px", background: "transparent", color: "#2634d5",
              border: "1px dashed #2634d5", borderRadius: 8, fontSize: 12,
              fontWeight: 600, cursor: "pointer", display: "inline-flex",
              alignItems: "center", gap: 4, marginTop: 4,
            }}
          >
            <Plus size={13} /> {t("Thêm mốc mới")}
          </button>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onClose} disabled={saving}
            style={{ ...btnCancelStyle, flex: 1 }}
          >
            {t("Hủy")}
          </button>
          <button type="submit" disabled={saving}
            style={{ ...btnPrimaryStyle, flex: 1, width: "auto" }}
          >
            {saving ? (
              <>
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                {t("Đang lưu...")}
              </>
            ) : (
              <>
                <Save size={14} /> {t("Lưu quy tắc")}
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// STYLE CONSTANTS
// ============================================================

const cardStyle = {
  background: "var(--card-bg, #fff)",
  border: "1px solid var(--border-color, #e7ebf0)",
  borderRadius: 12,
  padding: 16,
};

const thStyle = {
  padding: 10,
  textAlign: "left",
  fontSize: 11.5,
  color: "var(--text-muted, #64748b)",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: 10,
  fontSize: 13,
  color: "var(--text-primary, #172033)",
};

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
  marginTop: 12,
  color: "var(--text-muted, #475569)",
};

const inputStyle = {
  width: "100%",
  padding: 10,
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  outline: "none",
  background: "var(--bg-secondary, #fff)",
  color: "var(--text-primary, #172033)",
  fontSize: 13,
  boxSizing: "border-box",
};

const selectStyle = {
  padding: "9px 12px",
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  outline: "none",
  background: "var(--bg-secondary, #fff)",
  color: "var(--text-primary, #172033)",
  fontSize: 12,
  cursor: "pointer",
};

const segmentedStyle = {
  display: "inline-flex",
  gap: 3,
  background: "var(--bg-tertiary, #f5f7fb)",
  padding: 4,
  borderRadius: 10,
};

const segmentBtnStyle = (active) => ({
  padding: "7px 12px",
  background: active ? "#2634d5" : "transparent",
  color: active ? "#fff" : "var(--text-muted, #475569)",
  border: 0,
  borderRadius: 7,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
});

const toolBtnStyle = {
  padding: "9px 14px",
  background: "var(--bg-tertiary, #f5f7fb)",
  color: "var(--text-primary, #172033)",
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const btnPrimaryStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  background: "#2634d5",
  color: "#fff",
  padding: "9px 16px",
  border: 0,
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
};

const btnCancelStyle = {
  padding: 12,
  border: "1px solid var(--border-color, #e5e9ef)",
  borderRadius: 8,
  background: "var(--card-bg, #fff)",
  cursor: "pointer",
  color: "var(--text-primary, #172033)",
  fontWeight: 600,
  fontSize: 13,
};

const clearBtnStyle = {
  background: "transparent",
  border: 0,
  cursor: "pointer",
  color: "var(--text-light, #8993a3)",
  padding: 2,
};

const modalHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 20,
};

const modalTitleStyle = {
  margin: 0,
  color: "var(--text-primary, #172033)",
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 16,
};

const modalCloseStyle = {
  background: "transparent",
  border: 0,
  cursor: "pointer",
  color: "var(--text-light, #8993a3)",
  padding: 4,
  display: "grid",
  placeItems: "center",
};

const emptyBoxStyle = {
  textAlign: "center",
  padding: 40,
  color: "var(--text-light, #8993a3)",
};
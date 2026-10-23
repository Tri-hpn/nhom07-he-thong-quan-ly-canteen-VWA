// ============================================================
// OWNERVOUCHERS.JSX — Quản lý voucher (Admin)
// ============================================================
// ✅ SOURCE-TEXT I18N: dùng tiếng Việt trực tiếp qua t("...")
// ✅ V4: Nhận URL params từ trang Chat để tạo voucher cho khách
// ✅ V5: Fix lỗi dropdown không tự chọn khách hàng (Controlled Component)
// ============================================================

import { SkeletonTable } from "../../components/Skeleton";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {Plus, Search, Trash2, Pencil, Ticket, Gift, Save, Check, Download, Power, Globe, User as UserIcon, Eye, X, Users, Copy, Loader2, AlertCircle, Edit, Settings, History, Zap, Info } from "lucide-react";
import { api } from "../../api";
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import ConfirmDialog from "../../components/ConfirmDialog";
import RulesModal from "../../components/RulesModal";

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
  const [searchParams] = useSearchParams();

  // Filter options — useMemo vì phụ thuộc t
  const SOURCE_FILTERS = useMemo(
    () => [
      { id: "all",      label: t("Tất cả") },
      { id: "public",   label: "🌐 Toàn hệ thống" },
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
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [formValue, setFormValue] = useState("");
  const [formIsFlashSale, setFormIsFlashSale] = useState(false);
  const [publishDate, setPublishDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState("");
  const [isFlashSale, setIsFlashSale] = useState(false);
  const [duration, setDuration] = useState(30);
  const [durationUnit, setDurationUnit] = useState("minutes");
  const [selectedUserId, setSelectedUserId] = useState(""); // ✅ V5: Controlled select

  // ✅ V3: Khởi tạo filter từ localStorage
  const [filters, setFilters] = useState(() => readStoredFilters());
  const { q, source: filterSource, status: filterStatus, sortBy } = filters;

  const [selected, setSelected] = useState([]);
  const [copiedId, setCopiedId] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // ---------- Claims modal ----------
  const [claimsModal, setClaimsModal] = useState(null);
  const [claims, setClaims] = useState([]);
  const [loadingClaims, setLoadingClaims] = useState(false);

  // ---------- Points config ----------
  const [pointsConfig, setPointsConfig] = useState(null);
  const [configModal, setConfigModal] = useState(false);
  const [activeTab, setActiveTab] = useState("vouchers"); // "vouchers" | "rules"
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

  // Auto open modal from URL params
  useEffect(() => {
    if (searchParams.get("action") === "create") {
      const uId = searchParams.get("userId");
      const uName = searchParams.get("userName");
      setModal({ 
        code: generateCode(), 
        user_id: uId ? Number(uId) : "", 
        user_name: uName || "" 
      });
    }
  }, [searchParams]);

  // Sync formValue và selectedUserId khi mở/đổi modal
  useEffect(() => {
    if (modal) {
      setFormValue(modal.value != null ? Number(modal.value) : "");
      setFormIsFlashSale(!!modal.isFlashSale);
      setFormIsFlashSale(modal.is_flash_sale || false);
      setPublishDate(modal.publish_date ? modal.publish_date.slice(0, 10) : new Date().toISOString().slice(0, 10));
      setExpiryDate(modal.expires_at ? modal.expires_at.slice(0, 10) : "");
      setSelectedUserId(modal.user_id ? String(modal.user_id) : ""); // ✅ V5
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

    // Search Nâng cao: Bắt mọi trường (Mã, Tên, Tiền, Nguồn, Trạng thái, Ngày)
    if (q.trim()) {
      const s = q.toLowerCase().trim();
      const sNoDot = s.replace(/\./g, ""); // Bỏ dấu chấm để tìm "50.000" hoặc "50000"

      result = result.filter((v) => {
        const cust = (customers || []).find(c => String(c.id) === String(v.user_id));
        const cName = cust ? (cust.name || "").toLowerCase() : "";
        
        const codeStr = (v.code || "").toLowerCase();
        const valueStr = String(v.value || "");
        const valueFormatted = Number(v.value || 0).toLocaleString("vi-VN").toLowerCase(); // VD: 50.000
        
        const statusStr = v.used ? "đã dùng used" : "chưa dùng unused";
        const sourceStr = !v.user_id ? "hệ thống toàn hệ thống public" : "cá nhân personal";
        const dateStr = v.created_at ? new Date(v.created_at).toLocaleDateString("vi-VN") : "";

        // Kiểm tra tất cả các trường
        return codeStr.includes(s) ||
               cName.includes(s) ||
               valueStr.includes(s) || valueStr.includes(sNoDot) ||
               valueFormatted.includes(s) || valueFormatted.includes(sNoDot) ||
               statusStr.includes(s) ||
               sourceStr.includes(s) ||
               dateStr.includes(s);
      });
    }

    // Status filter
    if (filterStatus === "used") result = result.filter((v) => v.used);
    if (filterStatus === "unused") result = result.filter((v) => !v.used);

            // Source filter
        if (filterSource === "all" || filterSource === "public") {
          result = result.filter((v) => !v.user_id && !v.claimed_from);
        } else if (filterSource === "personal") {
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
  }, [list, q, filterStatus, filterSource, sortBy, customers]);

  const suggestions = useMemo(() => {
    if (!q.trim() || !showSuggestions) return [];
    return filtered.slice(0, 8);
  }, [q, filtered, showSuggestions]);

  const highlightMatch = (text, query) => {
    if (!query || !text) return text;
    const str = String(text);
    const idx = str.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return str;
    return (
      <>
        {str.slice(0, idx)}
        <b style={{ color: "#2634d5" }}>{str.slice(idx, idx + query.length)}</b>
        {str.slice(idx + query.length)}
      </>
    );
  };

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
    const userId = selectedUserId ? Number(selectedUserId) : null;

    // Validate cơ bản
    if (!code) return toast(t("Vui lòng nhập mã voucher"), "error");
    if (!value || value <= 0) return toast(t("Giá trị phải lớn hơn 0"), "error");
    if (value > 10_000_000)
      return toast(t("Giá trị tối đa 10 triệu"), "error");

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
      const data = { code, value, user_id: userId, points_used: Number(f.get("points_used")) || 0, isFlashSale: !!formIsFlashSale };
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
        [t("Mã"), t("Giá trị"), t("Nguồn"), t("Khách hàng"), t("Trạng thái"), t("Ngày tạo")],
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
      {/* THANH TAB */}
      <div style={{ display: "inline-flex", background: "var(--bg-tertiary, #f5f7fb)", padding: 4, borderRadius: 12, gap: 4, marginBottom: 20 }}>
        <button onClick={() => setActiveTab("vouchers")} style={{ padding: "10px 20px", background: activeTab === "vouchers" ? "#2634d5" : "transparent", color: activeTab === "vouchers" ? "#fff" : "var(--text-muted, #475569)", border: 0, borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Ticket size={16} /> {t("Quản lý Voucher")}
        </button>
        <button onClick={() => setActiveTab("rules")} style={{ padding: "10px 20px", background: activeTab === "rules" ? "#2634d5" : "transparent", color: activeTab === "rules" ? "#fff" : "var(--text-muted, #475569)", border: 0, borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Settings size={16} /> {t("Quy tắc Xu")}
        </button>
      </div>

      {activeTab === "vouchers" && (
      <>
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
              position: "relative",
            }}
          >
            <Search size={16} style={{ color: "var(--text-light, #8993a3)" }} />
            <input
              value={q}
              onChange={(e) => { setFilters((prev) => ({ ...prev, q: e.target.value, source: "all", status: "all" })); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder={t("Tìm mã, tên KH, số tiền, trạng thái...")}
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

            {showSuggestions && suggestions.length > 0 && (
              <div style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0, right: 0,
                background: "var(--card-bg, #fff)",
                border: "1px solid var(--border-color, #e5e9ef)",
                borderRadius: 10,
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                maxHeight: 320,
                overflowY: "auto",
                zIndex: 100,
              }}>
                {suggestions.map((v) => {
                  const cust = (customers || []).find(c => String(c.id) === String(v.user_id));
                  return (
                    <div
                      key={v.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setFilterField("q", v.code); setShowSuggestions(false); }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(14,165,233,0.06)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                      style={{
                        padding: "10px 14px",
                        cursor: "pointer",
                        borderBottom: "1px solid var(--border-color, #f1f5f9)",
                        fontSize: 13,
                        transition: "background 0.15s",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{highlightMatch(v.code, q)}</div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, display: "flex", flexWrap: "wrap", gap: 6 }}>
                        <span>{cust ? `👤 ${highlightMatch(cust.name, q)}` : `🌐 ${highlightMatch("Hệ thống", q)}`}</span>
                        <span>·</span>
                        <span>{highlightMatch(money(v.value), q)}</span>
                        <span>·</span>
                        <span>{highlightMatch(v.used ? "Đã dùng" : "Chưa dùng", q)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
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
          

          {/* Clear filters */}


          {/* Points config */}
          

          {/* Export */}
          

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
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ cursor: "pointer" }} aria-label="Chọn tất cả" />
                  </th>
                  <th style={thStyle}>Mã</th>
                  <th style={thStyle}>Giá trị</th>
                  <th style={thStyle}>Nguồn</th>
                  <th style={thStyle}>Deal Sốc</th>
                  <th style={thStyle}>Lượt nhận</th>
                  <th style={thStyle}>Trạng thái</th>
                  <th style={thStyle}>Ngày</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => {
                  const cust = customerMap.get(String(v.user_id));
                  const src = getSource(v);
                  const isTemplate = !v.user_id && !v.claimed_from;
                  const claimCount = isTemplate ? (claimsCountMap.get(v.id) || 0) : 0;
                  const isSelected = selected.includes(v.id);
                  const isCopied = copiedId === v.id;

                  return (
                    <tr
                      key={v.id}
                      onClick={() => openClaims(v)}
                      style={{
                        cursor: "pointer",
                        borderBottom: "1px solid var(--border-color, #eef2f7)",
                        background: v.isFlashSale
                          ? "rgba(245, 158, 11, 0.10)"
                          : isSelected
                          ? "rgba(38, 52, 213, 0.04)"
                          : "transparent",
                        borderLeft: v.isFlashSale ? "3px solid #f59e0b" : "3px solid transparent",
                        transition: "background 0.2s ease",
                      }}
                    >
                      {/* 1. Checkbox */}
                      <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(v.id)} style={{ cursor: "pointer" }} aria-label={`Chọn ${v.code}`} />
                      </td>
                      {/* 2. Mã */}
                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <b style={{ color: "#2634d5", fontFamily: "monospace", fontSize: 12 }}>{v.code}</b>
                          <button
                            onClick={(e) => { e.stopPropagation(); copyCode(v); }}
                            title="Sao chép mã"
                            style={{ background: "transparent", border: 0, cursor: "pointer", color: isCopied ? "#18a967" : "var(--text-light, #94a3b8)", padding: 2, display: "grid", placeItems: "center" }}
                          >
                            {isCopied ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>
                      {/* 3. Giá trị */}
                      <td style={tdStyle}>
                        <b style={{ color: "#18a967" }}>{money(v.value)}</b>
                      </td>
                      {/* 4. Nguồn */}
                      <td style={tdStyle}>
                        <span style={{ padding: "3px 9px", borderRadius: 12, fontSize: 10.5, fontWeight: 700, background: src.bg, color: src.color, display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>
                          {isTemplate ? <Globe size={10} /> : <UserIcon size={10} />}
                          {src.label}
                        </span>
                      </td>
                      {/* 5. Deal Sốc — huy hiệu vuông bo góc màu cam */}
                      <td style={{ ...tdStyle, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                        {v.isFlashSale && (
                          <div style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: "#f59e0b",
                            color: "#fff",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 2px 5px rgba(245, 158, 11, 0.35)"
                          }}>
                            <Check size={16} strokeWidth={3} />
                          </div>
                        )}
                      </td>
                      {/* 6. Lượt nhận */}
                      <td style={{ ...tdStyle, fontSize: 12 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: claimCount > 0 || v.user_id ? "#2634d5" : "var(--text-light, #94a3b8)", fontWeight: claimCount > 0 || v.user_id ? 700 : 400 }}>
                          <Users size={12} />
                          {v.user_id ? "1 khách đã nhận" : claimCount > 0 ? `${claimCount} khách đã nhận` : "Chưa ai nhận"}
                        </span>
                      </td>
                      {/* 7. Trạng thái */}
                      <td style={tdStyle}>
                        <span style={{ padding: "3px 9px", borderRadius: 12, fontSize: 10.5, fontWeight: 700, background: v.used ? "#fee2e2" : "#e8f9f1", color: v.used ? "#ef4444" : "#18a967", whiteSpace: "nowrap" }}>
                          {v.used ? "Đã dùng" : "Chưa dùng"}
                        </span>
                      </td>
                      {/* 8. Ngày */}
                      <td style={{ ...tdStyle, fontSize: 11, color: "var(--text-muted, #64748b)", whiteSpace: "nowrap" }}>
                        {v.created_at ? new Date(v.created_at).toLocaleDateString("vi-VN") : "—"}
                      </td>
                      {/* 9. Thao tác */}
                      <td style={{ ...tdStyle, textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          {isTemplate && (
                            <IconButton onClick={() => openClaims(v)} title="Xem lượt nhận" color="#8b5cf6">
                              <Eye size={14} />
                            </IconButton>
                          )}
                          <IconButton onClick={() => toggleUsed(v)} title={v.used ? "Đánh dấu chưa dùng" : "Đánh dấu đã dùng"} color={v.used ? "#18a967" : "#f59e0b"}>
                            <Power size={14} />
                          </IconButton>
                          <IconButton onClick={() => setModal(v)} title="Sửa">
                            <Edit size={14} />
                          </IconButton>
                          <IconButton onClick={() => removeVoucher(v)} title="Xóa" color="#ef4444">
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

            <label style={labelStyle}>{t("Ngày tung")} *</label>
            <input
              type="date"
              value={publishDate}
              onChange={(e) => setPublishDate(e.target.value)}
              required
              disabled={saving}
              style={inputStyle}
            />

            <label style={labelStyle}>{t("Ngày hết hạn")}</label>
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} disabled={saving} style={inputStyle} />
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 20, marginTop: 8 }}>
              (Để trống nếu voucher không có ngày hết hạn)
            </div>

            <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%", boxSizing: "border-box", marginTop: 16, marginBottom: 12, padding: "12px 16px", background: "rgba(245, 158, 11, 0.05)", borderRadius: 10, border: formIsFlashSale ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid var(--border-color, #e5e9ef)" }}>
              <div style={{ margin: 0, fontWeight: 700, color: formIsFlashSale ? "#f59e0b" : "var(--text-primary)", display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                <Zap size={18} /> Kích hoạt Deal Sốc (Flash Sale)
              </div>
              <input type="checkbox" checked={formIsFlashSale} onChange={(e) => setFormIsFlashSale(e.target.checked)} disabled={saving} style={{ width: 28, height: 28, accentColor: "#f59e0b", cursor: saving ? "not-allowed" : "pointer", margin: 0, flexShrink: 0 }} />
            </div>

            {formIsFlashSale && (
              <div style={{ marginBottom: 20, padding: 16, background: "rgba(245, 158, 11, 0.05)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, width: "100%", flexWrap: "nowrap" }}>
                  <div style={{ margin: 0, fontWeight: 600, color: "var(--text-muted, #475569)", whiteSpace: "nowrap", flexShrink: 0 }}>{t("Thời gian hiệu lực")} *</div>
                  <input type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} required style={{ ...inputStyle, marginBottom: 0, flex: 1, minWidth: 0, textAlign: "center", fontWeight: 700 }} disabled={saving} />
                  <select value={durationUnit} onChange={(e) => setDurationUnit(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1, minWidth: 0, fontWeight: 600 }} disabled={saving}>
                    <option value="minutes">Phút</option>
                    <option value="hours">Giờ</option>
                  </select>
                </div>
                <div style={{ fontSize: 13, color: "#d97706", display: "flex", gap: 6, alignItems: "flex-start", fontWeight: 600 }}>
                  <AlertCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span>Voucher sẽ hết hạn sau <b>{duration || 30} {durationUnit === "hours" ? "giờ" : "phút"}</b> kể từ ngày tung.</span>
                </div>
              </div>
            )}

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
      </>
      )}

      {activeTab === "rules" && pointsConfig && (
        <PointsConfigTab
          initial={pointsConfig}
          saving={savingConfig}
          
          onSave={async (next) => {
            setSavingConfig(true);
            try {
              const res = await api.points.updateConfig(next);
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
function PointsConfigTab({ initial, saving, onSave, t }) {
  const [isEditing, setIsEditing] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [rateDesc, setRateDesc] = useState(initial?.earn?.rate_desc || "Điều kiện nhận thưởng: Đơn hàng được hoàn thành thành công.\nCách cộng Xu: Hệ thống tự động cộng Xu vào tài khoản sau khi đơn hàng hoàn thành.\nTrường hợp không được thưởng: Đơn hàng chưa hoàn thành hoặc đã bị hủy sẽ không được nhận Xu thưởng.\nKiểm tra Xu: Xem số Xu được cộng trong mục Lịch sử Xu.");
  const [greenDesc, setGreenDesc] = useState(initial?.earn?.green_desc || "Điều kiện tham gia: Mang hộp đựng cá nhân khi mua đồ ăn mang về.\nCách nhận thưởng: Thông báo với nhân viên tại quầy để được kiểm tra và xác nhận hợp lệ. Sau khi được duyệt, bạn nhận Xu.\nGiới hạn thưởng: Mỗi đơn hàng chỉ được nhận thưởng Sống Xanh một lần.\nLưu ý: Mang hộp cá nhân nhưng chưa được nhân viên xác nhận thì chưa đủ điều kiện nhận Xu.");
  const [reviewDesc, setReviewDesc] = useState(initial?.earn?.review_desc || "Điều kiện nhận thưởng: Đơn hàng đã hoàn thành và món ăn được đánh giá là món bạn đã mua.\nCách nhận thưởng: Chọn số sao và gửi nhận xét về món ăn thông qua chức năng đánh giá.\nMức thưởng: Nhận Xu cho mỗi lượt đánh giá hợp lệ.\nGiới hạn thưởng: Mỗi tài khoản chỉ được nhận thưởng một lần cho mỗi món ăn; đánh giá trùng lặp không được cộng thêm Xu.");
  const [subsidyDesc, setSubsidyDesc] = useState(initial?.earn?.subsidy_desc || "Chương trình hỗ trợ một phần chi phí bữa ăn cho sinh viên đủ điều kiện. Khoản trợ giá được tính bằng VNĐ và được trừ trực tiếp vào tiền suất ăn, không cộng vào số dư Xu.\nMức trợ giá: Hỗ trợ tối đa 10.000đ cho mỗi suất ăn đủ điều kiện.\nĐiều kiện áp dụng: Suất ăn có giá từ 25.000đ trở lên và thanh toán theo hình thức được chương trình quy định tại quầy.\nCách nhận trợ giá: Chọn suất ăn đủ điều kiện và thực hiện thanh toán tại quầy theo hướng dẫn của căng tin. Khoản trợ giá được áp dụng khi giao dịch đáp ứng điều kiện chương trình.\nHạn mức hỗ trợ: Số tiền trợ giá phụ thuộc vào ngân sách quỹ và số suất ăn còn được hỗ trợ trong kỳ.\nTheo dõi quyền lợi: Bạn có thể xem hạn mức trợ giá còn lại, số suất đã sử dụng trong tháng và tiến độ sử dụng trên giao diện chương trình.\nLưu ý: Trợ giá là khoản giảm trực tiếp bằng VNĐ, không phải Xu. Mức hỗ trợ thực tế không vượt quá 10.000đ cho mỗi suất ăn và phụ thuộc vào điều kiện, hạn mức còn lại của chương trình.");
  const [historyModal, setHistoryModal] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  
  // Lấy dữ liệu ban đầu từ config
  const [ratePoints, setRatePoints] = useState(initial.earn.rate_points || 200);
  const [greenEnabled, setGreenEnabled] = useState(initial.earn.green_enabled !== false);
  const [greenPoints, setGreenPoints] = useState(initial.earn.green_points || 300);
  const [greenApproval, setGreenApproval] = useState(initial.earn.green_require_approval !== false);
  const [reviewEnabled, setReviewEnabled] = useState(initial.earn.review_enabled !== false);
  const [reviewPoints, setReviewPoints] = useState(initial.earn.review_points || 500);
  
  // Mảng các chương trình tùy chỉnh thêm mới
  const [customPrograms, setCustomPrograms] = useState(initial.earn.custom_programs || []);

  const submit = (e) => {
    if (e) e.preventDefault();
    if (saving) return;
    
    const changes = [];
    const old = initial.earn;
    const num = (v) => Number(v) || 0;
    
    if (num(old.rate_points) !== num(ratePoints)) changes.push(`Hoàn thành đơn hàng: ${num(old.rate_points)} → ${num(ratePoints)} Xu`);
    if (!!old.green_enabled !== greenEnabled) changes.push(`Sống Xanh: ${greenEnabled ? "BẬT" : "TẮT"}`);
    else if (greenEnabled && num(old.green_points) !== num(greenPoints)) changes.push(`Sống Xanh: ${num(old.green_points)} → ${num(greenPoints)} Xu`);
    if (!!old.green_require_approval !== greenApproval) changes.push(`Duyệt Sống Xanh: ${greenApproval ? "BẬT" : "TẮT"}`);
    if (!!old.review_enabled !== reviewEnabled) changes.push(`Đánh giá: ${reviewEnabled ? "BẬT" : "TẮT"}`);
    else if (reviewEnabled && num(old.review_points) !== num(reviewPoints)) changes.push(`Đánh giá: ${num(old.review_points)} → ${num(reviewPoints)} Xu`);
    if (JSON.stringify(old.custom_programs || []) !== JSON.stringify(customPrograms)) changes.push(`Chương trình tùy chỉnh thay đổi`);
    
    if (changes.length === 0) {
      toast(t("Không có thay đổi nào để lưu"), "info");
      setIsEditing(false);
      return;
    }
    toast(t("Đã lưu: ") + changes.join(" · "), "success");
    setIsEditing(false);
    
    const payload = {
      earn: {
        ...initial.earn,
        rate_points: Number(ratePoints),
        green_enabled: greenEnabled,
        green_points: Number(greenPoints),
        green_require_approval: greenApproval,
        review_enabled: reviewEnabled,
        review_points: Number(reviewPoints),
        custom_programs: customPrograms
      },
      redeem: initial.redeem
    };
    onSave(payload);
    setHistoryRefreshKey(prev => prev + 1);
  };

  const handleAddProgram = () => {
    setCustomPrograms([...customPrograms, { id: "custom_" + Date.now(), name: "Chương trình mới", desc: "Mô tả chương trình", points: 100 }]);
    toast(t("Đã thêm chương trình mới. Bấm Lưu để ghi lại."), "info");
  };

  const handleUpdateProgram = (id, field, value) => {
    setCustomPrograms(customPrograms.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleRemoveProgram = (id) => {
    setCustomPrograms(customPrograms.filter(p => p.id !== id));
    toast(t("Đã xóa chương trình. Bấm Lưu để ghi lại."), "warning");
  };

  return (
    <div style={{ background: "var(--card-bg, #fff)", border: "1px solid var(--border-color, #e7ebf0)", borderRadius: 12, padding: 24 }}>
      
      {/* HEADER + CÁC NÚT THAO TÁC */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary, #172033)", display: "flex", alignItems: "center", gap: 10 }}>
          <Settings size={24} /> Quy tắc cộng Xu VWA
        </div>
        
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setShowRulesModal(true)} style={{ padding: "8px 16px", background: "rgba(245, 158, 11, 0.1)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: 8, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6, marginRight: 8 }}>
              <Info size={16} /> Quy tắc Xu
            </button>
            <button type="button" onClick={() => setShowRulesModal(true)} style={{ padding: "8px 16px", background: "rgba(245, 158, 11, 0.1)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: 8, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6, marginRight: 8, position: "relative", zIndex: 99 }}>
            <Info size={16} /> Quy tắc Xu
          </button>
          <button type="button" onClick={() => setHistoryModal(true)} style={{ padding: "8px 16px", background: "var(--bg-tertiary, #f5f7fb)", color: "var(--text-primary, #172033)", border: "1px solid var(--border-color, #e5e9ef)", borderRadius: 8, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <History size={16} /> Lịch sử
          </button>
          
          {!isEditing ? (
            <button type="button" onClick={() => setIsEditing(true)} style={{ padding: "8px 16px", background: "#2634d5", color: "#fff", border: 0, borderRadius: 8, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <Edit size={16} /> Chỉnh sửa
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setIsEditing(false)} style={{ padding: "8px 16px", background: "var(--bg-tertiary, #f5f7fb)", color: "var(--text-primary, #172033)", border: "1px solid var(--border-color, #e5e9ef)", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Hủy</button>
              <button type="button" onClick={submit} disabled={saving} style={{ padding: "8px 16px", background: "#18a967", color: "#fff", border: 0, borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Save size={16} /> {saving ? "Đang lưu..." : "Lưu lại"}
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* QUY TẮC 1: Hoàn thành đơn hàng */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", background: "var(--bg-tertiary, #f8fafc)", borderRadius: 10, border: "1px solid var(--border-color, #e2e8f0)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary, #172033)" }}>🍽️ Hoàn thành đơn hàng</div>
            {isEditing ? <textarea value={rateDesc} onChange={(e) => setRateDesc(e.target.value)} style={{ width: "100%", minHeight: 100, padding: 8, marginTop: 8, borderRadius: 6, border: "1px solid #cbd5e1", fontFamily: "inherit", fontSize: 13, lineHeight: 1.5 }} /> : <div style={{ fontSize: 13, color: "var(--text-muted, #64748b)", marginTop: 4, whiteSpace: "pre-line", lineHeight: 1.6 }}>{rateDesc}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
            {isEditing ? (
              <input type="number" value={ratePoints} onChange={(e) => setRatePoints(e.target.value)} style={{ width: 80, padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", outline: "none", textAlign: "right" }} />
            ) : (
              <b style={{ fontSize: 16, color: "#18a967", whiteSpace: "nowrap" }}>+{ratePoints} Xu</b>
            )}
            <input type="checkbox" checked={true} disabled={!isEditing || saving} onChange={() => {}} style={{ width: 20, height: 20, accentColor: "#18a967", cursor: (!isEditing || saving) ? "not-allowed" : "pointer" }} title="Quy tắc mặc định (luôn bật)" />
          </div>
        </div>

        {/* QUY TẮC 2: SỐNG XANH */}
        <div style={{ display: "flex", flexDirection: "column", background: "var(--bg-tertiary, #f8fafc)", borderRadius: 10, border: "1px solid var(--border-color, #e2e8f0)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary, #172033)" }}>🌱 Sống Xanh Học Đường</div>
              {isEditing ? <textarea value={greenDesc} onChange={(e) => setGreenDesc(e.target.value)} style={{ width: "100%", minHeight: 100, padding: 8, marginTop: 8, borderRadius: 6, border: "1px solid #cbd5e1", fontFamily: "inherit", fontSize: 13, lineHeight: 1.5 }} /> : <div style={{ fontSize: 13, color: "var(--text-muted, #64748b)", marginTop: 4, whiteSpace: "pre-line", lineHeight: 1.6 }}>{greenDesc}</div>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
              {isEditing ? (
                <input type="number" value={greenPoints} onChange={(e) => setGreenPoints(e.target.value)} style={{ width: 80, padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", outline: "none", textAlign: "right" }} />
              ) : (
                <b style={{ fontSize: 16, color: "#18a967", whiteSpace: "nowrap" }}>+{greenPoints} Xu</b>
              )}
              <input type="checkbox" checked={greenEnabled} onChange={(e) => setGreenEnabled(e.target.checked)} disabled={!isEditing || saving} style={{ width: 20, height: 20, accentColor: "#18a967", cursor: (!isEditing || saving) ? "not-allowed" : "pointer" }} />
            </div>
          </div>
          {greenEnabled && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px 16px 20px", borderTop: "1px dashed var(--border-color, #cbd5e1)", paddingTop: 12 }}>
              <span style={{ fontSize: 13, color: "var(--text-muted, #64748b)", fontWeight: 600 }}>🛡️ Yêu cầu nhân viên duyệt</span>
              <div style={{ marginLeft: "auto" }}>
                <input type="checkbox" checked={greenApproval} onChange={(e) => setGreenApproval(e.target.checked)} disabled={!isEditing || saving} style={{ width: 18, height: 18, accentColor: "#18a967", cursor: (!isEditing || saving) ? "not-allowed" : "pointer" }} />
              </div>
            </div>
          )}
        </div>

        {/* QUY TẮC 3: ĐÁNH GIÁ */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", background: "var(--bg-tertiary, #f8fafc)", borderRadius: 10, border: "1px solid var(--border-color, #e2e8f0)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary, #172033)" }}>⭐ Đánh giá món ăn</div>
            {isEditing ? <textarea value={reviewDesc} onChange={(e) => setReviewDesc(e.target.value)} style={{ width: "100%", minHeight: 100, padding: 8, marginTop: 8, borderRadius: 6, border: "1px solid #cbd5e1", fontFamily: "inherit", fontSize: 13, lineHeight: 1.5 }} /> : <div style={{ fontSize: 13, color: "var(--text-muted, #64748b)", marginTop: 4, whiteSpace: "pre-line", lineHeight: 1.6 }}>{reviewDesc}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
            {isEditing ? (
              <input type="number" value={reviewPoints} onChange={(e) => setReviewPoints(e.target.value)} style={{ width: 80, padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", outline: "none", textAlign: "right" }} />
            ) : (
              <b style={{ fontSize: 16, color: "#18a967", whiteSpace: "nowrap" }}>+{reviewPoints} Xu</b>
            )}
            <input type="checkbox" checked={reviewEnabled} onChange={(e) => setReviewEnabled(e.target.checked)} disabled={!isEditing || saving} style={{ width: 20, height: 20, accentColor: "#18a967", cursor: (!isEditing || saving) ? "not-allowed" : "pointer" }} />
          </div>
        </div>

        {/* QUY TẮC 4: TRỢ GIÁ SINH VIÊN */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", background: "var(--bg-tertiary, #f8fafc)", borderRadius: 10, border: "1px solid var(--border-color, #e2e8f0)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary, #172033)" }}>🎓 Trợ giá sinh viên</div>
            <div style={{ fontSize: 13, color: "var(--text-muted, #64748b)", marginTop: 4 }}>Ưu đãi giảm giá 10.000đ cho mỗi đơn hàng dành riêng cho sinh viên.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
            <b style={{ fontSize: 16, color: "#18a967", whiteSpace: "nowrap" }}>+10.000 Xu</b>
            <input type="checkbox" checked={true} disabled={!isEditing || saving} onChange={() => {}} style={{ width: 20, height: 20, accentColor: "#18a967", cursor: (!isEditing || saving) ? "not-allowed" : "pointer" }} title="Quy tắc mặc định (luôn bật)" />
          </div>
        </div>

        {/* CÁC CHƯƠNG TRÌNH TÙY CHỈNH THÊM MỚI */}
        {customPrograms.map((prog) => (
          <div key={prog.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", background: "rgba(14, 165, 233, 0.05)", borderRadius: 10, border: "1px dashed rgba(14, 165, 233, 0.4)" }}>
            <div style={{ flex: 1, marginRight: 16 }}>
              {isEditing ? (
                <>
                  <input type="text" value={prog.name} onChange={(e) => handleUpdateProgram(prog.id, "name", e.target.value)} placeholder="Tên chương trình" style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", outline: "none", marginBottom: 6, fontWeight: 700 }} />
                  <input type="text" value={prog.desc} onChange={(e) => handleUpdateProgram(prog.id, "desc", e.target.value)} placeholder="Mô tả" style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", outline: "none", fontSize: 13 }} />
                </>
              ) : (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0EA5E9" }}>{prog.name}</div>
                  <div style={{ fontSize: 13, color: "var(--text-muted, #64748b)", marginTop: 4 }}>{prog.desc}</div>
                </>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
              {isEditing ? (
                <input type="number" value={prog.points} onChange={(e) => handleUpdateProgram(prog.id, "points", e.target.value)} style={{ width: 80, padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", outline: "none", textAlign: "right" }} />
              ) : (
                <b style={{ fontSize: 16, color: "#18a967", whiteSpace: "nowrap" }}>+{prog.points} Xu</b>
              )}
              
              {isEditing && (
                <button type="button" onClick={() => handleRemoveProgram(prog.id)} style={{ background: "#fee2e2", color: "#ef4444", border: 0, width: 32, height: 32, borderRadius: 6, display: "grid", placeItems: "center", cursor: "pointer" }} title="Xóa chương trình này">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}

        {/* NÚT THÊM CHƯƠNG TRÌNH */}
        {isEditing && (
          <button type="button" onClick={handleAddProgram} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, background: "transparent", border: "1px dashed #0EA5E9", color: "#0EA5E9", borderRadius: 10, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>
            <Plus size={18} /> Thêm chương trình mới
          </button>
        )}
      </div>

      {/* MODAL LỊCH SỬ */}
      {historyModal && (
        <Modal onClose={() => setHistoryModal(false)} maxWidth={700}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}><History size={20} /> Lịch sử thay đổi Quy tắc</h3>
            <button onClick={() => setHistoryModal(false)} style={{ background: "transparent", border: 0, cursor: "pointer" }}><X size={20} /></button>
          </div>
          <ConfigHistoryTable t={t} key={historyRefreshKey} />
        </Modal>
      )}
    </div>
  );
}

function ConfigHistoryTable({ t }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.points.history()
      .then(data => setHistory(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: "center", padding: 30 }}>Đang tải lịch sử...</div>;
  if (!history.length) return <div style={{ textAlign: "center", padding: 30, color: "#64748b" }}>Chưa có lịch sử thay đổi nào.</div>;

  return (
    <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--bg-tertiary, #f8fafc)", borderBottom: "1px solid var(--border-color, #e2e8f0)" }}>
            <th style={{ padding: 10, textAlign: "left" }}>Thời gian</th>
            <th style={{ padding: 10, textAlign: "left" }}>Người đổi</th>
            <th style={{ padding: 10, textAlign: "left" }}>Chi tiết thay đổi</th>
          </tr>
        </thead>
        <tbody>
          {history.map(h => (
            <tr key={h.id} style={{ borderBottom: "1px solid var(--border-color, #f1f5f9)" }}>
              <td style={{ padding: 10, color: "var(--text-muted, #64748b)", whiteSpace: "nowrap" }}>
                {new Date(h.updated_at).toLocaleString("vi-VN")}
              </td>
              <td style={{ padding: 10, fontWeight: 600 }}>{h.updated_by}</td>
              <td style={{ padding: 10 }}>
                {h.changes ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {h.changes.map((chg, i) => (
                      <div key={i}>
                        <span style={{ color: "#64748b" }}>{chg.field}:</span>{" "}
                        <span style={{ color: "#ef4444", textDecoration: "line-through" }}>{chg.isBool ? (chg.old ? "BẬT" : "TẮT") : chg.old}</span> → <span style={{ color: "#18a967", fontWeight: 600 }}>{chg.isBool ? (chg.new ? "BẬT" : "TẮT") : chg.new}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: "var(--text-muted, #64748b)", fontStyle: "italic" }}>Dữ liệu lịch sử cũ</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {showRulesModal && <RulesModal isAdmin={true} onClose={() => setShowRulesModal(false)} />}
    </div>
  );
}
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

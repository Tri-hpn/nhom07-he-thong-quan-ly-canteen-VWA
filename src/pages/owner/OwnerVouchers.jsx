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
import {Plus, Search, Trash2, Pencil, Ticket, Gift, Save, Check, Download, Power, Globe, User as UserIcon, Eye, X, Users, Copy, Loader2, AlertCircle, Edit, Settings, History, Zap, Info} from "lucide-react";
import { api } from "../../api";
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import { useI18n } from "../../hooks/useI18n";
import ConfirmDialog from "../../components/ConfirmDialog";
import RulesModal from "../../components/RulesModal";


const safeISOString = (dateVal) => {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  return isNaN(d.getTime()) ? null : d.toISOString();
};
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



function Countdown({ targetDate }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [isExpired, setIsExpired] = useState(false);
  useEffect(() => {
    if (!targetDate) return;
    try {
      const targetTime = new Date(targetDate).getTime();
      if (isNaN(targetTime)) return; // Bỏ qua nếu ngày lỗi
      const updateTimer = () => {
        const now = new Date().getTime();
        const distance = targetTime - now;
        if (distance < 0) {
          setTimeLeft("Đã hết hạn");
          setIsExpired(true);
          return;
        }
        const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((distance % (1000 * 60)) / 1000);
        setTimeLeft(`Còn ${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
        setIsExpired(false);
      };
      updateTimer();
      const timer = setInterval(updateTimer, 1000);
      return () => clearInterval(timer);
    } catch (e) {
      return;
    }
  }, [targetDate]);
  if (!targetDate) return null;
  const isValid = !isNaN(new Date(targetDate).getTime());
  if (!isValid) return null;
  return (
    <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: isExpired ? "#fee2e2" : "#fef3c7", color: isExpired ? "#ef4444" : "#d97706", display: "inline-flex", alignItems: "center", gap: 4 }}>
      {isExpired ? "Hết hạn" : `⏱ ${timeLeft}`}
    </span>
  );
}



const formatDateSafe = (dateStr, type = "date") => {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    if (type === "date") return d.toLocaleDateString("vi-VN");
    if (type === "time") return d.toLocaleTimeString("vi-VN", { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
    if (type === "datetime") return d.toLocaleString("vi-VN");
  } catch (e) {
    return "—";
  }
  return "—";
};

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
      { id: "all",          label: t("Tất cả") },
      { id: "active",       label: t("Đang hoạt động") },
      { id: "expired",      label: t("Hết hạn") },
      { id: "out_of_stock", label: t("Hết lượt") },
      { id: "paused",       label: t("Đã tạm ngưng") },
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
  const [formIsFlashSale, setFormIsFlashSale] = useState(false);
  const [publishDate, setPublishDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState("");
  const [isFlashSale, setIsFlashSale] = useState(false);
  const [duration, setDuration] = useState(30);
  const [durationUnit, setDurationUnit] = useState("minutes");
  const [maxClaims, setMaxClaims] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [targetAudience, setTargetAudience] = useState("all"); // ✅ V5: Controlled select

  // ✅ V3: Khởi tạo filter từ localStorage
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  const [filters, setFilters] = useState({ q: "", source: "all", status: "all", flash: "all", sortBy: "newest" });
  const { q, source: filterSource, status: filterStatus, flash: filterFlash, sortBy } = filters;

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
      setExpiryDate(modal.expires_at ? modal.expires_at.slice(0, 16) : "");
      setSelectedUserId(modal.user_id ? String(modal.user_id) : "");
      setTargetAudience(modal.user_id ? "specific" : "all"); // ✅ V5
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

  const claimsCountMap = useMemo(() => {
    const map = new Map();
    for (const v of list) {
      if (v.claimed_from) {
        map.set(v.claimed_from, (map.get(v.claimed_from) || 0) + 1);
      }
    }
    return map;
  }, [list]);

  const filtered = useMemo(() => {
    let result = [...list];

    // FIX: Loai voucher da claim khoi danh sach chinh (chi hien trong popup Xem luot nhan)
    result = result.filter((v) => !v.claimed_from);

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
        const dateStr = v.created_at ? formatDateSafe(v.created_at, "date") : "";

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

    
    // Flash Sale filter
    if (filterFlash === "flash") {
      result = result.filter((v) => v.is_flash_sale || v.isFlashSale);
    } else if (filterFlash === "normal") {
      result = result.filter((v) => !v.is_flash_sale && !v.isFlashSale);
    }

    // Status filter
    const checkIsExpiredFilter = (v) => v.expires_at && new Date(v.expires_at).getTime() < now.getTime();
    const checkIsMaxedFilter = (v) => Number(v.max_claims) > 0 && Number(claimsCountMap.get(v.id) || 0) >= Number(v.max_claims);

    if (filterStatus === "paused") {
      result = result.filter((v) => v.used);
    } else if (filterStatus === "out_of_stock") {
      result = result.filter((v) => !v.used && checkIsMaxedFilter(v));
    } else if (filterStatus === "expired") {
      result = result.filter((v) => !v.used && checkIsExpiredFilter(v) && !checkIsMaxedFilter(v));
    } else if (filterStatus === "active") {
      result = result.filter((v) => !v.used && !checkIsExpiredFilter(v) && !checkIsMaxedFilter(v));
    }

    // Source filter
    if (filterSource === "public") {
      result = result.filter((v) => !v.user_id && !v.claimed_from);
    } else if (filterSource === "personal") {
      result = result.filter((v) => v.user_id);
    }
    // Nếu filterSource === "all" thì không lọc gì cả, giữ nguyên tất cả

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
  }, [list, q, filterStatus, filterSource, filterFlash, sortBy, customers]);

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
    if (!v.user_id) {
      return { label: "Toàn hệ thống", color: "#ec4899", bg: "#fce7f3" };
    }
    return { label: "Cá nhân", color: "#2634d5", bg: "#eef2ff" };
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

    if (!code) return toast(t("Vui lòng nhập mã voucher"), "error");
    if (!value || value <= 0) return toast(t("Giá trị phải lớn hơn 0"), "error");
    if (value > 10_000_000) return toast(t("Giá trị tối đa 10 triệu"), "error");

    const currentId = modal?.id;
    const dup = list.find(
      (v) => v.id !== currentId && (v.code || "").toUpperCase() === code
    );
    if (dup) {
      return toast(`${t("Đã có voucher mã")} "${dup.code}" - ${t("vui lòng đặt mã khác")}`, "error");
    }

    setSaving(true);
    try {
      const data = {
        code, 
        value, 
        user_id: userId, 
        points_used: Number(f.get("points_used")) || 0,
        is_flash_sale: !!formIsFlashSale,
        max_claims: Number(maxClaims) || 0,
        expires_at: expiryDate ? expiryDate : null
      };
      
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
    const action = newUsed ? "Tắt" : "Mở lại";
    
    setConfirm({
      title: `${action} voucher "${v.code}"?`,
      message: newUsed
        ? "Voucher sẽ bị vô hiệu hóa, khách hàng sẽ không thể nhìn thấy hoặc sử dụng voucher này nữa."
        : "Voucher sẽ được khôi phục về trạng thái chưa dùng.",
      confirmText: newUsed ? "Tắt voucher" : "Mở lại",
      cancelText: "Hủy",
      danger: newUsed,
      onConfirm: async () => {
        try {
          const payload = { used: newUsed };
          
          // Ngầm sửa lỗi ngày tháng nếu có (Tránh lỗi Invalid time value)
          if (v.expires_at && isNaN(new Date(v.expires_at).getTime())) {
            payload.expires_at = null;
          }
          if (v.created_at && isNaN(new Date(v.created_at).getTime())) {
            payload.created_at = new Date().toISOString();
          }

          await api.vouchers.update(v.id, payload);
          toast(`Đã ${newUsed ? "tắt" : "mở lại"} voucher`, "success");
          setConfirm(null);
          load();
        } catch (e) {
          toast("Đã xảy ra lỗi khi cập nhật. Vui lòng thử lại!", "error");
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
              ? formatDateSafe(v.created_at, "datetime")
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

          <select
            value={filterFlash}
            onChange={(e) => setFilterField("flash", e.target.value)}
            style={selectStyle}
          >
            <option value="all">Tất cả loại</option>
            <option value="flash">🔥 Deal Sốc</option>
            <option value="normal">Thường</option>
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
          {t("Hiển thị")} <b>{filtered.length}</b> / {list.filter((v) => !v.claimed_from).length} {t("voucher")}
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
                  
                  const isFlash = v.is_flash_sale || v.isFlashSale;
                  const isExpired = v.expires_at && new Date(v.expires_at).getTime() < now.getTime();
                  const isMaxed = Number(v.max_claims) > 0 && Number(claimsCountMap.get(v.id) || 0) >= Number(v.max_claims);
                  const isSelected = selected.includes(v.id);
                  const isCopied = copiedId === v.id;
                  
                  return (
                    <tr
                      key={v.id}
                      className={isFlash ? "deal-soc-row" : ""}
                      style={{
                        borderBottom: "1px solid var(--border-color, #eef2f7)",
                        opacity: (isExpired || isMaxed) ? 0.5 : 1,
                        filter: (isExpired || isMaxed) ? "grayscale(100%)" : "none",
                        background: isSelected ? "rgba(38, 52, 213, 0.06)" : "transparent",
                        transition: "all 0.2s"
                      }}
                    >
                      <td style={tdStyle}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(v.id)}
                          style={{ cursor: "pointer" }}
                        />
                      </td>

                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <b style={{ color: "#2634d5", fontFamily: "monospace", fontSize: 12 }}>{v.code}</b>
                          <button
                            onClick={() => copyCode(v)}
                            title="Sao chép mã"
                            style={{ background: "transparent", border: 0, cursor: "pointer", color: isCopied ? "#18a967" : "var(--text-light, #94a3b8)", padding: 2, display: "grid", placeItems: "center" }}
                          >
                            {isCopied ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <b style={{ color: "#18a967" }}>{money(v.value)}</b>
                      </td>

                      <td style={tdStyle}>
                        <span style={{ padding: "3px 9px", borderRadius: 12, fontSize: 10.5, fontWeight: 700, background: src.bg, color: src.color, display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>
                          {isTemplate ? <Globe size={10} /> : <UserIcon size={10} />}
                          {src.label}
                        </span>
                      </td>

                      <td style={{ ...tdStyle, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                        {isFlash ? (
                          <div style={{ width: 28, height: 28, borderRadius: 6, background: "#f59e0b", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 5px rgba(245, 158, 11, 0.35)", margin: "0 auto" }}>
                            <Check size={16} strokeWidth={3} />
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-light, #cbd5e1)", fontSize: 12 }}>—</span>
                        )}
                      </td>

                      <td style={{ ...tdStyle, fontSize: 12 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: claimCount > 0 || v.user_id ? "#2634d5" : "var(--text-light, #94a3b8)", fontWeight: claimCount > 0 || v.user_id ? 700 : 400 }}>
                          <Users size={12} />
                          {v.user_id ? "1 khách đã nhận" : (Number(v.max_claims) > 0 ? `${claimCount}/${v.max_claims} khách đã nhận` : claimCount > 0 ? `${claimCount} khách đã nhận` : "Chưa ai nhận")}
                        </span>
                      </td>

                      <td style={tdStyle}>
                        {v.used ? (
                          <span style={{ padding: "3px 9px", borderRadius: 12, fontSize: 10.5, fontWeight: 700, background: "#fef3c7", color: "#d97706", whiteSpace: "nowrap" }}>Tạm ngưng</span>
                        ) : isMaxed ? (
                          <span style={{ padding: "3px 9px", borderRadius: 12, fontSize: 10.5, fontWeight: 700, background: "#fee2e2", color: "#ef4444", whiteSpace: "nowrap" }}>Hết lượt</span>
                        ) : isExpired ? (
                          <span style={{ padding: "3px 9px", borderRadius: 12, fontSize: 10.5, fontWeight: 700, background: "#e2e8f0", color: "#475569", whiteSpace: "nowrap" }}>Hết hạn</span>
                        ) : (
                          <span style={{ padding: "3px 9px", borderRadius: 12, fontSize: 10.5, fontWeight: 700, background: "#e8f9f1", color: "#18a967", whiteSpace: "nowrap" }}>Hoạt động</span>
                        )}
                      </td>

                      <td style={{ ...tdStyle, fontSize: 11, color: "var(--text-muted, #64748b)", whiteSpace: "nowrap" }}>
                        {formatDateSafe(v.created_at, "date")}
                        {v.expires_at && (
                          <div style={{ fontSize: 9, color: "#ef4444", marginTop: 2, fontWeight: 700 }}>
                            Hết hạn: {v.expires_at && v.expires_at.includes("T") ? v.expires_at.split("T")[1].slice(0, 5) : (v.expires_at || "")}
                          </div>
                        )}
                      </td>

                      <td style={{ ...tdStyle, textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          {isTemplate && (
                            <IconButton onClick={() => openClaims(v)} title="Xem lượt nhận" color="#8b5cf6">
                              <Eye size={14} />
                            </IconButton>
                          )}
                          <IconButton
                            onClick={() => toggleUsed(v)}
                            title={v.used ? "Mở lại voucher" : "Tắt voucher"}
                            color={v.used ? "#18a967" : "#f59e0b"}
                          >
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

            <label style={labelStyle}>{t("Thời gian hết hạn (Ngày & Giờ)")}</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "nowrap" }}>
              <input
                type="date"
                value={expiryDate ? expiryDate.split("T")[0] : ""}
                onChange={(e) => {
                  const d = e.target.value;
                  const nowT = new Date();
                  const curT = String(nowT.getHours()).padStart(2, '0') + ':' + String(nowT.getMinutes()).padStart(2, '0');
                  const t = expiryDate && expiryDate.includes("T") ? expiryDate.split("T")[1] : curT;
                  setExpiryDate(d ? d + "T" + t : "");
                }}
                disabled={saving}
                style={{ ...inputStyle, marginBottom: 0, flex: 1, minWidth: 0, width: "auto" }}
              />
              <input
                type="time"
                value={expiryDate && expiryDate.includes("T") ? expiryDate.split("T")[1] : ""}
                onChange={(e) => {
                  const t = e.target.value;
                  const d = expiryDate && expiryDate.includes("T") ? expiryDate.split("T")[0] : new Date().toISOString().slice(0, 10);
                  const nowT = new Date();
                  const curT = String(nowT.getHours()).padStart(2, '0') + ':' + String(nowT.getMinutes()).padStart(2, '0');
                  setExpiryDate(t ? d + "T" + t : (d ? d + "T" + curT : ""));
                }}
                disabled={saving}
                style={{ ...inputStyle, marginBottom: 0, width: 130, flexShrink: 0 }}
              />
            </div>
            {expiryDate && (
              <div style={{ fontSize: 13, color: "#2634d5", fontWeight: 700, marginBottom: 12, marginTop: 4 }}>
                Mốc thời gian bạn đã chọn: {expiryDate.split("T")[0].split("-").reverse().join("/")} {expiryDate.split("T")[1]}
              </div>
            )}
            {expiryDate ? (
              <div style={{ fontSize: 12, color: "#d97706", fontWeight: 600, marginBottom: 20, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <AlertCircle size={14} />
                Voucher sẽ hết hạn sau {(() => {
                  const dStr = expiryDate.length === 10 ? expiryDate + "T23:59:59" : expiryDate;
                  const diff = new Date(dStr).getTime() - now.getTime();
                  if (diff <= 0) return "0 phút (Đã hết hạn)";
                  const m = Math.floor(diff / 60000);
                  const h = Math.floor(m / 60);
                  const d = Math.floor(h / 24);
                  if (d > 0) return d + " ngày " + (h % 24) + " giờ";
                  if (h > 0) return h + " giờ " + (m % 60) + " phút";
                  return m + " phút";
                })()}.
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 20, marginTop: 4 }}>
                (Để trống nếu voucher không có ngày hết hạn)
              </div>
            )}

            <div style={{ marginBottom: 20, padding: 16, background: "var(--bg-tertiary, #f8fafc)", border: "1px solid var(--border-color, #e5e9ef)", borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", flexWrap: "nowrap" }}>
                <div style={{ margin: 0, fontWeight: 600, color: "var(--text-muted, #475569)", whiteSpace: "nowrap", flexShrink: 0, width: 70 }}>Giới hạn:</div>
                <input
                  name="max_claims"
                  type="number"
                  min="0"
                  value={maxClaims}
                  onChange={(e) => setMaxClaims(e.target.value)}
                  placeholder="0"
                  style={{ ...inputStyle, marginBottom: 0, flex: 1, minWidth: 0, fontWeight: 700 }}
                  disabled={saving}
                />
                <div style={{ fontSize: 13, color: "var(--text-muted)", flex: 1 }}>lượt sử dụng</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", boxSizing: "border-box", marginTop: 0, marginBottom: 16, padding: "12px 16px", background: "rgba(245, 158, 11, 0.05)", borderRadius: 10, border: formIsFlashSale ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid var(--border-color, #e5e9ef)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, fontWeight: 700, color: formIsFlashSale ? "#f59e0b" : "var(--text-primary, #172033)", minWidth: 0 }}>
                <Zap size={18} style={{ flexShrink: 0 }} />
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Kích hoạt Deal Sốc (Flash Sale)</span>
              </div>
              <input type="checkbox" checked={formIsFlashSale} onChange={(e) => setFormIsFlashSale(e.target.checked)} disabled={saving} style={{ width: 20, height: 20, accentColor: "#f59e0b", cursor: saving ? "not-allowed" : "pointer", margin: 0, flexShrink: 0 }} />
            </div>

            {formIsFlashSale && (
              <div style={{ marginBottom: 20, padding: 16, background: "rgba(245, 158, 11, 0.05)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: 10 }}>

                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, width: "100%", flexWrap: "nowrap" }}>
                  <div style={{ margin: 0, fontWeight: 600, color: "var(--text-muted, #475569)", whiteSpace: "nowrap", flexShrink: 0, width: 70 }}>Giới hạn:</div>
                  <input type="number" min="0" value={maxClaims} onChange={(e) => setMaxClaims(e.target.value)} placeholder="0 = Không giới hạn" style={{ ...inputStyle, marginBottom: 0, flex: 1, minWidth: 0, fontWeight: 700 }} disabled={saving} />
                  <div style={{ fontSize: 13, color: "var(--text-muted)", flex: 1 }}>lượt sử dụng</div>
                </div>

              </div>
            )}

            <label style={labelStyle}>Đối tượng áp dụng *</label>
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => { setTargetAudience("all"); setSelectedUserId(""); }}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "12px 8px", borderRadius: 10, cursor: "pointer",
                  border: targetAudience === "all" ? "2px solid #2634d5" : "1px solid var(--border-color, #e5e9ef)",
                  backgroundColor: targetAudience === "all" ? "rgba(38, 52, 213, 0.05)" : "var(--card-bg, #fff)",
                  color: targetAudience === "all" ? "#2634d5" : "var(--text-primary, #172033)",
                  fontSize: 14, fontWeight: 700
                }}
              >
                <div style={{ width: 16, height: 16, borderRadius: "50%", border: targetAudience === "all" ? "5px solid #2634d5" : "2px solid #cbd5e1", boxSizing: "border-box", flexShrink: 0 }} />
                🌐 Toàn bộ
              </button>

              <button
                type="button"
                onClick={() => { setTargetAudience("specific"); if (!selectedUserId && customers.length > 0) setSelectedUserId(String(customers[0].id)); }}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "12px 8px", borderRadius: 10, cursor: "pointer",
                  border: targetAudience === "specific" ? "2px solid #2634d5" : "1px solid var(--border-color, #e5e9ef)",
                  backgroundColor: targetAudience === "specific" ? "rgba(38, 52, 213, 0.05)" : "var(--card-bg, #fff)",
                  color: targetAudience === "specific" ? "#2634d5" : "var(--text-primary, #172033)",
                  fontSize: 14, fontWeight: 700
                }}
              >
                <div style={{ width: 16, height: 16, borderRadius: "50%", border: targetAudience === "specific" ? "5px solid #2634d5" : "2px solid #cbd5e1", boxSizing: "border-box", flexShrink: 0 }} />
                👤 Chỉ định 1 khách
              </button>
            </div>

            {targetAudience === "specific" && (
              <select
                name="user_id"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={saving}
                style={inputStyle}
              >
                <option value="">— Chọn khách hàng —</option>
                {customers.map((cu) => (
                  <option key={cu.id} value={cu.id}>{cu.name} ({cu.email})</option>
                ))}
              </select>
            )}

            {targetAudience === "all" && (
              <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(236, 72, 153, 0.08)", border: "1px solid rgba(236, 72, 153, 0.25)", borderRadius: 8, fontSize: 12, color: "#ec4899", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Globe size={14} style={{ flexShrink: 0 }} /> Voucher sẽ hiện ở trang "Ưu đãi" cho mọi khách nhận
              </div>
            )}

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
        <Modal onClose={() => setClaimsModal(null)} maxWidth={560} zIndex={MODAL_Z + 10}>
          <div style={modalHeaderStyle}>
            <h3 style={modalTitleStyle}><Users size={20} /> {t("Khách đã nhận voucher")}</h3>
            <button onClick={() => setClaimsModal(null)} style={modalCloseStyle} aria-label="Đóng"><X size={20} /></button>
          </div>

          <div style={{ background: "var(--bg-tertiary, #f5f7fb)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <b style={{ fontFamily: "monospace", color: "#2634d5" }}>{claimsModal.code}</b>{" "}
              · {money(claimsModal.value)} · <b>{claims.length}/{Number(claimsModal.max_claims) > 0 ? claimsModal.max_claims : "Không giới hạn"}</b> khách đã nhận
            </div>
            <Countdown targetDate={claimsModal.expires_at} />
          </div>

          {loadingClaims ? (
            <SkeletonTable columns={4} rows={3} headers={[t("Khách hàng"), t("Mã cá nhân"), t("Ngày nhận"), t("Trạng thái")]} />
          ) : claims.length === 0 ? (
            <div style={emptyBoxStyle}>
              <Users size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
              <div style={{ fontSize: 13 }}>{t("Chưa có khách nào nhận voucher này")}</div>
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
                    <tr key={c.id} style={{ borderBottom: "1px solid var(--border-color, #eef2f7)" }}>
                      <td style={tdStyle}>
                        <b style={{ fontSize: 13 }}>{c.user_name}</b>
                        <div style={{ fontSize: 11, color: "var(--text-light, #8993a3)" }}>{c.user_email}</div>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>{c.code}</td>
                      <td style={{ ...tdStyle, fontSize: 11, color: "var(--text-muted, #64748b)" }}>
                        {formatDateSafe(c.created_at, "date")}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ padding: "3px 9px", borderRadius: 12, fontSize: 10.5, fontWeight: 700, background: c.used ? "#fee2e2" : "#e8f9f1", color: c.used ? "#ef4444" : "#18a967" }}>
                          {c.used ? t("Đã dùng") : t("Chưa dùng")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button onClick={() => setClaimsModal(null)} style={{ ...btnPrimaryStyle, marginTop: 16, width: "100%" }}>
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
              console.log("Đang gửi API:", next.earn);
              const res = await api.points.updateConfig(next);
              console.log("API phản hồi:", res);
              setPointsConfig(res.config || next);
              toast("Đã lưu Quy tắc Xu thành công!", "success");
            } catch (e) {
              console.error("Lỗi lưu API:", e);
              toast(e.message || "Lỗi khi lưu, vui lòng thử lại", "error");
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
      disabled = false,
    }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      aria-label={title}
      style={{
        padding: 6,
        border: "1px solid var(--border-color, #e5e9ef)",
        borderRadius: 6,
        background: "var(--card-bg, #fff)",
        cursor: disabled ? "not-allowed" : "pointer",
            display: "grid",
            placeItems: "center",
            color: disabled ? "var(--text-light, #94a3b8)" : color,
            opacity: disabled ? 0.5 : 1,
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
  const [subsidyPoints, setSubsidyPoints] = useState(initial?.earn?.subsidy_points || 10000);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [rateEnabled, setRateEnabled] = useState(initial?.earn?.rate_enabled ?? true);
  const [subsidyEnabled, setSubsidyEnabled] = useState(initial?.earn?.subsidy_enabled ?? true);
  const [isEditing, setIsEditing] = useState(false);
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

    const payload = {
      earn: {
        ...initial.earn,
        rate_enabled: rateEnabled,
        rate_points: Number(ratePoints),
        green_enabled: greenEnabled,
        green_points: Number(greenPoints),
        green_require_approval: greenApproval,
        review_enabled: reviewEnabled,
        review_points: Number(reviewPoints),
        subsidy_enabled: subsidyEnabled,
        subsidy_points: Number(subsidyPoints),
        rate_desc: rateDesc,
        green_desc: greenDesc,
        review_desc: reviewDesc,
        subsidy_desc: subsidyDesc,
        custom_programs: customPrograms
      },
      redeem: initial.redeem
    };
    onSave(payload);
    setIsEditing(false);
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
          <button type="button" onClick={() => setShowRulesModal(true)} style={{ padding: "8px 16px", background: "rgba(245, 158, 11, 0.1)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: 8, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <Info size={16} /> Quy tắc Xu
          </button>
          
          
          {!isEditing ? (
            <button type="button" onClick={() => setIsEditing(true)} style={{ padding: "8px 16px", background: "#2634d5", color: "#fff", border: 0, borderRadius: 8, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <Edit size={16} /> Chỉnh sửa
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setIsEditing(false)} style={{ padding: "8px 16px", background: "var(--bg-tertiary, #f5f7fb)", color: "var(--text-primary, #172033)", border: "1px solid var(--border-color, #e5e9ef)", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Hủy</button>
              <button type="button" onClick={submit} style={{ position: "relative", zIndex: 99, padding: "8px 16px", background: "#18a967", color: "#fff", border: 0, borderRadius: 8, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
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
{isEditing ? (
              <textarea value={rateDesc} onChange={(e) => setRateDesc(e.target.value)} style={{ width: "100%", minHeight: 160, padding: 8, marginTop: 8, resize: "vertical", borderRadius: 6, border: "1px solid #cbd5e1", fontFamily: "inherit", fontSize: 13, lineHeight: 1.5 }} />
            ) : (
              <div style={{ fontSize: 13, color: "var(--text-muted, #64748b)", marginTop: 4, whiteSpace: "pre-line" }}>{rateDesc}</div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
            {isEditing ? (
              <input type="number" value={ratePoints} onChange={(e) => setRatePoints(e.target.value)} style={{ width: 80, padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", outline: "none", textAlign: "right" }} />
            ) : (
              <b style={{ fontSize: 16, color: "#18a967", whiteSpace: "nowrap" }}>+{ratePoints} Xu</b>
            )}
            {isEditing ? (
                <button type="button" onClick={() => setRateEnabled(false)} style={{ background: "transparent", border: 0, color: "#ef4444", cursor: "pointer", padding: 4 }} title="Xóa quy tắc"><Trash2 size={20} /></button>
              ) : (
                <input type="checkbox" checked={rateEnabled} disabled style={{ width: 20, height: 20, accentColor: "#18a967" }} />
              )}
          </div>
        </div>

        {/* QUY TẮC 2: SỐNG XANH */}
        <div style={{ display: "flex", flexDirection: "column", background: "var(--bg-tertiary, #f8fafc)", borderRadius: 10, border: "1px solid var(--border-color, #e2e8f0)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary, #172033)" }}>🌱 Sống Xanh Học Đường</div>
{isEditing ? (
                <textarea value={greenDesc} onChange={(e) => setGreenDesc(e.target.value)} style={{ width: "100%", minHeight: 160, padding: 8, marginTop: 8, resize: "vertical", borderRadius: 6, border: "1px solid #cbd5e1", fontFamily: "inherit", fontSize: 13, lineHeight: 1.5 }} />
              ) : (
                <div style={{ fontSize: 13, color: "var(--text-muted, #64748b)", marginTop: 4, whiteSpace: "pre-line" }}>{greenDesc}</div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
              {isEditing ? (
                <input type="number" value={greenPoints} onChange={(e) => setGreenPoints(e.target.value)} style={{ width: 80, padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", outline: "none", textAlign: "right" }} />
              ) : (
                <b style={{ fontSize: 16, color: "#18a967", whiteSpace: "nowrap" }}>+{greenPoints} Xu</b>
              )}
              {isEditing ? (
                <button type="button" onClick={() => setGreenEnabled(false)} style={{ background: "transparent", border: 0, color: "#ef4444", cursor: "pointer", padding: 4 }} title="Xóa quy tắc"><Trash2 size={20} /></button>
              ) : (
                <input type="checkbox" checked={greenEnabled} disabled style={{ width: 20, height: 20, accentColor: "#18a967" }} />
              )}
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
{isEditing ? (
              <textarea value={reviewDesc} onChange={(e) => setReviewDesc(e.target.value)} style={{ width: "100%", minHeight: 160, padding: 8, marginTop: 8, resize: "vertical", borderRadius: 6, border: "1px solid #cbd5e1", fontFamily: "inherit", fontSize: 13, lineHeight: 1.5 }} />
            ) : (
              <div style={{ fontSize: 13, color: "var(--text-muted, #64748b)", marginTop: 4, whiteSpace: "pre-line" }}>{reviewDesc}</div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
            {isEditing ? (
              <input type="number" value={reviewPoints} onChange={(e) => setReviewPoints(e.target.value)} style={{ width: 80, padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", outline: "none", textAlign: "right" }} />
            ) : (
              <b style={{ fontSize: 16, color: "#18a967", whiteSpace: "nowrap" }}>+{reviewPoints} Xu</b>
            )}
            {isEditing ? (
                <button type="button" onClick={() => setReviewEnabled(false)} style={{ background: "transparent", border: 0, color: "#ef4444", cursor: "pointer", padding: 4 }} title="Xóa quy tắc"><Trash2 size={20} /></button>
              ) : (
                <input type="checkbox" checked={reviewEnabled} disabled style={{ width: 20, height: 20, accentColor: "#18a967" }} />
              )}
          </div>
        </div>

        {/* QUY TẮC 4: TRỢ GIÁ SINH VIÊN */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", background: "var(--bg-tertiary, #f8fafc)", borderRadius: 10, border: "1px solid var(--border-color, #e2e8f0)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary, #172033)" }}>🎓 Trợ giá sinh viên</div>
{isEditing ? (
              <textarea value={subsidyDesc} onChange={(e) => setSubsidyDesc(e.target.value)} style={{ width: "100%", minHeight: 160, padding: 8, marginTop: 8, resize: "vertical", borderRadius: 6, border: "1px solid #cbd5e1", fontFamily: "inherit", fontSize: 13, lineHeight: 1.5 }} />
            ) : (
              <div style={{ fontSize: 13, color: "var(--text-muted, #64748b)", marginTop: 4, whiteSpace: "pre-line" }}>{subsidyDesc}</div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
            {isEditing ? (
              <input type="number" value={subsidyPoints || 10000} onChange={(e) => setSubsidyPoints(e.target.value)} style={{ width: 80, padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", outline: "none", textAlign: "right" }} />
            ) : (
              <b style={{ fontSize: 16, color: "#18a967", whiteSpace: "nowrap" }}>+{Number(subsidyPoints || 10000).toLocaleString("vi-VN")} Xu</b>
            )}
            {isEditing ? (
                <button type="button" onClick={() => setRateEnabled(false)} style={{ background: "transparent", border: 0, color: "#ef4444", cursor: "pointer", padding: 4 }} title="Xóa quy tắc"><Trash2 size={20} /></button>
              ) : (
                <input type="checkbox" checked={rateEnabled} disabled style={{ width: 20, height: 20, accentColor: "#18a967" }} />
              )}
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
      {showRulesModal && (
        <RulesModal
          isAdmin={true}
          onClose={() => setShowRulesModal(false)}
          liveData={{
            rate_points: Number(ratePoints),
            green_points: Number(greenPoints),
            review_points: Number(reviewPoints),
            subsidy_points: Number(subsidyPoints || 10000),
            rate_desc: rateDesc,
            green_desc: greenDesc,
            review_desc: reviewDesc,
            subsidy_desc: subsidyDesc,
            custom_programs: customPrograms,
            rate_enabled: rateEnabled,
            green_enabled: greenEnabled,
            review_enabled: reviewEnabled,
            subsidy_enabled: subsidyEnabled
          }}
        />
      )}
    </div>
  );
}

function ConfigHistoryTable({ t }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.settings.get().then(data => setHistory(data || []))
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
                {formatDateSafe(h.updated_at, "datetime")}
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

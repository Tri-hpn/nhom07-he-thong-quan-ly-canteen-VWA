// ============================================================
// OWNERMENU.JSX — Quản lý thực đơn + danh mục (Admin) (B9.6c)
// ============================================================
// B9.6c:
//   - ~30 hardcoded text → t()
//   - toast chỉ 2 args
//   - Xoá document.getElementById → state/ref
//   - Thêm submittingRef cho saveItem/saveCat/resetSlots/toggleSlot
//   - Modal + slotToEdit + slotDelete: scroll lock + ESC
//   - Extract SlotEditModal + AddToppingForm
//   - stopPropagation cho toggle slot trong group
//   - Fix typo aria-label "TĒng" → "Tăng"
//   - Remove unused imports: SkeletonTable, Flame
// ============================================================

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Plus, Minus, Search, Pencil, Trash2, FolderPlus, Folder, X, Save,
  Loader2, AlertCircle, UtensilsCrossed, EyeOff, Eye, Star, Clock,
  Sunrise, Sun, Sunset, RotateCcw, Edit, CheckCircle2, Package, Ban,
  Power, ChevronLeft, ChevronRight, History, ChevronDown,
} from "lucide-react";
import { api, getToken } from "../../api";
import { money } from "../../components/UI";
import { toast } from "../../components/Effects";
import ConfirmDialog from "../../components/ConfirmDialog";
import ImageUploader from "../../components/ImageUploader";
import PriceHistoryModal from "../../components/PriceHistoryModal";
import { useI18n } from "../../hooks/useI18n";

const MODAL_Z = 2147483600;
const DEFAULT_CATEGORY_ICON = "🍽️";
const MAX_DISCOUNT = 90;
const MAX_STOCK = 100;
const LOW_STOCK_THRESHOLD = 10;
const PAGE_SIZE = 6;

const SESSIONS = [
  { id: "morning",   label: "Buổi sáng",  icon: Sunrise, color: "#f59e0b", from: "00:00", to: "11:00" },
  { id: "noon",      label: "Buổi trưa",  icon: Sun,     color: "#2634d5", from: "11:00", to: "14:00" },
  { id: "afternoon", label: "Buổi chiều", icon: Sunset,  color: "#8b5cf6", from: "14:00", to: "18:00" },
  { id: "evening",   label: "Buổi tối",   icon: Sunset,  color: "#ec4899", from: "18:00", to: "24:00" },
];

function getSessionId(startTime) {
  const [h] = String(startTime || "").split(":").map(Number);
  if (h >= 0 && h < 11) return "morning";
  if (h >= 11 && h < 14) return "noon";
  if (h >= 14 && h < 18) return "afternoon";
  if (h >= 18 && h < 24) return "evening";
  return "morning";
}

const DEBUG = import.meta.env.DEV;
function dbg(...args) {
  if (DEBUG) console.log("[OwnerMenu]", ...args);
}

function getFALLBACK_IMG() {
  return (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect fill='#f5f7fb' width='100' height='100'/><text x='50' y='58' font-size='40' text-anchor='middle'>🍽️</text></svg>`
    )
  );
}

const STALL_OPTIONS = [
  { value: "Quầy Cơm Suất", label: "Quầy Cơm Suất" },
  { value: "Quầy Bún / Phở", label: "Quầy Bún / Phở" },
  { value: "Quầy Trà & Cafe", label: "Quầy Trà & Cafe" },
];

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function OwnerMenu() {
  const { t, tData } = useI18n();

  // ---------- Menu list state ----------
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [stallFilter, setStallFilter] = useState("Mọi Quầy");
  const [filterCat, setFilterCat] = useState("");

  // ---------- Pagination ----------
  const [page, setPage] = useState(1);

  // ---------- Time slots ----------
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsError, setSlotsError] = useState("");
  const [openSlots, setOpenSlots] = useState(false);
  const [expandedSession, setExpandedSession] = useState(null);
  const [slotModal, setSlotModal] = useState(null);
  const [slotToEdit, setSlotToEdit] = useState(null);
  const [slotToDelete, setSlotToDelete] = useState(null);
  const [togglingSlotId, setTogglingSlotId] = useState(null);
  const [confirmSlotReset, setConfirmSlotReset] = useState(false);
  const [resettingSlots, setResettingSlots] = useState(false);

  // ---------- Categories ----------
  const [categories, setCategories] = useState([]);
  const [showCatModal, setShowCatModal] = useState(false);
  const [catForm, setCatForm] = useState({ name: "", icon: DEFAULT_CATEGORY_ICON, order: "" });
  const [editingCat, setEditingCat] = useState(null);
  const [catLoading, setCatLoading] = useState(false);

  // ---------- Item modal ----------
  const [modal, setModal] = useState(null);
  const [historyModalItem, setHistoryModalItem] = useState(null);
  const [image, setImage] = useState("");
  const [saving, setSaving] = useState(false);

  // ---------- Price fields ----------
  const [priceFields, setPriceFields] = useState({
    price: "",
    originalPrice: "",
    discountPercent: 0,
  });

  // ---------- Signature / Toppings ----------
  const [isSignature, setIsSignature] = useState(false);
  const [allowedToppings, setAllowedToppings] = useState([]);
  const [allToppings, setAllToppings] = useState([]);

  useEffect(() => {
    api.toppings.list().then((data) => setAllToppings(data || [])).catch(console.error);
  }, []);

  // ---------- Dinh dưỡng ----------
  const [nutrition, setNutrition] = useState({
    is_cool: false,
    is_healthy: false,
    is_spicy: false,
  });

  // ---------- Confirm ----------
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // ---------- Per-action loading ----------
  const [togglingId, setTogglingId] = useState(null);
  const [processingIds, setProcessingIds] = useState(() => new Set());

  // ---------- B9.6c — refs chống double-submit ----------
  const saveItemRef = useRef(false);
  const saveCatRef = useRef(false);
  const resetSlotsRef = useRef(false);
  const toggleSlotRef = useRef(false);
  const addSlotRef = useRef(false);

  // ============================================================
  // LOAD SLOTS
  // ============================================================
  const loadSlots = useCallback(async () => {
    if (!getToken()) { setSlotsLoading(false); return; }
    setSlotsLoading(true);
    setSlotsError("");
    try {
      const data = await api.timeSlots.list();
      setSlots(Array.isArray(data) ? data : []);
    } catch (e) {
      setSlotsError(e.message || t("Không tải được khung giờ"));
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [t]);

  const toggleSlot = async (slot) => {
    if (toggleSlotRef.current) return;

    const oldEnabled = !!slot.enabled;
    const newEnabled = !oldEnabled;

    toggleSlotRef.current = true;
    setTogglingSlotId(slot.id);

    setSlots((prev) =>
      prev.map((s) => (s.id === slot.id ? { ...s, enabled: newEnabled } : s))
    );

    try {
      await api.timeSlots.update(slot.id, { enabled: newEnabled });
      toast(
        newEnabled
          ? t("Đã BẬT khung {id}", { id: slot.id })
          : t("Đã TẮT khung {id}", { id: slot.id }),
        "success"
      );
    } catch (e) {
      setSlots((prev) =>
        prev.map((s) => (s.id === slot.id ? { ...s, enabled: oldEnabled } : s))
      );
      toast(e.message || t("Không đổi được trạng thái"), "error");
    } finally {
      toggleSlotRef.current = false;
      setTogglingSlotId(null);
    }
  };

  const resetSlots = async () => {
    if (resetSlotsRef.current) return;
    resetSlotsRef.current = true;
    setResettingSlots(true);
    try {
      const res = await api.timeSlots.reset();
      setSlots(Array.isArray(res.slots) ? res.slots : []);
      toast(t("Đã reset toàn bộ khung giờ về mặc định"), "success");
      setConfirmSlotReset(false);
    } catch (e) {
      toast(e.message || t("Không reset được"), "error");
    } finally {
      resetSlotsRef.current = false;
      setResettingSlots(false);
    }
  };

  // ============================================================
  // LOAD MENU
  // ============================================================
  const load = useCallback(async () => {
    if (!getToken()) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const [items, cats] = await Promise.all([
        api.menu.list("", "Tất cả", "popular"),
        api.categories.list(),
      ]);
      const itemsArr = Array.isArray(items) ? items : [];
      setList(itemsArr);
      setCategories(Array.isArray(cats) ? cats : []);
      const inactiveCount = itemsArr.filter((m) => !m.active).length;
      dbg(`Load xong: ${itemsArr.length} món (${inactiveCount} đã tắt)`);
    } catch (e) {
      setError(e.message || t("Không tải được thực đơn"));
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
    loadSlots();
  }, [load, loadSlots]);

  // ESC đóng modals (parent-level — Modal component cũng xử lý, đây là backup cho slotModal)
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (showCatModal && !catLoading) setShowCatModal(false);
      else if (modal && !saving) closeItemModal();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modal, showCatModal, catLoading, saving]);

  // Reset price fields + signature khi mở modal khác
  useEffect(() => {
    if (!modal) return;
    setPriceFields({
      price: modal.price != null ? Number(modal.price) : "",
      originalPrice: modal.original_price ? String(modal.original_price) : "",
      discountPercent: Number(modal.discount_percent) || 0,
    });
    setIsSignature(!!modal.is_signature);
    setNutrition({
      is_cool: !!modal.is_cool,
      is_healthy: !!modal.is_healthy,
      is_spicy: !!modal.is_spicy,
    });
  }, [modal]);

  // ============================================================
  // FILTER + PAGINATION
  // ============================================================
  const filtered = useMemo(() => {
    let result = list;

    if (q.trim()) {
      const s = q.toLowerCase().trim();
      result = result.filter((m) => m.name?.toLowerCase().includes(s));
    }
    if (stallFilter !== "Mọi Quầy") {
      result = result.filter((m) => (m.station || m.stall || m.area) === stallFilter);
    }
    if (filterCat) {
      result = result.filter((m) => m.category === filterCat);
    }

    return [...result].sort((a, b) => {
      const stockA = Number(a.stock) || 0;
      const stockB = Number(b.stock) || 0;
      const activeA = Number(a.active) || 0;
      const activeB = Number(b.active) || 0;
      const orderA = !activeA ? 0 : stockA === 0 ? 1 : stockA < LOW_STOCK_THRESHOLD ? 2 : 3;
      const orderB = !activeB ? 0 : stockB === 0 ? 1 : stockB < LOW_STOCK_THRESHOLD ? 2 : 3;
      return orderA - orderB;
    });
  }, [list, q, filterCat, stallFilter]);

  useEffect(() => {
    setPage(1);
  }, [q, filterCat, stallFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

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

  // ---------- Price handlers ----------
  const hasOriginal = Number(priceFields.originalPrice) > 0;

  const handleOriginalChange = (v) => {
    const original = Number(v) || 0;
    setPriceFields((prev) => {
      if (original <= 0) return { ...prev, originalPrice: v, discountPercent: 0 };
      const d = Number(prev.discountPercent) || 0;
      const newPrice = d > 0 ? Math.round(original * (1 - d / 100)) : original;
      return { ...prev, originalPrice: v, price: newPrice };
    });
  };

  const handleDiscountChange = (v) => {
    const d = Math.max(0, Math.min(MAX_DISCOUNT, Number(v) || 0));
    setPriceFields((prev) => {
      const original = Number(prev.originalPrice) || 0;
      if (original <= 0) return { ...prev, discountPercent: 0 };
      const newPrice = d > 0 ? Math.round(original * (1 - d / 100)) : original;
      return { ...prev, discountPercent: d, price: newPrice };
    });
  };

  const handlePriceChange = (v) => {
    setPriceFields((prev) => ({ ...prev, price: v }));
  };

  // ---------- Item modal ----------
  const openItemModal = (item = null) => {
    setAllowedToppings(item?.allowed_toppings || []);
    setImage(item?.image || "");
    setModal(item || {});
  };

  const closeItemModal = () => {
    setModal(null);
    setImage("");
    setPriceFields({ price: "", originalPrice: "", discountPercent: 0 });
    setIsSignature(false);
    setNutrition({ is_cool: false, is_healthy: false, is_spicy: false });
  };

  const saveItem = async (e) => {
    e.preventDefault();
    if (saveItemRef.current) return;

    const f = new FormData(e.currentTarget);
    const name = f.get("name")?.trim();
    const category = f.get("category");
    const stock = Number(f.get("stock"));

    if (!name) return toast(t("Vui lòng nhập tên món"), "error");

    const currentId = modal._id || modal.id;
    const dup = list.find(
      (m) =>
        (m._id || m.id) !== currentId &&
        (m.name || "").trim().toLowerCase() === name.toLowerCase()
    );
    if (dup) {
      return toast(t('Đã có món "{name}" — vui lòng đặt tên khác', { name: dup.name }), "error");
    }

    const original = Number(priceFields.originalPrice) || 0;
    const d = Number(priceFields.discountPercent) || 0;
    let price = Number(priceFields.price) || 0;
    if (original > 0) price = d > 0 ? Math.round(original * (1 - d / 100)) : original;

    if (!price || price <= 0) return toast(t("Giá phải lớn hơn 0"), "error");
    if (d < 0 || d > MAX_DISCOUNT) {
      return toast(t("% giảm giá phải từ 0-{max}", { max: MAX_DISCOUNT }), "error");
    }
    if (stock < 0) return toast(t("Số lượng không được âm"), "error");

    const numOrNull = (v) => {
      const s = String(v ?? "").trim();
      if (s === "") return null;
      const n = Number(s);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };

    const data = {
      name,
      category,
      price,
      station: f.get("station")?.trim() || "",
      original_price: original > 0 ? original : price,
      discount_percent: original > 0 ? d : 0,
      stock,
      description: f.get("description")?.trim() || "",
      image: image || f.get("imageUrl")?.trim() || "",
      reason: f.get("reason")?.trim() || "",
      is_signature: isSignature,
      prep_time: numOrNull(f.get("prep_time")),
      calories: numOrNull(f.get("calories")),
      is_cool: nutrition.is_cool,
      is_healthy: nutrition.is_healthy,
      is_spicy: nutrition.is_spicy,
      allowed_toppings: allowedToppings,
    };

    saveItemRef.current = true;
    setSaving(true);
    try {
      if (currentId) {
        await api.menu.update(currentId, data);
        toast(t("Đã cập nhật món"), "success");
      } else {
        await api.menu.create(data);
        toast(t("Đã thêm món mới"), "success");
      }
      closeItemModal();
      load();
    } catch (e) {
      toast(e.message || t("Không lưu được"), "error");
    } finally {
      saveItemRef.current = false;
      setSaving(false);
    }
  };

  // ---------- Toggle active ----------
  const toggleActive = async (item) => {
    const id = item._id || item.id;
    const oldActive = Number(item.active) || 0;
    const newActive = oldActive ? 0 : 1;

    if (togglingId !== null) return;

    setTogglingId(id);
    setList((prev) =>
      prev.map((m) => ((m._id || m.id) === id ? { ...m, active: newActive } : m))
    );

    try {
      await api.menu.update(id, { active: newActive });
      if (newActive) {
        toast(t('Đã BẬT bán món "{name}"', { name: item.name }), "success");
      } else {
        toast(t('Đã TẮT bán món "{name}" (món vẫn còn, chỉ ẩn với khách)', { name: item.name }), "success");
      }
    } catch (e) {
      setList((prev) =>
        prev.map((m) => ((m._id || m.id) === id ? { ...m, active: oldActive } : m))
      );
      toast(e.message || t("Không đổi được trạng thái"), "error");
    } finally {
      setTogglingId(null);
    }
  };

  // ---------- Toggle out ----------
  const markProcessing = (id, on) => {
    setProcessingIds((s) => {
      const n = new Set(s);
      if (on) n.add(id); else n.delete(id);
      return n;
    });
  };

  const handleToggleOut = useCallback(
    async (item) => {
      const id = item._id || item.id;
      if (processingIds.has(id)) return;
      markProcessing(id, true);

      const stockNum = Number(item.stock) || 0;
      const isOut = stockNum === 0;
      const newStock = isOut ? 20 : 0;

      try {
        await api.menu.update(id, { stock: newStock });
        toast(
          isOut
            ? t('Đã mở bán lại: "{name}"', { name: item.name })
            : t('Đã tạm hết hàng: "{name}"', { name: item.name }),
          isOut ? "success" : "warning"
        );
        await load();
      } catch (e) {
        toast(e.message || t("Không cập nhật được"), "error");
      } finally {
        markProcessing(id, false);
      }
    },
    [processingIds, load, t]
  );

  const handleAdjustStock = useCallback(
    async (item, delta) => {
      const id = item._id || item.id;
      if (processingIds.has(id)) return;

      const currentStock = Number(item.stock) || 0;
      const newStock = Math.max(0, Math.min(MAX_STOCK, currentStock + delta));
      if (newStock === currentStock) return;

      markProcessing(id, true);
      try {
        await api.menu.update(id, { stock: newStock });
        toast(t("Tồn kho: {n} suất", { n: newStock }), "success");
        await load();
      } catch (e) {
        toast(e.message || t("Không cập nhật được"), "error");
      } finally {
        markProcessing(id, false);
      }
    },
    [processingIds, load, t]
  );

  const removeItem = (item) => {
    const id = item._id || item.id;
    setConfirm({
      title: t('Xóa vĩnh viễn món "{name}"?', { name: item.name }),
      message:
        t("⚠️ HÀNH ĐỘNG NÀY KHÔNG THỂ HOÀN TÁC.") + "\n\n" +
        t("Món sẽ bị XÓA KHỎI DATABASE.") + "\n" +
        t("Khác với 'Tắt món' (chỉ ẩn khỏi khách, có thể bật lại).") + "\n\n" +
        t("Nếu bạn chỉ muốn ẩn tạm, hãy dùng nút Tắt món."),
      confirmText: t("XÓA VĨNH VIỄN"),
      cancelText: t("Hủy — Giữ lại"),
      danger: true,
      onConfirm: async () => {
        await api.menu.remove(id);
        toast(t('Đã XÓA vĩnh viễn món "{name}"', { name: item.name }), "success");
        setConfirm(null);
        load();
      },
    });
  };

  // ---------- Categories ----------
  const openAddCat = () => {
    setEditingCat(null);
    setCatForm({ name: "", icon: DEFAULT_CATEGORY_ICON, order: "" });
  };

  const openEditCat = (cat) => {
    setEditingCat(cat);
    setCatForm({
      name: cat.name,
      icon: cat.icon || DEFAULT_CATEGORY_ICON,
      order: cat.order != null ? String(cat.order) : "",
    });
  };

  const saveCat = async () => {
    if (saveCatRef.current) return;
    const name = catForm.name.trim();
    if (!name) return toast(t("Nhập tên danh mục"), "error");

    const orderStr = String(catForm.order || "").trim();
    let order;
    if (orderStr) {
      order = Number(orderStr);
      if (!Number.isInteger(order) || order < 0) {
        return toast(t("Thứ tự phải là số nguyên >= 0"), "error");
      }
    }

    saveCatRef.current = true;
    setCatLoading(true);
    try {
      const payload = { name, icon: catForm.icon };
      if (order !== undefined) payload.order = order;

      if (editingCat) {
        await api.categories.update(editingCat.id, payload);
        toast(t("Đã cập nhật danh mục"), "success");
      } else {
        await api.categories.create(payload);
        toast(t("Đã thêm danh mục"), "success");
      }
      setEditingCat(null);
      setCatForm({ name: "", icon: DEFAULT_CATEGORY_ICON, order: "" });
      load();
    } catch (e) {
      toast(e.message || t("Không lưu được"), "error");
    } finally {
      saveCatRef.current = false;
      setCatLoading(false);
    }
  };

  const removeCat = (cat) => {
    setConfirm({
      title: t('Xóa danh mục "{name}"?', { name: cat.name }),
      message: t("Danh mục sẽ bị xoá khỏi hệ thống. Các món thuộc danh mục này vẫn được giữ nhưng sẽ không có danh mục."),
      confirmText: t("Xóa danh mục"),
      cancelText: t("Hủy"),
      danger: true,
      onConfirm: async () => {
        await api.categories.remove(cat.id);
        toast(t("Đã xóa danh mục"), "success");
        setConfirm(null);
        load();
      },
    });
  };

  // ============================================================
  // COMPUTED
  // ============================================================
  const stats = useMemo(() => {
    const total = list.length;
    const active = list.filter((m) => Number(m.active) === 1).length;
    return { total, active, inactive: total - active };
  }, [list]);

  const slotStats = useMemo(() => {
    const enabled = slots.filter((s) => s.enabled).length;
    return { total: slots.length, enabled, disabled: slots.length - enabled };
  }, [slots]);

  const groupedSlots = useMemo(() => {
    const map = {};
    for (const s of slots) {
      const sid = getSessionId(s.start);
      if (!map[sid]) map[sid] = [];
      map[sid].push(s);
    }
    return SESSIONS.map((session) => ({
      ...session,
      slots: map[session.id] || [],
    })).filter((g) => g.slots.length > 0);
  }, [slots]);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <>
      <div>
        {/* ============ KHUNG GIỜ ============ */}
        <div
          style={{
            background: "var(--card-bg, #fff)",
            border: "1px solid var(--border-color, #e7ebf0)",
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <div
            onClick={() => setOpenSlots((v) => !v)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: openSlots ? 14 : 0,
              flexWrap: "wrap",
              gap: 10,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div
                style={{
                  width: 40, height: 40, borderRadius: 11,
                  background: "rgba(38, 52, 213, 0.12)", color: "#2634d5",
                  display: "grid", placeItems: "center", flexShrink: 0,
                }}
              >
                <Clock size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: 16, color: "var(--text-primary, #172033)" }}>
                  {t("Khung giờ nhận món")}
                </h3>
                <span style={{ fontSize: 12, color: "var(--text-light, #8993a3)" }}>
                  {t("Tổng {n} khung", { n: slotStats.total })} ·{" "}
                  <b style={{ color: "#18a967" }}>{t("{n} đang mở", { n: slotStats.enabled })}</b>
                  {slotStats.disabled > 0 && (
                    <>
                      {" "} ·{" "}
                      <b style={{ color: "#ef4444" }}>{t("{n} đã tắt", { n: slotStats.disabled })}</b>
                    </>
                  )}
                </span>
              </div>
            </div>

            <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                type="button"
                onClick={loadSlots}
                disabled={slotsLoading}
                title={t("Làm mới")}
                aria-label={t("Làm mới khung giờ")}
                style={{
                  padding: "8px 12px",
                  background: "var(--card-bg, #fff)",
                  border: "1px solid var(--border-color, #e5e9ef)",
                  borderRadius: 8,
                  cursor: slotsLoading ? "not-allowed" : "pointer",
                  fontSize: 12,
                  color: "var(--text-primary, #172033)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  opacity: slotsLoading ? 0.6 : 1,
                }}
              >
                {slotsLoading ? (
                  <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <RotateCcw size={13} />
                )}
                {t("Làm mới")}
              </button>

              <button
                type="button"
                onClick={() => setSlotModal({ manage: true })}
                style={{
                  padding: "8px 12px",
                  background: "#2634d5",
                  border: "1px solid #2634d5",
                  color: "#fff",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  position: "relative",
                  zIndex: 99,
                }}
              >
                <Edit size={13} /> {t("Chỉnh sửa")}
              </button>

              <ChevronDown
                size={18}
                style={{
                  color: "var(--text-light, #8993a3)",
                  transition: "transform 0.2s",
                  transform: openSlots ? "rotate(180deg)" : "rotate(0deg)",
                  flexShrink: 0,
                }}
              />
            </div>
          </div>

          {openSlots && (
            <>
              {slotsError && !slotsLoading && (
                <div
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    marginBottom: 14,
                    color: "#ef4444",
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{slotsError}</span>
                  <button
                    onClick={loadSlots}
                    style={{
                      padding: "4px 10px",
                      background: "#ef4444",
                      color: "#fff",
                      border: 0,
                      borderRadius: 5,
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {t("Thử lại")}
                  </button>
                </div>
              )}

              {slotsLoading && slots.length === 0 && (
                <div style={{ textAlign: "center", padding: 30, color: "var(--text-light, #8993a3)", fontSize: 13 }}>
                  <Loader2 size={22} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
                  <div>{t("Đang tải khung giờ...")}</div>
                </div>
              )}

              {!slotsLoading &&
                groupedSlots.map((group) => {
                  const Icon = group.icon;
                  const enabledCount = group.slots.filter((s) => s.enabled).length;

                  return (
                    <div
                      onClick={() => setExpandedSession(expandedSession === group.id ? null : group.id)}
                      key={group.id}
                      style={{
                        cursor: "pointer",
                        background: "var(--bg-tertiary, #f8fafc)",
                        border: "1px solid var(--border-color, #eef2f7)",
                        borderRadius: 10,
                        padding: 14,
                        marginBottom: 12,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <div
                          style={{
                            width: 30, height: 30, borderRadius: 8,
                            background: group.color + "18", color: group.color,
                            display: "grid", placeItems: "center", flexShrink: 0,
                          }}
                        >
                          <Icon size={16} />
                        </div>
                        <b style={{ fontSize: 13, color: "var(--text-primary, #172033)" }}>
                          {t(group.label)}
                        </b>
                        <span style={{ fontSize: 11, color: "var(--text-light, #8993a3)" }}>
                          ({group.from} - {group.to}) ·{" "}
                          <b style={{ color: "#18a967" }}>
                            {enabledCount}/{group.slots.length}
                          </b>{" "}
                          {t("khung mở")}
                        </span>
                      </div>

                      <div
                        style={{
                          display: expandedSession === group.id ? "grid" : "none",
                          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                          gap: 8,
                        }}
                      >
                        {group.slots.map((slot) => {
                          const active = !!slot.enabled;
                          const isToggling = togglingSlotId === slot.id;

                          return (
                            <div
                              key={slot.id}
                              style={{
                                background: active ? "var(--card-bg, #fff)" : "rgba(239, 68, 68, 0.06)",
                                border: active
                                  ? "1px solid var(--border-color, #e5e9ef)"
                                  : "1px solid rgba(239, 68, 68, 0.3)",
                                borderRadius: 9,
                                padding: "10px 12px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                                transition: "all 0.2s",
                                opacity: isToggling ? 0.6 : 1,
                              }}
                            >
                              <b
                                style={{
                                  fontSize: 13,
                                  fontFamily: "monospace",
                                  color: active ? "var(--text-primary, #172033)" : "var(--text-muted, #64748b)",
                                  textDecoration: active ? "none" : "line-through",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {slot.id}
                              </b>

                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleSlot(slot); }}
                                disabled={isToggling}
                                aria-pressed={active}
                                role="switch"
                                title={active ? t("Tắt khung giờ này") : t("Bật khung giờ này")}
                                style={{
                                  background: active ? "#18a967" : "#cbd5e1",
                                  border: 0,
                                  cursor: isToggling ? "wait" : "pointer",
                                  width: 40,
                                  height: 22,
                                  borderRadius: 999,
                                  padding: 0,
                                  position: "relative",
                                  display: "inline-block",
                                  flexShrink: 0,
                                  transition: "background-color 0.25s ease",
                                  boxShadow: active
                                    ? "0 2px 8px rgba(24, 169, 103, 0.35)"
                                    : "inset 0 1px 3px rgba(0, 0, 0, 0.08)",
                                }}
                              >
                                <span
                                  style={{
                                    position: "absolute",
                                    top: 3,
                                    left: active ? 21 : 3,
                                    width: 16,
                                    height: 16,
                                    borderRadius: "50%",
                                    background: "#ffffff",
                                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
                                    transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                                  }}
                                />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </>
          )}
        </div>

        {/* DEBUG */}
        {DEBUG && (
          <div
            style={{
              background: "rgba(38, 52, 213, 0.08)",
              border: "1px solid rgba(38, 52, 213, 0.2)",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 12,
              color: "#2634d5",
              fontFamily: "monospace",
            }}
          >
            🔍 DEBUG: Tổng <b>{stats.total}</b> món ·{" "}
            <b style={{ color: "#18a967" }}>{stats.active} đang bán</b> ·{" "}
            <b style={{ color: "#f59e0b" }}>{stats.inactive} đã tắt</b>
          </div>
        )}

        {/* TOOLBAR */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--card-bg, #fff)",
              border: "1px solid var(--border-color, #e5e9ef)",
              borderRadius: 10,
              padding: "10px 14px",
              flex: 1,
              minWidth: 220,
              maxWidth: 400,
            }}
          >
            <Search size={18} style={{ color: "var(--text-light, #8993a3)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("Tìm món ăn...")}
              style={{
                flex: 1,
                border: 0,
                outline: "none",
                fontSize: 13,
                background: "transparent",
                color: "var(--text-primary, #172033)",
              }}
            />
            {q && (
              <button onClick={() => setQ("")} style={clearBtnStyle} aria-label={t("Xoá tìm kiếm")}>
                <X size={14} />
              </button>
            )}
          </div>

          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            style={{
              padding: "10px 14px",
              border: "1px solid var(--border-color, #e5e9ef)",
              borderRadius: 10,
              fontSize: 13,
              outline: "none",
              background: "var(--card-bg, #fff)",
              color: "var(--text-primary, #172033)",
              cursor: "pointer",
              minWidth: 140,
            }}
          >
            <option value="">{t("Tất cả danh mục")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>

          <button onClick={() => openItemModal(null)} style={btnPrimaryStyle}>
            <Plus size={16} /> {t("Thêm món")}
          </button>

          <button
            onClick={() => { openAddCat(); setShowCatModal(true); }}
            style={btnOutlineStyle}
          >
            <FolderPlus size={16} /> {t("Quản lý danh mục")}
          </button>

          <select
            value={stallFilter}
            onChange={(e) => setStallFilter(e.target.value)}
            style={{
              padding: "0 16px",
              background: "#2634d5",
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              outline: "none",
              height: 38,
              appearance: "none",
              WebkitAppearance: "none",
              MozAppearance: "none",
              textAlign: "center",
              textAlignLast: "center",
            }}
          >
            <option value="Mọi Quầy" style={{ background: "#fff", color: "#172033" }}>
              {t("Mọi Quầy")}
            </option>
            {STALL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} style={{ background: "#fff", color: "#172033" }}>
                {t(o.label)}
              </option>
            ))}
          </select>
        </div>

        {/* RESULT INFO */}
        {!loading && filtered.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
              fontSize: 13,
              color: "var(--text-muted, #64748b)",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <span>
              {t("Hiển thị {shown} / {total} món", {
                shown: paginatedItems.length,
                total: filtered.length,
              })}
            </span>
          </div>
        )}

        {/* MENU GRID */}
        {loading && paginatedItems.length === 0 ? (
          <div
            style={{
              padding: 60,
              textAlign: "center",
              color: "var(--text-light, #8993a3)",
              background: "var(--card-bg, #fff)",
              borderRadius: 14,
            }}
          >
            <Loader2 size={26} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
            <div>{t("Đang tải thực đơn...")}</div>
          </div>
        ) : error ? (
          <ErrorBox message={error} onRetry={load} t={t} />
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: 60,
              textAlign: "center",
              color: "var(--text-light, #8993a3)",
              background: "var(--card-bg, #fff)",
              borderRadius: 14,
            }}
          >
            <UtensilsCrossed size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div>
              {q || filterCat
                ? t("Không có món nào khớp bộ lọc")
                : t('Chưa có món nào — bấm "Thêm món" để bắt đầu')}
            </div>
          </div>
        ) : (
          <>
            <div className="admin-menu-grid">
              {paginatedItems.map((m) => (
                <AdminMenuCardRow
                  key={m._id || m.id}
                  item={m}
                  isProcessing={processingIds.has(m._id || m.id)}
                  isToggling={togglingId === (m._id || m.id)}
                  onToggleOut={() => handleToggleOut(m)}
                  onToggleActive={() => toggleActive(m)}
                  onAdjustStock={(delta) => handleAdjustStock(m, delta)}
                  onEdit={() => openItemModal(m)}
                  onDelete={() => removeItem(m)}
                  onViewHistory={() => setHistoryModalItem(m)}
                  t={t}
                  tData={tData}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="admin-menu-pagination">
                <button
                  type="button"
                  className="admin-menu-page-btn"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  aria-label={t("Trang trước")}
                >
                  <ChevronLeft size={18} />
                  <span>{t("Trang trước")}</span>
                </button>

                <div className="admin-menu-page-indicator">
                  <span className="admin-menu-page-indicator__label">{t("Trang")}</span>
                  <span className="admin-menu-page-indicator__current">{currentPage}</span>
                  <span className="admin-menu-page-indicator__sep">/</span>
                  <span className="admin-menu-page-indicator__total">{totalPages}</span>
                </div>

                <button
                  type="button"
                  className="admin-menu-page-btn"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  aria-label={t("Trang sau")}
                >
                  <span>{t("Trang sau")}</span>
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </>
        )}

        {historyModalItem && (
          <PriceHistoryModal
            item={historyModalItem}
            onClose={() => setHistoryModalItem(null)}
          />
        )}

        {/* CATEGORY MODAL */}
        {showCatModal && (
          <Modal onClose={() => !catLoading && setShowCatModal(false)} maxWidth={560}>
            <div style={modalHeaderStyle}>
              <h3 style={modalTitleStyle}>
                <Folder size={20} style={{ color: "#0EA5E9" }} /> {t("Quản lý danh mục")}
              </h3>
              <button
                onClick={() => !catLoading && setShowCatModal(false)}
                style={modalCloseStyle}
                aria-label={t("Đóng")}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ background: "var(--bg-tertiary, #f5f7fb)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted, #475569)", marginBottom: 8 }}>
                {editingCat ? `✏️ ${t("Sửa danh mục")}` : `➕ ${t("Thêm danh mục mới")}`}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 80px auto", gap: 8 }}>
                <input
                  value={catForm.icon}
                  onChange={(e) => setCatForm({ ...catForm, icon: e.target.value })}
                  placeholder={DEFAULT_CATEGORY_ICON}
                  maxLength={4}
                  style={{
                    padding: 10, border: "1px solid var(--border-color, #e5e9ef)",
                    borderRadius: 8, outline: "none", textAlign: "center", fontSize: 20,
                    background: "var(--card-bg, #fff)",
                  }}
                  aria-label={t("Icon danh mục")}
                />
                <input
                  value={catForm.name}
                  onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                  placeholder={t("VD: Bún, Phở, Tráng miệng...")}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveCat(); } }}
                  style={{
                    padding: 10, border: "1px solid var(--border-color, #e5e9ef)",
                    borderRadius: 8, outline: "none", background: "var(--card-bg, #fff)",
                    color: "var(--text-primary, #172033)",
                  }}
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={catForm.order}
                  onChange={(e) => setCatForm({ ...catForm, order: e.target.value })}
                  placeholder={t("Tự động")}
                  title={t("Thứ tự hiển thị (để trống = tự động)")}
                  style={{
                    padding: 10, border: "1px solid var(--border-color, #e5e9ef)",
                    borderRadius: 8, outline: "none", background: "var(--card-bg, #fff)",
                    color: "var(--text-primary, #172033)", fontSize: 13,
                  }}
                  aria-label={t("Thứ tự hiển thị")}
                />
                <button
                  onClick={saveCat}
                  disabled={catLoading || !catForm.name.trim()}
                  style={{
                    padding: "10px 16px",
                    background: !catForm.name.trim() || catLoading ? "#94a3b8" : "#0EA5E9",
                    color: "#fff",
                    border: 0,
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: !catForm.name.trim() || catLoading ? "not-allowed" : "pointer",
                    fontSize: 13,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {catLoading ? (
                    <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <Save size={14} />
                  )}
                  {editingCat ? t("Lưu") : t("Thêm")}
                </button>
              </div>
              {editingCat && (
                <button
                  onClick={() => {
                    setEditingCat(null);
                    setCatForm({ name: "", icon: DEFAULT_CATEGORY_ICON, order: "" });
                  }}
                  style={{
                    marginTop: 8, background: "transparent", border: 0,
                    color: "#ef4444", fontSize: 12, cursor: "pointer",
                    fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4,
                  }}
                >
                  <X size={12} /> {t("Hủy sửa")}
                </button>
              )}
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted, #475569)", marginBottom: 8 }}>
              {t("Danh sách")} ({categories.length})
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 400, overflowY: "auto" }}>
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", background: "var(--card-bg, #fff)",
                    border: "1px solid var(--border-color, #e5e9ef)", borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      width: 34, height: 34, borderRadius: 9,
                      background: "var(--bg-tertiary, #f5f7fb)",
                      display: "grid", placeItems: "center", fontSize: 18, flexShrink: 0,
                    }}
                  >
                    {cat.icon || DEFAULT_CATEGORY_ICON}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 13, color: "var(--text-primary, #172033)", display: "block" }}>
                      {cat.name}
                    </b>
                    {cat.order && (
                      <div style={{ fontSize: 11, color: "var(--text-light, #8993a3)" }}>
                        {t("Thứ tự")}: {cat.order}
                      </div>
                    )}
                  </div>
                  <IconButton onClick={() => openEditCat(cat)} title={t("Sửa")} color="#0EA5E9">
                    <Edit size={14} />
                  </IconButton>
                  <IconButton onClick={() => removeCat(cat)} title={t("Xóa")} color="#ef4444">
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              ))}
              {categories.length === 0 && (
                <div style={{ textAlign: "center", padding: 30, color: "var(--text-light, #8993a3)", fontSize: 13 }}>
                  {t("Chưa có danh mục nào")}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowCatModal(false)}
              style={{ ...btnPrimaryStyle, marginTop: 16, width: "100%" }}
            >
              {t("Đóng")}
            </button>
          </Modal>
        )}

        {/* ITEM MODAL */}
        {modal && (
          <Modal onClose={() => !saving && closeItemModal()} maxWidth={560}>
            <div style={modalHeaderStyle}>
              <h3 style={modalTitleStyle}>
                {modal._id || modal.id ? t("Sửa món") : t("Thêm món")}
              </h3>
              <button
                onClick={() => !saving && closeItemModal()}
                style={modalCloseStyle}
                aria-label={t("Đóng")}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveItem} autoComplete="off">
              <label style={labelStyle}>{t("Tên món")} *</label>
              <input
                name="name"
                defaultValue={modal.name || ""}
                required
                style={inputStyle}
                autoFocus
                disabled={saving}
              />

              <label style={labelStyle}>{t("Danh mục")} *</label>
              <select
                name="category"
                defaultValue={modal.category || (categories[0]?.name ?? "")}
                required
                style={inputStyle}
                disabled={saving}
              >
                {categories.length === 0 && (
                  <option value="">{t("— Chưa có danh mục —")}</option>
                )}
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
              </select>

              <label style={labelStyle}>{t("Thuộc Quầy (Khu vực)")}</label>
              <select
                name="station"
                defaultValue={modal.station || modal.stall || modal.area || ""}
                style={inputStyle}
                disabled={saving}
              >
                <option value="">{t("Không chọn quầy")}</option>
                {STALL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{t(o.label)}</option>
                ))}
              </select>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 8 }}>
                <div>
                  <label style={{ ...labelStyle, marginTop: 0 }}>{t("Giá gốc")}</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={priceFields.originalPrice}
                    onChange={(e) => handleOriginalChange(e.target.value)}
                    placeholder={t("VD: 50000")}
                    style={{ ...inputStyle, marginBottom: 0 }}
                    disabled={saving}
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, marginTop: 0 }}>{t("% Giảm")}</label>
                  <input
                    type="number"
                    min="0"
                    max={MAX_DISCOUNT}
                    step="1"
                    value={priceFields.discountPercent}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                    style={{ ...inputStyle, marginBottom: 0 }}
                    disabled={saving || !hasOriginal}
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, marginTop: 0 }}>
                    {t("Giá bán")} {!hasOriginal && "*"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={priceFields.price}
                    onChange={(e) => handlePriceChange(e.target.value)}
                    required={!hasOriginal}
                    placeholder={t("VD: 30000")}
                    style={{
                      ...inputStyle,
                      marginBottom: 0,
                      background: hasOriginal ? "var(--bg-tertiary, #f5f7fb)" : "var(--bg-secondary, #fff)",
                      cursor: hasOriginal ? "not-allowed" : "text",
                      opacity: hasOriginal ? 0.75 : 1,
                    }}
                    disabled={saving || hasOriginal}
                  />
                </div>
              </div>

              <div
                style={{
                  marginBottom: 14,
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: 12.5,
                  background: hasOriginal ? "rgba(14, 165, 233, 0.08)" : "var(--bg-tertiary, #f8fafc)",
                  border: hasOriginal ? "1px solid rgba(14, 165, 233, 0.25)" : "1px solid var(--border-color, #e5e9ef)",
                  color: hasOriginal ? "#0284C7" : "var(--text-muted, #64748b)",
                }}
              >
                {hasOriginal ? (
                  <>
                    💰 {t("Khách sẽ trả")} <b>{money(priceFields.price)}</b>
                    {priceFields.discountPercent > 0 && (
                      <>
                        {" "}— {t("giảm")} <b>{priceFields.discountPercent}%</b> {t("từ")}{" "}
                        <span style={{ textDecoration: "line-through" }}>
                          {money(Number(priceFields.originalPrice) || 0)}
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  <>💡 {t("Để trống Giá gốc nếu không giảm giá.")}</>
                )}
              </div>

              <label style={labelStyle}>{t("Số lượng")} *</label>
              <input
                name="stock"
                type="number"
                min="0"
                step="1"
                defaultValue={modal.stock ?? ""}
                placeholder={t("VD: 20")}
                required
                style={inputStyle}
                disabled={saving}
              />

              <label style={labelStyle}>{t("Mô tả")}</label>
              <textarea
                name="description"
                defaultValue={modal.description || ""}
                style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                disabled={saving}
              />

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, marginTop: 10 }}>
                {[
                  { key: "is_cool", icon: "❄️", label: t("Mát lạnh") },
                  { key: "is_healthy", icon: "🥗", label: t("Lành mạnh") },
                  { key: "is_spicy", icon: "🌶️", label: t("Cay") },
                ].map((c) => (
                  <label
                    key={c.key}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "flex-start",
                      gap: 8,
                      padding: "6px 12px",
                      borderRadius: 20,
                      fontSize: 13,
                      whiteSpace: "nowrap",
                      cursor: saving ? "not-allowed" : "pointer",
                      background: nutrition[c.key] ? "rgba(16, 185, 129, 0.12)" : "var(--bg-tertiary, #f8fafc)",
                      border: nutrition[c.key] ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid var(--border-color, #e5e9ef)",
                      transition: "all 0.2s",
                      userSelect: "none",
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "var(--text-primary, #172033)" }}>{c.label}</span>
                    <span style={{ fontSize: 14 }}>{c.icon}</span>
                    <div
                      style={{
                        width: 16, height: 16, borderRadius: 4,
                        border: nutrition[c.key] ? "1px solid #10b981" : "1px solid #cbd5e1",
                        background: nutrition[c.key] ? "#10b981" : "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, marginLeft: 4,
                      }}
                    >
                      {nutrition[c.key] && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                    </div>
                    <input
                      type="checkbox"
                      checked={!!nutrition[c.key]}
                      onChange={(e) => setNutrition((p) => ({ ...p, [c.key]: e.target.checked }))}
                      disabled={saving}
                      style={{ display: "none" }}
                    />
                  </label>
                ))}
              </div>

              <label style={labelStyle}>{t("Dinh dưỡng & phục vụ")}</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 8 }}>
                <div>
                  <label style={{ ...labelStyle, marginTop: 0 }}>⏱ {t("Thời gian làm (phút)")}</label>
                  <input
                    name="prep_time"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={modal.prep_time ?? ""}
                    placeholder={t("VD: 10")}
                    style={{ ...inputStyle, marginBottom: 0 }}
                    disabled={saving}
                  />
                </div>
              </div>

              <div
                style={{
                  marginBottom: 14,
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  background: "var(--bg-tertiary, #f8fafc)",
                  border: "1px solid var(--border-color, #e5e9ef)",
                  color: "var(--text-muted, #64748b)",
                }}
              >
                💡 {t("Để trống Thời gian làm — hệ thống tự gán mặc định theo danh mục. Tiêu chí này dùng cho bộ lọc 'Tiêu chí ưu tiên' ở trang thực đơn của khách hàng.")}
              </div>

              <label style={labelStyle}>{t("Lý do đổi giá (nếu có sửa giá)")}</label>
              <input
                name="reason"
                placeholder={t("VD: Tăng giá nguyên liệu, khuyến mãi...")}
                style={inputStyle}
                disabled={saving}
              />

              <div style={{ width: "100%", maxWidth: 400, marginBottom: 16, alignSelf: "flex-start" }}>
                <ImageUploader
                  value={image}
                  onChange={setImage}
                  label={t("Ảnh món ăn (JPEG/PNG, tối đa 100MB)")}
                />
              </div>

              {!image && (
                <>
                  <label style={labelStyle}>{t("Hoặc dán URL ảnh")}</label>
                  <input
                    name="imageUrl"
                    defaultValue={modal.image?.startsWith("http") ? modal.image : ""}
                    placeholder="https://..."
                    style={inputStyle}
                    disabled={saving}
                  />
                </>
              )}

              <label
                style={{
                  display: "inline-flex",
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 16,
                  marginBottom: 16,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={isSignature}
                  onChange={(e) => setIsSignature(e.target.checked)}
                  disabled={saving}
                  style={{
                    width: 18, height: 18, margin: 0,
                    accentColor: "#f59e0b", cursor: "inherit", flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 14, fontWeight: 600, color: isSignature ? "#f59e0b" : "var(--text-primary, #172033)", whiteSpace: "nowrap" }}>
                  ⭐ {t("Món Signature")} <span style={{ fontWeight: 400, fontSize: 13, color: "var(--text-muted, #64748b)" }}>({t("Hiển thị nổi bật ở trang chủ")})</span>
                </span>
              </label>

              <div style={{ marginTop: 20, padding: 16, background: "var(--bg-tertiary, #f8fafc)", borderRadius: 10, border: "1px solid var(--border-color, #e5e9ef)", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary, #172033)" }}>
                  🍩 {t("Topping áp dụng cho món này")}
                </div>

                {allToppings.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {allToppings.map((tp) => (
                      <label
                        key={tp.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          background: "#fff", padding: "8px 12px", borderRadius: 8,
                          border: "1px solid var(--border-color, #e5e9ef)",
                          cursor: "pointer", fontSize: 13, fontWeight: 600,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={allowedToppings.includes(tp.id)}
                          onChange={(e) => {
                            if (e.target.checked) setAllowedToppings([...allowedToppings, tp.id]);
                            else setAllowedToppings(allowedToppings.filter((id) => id !== tp.id));
                          }}
                          style={{ width: 16, height: 16, accentColor: "#10b981", cursor: "pointer" }}
                        />
                        {tp.name} (+{money(tp.price)})
                      </label>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "var(--text-muted, #64748b)" }}>
                    {t("Chưa có topping nào trong hệ thống.")}
                  </div>
                )}

                <AddToppingForm
                  onAdded={async () => {
                    const updatedData = await api.toppings.list();
                    setAllToppings(updatedData || []);
                  }}
                  t={t}
                />
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button
                  type="button"
                  onClick={closeItemModal}
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
                      <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                      {t("Đang lưu...")}
                    </>
                  ) : (
                    <>
                      <Save size={14} /> {t("Lưu món")}
                    </>
                  )}
                </button>
              </div>
            </form>
          </Modal>
        )}

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </div>

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

      <ConfirmDialog
        open={confirmSlotReset}
        title={t("Reset toàn bộ khung giờ?")}
        message={t("Tất cả khung giờ sẽ được BẬT lại như mặc định. Trạng thái tắt hiện tại sẽ bị xoá.")}
        confirmText={t("Reset")}
        cancelText={t("Hủy")}
        danger
        loading={resettingSlots}
        onConfirm={resetSlots}
        onClose={() => !resettingSlots && setConfirmSlotReset(false)}
      />

      {/* SLOT MANAGE MODAL */}
      {slotModal && slotModal.manage && (
        <Modal onClose={() => setSlotModal(null)} maxWidth={600}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ margin: 0 }}>{t("Quản lý khung giờ")}</h3>
            <button
              onClick={() => setSlotModal(null)}
              style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--text-light)" }}
              aria-label={t("Đóng")}
            >
              <X size={20} />
            </button>
          </div>

          <div style={{ background: "var(--bg-tertiary)", padding: 16, borderRadius: 10, marginBottom: 20 }}>
            <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>{t("Thêm khung giờ mới")}</h4>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (addSlotRef.current) return;
                const f = new FormData(e.currentTarget);
                const start = f.get("start");
                const end = f.get("end");
                if (start >= end) return toast(t("Giờ kết thúc phải lớn hơn giờ bắt đầu"), "error");
                addSlotRef.current = true;
                try {
                  await api.timeSlots.create({ start, end });
                  toast(t("Đã thêm khung giờ"), "success");
                  e.target.reset();
                  loadSlots();
                } catch (err) {
                  toast(err.message, "error");
                } finally {
                  addSlotRef.current = false;
                }
              }}
              style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
            >
              <input name="start" type="time" required defaultValue="07:00" style={{ ...inputStyle, width: "auto", margin: 0 }} />
              <span>{t("đến")}</span>
              <input name="end" type="time" required defaultValue="07:30" style={{ ...inputStyle, width: "auto", margin: 0 }} />
              <button
                type="submit"
                style={{
                  padding: "10px 16px",
                  background: "#2634d5",
                  color: "#fff",
                  border: 0,
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Plus size={16} /> {t("Thêm")}
              </button>
            </form>
          </div>

          <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>{t("Danh sách khung giờ hiện tại")}</h4>
          <div style={{ maxHeight: "40vh", overflowY: "auto", paddingRight: 8 }}>
            {groupedSlots.map((group) => (
              <div key={group.id} style={{ marginBottom: 16 }}>
                <b style={{ fontSize: 13, color: "var(--text-muted)" }}>{t(group.label)}</b>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginTop: 8 }}>
                  {group.slots.map((slot) => (
                    <div
                      key={slot.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "var(--card-bg)",
                        border: "1px solid var(--border-color)",
                        padding: "6px 10px",
                        borderRadius: 8,
                      }}
                    >
                      <span style={{ fontSize: 13, fontFamily: "monospace" }}>{slot.id}</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => setSlotToEdit(slot)}
                          style={{ background: "transparent", border: 0, color: "#f59e0b", cursor: "pointer", padding: 2 }}
                          title={t("Sửa")}
                          aria-label={t("Sửa")}
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSlotToDelete(slot)}
                          style={{ background: "transparent", border: 0, color: "#ef4444", cursor: "pointer", padding: 2 }}
                          title={t("Xóa")}
                          aria-label={t("Xóa")}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {slotToDelete && (
        <ConfirmDialog
          open
          title={t("Xóa khung giờ")}
          message={t('Bạn có chắc chắn muốn xóa khung giờ "{id}" không? Hành động này không thể hoàn tác.', { id: slotToDelete.id })}
          confirmText={t("Xóa ngay")}
          cancelText={t("Hủy")}
          danger
          onConfirm={async () => {
            try {
              await api.timeSlots.remove(slotToDelete.id);
              toast(t("Đã xóa khung giờ"), "success");
              setSlotToDelete(null);
              loadSlots();
            } catch (err) {
              toast(err.message || t("Lỗi khi xóa"), "error");
            }
          }}
          onClose={() => setSlotToDelete(null)}
        />
      )}

      {slotToEdit && (
        <SlotEditModal
          slot={slotToEdit}
          onClose={() => setSlotToEdit(null)}
          onSaved={() => { setSlotToEdit(null); loadSlots(); }}
          t={t}
        />
      )}
    </>
  );
}

// ============================================================
// SUB-COMPONENT: SlotEditModal (B9.6c — extract từ inline)
// ============================================================
function SlotEditModal({ slot, onClose, onSaved, t }) {
  const [start, setStart] = useState(slot.start);
  const [end, setEnd] = useState(slot.end);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const handleSave = async () => {
    if (savingRef.current) return;
    if (!start || !end || start >= end) {
      return toast(t("Giờ không hợp lệ (Kết thúc phải lớn hơn Bắt đầu)"), "error");
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await api.timeSlots.update(slot.id, { start, end });
      toast(t("Đã cập nhật khung giờ"), "success");
      onSaved();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal onClose={() => !saving && onClose()} maxWidth={400}>
      <h3 style={{ margin: "0 0 16px", fontSize: 18 }}>{t("Sửa khung giờ")}</h3>
      <label style={labelStyle}>{t("Giờ bắt đầu")}</label>
      <input
        type="time"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        style={inputStyle}
        disabled={saving}
      />
      <label style={labelStyle}>{t("Giờ kết thúc")}</label>
      <input
        type="time"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        style={inputStyle}
        disabled={saving}
      />
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button onClick={onClose} disabled={saving} style={{ ...btnCancelStyle, flex: 1 }}>
          {t("Hủy")}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            ...btnPrimaryStyle,
            flex: 1,
            width: "auto",
            opacity: saving ? 0.6 : 1,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? (
            <>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              {t("Đang lưu...")}
            </>
          ) : (
            t("Lưu thay đổi")
          )}
        </button>
      </div>
    </Modal>
  );
}

// ============================================================
// SUB-COMPONENT: AddToppingForm (B9.6c — extract từ inline)
// ============================================================
function AddToppingForm({ onAdded, t }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(false);

  const handleAdd = async () => {
    if (addingRef.current) return;
    if (!name || !price) return toast(t("Vui lòng nhập đủ Tên và Giá"), "error");
    addingRef.current = true;
    setAdding(true);
    try {
      const res = await api.toppings.create({ name, price: Number(price), applies_to: [] });
      if (res) {
        toast(t("Đã thêm Topping"), "success");
        setName("");
        setPrice("");
        await onAdded();
      } else {
        toast(t("Lỗi khi thêm Topping"), "error");
      }
    } catch {
      toast(t("Lỗi mạng"), "error");
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 8,
        paddingTop: 12,
        borderTop: "1px dashed var(--border-color, #e5e9ef)",
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("Tên topping mới...")}
        style={{ ...inputStyle, marginBottom: 0, flex: 1, minWidth: 150 }}
        disabled={adding}
      />
      <input
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder={t("Giá (VNĐ)")}
        style={{ ...inputStyle, marginBottom: 0, width: 120 }}
        disabled={adding}
      />
      <button
        type="button"
        onClick={handleAdd}
        disabled={adding}
        style={{
          ...btnPrimaryStyle,
          width: "auto",
          marginBottom: 0,
          padding: "0 16px",
          height: 42,
          opacity: adding ? 0.6 : 1,
          cursor: adding ? "not-allowed" : "pointer",
        }}
      >
        {adding ? (
          <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
        ) : (
          "+"
        )}{" "}
        {t("Thêm")}
      </button>
    </div>
  );
}

// ============================================================
// SUB-COMPONENT: AdminMenuCardRow
// ============================================================
function AdminMenuCardRow({
  item,
  isProcessing,
  isToggling,
  onToggleOut,
  onToggleActive,
  onAdjustStock,
  onEdit,
  onDelete,
  onViewHistory,
  t,
  tData,
}) {
  const stockNum = Number(item.stock) || 0;
  const soldNum = Number(item.sold) || 0;
  const totalStockNum = stockNum + soldNum;
  const activeNum = Number(item.active) || 0;
  const isActive = activeNum === 1;
  const isOut = stockNum === 0;
  const isLow = stockNum > 0 && stockNum < LOW_STOCK_THRESHOLD;
  const isDisabled = !isActive;

  const unitLabel =
    item.category === "Đồ uống"
      ? t("ly")
      : item.category === "Món mặn"
      ? t("tô")
      : t("suất");

  let statusBadge = null;
  if (isDisabled) {
    statusBadge = { variant: "disabled", icon: <Power size={11} />, text: t("Đã tắt món") };
  } else if (isOut) {
    statusBadge = { variant: "out", icon: <Ban size={11} />, text: t("Tạm hết hàng") };
  } else if (isLow) {
    statusBadge = {
      variant: "low",
      icon: <AlertCircle size={11} />,
      text: t("Sắp hết ({n})", { n: stockNum }),
    };
  } else {
    statusBadge = { variant: "active", icon: <CheckCircle2 size={11} />, text: t("Đang bán") };
  }

  const cardClass =
    "admin-menu-card" +
    (isDisabled ? " admin-menu-card--disabled" : "") +
    (isOut && !isDisabled ? " admin-menu-card--out" : "");

  return (
    <article className={cardClass}>
      <div className="admin-menu-card__img-wrap">
        <img
          src={item.image || getFALLBACK_IMG()}
          alt={item.name}
          loading="lazy"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = getFALLBACK_IMG();
          }}
        />
        {item.is_signature && (
          <span className="admin-menu-card__badge-signature">
            <Star size={9} fill="#fff" /> SIGNATURE
          </span>
        )}
      </div>

      <div className="admin-menu-card__info">
        <span className="admin-menu-card__category">{item.category}</span>

        <h3 className="admin-menu-card__name">{tData(item, "name") || item.name}</h3>

        <div className="admin-menu-card__price-row">
          {item.original_price > item.price && (
            <span className="admin-menu-card__price-old">{money(item.original_price)}</span>
          )}
          <span className="admin-menu-card__price-new">{money(item.price)}</span>
          {item.original_price > item.price && item.discount_percent > 0 && (
            <span className="admin-menu-card__discount">-{item.discount_percent}%</span>
          )}
        </div>

        <div className="admin-menu-card__meta">
          {item.rating > 0 && (
            <span className="admin-menu-card__meta-item">
              <Star size={12} fill="#f59e0b" color="#f59e0b" />
              <b>{item.rating}</b>
            </span>
          )}
          {item.prep_time > 0 && (
            <span className="admin-menu-card__meta-item">
              <Clock size={12} />
              {item.prep_time} {t("phút")}
            </span>
          )}
        </div>

        <div className="admin-menu-card__status-row">
          {statusBadge && (
            <span className={`admin-menu-card__badge admin-menu-card__badge--${statusBadge.variant}`}>
              {statusBadge.icon}
              {statusBadge.text}
            </span>
          )}

          <span className="admin-menu-card__stock-info">
            <Package size={12} />
            <b
              style={{
                color: isOut ? "var(--st-danger)" : isLow ? "#b45309" : "var(--st-success)",
              }}
            >
              {stockNum}
            </b>
            <span> / {totalStockNum} {unitLabel}</span>
          </span>
        </div>

        <div className="admin-menu-card__actions">
          <div className="admin-menu-card__stepper">
            <button
              type="button"
              className="admin-menu-card__step-btn"
              onClick={() => onAdjustStock(-1)}
              disabled={isProcessing || stockNum <= 0 || isDisabled}
              aria-label={t("Giảm")}
            >
              <Minus size={14} />
            </button>
            <span className="admin-menu-card__step-value">{stockNum}</span>
            <button
              type="button"
              className="admin-menu-card__step-btn"
              onClick={() => onAdjustStock(1)}
              disabled={isProcessing || stockNum >= MAX_STOCK || isDisabled}
              aria-label={t("Tăng")}
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="admin-menu-card__quick">
            <button
              type="button"
              className="admin-menu-card__quick-btn"
              onClick={() => onAdjustStock(10)}
              disabled={isProcessing || isDisabled}
            >
              +10
            </button>
            <button
              type="button"
              className="admin-menu-card__quick-btn"
              onClick={() => onAdjustStock(20)}
              disabled={isProcessing || isDisabled}
            >
              +20
            </button>
          </div>

          <button
            type="button"
            className={`admin-menu-card__toggle-out ${
              isOut ? "admin-menu-card__toggle-out--reopen" : "admin-menu-card__toggle-out--out"
            }`}
            onClick={onToggleOut}
            disabled={isProcessing || isDisabled}
            title={
              isDisabled
                ? t("Món đã bị tắt — mở lại trước khi thao tác")
                : isOut
                ? t("Mở bán lại")
                : t("Báo tạm hết hàng")
            }
          >
            {isProcessing ? (
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
            ) : isOut ? (
              <Eye size={14} />
            ) : (
              <EyeOff size={14} />
            )}
            <span>{isOut ? t("Mở bán lại") : t("Tạm hết")}</span>
          </button>

          <button
            type="button"
            className={`admin-menu-card__toggle-active ${
              isDisabled ? "admin-menu-card__toggle-active--off" : ""
            }`}
            onClick={onToggleActive}
            disabled={isToggling}
            title={
              isActive
                ? t("Tắt món — ẩn với khách, vẫn còn trong hệ thống")
                : t("Bật lại món")
            }
          >
            {isToggling ? (
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <Power size={14} />
            )}
            <span>{isActive ? t("Tắt món") : t("Bật lại")}</span>
          </button>

          <div className="admin-menu-card__icon-actions">
            <button
              type="button"
              className="admin-menu-card__icon-btn"
              onClick={onViewHistory}
              title={t("Lịch sử giá")}
              aria-label={t("Lịch sử giá")}
            >
              <History size={14} />
            </button>
            <button
              type="button"
              className="admin-menu-card__icon-btn"
              onClick={onEdit}
              disabled={isProcessing}
              title={t("Sửa món")}
              aria-label={t("Sửa món")}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              className="admin-menu-card__icon-btn admin-menu-card__icon-btn--danger"
              onClick={onDelete}
              disabled={isProcessing}
              title={t("Xoá vĩnh viễn món này")}
              aria-label={t("Xoá món")}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

// ============================================================
// SUB: IconButton
// ============================================================
function IconButton({ children, onClick, title, color = "var(--text-primary, #172033)" }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      type="button"
      style={{
        padding: 6,
        border: "1px solid var(--border-color, #e5e9ef)",
        borderRadius: 6,
        background: "var(--card-bg, #fff)",
        cursor: "pointer",
        color,
        display: "grid",
        placeItems: "center",
        width: 30,
        height: 30,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

// ============================================================
// SUB: ErrorBox (B9.6c — thêm t prop)
// ============================================================
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
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{t("Không tải được dữ liệu")}</div>
      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: onRetry ? 12 : 0 }}>{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          type="button"
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
// SUB: Modal (B9.6c — body scroll lock + ESC)
// ============================================================
function Modal({ children, onClose, maxWidth = 480 }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "block",
        zIndex: MODAL_Z,
        padding: "40px 16px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card-bg, #fff)",
          borderRadius: 16,
          padding: 24,
          width: "100%",
          maxWidth: maxWidth,
          margin: "0 auto",
          boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
          position: "relative",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================
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
  marginBottom: 14,
  outline: "none",
  background: "var(--bg-secondary, #fff)",
  color: "var(--text-primary, #172033)",
  fontSize: 13,
  boxSizing: "border-box",
};

const modalHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 16,
};

const modalTitleStyle = {
  margin: 0,
  color: "var(--text-primary, #172033)",
  fontSize: 16,
  display: "flex",
  alignItems: "center",
  gap: 8,
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

const clearBtnStyle = {
  background: "transparent",
  border: 0,
  cursor: "pointer",
  color: "var(--text-light, #8993a3)",
  padding: 2,
};

const btnPrimaryStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "10px 16px",
  background: "var(--btn-primary, #2634d5)",
  color: "#fff",
  border: 0,
  borderRadius: 10,
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
  textDecoration: "none",
};

const btnOutlineStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: "var(--card-bg, #fff)",
  color: "var(--btn-primary, #2634d5)",
  padding: "10px 16px",
  border: "1px solid var(--btn-primary, #2634d5)",
  borderRadius: 10,
  fontWeight: 600,
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
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
};